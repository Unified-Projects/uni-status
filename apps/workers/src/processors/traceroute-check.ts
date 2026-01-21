import { Job } from "bullmq";
import { nanoid } from "nanoid";
import { db } from "@uni-status/database";
import { monitors, checkResults } from "@uni-status/database/schema";
import { eq } from "drizzle-orm";
import { publishEvent } from "../lib/redis";
import { evaluateAlerts } from "../lib/alert-evaluator";
import type { CheckStatus } from "@uni-status/shared/types";
import { spawn } from "child_process";

interface TracerouteConfig {
  maxHops?: number;
  packetSize?: number;
  expectedHopCount?: number;
  expectedLastHop?: string;
}

interface TracerouteCheckJob {
  monitorId: string;
  url: string;  // hostname or IP address
  timeoutMs: number;
  config?: {
    traceroute?: TracerouteConfig;
  };
}

interface TracerouteHop {
  hop: number;
  address: string | null;
  hostname: string | null;
  rtt: number | null;  // Round-trip time in ms
}

function parseTracerouteOutput(output: string): TracerouteHop[] {
  const hops: TracerouteHop[] = [];
  const lines = output.split("\n");

  for (const line of lines) {
    // Skip header line and empty lines
    if (!line.trim() || line.includes("traceroute to") || line.includes("tracert")) {
      continue;
    }

    // Parse traceroute line format:
    // Linux: " 1  192.168.1.1 (192.168.1.1)  1.234 ms  1.456 ms  1.678 ms"
    // macOS: " 1  192.168.1.1 (192.168.1.1)  1.234 ms  1.456 ms  1.678 ms"
    // Windows: "  1    <1 ms    <1 ms    <1 ms  192.168.1.1"

    const hopMatch = line.match(/^\s*(\d+)/);
    if (!hopMatch) continue;

    const hopNumber = Number.parseInt(hopMatch[1] ?? "0", 10);

    // Check for timeout (* * *)
    if (line.includes("* * *") || line.includes("Request timed out")) {
      hops.push({
        hop: hopNumber,
        address: null,
        hostname: null,
        rtt: null,
      });
      continue;
    }

    // Extract IP address
    const ipMatch = line.match(/(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})/);
    const address = ipMatch?.[1] ?? null;

    // Extract hostname (appears before IP in parentheses on Unix)
    const hostnameMatch = line.match(/\s+([a-zA-Z0-9.-]+)\s+\([\d.]+\)/);
    const hostname = hostnameMatch?.[1] ?? null;

    // Extract RTT (first time value)
    const rttMatch = line.match(/([\d.]+)\s*ms/);
    const rtt = rttMatch?.[1] ? Number.parseFloat(rttMatch[1]) : null;

    hops.push({
      hop: hopNumber,
      address,
      hostname: hostname || address,
      rtt,
    });
  }

  return hops;
}

// Extract hostname from URL (handles both full URLs and plain hostnames)
function extractHostname(urlOrHost: string): string {
  try {
    // If it looks like a URL (has protocol), parse it
    if (urlOrHost.includes("://")) {
      const parsed = new URL(urlOrHost);
      return parsed.hostname;
    }
    // Otherwise assume it's already a hostname
    return urlOrHost;
  } catch {
    // If URL parsing fails, return as-is
    return urlOrHost;
  }
}

export async function processTracerouteCheck(job: Job<TracerouteCheckJob>) {
  const { monitorId, url, timeoutMs, config } = job.data;

  // Extract hostname from URL for traceroute command
  const hostname = extractHostname(url);

  console.log(`Processing traceroute check for ${monitorId} to ${hostname} (from ${url})`);

  const tracerouteConfig = config?.traceroute || {};
  const defaultRegion = process.env.MONITOR_DEFAULT_REGION || "uk";
  const startTime = performance.now();
  let status: CheckStatus = "success";
  let responseTimeMs = 0;
  let errorMessage: string | undefined;
  let errorCode: string | undefined;

  return new Promise<{ status: CheckStatus; responseTimeMs: number; errorMessage?: string }>((resolve) => {
    let resolved = false;
    let timeoutId: NodeJS.Timeout | null = null;
    let childProcess: ReturnType<typeof spawn> | null = null;
    let stdout = "";
    let stderr = "";

    const cleanup = async (finalStatus: CheckStatus, finalError?: string, finalErrorCode?: string) => {
      if (resolved) return;
      resolved = true;

      if (timeoutId) {
        clearTimeout(timeoutId);
        timeoutId = null;
      }

      if (childProcess) {
        try {
          childProcess.kill();
        } catch {
          // Ignore cleanup errors
        }
        childProcess = null;
      }

      responseTimeMs = Math.round(performance.now() - startTime);
      status = finalStatus;
      errorMessage = finalError;
      errorCode = finalErrorCode;

      // Parse results if we have output
      let hops: TracerouteHop[] = [];
      if (stdout) {
        hops = parseTracerouteOutput(stdout);
      }

      // Store result with traceroute data
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
        metadata: { hops, target: url },
        createdAt: now,
      });

      // Fetch monitor to get organizationId
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

      // Publish event
      await publishEvent(`monitor:${monitorId}`, {
        type: "monitor:check",
        data: {
          monitorId,
          status,
          responseTimeMs,
          hops,
          timestamp: now.toISOString(),
        },
      });

      // Evaluate alerts
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

      console.log(`Traceroute check completed for ${monitorId}: ${status} (${responseTimeMs}ms, ${hops.length} hops)`);

      resolve({
        status,
        responseTimeMs,
        errorMessage,
      });
    };

    // Set timeout
    timeoutId = setTimeout(() => {
      cleanup("timeout", "Traceroute timeout", "TIMEOUT");
    }, timeoutMs);

    try {
      // Build traceroute command arguments
      const maxHops = tracerouteConfig.maxHops || 30;
      const waitTime = Math.ceil(timeoutMs / 1000 / maxHops);  // Wait time per hop

      // Detect OS and use appropriate command
      const isWindows = process.platform === "win32";

      let command: string;
      let args: string[];

      if (isWindows) {
        command = "tracert";
        args = ["-h", String(maxHops), "-w", String(waitTime * 1000), hostname];
      } else {
        command = "traceroute";
        // Use ICMP mode (-I) which works better in containerized environments
        // where UDP traceroute packets may be blocked or not properly routed
        args = ["-I", "-m", String(maxHops), "-w", String(Math.max(1, waitTime)), "-q", "1", hostname];

        // Add packet size if specified
        if (tracerouteConfig.packetSize) {
          args.push(String(tracerouteConfig.packetSize));
        }
      }

      childProcess = spawn(command, args);

      childProcess.stdout?.on("data", (data: Buffer) => {
        stdout += data.toString();
      });

      childProcess.stderr?.on("data", (data: Buffer) => {
        stderr += data.toString();
      });

      childProcess.on("close", async (code) => {
        if (resolved) return;

        if (code === 0 || stdout.length > 0) {
          // Parse output and validate
          const hops = parseTracerouteOutput(stdout);

          if (hops.length === 0) {
            await cleanup("failure", "No hops detected", "NO_HOPS");
            return;
          }

          // Check if traceroute reached the destination
          const lastHop = hops[hops.length - 1];
          if (!lastHop) {
            await cleanup("failure", "No hops detected", "NO_HOPS");
            return;
          }
          const reachedDestination = lastHop.address !== null;

          // Check expected hop count
          if (tracerouteConfig.expectedHopCount !== undefined) {
            if (hops.length !== tracerouteConfig.expectedHopCount) {
              await cleanup("degraded", `Expected ${tracerouteConfig.expectedHopCount} hops, got ${hops.length}`, "HOP_COUNT_MISMATCH");
              return;
            }
          }

          // Check expected last hop
          if (tracerouteConfig.expectedLastHop && lastHop.address !== tracerouteConfig.expectedLastHop) {
            await cleanup("degraded", `Expected last hop ${tracerouteConfig.expectedLastHop}, got ${lastHop.address}`, "LAST_HOP_MISMATCH");
            return;
          }

          if (!reachedDestination) {
            await cleanup("failure", "Could not reach destination", "DESTINATION_UNREACHABLE");
          } else {
            await cleanup("success");
          }
        } else {
          const errMsg = stderr || `Traceroute failed with code ${code}`;

          if (errMsg.includes("Name or service not known") || errMsg.includes("cannot resolve")) {
            await cleanup("failure", errMsg, "HOST_NOT_FOUND");
          } else if (errMsg.includes("Operation not permitted") || errMsg.includes("permission")) {
            await cleanup("error", errMsg, "PERMISSION_DENIED");
          } else {
            await cleanup("error", errMsg, "UNKNOWN");
          }
        }
      });

      childProcess.on("error", async (err) => {
        const errMessage = err.message || "Unknown error";

        if (errMessage.includes("ENOENT")) {
          await cleanup("error", "Traceroute command not found", "COMMAND_NOT_FOUND");
        } else {
          await cleanup("error", errMessage, "UNKNOWN");
        }
      });

    } catch (err) {
      const errMessage = err instanceof Error ? err.message : "Unknown error";
      cleanup("error", errMessage, "UNKNOWN");
    }
  });
}
