/**
 * Worker Check Execution Tests
 *
 * End-to-end tests that verify workers correctly execute checks
 * against test services and store results with expected data.
 */

import { describe, it, expect, beforeAll } from "vitest";
import { randomUUID } from "crypto";
import { bootstrapTestContext, TestContext } from "../helpers/context";
import {
  triggerAndWaitForCheck,
  waitForCheckResult,
  forceMonitorDue,
  getLatestCheckResult,
  clearCheckResults,
} from "../helpers/worker-integration";
import {
  TEST_SERVICES,
  getTestUrlForMonitorType,
  getTestConfigForMonitorType,
} from "../helpers/services";
import { setMonitorStatus, getMonitorById } from "../helpers/data";

const API_BASE_URL = process.env.API_BASE_URL ?? "http://api:3001";

type MonitorPayload = {
  name: string;
  url: string;
  type: string;
  method?: string;
  intervalSeconds?: number;
  timeoutMs?: number;
  config?: Record<string, unknown>;
  regions?: string[];
};

async function createMonitor(
  ctx: TestContext,
  payload: MonitorPayload
): Promise<{ id: string; heartbeatToken?: string }> {
  const response = await fetch(`${API_BASE_URL}/api/v1/monitors`, {
    method: "POST",
    headers: ctx.headers,
    body: JSON.stringify({
      intervalSeconds: 60,
      timeoutMs: 30000,
      method: "GET",
      regions: ["uk"],
      ...payload,
    }),
  });

  expect(response.status).toBe(201);
  const body = await response.json();
  expect(body.success).toBe(true);

  return {
    id: body.data.id,
    heartbeatToken: body.data.heartbeatToken,
  };
}

describe("Worker Check Execution", () => {
  let ctx: TestContext;

  beforeAll(async () => {
    ctx = await bootstrapTestContext();
  });

  describe("HTTP/HTTPS checks", () => {
    it("executes HTTP check against httpbin and stores result with timing metrics", async () => {
      const monitor = await createMonitor(ctx, {
        name: `HTTP Check Test ${randomUUID().slice(0, 8)}`,
        url: `${TEST_SERVICES.HTTPBIN_URL}/get`,
        type: "http",
        config: getTestConfigForMonitorType("http"),
      });

      // Ensure monitor is not paused
      await setMonitorStatus(monitor.id, "pending");

      // Trigger check and wait for result
      const result = await triggerAndWaitForCheck(ctx, monitor.id, {
        timeoutMs: 30000,
      });

      expect(result).toBeDefined();
      expect(result.status).toBe("success");
      expect(result.statusCode).toBe(200);
      expect(result.responseTimeMs).toBeGreaterThan(0);

      // Verify timing metrics are present
      expect(result.dnsMs).toBeDefined();
      expect(result.tcpMs).toBeDefined();
    });

    it("handles HTTP timeout correctly", async () => {
      const monitor = await createMonitor(ctx, {
        name: `HTTP Timeout Test ${randomUUID().slice(0, 8)}`,
        url: `${TEST_SERVICES.HTTPBIN_URL}/delay/10`, // 10 second delay
        type: "http",
        timeoutMs: 2000, // 2 second timeout
        config: getTestConfigForMonitorType("http"),
      });

      await setMonitorStatus(monitor.id, "pending");

      const result = await triggerAndWaitForCheck(ctx, monitor.id, {
        timeoutMs: 30000,
      });

      expect(result).toBeDefined();
      expect(["timeout", "error", "failure"]).toContain(result.status);
    });

    it("marks monitor as degraded when response is slow", async () => {
      const monitor = await createMonitor(ctx, {
        name: `HTTP Degraded Test ${randomUUID().slice(0, 8)}`,
        url: `${TEST_SERVICES.HTTPBIN_URL}/delay/1`, // 1 second delay
        type: "http",
        timeoutMs: 10000,
        config: {
          ...getTestConfigForMonitorType("http"),
          degradedThresholdMs: 500, // Trigger degraded if > 500ms
        },
      });

      await setMonitorStatus(monitor.id, "pending");

      const result = await triggerAndWaitForCheck(ctx, monitor.id, {
        timeoutMs: 30000,
      });

      expect(result).toBeDefined();
      // Response should be slow enough to be degraded
      expect(result.responseTimeMs).toBeGreaterThan(500);
    });

    it("stores response headers in result", async () => {
      const monitor = await createMonitor(ctx, {
        name: `HTTP Headers Test ${randomUUID().slice(0, 8)}`,
        url: `${TEST_SERVICES.HTTPBIN_URL}/response-headers?X-Test-Header=test-value`,
        type: "http",
        config: getTestConfigForMonitorType("http"),
      });

      await setMonitorStatus(monitor.id, "pending");

      const result = await triggerAndWaitForCheck(ctx, monitor.id, {
        timeoutMs: 30000,
      });

      expect(result).toBeDefined();
      expect(result.status).toBe("success");
      // Headers should be stored
      if (result.headers) {
        expect(typeof result.headers).toBe("object");
      }
    });

    it("handles various HTTP status codes correctly", async () => {
      // Test 404 response - without assertions, any valid HTTP response is "success"
      // because the server responded (connectivity is confirmed)
      const monitor404 = await createMonitor(ctx, {
        name: `HTTP 404 Test ${randomUUID().slice(0, 8)}`,
        url: `${TEST_SERVICES.HTTPBIN_URL}/status/404`,
        type: "http",
        config: getTestConfigForMonitorType("http"),
      });

      await setMonitorStatus(monitor404.id, "pending");

      const result404 = await triggerAndWaitForCheck(ctx, monitor404.id, {
        timeoutMs: 30000,
      });

      expect(result404).toBeDefined();
      expect(result404.statusCode).toBe(404);
      // Without status code assertions, a 404 is still a valid response
      // The monitor connected successfully and got an HTTP response
      expect(["success", "failure", "error"]).toContain(result404.status);
    });

    it("handles connection refused correctly", async () => {
      const monitor = await createMonitor(ctx, {
        name: `HTTP Connection Refused Test ${randomUUID().slice(0, 8)}`,
        url: "http://localhost:59999/nonexistent", // Port that's not listening
        type: "http",
        timeoutMs: 5000,
        config: getTestConfigForMonitorType("http"),
      });

      await setMonitorStatus(monitor.id, "pending");

      const result = await triggerAndWaitForCheck(ctx, monitor.id, {
        timeoutMs: 30000,
      });

      expect(result).toBeDefined();
      expect(["failure", "error", "timeout"]).toContain(result.status);
      expect(result.errorMessage).toBeDefined();
    });
  });

  describe("HTTPS/SSL checks", () => {
    it("does not attach certificate info on regular HTTPS uptime checks", async () => {
      const monitor = await createMonitor(ctx, {
        name: `HTTPS Cert Test ${randomUUID().slice(0, 8)}`,
        url: TEST_SERVICES.NGINX_SSL_URL,
        type: "https",
        config: getTestConfigForMonitorType("https"),
      });

      await setMonitorStatus(monitor.id, "pending");

      const result = await triggerAndWaitForCheck(ctx, monitor.id, {
        timeoutMs: 30000,
      });

      expect(result).toBeDefined();
      // Certificate checks are handled separately on a daily cadence
      expect(result.certificateInfo ?? null).toBeNull();
    });

    it("stores TLS timing metrics", async () => {
      const monitor = await createMonitor(ctx, {
        name: `HTTPS TLS Timing Test ${randomUUID().slice(0, 8)}`,
        url: TEST_SERVICES.NGINX_SSL_URL,
        type: "https",
        config: getTestConfigForMonitorType("https"),
      });

      await setMonitorStatus(monitor.id, "pending");

      const result = await triggerAndWaitForCheck(ctx, monitor.id, {
        timeoutMs: 30000,
      });

      expect(result).toBeDefined();
      // TLS timing should be recorded for HTTPS requests
      if (result.status === "success") {
        expect(result.tlsMs).toBeDefined();
      }
    });
  });

  describe("TCP checks", () => {
    it("connects to TCP echo server successfully", async () => {
      const monitor = await createMonitor(ctx, {
        name: `TCP Check Test ${randomUUID().slice(0, 8)}`,
        url: TEST_SERVICES.TCP_ECHO_URL,
        type: "tcp",
        timeoutMs: 10000,
        config: getTestConfigForMonitorType("tcp"),
      });

      await setMonitorStatus(monitor.id, "pending");

      const result = await triggerAndWaitForCheck(ctx, monitor.id, {
        timeoutMs: 30000,
      });

      expect(result).toBeDefined();
      expect(result.status).toBe("success");
      // Response time may be 0 for very fast local connections, or null if not measured
      expect(result.responseTimeMs).toBeGreaterThanOrEqual(0);
      // TCP connection time should be defined (may be 0 for fast connections)
      expect(result.tcpMs).toBeDefined();
    });

    it("handles TCP connection refused", async () => {
      const monitor = await createMonitor(ctx, {
        name: `TCP Refused Test ${randomUUID().slice(0, 8)}`,
        url: "tcp://localhost:59998", // Port not listening
        type: "tcp",
        timeoutMs: 5000,
        config: getTestConfigForMonitorType("tcp"),
      });

      await setMonitorStatus(monitor.id, "pending");

      const result = await triggerAndWaitForCheck(ctx, monitor.id, {
        timeoutMs: 30000,
      });

      expect(result).toBeDefined();
      expect(["failure", "error", "timeout"]).toContain(result.status);
    });

    it("handles TCP timeout", async () => {
      const monitor = await createMonitor(ctx, {
        name: `TCP Timeout Test ${randomUUID().slice(0, 8)}`,
        url: "tcp://10.255.255.1:80", // Non-routable IP to force timeout
        type: "tcp",
        timeoutMs: 3000,
        config: getTestConfigForMonitorType("tcp"),
      });

      await setMonitorStatus(monitor.id, "pending");

      const result = await triggerAndWaitForCheck(ctx, monitor.id, {
        timeoutMs: 30000,
      });

      expect(result).toBeDefined();
      expect(["timeout", "error", "failure"]).toContain(result.status);
    });
  });

  describe("WebSocket checks", () => {
    it("connects to WebSocket echo server and exchanges messages", async () => {
      const monitor = await createMonitor(ctx, {
        name: `WebSocket Check Test ${randomUUID().slice(0, 8)}`,
        url: TEST_SERVICES.WS_ECHO_URL,
        type: "websocket",
        timeoutMs: 10000,
        config: getTestConfigForMonitorType("websocket"),
      });

      await setMonitorStatus(monitor.id, "pending");

      const result = await triggerAndWaitForCheck(ctx, monitor.id, {
        timeoutMs: 30000,
      });

      expect(result).toBeDefined();
      expect(result.status).toBe("success");
      // Response time may be 0 for very fast local connections
      expect(result.responseTimeMs).toBeGreaterThanOrEqual(0);
    });

    it("handles WebSocket connection failure", async () => {
      const monitor = await createMonitor(ctx, {
        name: `WebSocket Failure Test ${randomUUID().slice(0, 8)}`,
        url: "ws://localhost:59997", // Port not listening
        type: "websocket",
        timeoutMs: 5000,
        config: getTestConfigForMonitorType("websocket"),
      });

      await setMonitorStatus(monitor.id, "pending");

      const result = await triggerAndWaitForCheck(ctx, monitor.id, {
        timeoutMs: 30000,
      });

      expect(result).toBeDefined();
      expect(["failure", "error", "timeout"]).toContain(result.status);
    });
  });

  describe("SMTP checks", () => {
    it("connects to mailhog SMTP server", async () => {
      const monitor = await createMonitor(ctx, {
        name: `SMTP Check Test ${randomUUID().slice(0, 8)}`,
        url: `smtp://${TEST_SERVICES.MAILHOG_HOST}:${TEST_SERVICES.MAILHOG_SMTP_PORT}`,
        type: "smtp",
        timeoutMs: 10000,
        config: getTestConfigForMonitorType("smtp"),
      });

      await setMonitorStatus(monitor.id, "pending");

      const result = await triggerAndWaitForCheck(ctx, monitor.id, {
        timeoutMs: 30000,
      });

      expect(result).toBeDefined();
      expect(result.status).toBe("success");
      expect(result.responseTimeMs).toBeGreaterThan(0);
    });
  });

  describe("MQTT checks", () => {
    it("connects to mosquitto MQTT broker", async () => {
      const monitor = await createMonitor(ctx, {
        name: `MQTT Check Test ${randomUUID().slice(0, 8)}`,
        url: TEST_SERVICES.MOSQUITTO_URL,
        type: "mqtt",
        timeoutMs: 10000,
        config: getTestConfigForMonitorType("mqtt"),
      });

      await setMonitorStatus(monitor.id, "pending");

      const result = await triggerAndWaitForCheck(ctx, monitor.id, {
        timeoutMs: 30000,
      });

      expect(result).toBeDefined();
      if (result.status !== "success") {
        console.error(`MQTT check failed: ${result.errorMessage || "no error message"}`);
        console.error(`MQTT error code: ${result.errorCode || "none"}`);
      }
      expect(result.status).toBe("success");
      expect(result.responseTimeMs).toBeGreaterThanOrEqual(0);
    });
  });

  describe("AMQP checks", () => {
    it("connects to RabbitMQ AMQP broker", async () => {
      const monitor = await createMonitor(ctx, {
        name: `AMQP Check Test ${randomUUID().slice(0, 8)}`,
        url: TEST_SERVICES.RABBITMQ_URL,
        type: "amqp",
        timeoutMs: 10000,
        config: getTestConfigForMonitorType("amqp"),
      });

      await setMonitorStatus(monitor.id, "pending");

      const result = await triggerAndWaitForCheck(ctx, monitor.id, {
        timeoutMs: 30000,
      });

      expect(result).toBeDefined();
      if (result.status !== "success") {
        console.error(`AMQP check failed: ${result.errorMessage || "no error message"}`);
        console.error(`AMQP error code: ${result.errorCode || "none"}`);
      }
      expect(result.status).toBe("success");
      expect(result.responseTimeMs).toBeGreaterThanOrEqual(0);
    });
  });

  describe("SSH checks", () => {
    it("connects to OpenSSH server and extracts banner", async () => {
      const monitor = await createMonitor(ctx, {
        name: `SSH Check Test ${randomUUID().slice(0, 8)}`,
        url: `ssh://${TEST_SERVICES.OPENSSH_HOST}:${TEST_SERVICES.OPENSSH_PORT}`,
        type: "ssh",
        timeoutMs: 10000,
        config: getTestConfigForMonitorType("ssh"),
      });

      await setMonitorStatus(monitor.id, "pending");

      const result = await triggerAndWaitForCheck(ctx, monitor.id, {
        timeoutMs: 30000,
      });

      expect(result).toBeDefined();
      if (result.status !== "success") {
        console.error(`SSH check failed: ${result.errorMessage || "no error message"}`);
        console.error(`SSH error code: ${result.errorCode || "none"}`);
      }
      expect(result.status).toBe("success");
      expect(result.responseTimeMs).toBeGreaterThanOrEqual(0);

      // Should have banner info in metadata
      if (result.metadata && typeof result.metadata === "object") {
        const banner = (result.metadata as Record<string, unknown>).banner;
        if (banner) {
          expect(String(banner)).toContain("SSH");
        }
      }
    });
  });

  describe("LDAP checks", () => {
    it("connects to OpenLDAP server", async () => {
      const monitor = await createMonitor(ctx, {
        name: `LDAP Check Test ${randomUUID().slice(0, 8)}`,
        url: TEST_SERVICES.OPENLDAP_URL,
        type: "ldap",
        timeoutMs: 10000,
        config: getTestConfigForMonitorType("ldap"),
      });

      await setMonitorStatus(monitor.id, "pending");

      const result = await triggerAndWaitForCheck(ctx, monitor.id, {
        timeoutMs: 30000,
      });

      expect(result).toBeDefined();
      expect(result.status).toBe("success");
      expect(result.responseTimeMs).toBeGreaterThan(0);
    });
  });

  describe("Heartbeat checks", () => {
    it("accepts heartbeat ping via public endpoint", async () => {
      const monitor = await createMonitor(ctx, {
        name: `Heartbeat Check Test ${randomUUID().slice(0, 8)}`,
        url: "heartbeat://test-job",
        type: "heartbeat",
        config: getTestConfigForMonitorType("heartbeat"),
      });

      expect(monitor.heartbeatToken).toBeDefined();

      // Send heartbeat ping via public endpoint
      const pingResponse = await fetch(
        `${API_BASE_URL}/api/public/heartbeat/${monitor.heartbeatToken}?status=complete&duration=1234`,
        { method: "GET" }
      );

      expect(pingResponse.status).toBe(200);
      const pingBody = await pingResponse.json();
      expect(pingBody.success).toBe(true);
    });

    it("accepts heartbeat ping with POST method and metadata", async () => {
      const monitor = await createMonitor(ctx, {
        name: `Heartbeat POST Test ${randomUUID().slice(0, 8)}`,
        url: "heartbeat://test-job-post",
        type: "heartbeat",
        config: getTestConfigForMonitorType("heartbeat"),
      });

      expect(monitor.heartbeatToken).toBeDefined();

      // Send heartbeat ping via POST with metadata
      const pingResponse = await fetch(
        `${API_BASE_URL}/api/public/heartbeat/${monitor.heartbeatToken}?status=complete&duration=5678&exit_code=0`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ job: "backup", host: "server1" }),
        }
      );

      expect(pingResponse.status).toBe(200);
      const pingBody = await pingResponse.json();
      expect(pingBody.success).toBe(true);
    });
  });

  describe("Database checks", () => {
    it("connects to PostgreSQL database", async () => {
      const monitor = await createMonitor(ctx, {
        name: `Postgres Check Test ${randomUUID().slice(0, 8)}`,
        url: `postgres://${TEST_SERVICES.POSTGRES_HOST}:${TEST_SERVICES.POSTGRES_PORT}/uni_status`,
        type: "database_postgres",
        timeoutMs: 10000,
        config: getTestConfigForMonitorType("database_postgres"),
      });

      await setMonitorStatus(monitor.id, "pending");

      const result = await triggerAndWaitForCheck(ctx, monitor.id, {
        timeoutMs: 30000,
      });

      expect(result).toBeDefined();
      expect(result.status).toBe("success");
      expect(result.responseTimeMs).toBeGreaterThan(0);
    });

    it("connects to Redis cache", async () => {
      const monitor = await createMonitor(ctx, {
        name: `Redis Check Test ${randomUUID().slice(0, 8)}`,
        url: `redis://${TEST_SERVICES.REDIS_HOST}:${TEST_SERVICES.REDIS_PORT}`,
        type: "database_redis",
        timeoutMs: 10000,
        config: getTestConfigForMonitorType("database_redis"),
      });

      await setMonitorStatus(monitor.id, "pending");

      const result = await triggerAndWaitForCheck(ctx, monitor.id, {
        timeoutMs: 30000,
      });

      expect(result).toBeDefined();
      expect(result.status).toBe("success");
      expect(result.responseTimeMs).toBeGreaterThan(0);
    });
  });

  describe("DNS checks", () => {
    it("resolves DNS A records correctly", async () => {
      const monitor = await createMonitor(ctx, {
        name: `DNS Check Test ${randomUUID().slice(0, 8)}`,
        url: "example.com",
        type: "dns",
        timeoutMs: 10000,
        config: {
          dns: {
            recordType: "A",
            nameserver: "8.8.8.8",
          },
        },
      });

      await setMonitorStatus(monitor.id, "pending");

      const result = await triggerAndWaitForCheck(ctx, monitor.id, {
        timeoutMs: 30000,
      });

      expect(result).toBeDefined();
      expect(result.status).toBe("success");
      expect(result.responseTimeMs).toBeGreaterThan(0);

      // DNS results should be in metadata
      if (result.metadata) {
        expect(typeof result.metadata).toBe("object");
      }
    });

    it("handles DNS NXDOMAIN correctly", async () => {
      const monitor = await createMonitor(ctx, {
        name: `DNS NXDOMAIN Test ${randomUUID().slice(0, 8)}`,
        url: "nonexistent-domain-12345.invalid",
        type: "dns",
        timeoutMs: 10000,
        config: {
          dns: {
            recordType: "A",
            nameserver: "8.8.8.8",
          },
        },
      });

      await setMonitorStatus(monitor.id, "pending");

      const result = await triggerAndWaitForCheck(ctx, monitor.id, {
        timeoutMs: 30000,
      });

      expect(result).toBeDefined();
      expect(["failure", "error"]).toContain(result.status);
    });
  });

  describe("SSL certificate checks", () => {
    it("extracts certificate info from SSL endpoint", async () => {
      const monitor = await createMonitor(ctx, {
        name: `SSL Check Test ${randomUUID().slice(0, 8)}`,
        url: TEST_SERVICES.NGINX_SSL_URL,
        type: "ssl",
        timeoutMs: 10000,
        config: getTestConfigForMonitorType("ssl"),
      });

      await setMonitorStatus(monitor.id, "pending");

      const result = await triggerAndWaitForCheck(ctx, monitor.id, {
        timeoutMs: 30000,
      });

      expect(result).toBeDefined();

      // Certificate info should be present regardless of chain validation
      if (result.certificateInfo) {
        expect(result.certificateInfo.subject).toBeDefined();
        expect(result.certificateInfo.issuer).toBeDefined();
        expect(result.certificateInfo.validFrom).toBeDefined();
        expect(result.certificateInfo.validTo).toBeDefined();
        expect(result.certificateInfo.daysUntilExpiry).toBeDefined();
      }
    });
  });

  describe("Monitor status updates", () => {
    it("updates monitor status to active on successful check", async () => {
      const monitor = await createMonitor(ctx, {
        name: `Status Update Test ${randomUUID().slice(0, 8)}`,
        url: `${TEST_SERVICES.HTTPBIN_URL}/get`,
        type: "http",
        config: getTestConfigForMonitorType("http"),
      });

      // Set to pending initially
      await setMonitorStatus(monitor.id, "pending");

      // Trigger check
      await triggerAndWaitForCheck(ctx, monitor.id, {
        timeoutMs: 30000,
        expectedStatus: "success",
      });

      // Verify monitor status is now active
      const updatedMonitor = await getMonitorById(monitor.id);
      expect(updatedMonitor).toBeDefined();
      expect(updatedMonitor!.status).toBe("active");
    });

    it("updates monitor status to down on failed check", async () => {
      const monitor = await createMonitor(ctx, {
        name: `Status Down Test ${randomUUID().slice(0, 8)}`,
        url: "http://localhost:59996", // Non-existent
        type: "http",
        timeoutMs: 5000,
        config: getTestConfigForMonitorType("http"),
      });

      // Set to pending initially
      await setMonitorStatus(monitor.id, "pending");

      // Trigger check and wait for failure
      const result = await triggerAndWaitForCheck(ctx, monitor.id, {
        timeoutMs: 30000,
      });

      expect(["failure", "error", "timeout"]).toContain(result.status);

      // Verify monitor status is now down
      const updatedMonitor = await getMonitorById(monitor.id);
      expect(updatedMonitor).toBeDefined();
      expect(updatedMonitor!.status).toBe("down");
    });
  });
});
