import { Job } from "bullmq";
import { nanoid } from "nanoid";
import { db } from "@uni-status/database";
import { monitors, checkResults } from "@uni-status/database/schema";
import { eq } from "drizzle-orm";
import { publishEvent } from "../lib/redis";
import { evaluateAlerts } from "../lib/alert-evaluator";
import type { CheckStatus } from "@uni-status/shared/types";
import * as grpc from "@grpc/grpc-js";

interface GrpcConfig {
  serviceName?: string;
  methodName?: string;
  requestPayload?: Record<string, unknown>;
  useTls?: boolean;
  metadata?: Record<string, string>;
}

interface GrpcCheckJob {
  monitorId: string;
  url: string;  // host:port format
  timeoutMs: number;
  config?: {
    grpc?: GrpcConfig;
  };
}

// Standard gRPC health check service definition
const HEALTH_CHECK_PROTO = {
  nested: {
    grpc: {
      nested: {
        health: {
          nested: {
            v1: {
              nested: {
                Health: {
                  methods: {
                    Check: {
                      requestType: "HealthCheckRequest",
                      responseType: "HealthCheckResponse",
                    },
                  },
                },
                HealthCheckRequest: {
                  fields: {
                    service: {
                      type: "string",
                      id: 1,
                    },
                  },
                },
                HealthCheckResponse: {
                  fields: {
                    status: {
                      type: "ServingStatus",
                      id: 1,
                    },
                  },
                },
                ServingStatus: {
                  values: {
                    UNKNOWN: 0,
                    SERVING: 1,
                    NOT_SERVING: 2,
                    SERVICE_UNKNOWN: 3,
                  },
                },
              },
            },
          },
        },
      },
    },
  },
};

export async function processGrpcCheck(job: Job<GrpcCheckJob>) {
  const { monitorId, url, timeoutMs, config } = job.data;

  console.log(`Processing gRPC check for ${monitorId}`);

  const grpcConfig = config?.grpc || {};
  const defaultRegion = process.env.MONITOR_DEFAULT_REGION || "uk";
  const startTime = performance.now();
  let status: CheckStatus = "success";
  let responseTimeMs = 0;
  let errorMessage: string | undefined;
  let errorCode: string | undefined;

  return new Promise<{ status: CheckStatus; responseTimeMs: number; errorMessage?: string }>((resolve) => {
    let client: grpc.Client | null = null;
    let timeoutId: NodeJS.Timeout | null = null;
    let resolved = false;

    const cleanup = async (finalStatus: CheckStatus, finalError?: string, finalErrorCode?: string) => {
      if (resolved) return;
      resolved = true;

      if (timeoutId) {
        clearTimeout(timeoutId);
        timeoutId = null;
      }

      if (client) {
        try {
          client.close();
        } catch {
          // Ignore cleanup errors
        }
        client = null;
      }

      responseTimeMs = Math.round(performance.now() - startTime);
      status = finalStatus;
      errorMessage = finalError;
      errorCode = finalErrorCode;

      // Store result
      const resultId = nanoid();
      const now = new Date();

      await db.insert(checkResults).values({
        id: resultId,
        monitorId,
        region: defaultRegion,
        status,
        responseTimeMs,
        errorMessage,
        errorCode,
        createdAt: now,
      });

      // Fetch monitor to get organizationId for alert evaluation
      const monitor = await db
        .select({ organizationId: monitors.organizationId })
        .from(monitors)
        .where(eq(monitors.id, monitorId))
        .limit(1);

      // Update monitor status
      const newStatus =
        status === "success"
          ? "active"
          : status === "degraded"
          ? "degraded"
          : "down";

      await db
        .update(monitors)
        .set({
          status: newStatus,
          updatedAt: now,
        })
        .where(eq(monitors.id, monitorId));

      // Publish event for real-time updates
      await publishEvent(`monitor:${monitorId}`, {
        type: "monitor:check",
        data: {
          monitorId,
          status,
          responseTimeMs,
          timestamp: now.toISOString(),
        },
      });

      // Evaluate alert policies for this monitor
      if (monitor[0]) {
        await evaluateAlerts({
          monitorId,
          organizationId: monitor[0].organizationId,
          checkResultId: resultId,
          checkStatus: status,
          errorMessage,
          responseTimeMs,
        });
      }

      console.log(`gRPC check completed for ${monitorId}: ${status} (${responseTimeMs}ms)`);

      resolve({
        status,
        responseTimeMs,
        errorMessage,
      });
    };

    // Set timeout
    timeoutId = setTimeout(() => {
      cleanup("timeout", "Connection timeout", "TIMEOUT");
    }, timeoutMs);

    try {
      // Create credentials
      const credentials = grpcConfig.useTls
        ? grpc.credentials.createSsl()
        : grpc.credentials.createInsecure();

      // Create metadata if provided
      const metadata = new grpc.Metadata();
      if (grpcConfig.metadata) {
        for (const [key, value] of Object.entries(grpcConfig.metadata)) {
          metadata.add(key, value);
        }
      }

      // Use a simple connectivity check
      // Create a generic client to check channel connectivity
      client = new grpc.Client(
        url,
        credentials,
        {
          "grpc.keepalive_time_ms": 10000,
          "grpc.keepalive_timeout_ms": 5000,
        }
      );

      // Wait for the channel to be ready
      const deadline = new Date(Date.now() + timeoutMs);
      client.waitForReady(deadline, async (error) => {
        if (error) {
          const errMessage = error.message || "Unknown gRPC error";

          if (errMessage.includes("UNAVAILABLE") || errMessage.includes("ECONNREFUSED")) {
            await cleanup("failure", errMessage, "CONNECTION_REFUSED");
          } else if (errMessage.includes("DEADLINE_EXCEEDED") || errMessage.includes("timeout")) {
            await cleanup("timeout", errMessage, "TIMEOUT");
          } else if (errMessage.includes("ENOTFOUND") || errMessage.includes("DNS")) {
            await cleanup("failure", errMessage, "HOST_NOT_FOUND");
          } else if (errMessage.includes("UNAUTHENTICATED") || errMessage.includes("PERMISSION_DENIED")) {
            await cleanup("failure", errMessage, "AUTH_FAILED");
          } else if (errMessage.includes("SSL") || errMessage.includes("certificate")) {
            await cleanup("failure", errMessage, "SSL_ERROR");
          } else {
            await cleanup("error", errMessage, "UNKNOWN");
          }
          return;
        }

        // If we have a specific service/method to call for health check
        if (grpcConfig.serviceName && grpcConfig.methodName) {
          // For custom service calls, we'd need the proto definition
          // For now, we just verify connectivity was successful
          console.log(`gRPC channel ready for ${url}, service: ${grpcConfig.serviceName}`);
          await cleanup("success");
        } else {
          // Standard health check - try to make a health check call
          // Using unary call to grpc.health.v1.Health/Check
          const healthPath = "/grpc.health.v1.Health/Check";

          // Make unary call using the generic client
          client!.makeUnaryRequest(
            healthPath,
            (value: { service?: string }) => {
              // Serialize request - simple protobuf encoding for HealthCheckRequest
              const buf = Buffer.alloc(value.service ? value.service.length + 2 : 2);
              if (value.service) {
                buf.writeUInt8(0x0a, 0); // field 1, wire type 2 (length-delimited)
                buf.writeUInt8(value.service.length, 1);
                buf.write(value.service, 2);
              }
              return buf;
            },
            (buffer: Buffer) => {
              // Deserialize response - simple protobuf decoding for HealthCheckResponse
              if (buffer.length >= 2) {
                const statusValue = buffer.readUInt8(1);
                return { status: statusValue };
              }
              return { status: 0 };
            },
            { service: grpcConfig.serviceName || "" },
            metadata,
            { deadline },
            async (error, response) => {
              if (error) {
                // Health service may not be implemented - if we got this far, channel is up
                if (error.code === grpc.status.UNIMPLEMENTED) {
                  // Health service not implemented, but connection works
                  console.log(`gRPC health service not implemented at ${url}, but connection succeeded`);
                  await cleanup("success");
                } else if (error.code === grpc.status.UNAVAILABLE) {
                  await cleanup("failure", error.message, "SERVICE_UNAVAILABLE");
                } else if (error.code === grpc.status.DEADLINE_EXCEEDED) {
                  await cleanup("timeout", error.message, "TIMEOUT");
                } else {
                  // Other error but connection was established
                  await cleanup("degraded", `Health check failed: ${error.message}`, "HEALTH_CHECK_FAILED");
                }
                return;
              }

              // Check health response status
              const responseStatus = (response as { status?: number })?.status;
              if (responseStatus === 1) {
                // SERVING
                await cleanup("success");
              } else if (responseStatus === 2) {
                // NOT_SERVING
                await cleanup("failure", "Service not serving", "NOT_SERVING");
              } else if (responseStatus === 3) {
                // SERVICE_UNKNOWN
                await cleanup("degraded", "Service unknown", "SERVICE_UNKNOWN");
              } else {
                // UNKNOWN or unexpected
                await cleanup("degraded", `Unknown health status: ${responseStatus}`, "UNKNOWN_STATUS");
              }
            }
          );
        }
      });

    } catch (err) {
      const errMessage = err instanceof Error ? err.message : "Unknown error";
      cleanup("error", errMessage, "UNKNOWN");
    }
  });
}
