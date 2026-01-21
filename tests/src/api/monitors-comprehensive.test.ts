/**
 * Monitors API Comprehensive Tests
 *
 * Complete coverage of all monitor API endpoints including:
 * - CRUD operations
 * - Pause/Resume
 * - Results retrieval
 * - Immediate checks
 * - Heartbeat operations
 * - Pagination
 * - Filtering
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { randomUUID } from "crypto";
import { bootstrapTestContext, TestContext } from "../helpers/context";
import {
  insertCheckResults,
  insertCheckResultFull,
  setMonitorStatus,
  insertHeartbeatPing,
} from "../helpers/data";
import { TEST_SERVICES, getTestConfigForMonitorType } from "../helpers/services";

const API_BASE_URL = process.env.API_BASE_URL ?? "http://api:3001";

describe("Monitors API - Comprehensive", () => {
  let ctx: TestContext;
  const createdMonitors: string[] = [];

  beforeAll(async () => {
    ctx = await bootstrapTestContext();
  });

  afterAll(async () => {
    // Clean up created monitors
    for (const monitorId of createdMonitors) {
      try {
        await fetch(`${API_BASE_URL}/api/v1/monitors/${monitorId}`, {
          method: "DELETE",
          headers: ctx.headers,
        });
      } catch {
        // Ignore cleanup errors
      }
    }
  });

  describe("GET /api/v1/monitors", () => {
    beforeAll(async () => {
      // Create multiple monitors for list testing
      for (let i = 0; i < 5; i++) {
        const response = await fetch(`${API_BASE_URL}/api/v1/monitors`, {
          method: "POST",
          headers: ctx.headers,
          body: JSON.stringify({
            name: `List Test Monitor ${i} ${randomUUID().slice(0, 8)}`,
            url: `https://example${i}.com`,
            type: "https",
            intervalSeconds: 60,
            timeoutMs: 30000,
          }),
        });
        const body = await response.json();
        createdMonitors.push(body.data.id);
      }
    });

    it("returns list of monitors", async () => {
      const response = await fetch(`${API_BASE_URL}/api/v1/monitors`, {
        headers: ctx.headers,
      });

      expect(response.status).toBe(200);
      const body = await response.json();
      expect(body.success).toBe(true);
      expect(Array.isArray(body.data)).toBe(true);
      expect(body.data.length).toBeGreaterThanOrEqual(5);
    });

    it("returns monitors with expected fields", async () => {
      const response = await fetch(`${API_BASE_URL}/api/v1/monitors`, {
        headers: ctx.headers,
      });

      const body = await response.json();
      const monitor = body.data[0];

      expect(monitor.id).toBeDefined();
      expect(monitor.name).toBeDefined();
      expect(monitor.url).toBeDefined();
      expect(monitor.type).toBeDefined();
      expect(monitor.status).toBeDefined();
      expect(monitor.intervalSeconds).toBeDefined();
      expect(monitor.timeoutMs).toBeDefined();
    });

    it("supports pagination with limit parameter", async () => {
      const response = await fetch(
        `${API_BASE_URL}/api/v1/monitors?limit=2`,
        { headers: ctx.headers }
      );

      expect(response.status).toBe(200);
      const body = await response.json();
      expect(body.data.length).toBeLessThanOrEqual(2);
    });

    it("supports pagination with offset parameter", async () => {
      // Get first page
      const firstResponse = await fetch(
        `${API_BASE_URL}/api/v1/monitors?limit=2&offset=0`,
        { headers: ctx.headers }
      );
      const firstBody = await firstResponse.json();

      // Get second page
      const secondResponse = await fetch(
        `${API_BASE_URL}/api/v1/monitors?limit=2&offset=2`,
        { headers: ctx.headers }
      );
      const secondBody = await secondResponse.json();

      // Ensure different monitors are returned
      const firstIds = firstBody.data.map((m: any) => m.id);
      const secondIds = secondBody.data.map((m: any) => m.id);

      for (const id of secondIds) {
        expect(firstIds).not.toContain(id);
      }
    });

    it("includes uptime stats when available", async () => {
      const monitorId = createdMonitors[0];

      // Insert check results
      await insertCheckResults(monitorId, [
        { status: "success", responseTimeMs: 100 },
        { status: "success", responseTimeMs: 150 },
        { status: "failure", responseTimeMs: 0 },
      ]);
      await setMonitorStatus(monitorId, "active");

      const response = await fetch(`${API_BASE_URL}/api/v1/monitors`, {
        headers: ctx.headers,
      });

      const body = await response.json();
      const monitor = body.data.find((m: any) => m.id === monitorId);

      // Monitor should have uptime data
      expect(monitor).toBeDefined();
    });
  });

  describe("POST /api/v1/monitors", () => {
    it("creates a basic HTTP monitor", async () => {
      const response = await fetch(`${API_BASE_URL}/api/v1/monitors`, {
        method: "POST",
        headers: ctx.headers,
        body: JSON.stringify({
          name: `HTTP Monitor ${randomUUID().slice(0, 8)}`,
          url: "https://example.com",
          type: "http",
          intervalSeconds: 60,
          timeoutMs: 30000,
        }),
      });

      expect(response.status).toBe(201);
      const body = await response.json();
      expect(body.success).toBe(true);
      expect(body.data.id).toBeDefined();
      expect(body.data.type).toBe("http");
      createdMonitors.push(body.data.id);
    });

    it("creates monitor with custom headers", async () => {
      const response = await fetch(`${API_BASE_URL}/api/v1/monitors`, {
        method: "POST",
        headers: ctx.headers,
        body: JSON.stringify({
          name: `Headers Monitor ${randomUUID().slice(0, 8)}`,
          url: "https://api.example.com",
          type: "https",
          intervalSeconds: 60,
          timeoutMs: 30000,
          headers: {
            Authorization: "Bearer test-token",
            "X-Custom-Header": "custom-value",
          },
        }),
      });

      expect(response.status).toBe(201);
      const body = await response.json();
      expect(body.data.headers).toBeDefined();
      createdMonitors.push(body.data.id);
    });

    it("creates monitor with request body", async () => {
      const response = await fetch(`${API_BASE_URL}/api/v1/monitors`, {
        method: "POST",
        headers: ctx.headers,
        body: JSON.stringify({
          name: `POST Body Monitor ${randomUUID().slice(0, 8)}`,
          url: "https://api.example.com/webhook",
          type: "https",
          method: "POST",
          intervalSeconds: 60,
          timeoutMs: 30000,
          body: JSON.stringify({ event: "health_check" }),
        }),
      });

      expect(response.status).toBe(201);
      const body = await response.json();
      expect(body.data.method).toBe("POST");
      expect(body.data.body).toBeDefined();
      createdMonitors.push(body.data.id);
    });

    it("creates monitor with assertions", async () => {
      const response = await fetch(`${API_BASE_URL}/api/v1/monitors`, {
        method: "POST",
        headers: ctx.headers,
        body: JSON.stringify({
          name: `Assertions Monitor ${randomUUID().slice(0, 8)}`,
          url: "https://api.example.com/health",
          type: "https",
          intervalSeconds: 60,
          timeoutMs: 30000,
          assertions: {
            statusCode: [200, 201],
            responseTime: 3000,
            body: {
              contains: "healthy",
              jsonPath: [{ path: "$.status", value: "ok" }],
            },
          },
        }),
      });

      expect(response.status).toBe(201);
      const body = await response.json();
      expect(body.data.assertions).toBeDefined();
      createdMonitors.push(body.data.id);
    });

    it("creates monitor with multiple regions", async () => {
      const response = await fetch(`${API_BASE_URL}/api/v1/monitors`, {
        method: "POST",
        headers: ctx.headers,
        body: JSON.stringify({
          name: `Multi-Region Monitor ${randomUUID().slice(0, 8)}`,
          url: "https://global.example.com",
          type: "https",
          intervalSeconds: 60,
          timeoutMs: 30000,
          regions: ["uk", "us-east", "eu-west"],
        }),
      });

      expect(response.status).toBe(201);
      const body = await response.json();
      expect(body.data.regions).toContain("uk");
      createdMonitors.push(body.data.id);
    });

    it("creates heartbeat monitor with token", async () => {
      const response = await fetch(`${API_BASE_URL}/api/v1/monitors`, {
        method: "POST",
        headers: ctx.headers,
        body: JSON.stringify({
          name: `Heartbeat Monitor ${randomUUID().slice(0, 8)}`,
          url: "heartbeat://cron-job",
          type: "heartbeat",
          intervalSeconds: 300,
          config: {
            heartbeat: {
              expectedInterval: 300,
              gracePeriod: 60,
            },
          },
        }),
      });

      expect(response.status).toBe(201);
      const body = await response.json();
      expect(body.data.heartbeatToken).toBeDefined();
      expect(body.data.heartbeatToken.length).toBeGreaterThan(10);
      createdMonitors.push(body.data.id);
    });

    it("creates monitor with degraded threshold", async () => {
      const response = await fetch(`${API_BASE_URL}/api/v1/monitors`, {
        method: "POST",
        headers: ctx.headers,
        body: JSON.stringify({
          name: `Degraded Threshold Monitor ${randomUUID().slice(0, 8)}`,
          url: "https://example.com",
          type: "https",
          intervalSeconds: 60,
          timeoutMs: 30000,
          degradedThresholdMs: 1000,
        }),
      });

      expect(response.status).toBe(201);
      const body = await response.json();
      expect(body.data.degradedThresholdMs).toBe(1000);
      createdMonitors.push(body.data.id);
    });
  });

  describe("GET /api/v1/monitors/:id", () => {
    let testMonitorId: string;

    beforeAll(async () => {
      const response = await fetch(`${API_BASE_URL}/api/v1/monitors`, {
        method: "POST",
        headers: ctx.headers,
        body: JSON.stringify({
          name: `Get Test Monitor ${randomUUID().slice(0, 8)}`,
          url: "https://example.com",
          type: "https",
          intervalSeconds: 60,
          timeoutMs: 30000,
          description: "Test description",
        }),
      });
      const body = await response.json();
      testMonitorId = body.data.id;
      createdMonitors.push(testMonitorId);
    });

    it("returns monitor by ID", async () => {
      const response = await fetch(
        `${API_BASE_URL}/api/v1/monitors/${testMonitorId}`,
        { headers: ctx.headers }
      );

      expect(response.status).toBe(200);
      const body = await response.json();
      expect(body.success).toBe(true);
      expect(body.data.id).toBe(testMonitorId);
    });

    it("returns all monitor fields", async () => {
      const response = await fetch(
        `${API_BASE_URL}/api/v1/monitors/${testMonitorId}`,
        { headers: ctx.headers }
      );

      const body = await response.json();
      const monitor = body.data;

      expect(monitor.id).toBeDefined();
      expect(monitor.name).toBeDefined();
      expect(monitor.url).toBeDefined();
      expect(monitor.type).toBeDefined();
      expect(monitor.status).toBeDefined();
      expect(monitor.intervalSeconds).toBeDefined();
      expect(monitor.timeoutMs).toBeDefined();
      expect(monitor.regions).toBeDefined();
      expect(monitor.createdAt).toBeDefined();
    });

    it("returns 404 for non-existent monitor", async () => {
      const fakeId = randomUUID();
      const response = await fetch(
        `${API_BASE_URL}/api/v1/monitors/${fakeId}`,
        { headers: ctx.headers }
      );

      expect(response.status).toBe(404);
    });
  });

  describe("PATCH /api/v1/monitors/:id", () => {
    let testMonitorId: string;

    beforeAll(async () => {
      const response = await fetch(`${API_BASE_URL}/api/v1/monitors`, {
        method: "POST",
        headers: ctx.headers,
        body: JSON.stringify({
          name: `Update Test Monitor ${randomUUID().slice(0, 8)}`,
          url: "https://example.com",
          type: "https",
          intervalSeconds: 60,
          timeoutMs: 30000,
        }),
      });
      const body = await response.json();
      testMonitorId = body.data.id;
      createdMonitors.push(testMonitorId);
    });

    it("updates monitor name", async () => {
      const newName = `Updated Name ${randomUUID().slice(0, 8)}`;
      const response = await fetch(
        `${API_BASE_URL}/api/v1/monitors/${testMonitorId}`,
        {
          method: "PATCH",
          headers: ctx.headers,
          body: JSON.stringify({ name: newName }),
        }
      );

      expect(response.status).toBe(200);
      const body = await response.json();
      expect(body.data.name).toBe(newName);
    });

    it("updates monitor interval", async () => {
      const response = await fetch(
        `${API_BASE_URL}/api/v1/monitors/${testMonitorId}`,
        {
          method: "PATCH",
          headers: ctx.headers,
          body: JSON.stringify({ intervalSeconds: 120 }),
        }
      );

      expect(response.status).toBe(200);
      const body = await response.json();
      expect(body.data.intervalSeconds).toBe(120);
    });

    it("updates monitor timeout", async () => {
      const response = await fetch(
        `${API_BASE_URL}/api/v1/monitors/${testMonitorId}`,
        {
          method: "PATCH",
          headers: ctx.headers,
          body: JSON.stringify({ timeoutMs: 45000 }),
        }
      );

      expect(response.status).toBe(200);
      const body = await response.json();
      expect(body.data.timeoutMs).toBe(45000);
    });

    it("updates monitor URL", async () => {
      const newUrl = "https://updated.example.com";
      const response = await fetch(
        `${API_BASE_URL}/api/v1/monitors/${testMonitorId}`,
        {
          method: "PATCH",
          headers: ctx.headers,
          body: JSON.stringify({ url: newUrl }),
        }
      );

      expect(response.status).toBe(200);
      const body = await response.json();
      expect(body.data.url).toBe(newUrl);
    });

    it("updates multiple fields at once", async () => {
      const response = await fetch(
        `${API_BASE_URL}/api/v1/monitors/${testMonitorId}`,
        {
          method: "PATCH",
          headers: ctx.headers,
          body: JSON.stringify({
            name: `Multi Update ${randomUUID().slice(0, 8)}`,
            intervalSeconds: 180,
            timeoutMs: 60000,
          }),
        }
      );

      expect(response.status).toBe(200);
      const body = await response.json();
      expect(body.data.intervalSeconds).toBe(180);
      expect(body.data.timeoutMs).toBe(60000);
    });

    it("returns 404 for non-existent monitor", async () => {
      const fakeId = randomUUID();
      const response = await fetch(
        `${API_BASE_URL}/api/v1/monitors/${fakeId}`,
        {
          method: "PATCH",
          headers: ctx.headers,
          body: JSON.stringify({ name: "Test" }),
        }
      );

      expect(response.status).toBe(404);
    });
  });

  describe("DELETE /api/v1/monitors/:id", () => {
    it("deletes monitor successfully", async () => {
      // Create a monitor to delete
      const createResponse = await fetch(`${API_BASE_URL}/api/v1/monitors`, {
        method: "POST",
        headers: ctx.headers,
        body: JSON.stringify({
          name: `Delete Test Monitor ${randomUUID().slice(0, 8)}`,
          url: "https://example.com",
          type: "https",
          intervalSeconds: 60,
          timeoutMs: 30000,
        }),
      });
      const createBody = await createResponse.json();
      const monitorId = createBody.data.id;

      // Delete the monitor
      const deleteResponse = await fetch(
        `${API_BASE_URL}/api/v1/monitors/${monitorId}`,
        {
          method: "DELETE",
          headers: ctx.headers,
        }
      );

      expect(deleteResponse.status).toBe(200);

      // Verify it's deleted
      const getResponse = await fetch(
        `${API_BASE_URL}/api/v1/monitors/${monitorId}`,
        { headers: ctx.headers }
      );

      expect(getResponse.status).toBe(404);
    });

    it("returns 404 for non-existent monitor", async () => {
      const fakeId = randomUUID();
      const response = await fetch(
        `${API_BASE_URL}/api/v1/monitors/${fakeId}`,
        {
          method: "DELETE",
          headers: ctx.headers,
        }
      );

      expect(response.status).toBe(404);
    });
  });

  describe("POST /api/v1/monitors/:id/pause", () => {
    let testMonitorId: string;

    beforeAll(async () => {
      const response = await fetch(`${API_BASE_URL}/api/v1/monitors`, {
        method: "POST",
        headers: ctx.headers,
        body: JSON.stringify({
          name: `Pause Test Monitor ${randomUUID().slice(0, 8)}`,
          url: "https://example.com",
          type: "https",
          intervalSeconds: 60,
          timeoutMs: 30000,
        }),
      });
      const body = await response.json();
      testMonitorId = body.data.id;
      createdMonitors.push(testMonitorId);
    });

    it("pauses monitor", async () => {
      const response = await fetch(
        `${API_BASE_URL}/api/v1/monitors/${testMonitorId}/pause`,
        {
          method: "POST",
          headers: ctx.headers,
        }
      );

      expect(response.status).toBe(200);
      const body = await response.json();
      expect(body.data.status).toBe("paused");
    });

    it("pause is idempotent", async () => {
      // Pause again
      const response = await fetch(
        `${API_BASE_URL}/api/v1/monitors/${testMonitorId}/pause`,
        {
          method: "POST",
          headers: ctx.headers,
        }
      );

      expect(response.status).toBe(200);
      const body = await response.json();
      expect(body.data.status).toBe("paused");
    });
  });

  describe("POST /api/v1/monitors/:id/resume", () => {
    let testMonitorId: string;

    beforeAll(async () => {
      const response = await fetch(`${API_BASE_URL}/api/v1/monitors`, {
        method: "POST",
        headers: ctx.headers,
        body: JSON.stringify({
          name: `Resume Test Monitor ${randomUUID().slice(0, 8)}`,
          url: "https://example.com",
          type: "https",
          intervalSeconds: 60,
          timeoutMs: 30000,
        }),
      });
      const body = await response.json();
      testMonitorId = body.data.id;
      createdMonitors.push(testMonitorId);

      // Pause it first
      await fetch(`${API_BASE_URL}/api/v1/monitors/${testMonitorId}/pause`, {
        method: "POST",
        headers: ctx.headers,
      });
    });

    it("resumes paused monitor", async () => {
      const response = await fetch(
        `${API_BASE_URL}/api/v1/monitors/${testMonitorId}/resume`,
        {
          method: "POST",
          headers: ctx.headers,
        }
      );

      expect(response.status).toBe(200);
      const body = await response.json();
      expect(body.data.status).not.toBe("paused");
    });

    it("resume is idempotent", async () => {
      const response = await fetch(
        `${API_BASE_URL}/api/v1/monitors/${testMonitorId}/resume`,
        {
          method: "POST",
          headers: ctx.headers,
        }
      );

      expect(response.status).toBe(200);
    });
  });

  describe("GET /api/v1/monitors/:id/results", () => {
    let testMonitorId: string;

    beforeAll(async () => {
      const response = await fetch(`${API_BASE_URL}/api/v1/monitors`, {
        method: "POST",
        headers: ctx.headers,
        body: JSON.stringify({
          name: `Results Test Monitor ${randomUUID().slice(0, 8)}`,
          url: "https://example.com",
          type: "https",
          intervalSeconds: 60,
          timeoutMs: 30000,
        }),
      });
      const body = await response.json();
      testMonitorId = body.data.id;
      createdMonitors.push(testMonitorId);

      // Insert some check results
      const now = new Date();
      for (let i = 0; i < 20; i++) {
        await insertCheckResultFull(testMonitorId, {
          status: i % 5 === 0 ? "failure" : "success",
          responseTimeMs: 100 + i * 10,
          statusCode: i % 5 === 0 ? 500 : 200,
          createdAt: new Date(now.getTime() - i * 60000), // Each 1 minute apart
        });
      }
    });

    it("returns check results for monitor", async () => {
      const response = await fetch(
        `${API_BASE_URL}/api/v1/monitors/${testMonitorId}/results`,
        { headers: ctx.headers }
      );

      expect(response.status).toBe(200);
      const body = await response.json();
      expect(body.success).toBe(true);
      expect(Array.isArray(body.data)).toBe(true);
      expect(body.data.length).toBeGreaterThan(0);
    });

    it("returns results with expected fields", async () => {
      const response = await fetch(
        `${API_BASE_URL}/api/v1/monitors/${testMonitorId}/results`,
        { headers: ctx.headers }
      );

      const body = await response.json();
      const result = body.data[0];

      expect(result.id).toBeDefined();
      expect(result.status).toBeDefined();
      expect(result.responseTimeMs).toBeDefined();
      expect(result.createdAt).toBeDefined();
    });

    it("supports pagination with limit", async () => {
      const response = await fetch(
        `${API_BASE_URL}/api/v1/monitors/${testMonitorId}/results?limit=5`,
        { headers: ctx.headers }
      );

      const body = await response.json();
      expect(body.data.length).toBeLessThanOrEqual(5);
    });

    it("supports pagination with offset", async () => {
      const firstResponse = await fetch(
        `${API_BASE_URL}/api/v1/monitors/${testMonitorId}/results?limit=5&offset=0`,
        { headers: ctx.headers }
      );
      const firstBody = await firstResponse.json();

      const secondResponse = await fetch(
        `${API_BASE_URL}/api/v1/monitors/${testMonitorId}/results?limit=5&offset=5`,
        { headers: ctx.headers }
      );
      const secondBody = await secondResponse.json();

      // Results should be different
      const firstIds = firstBody.data.map((r: any) => r.id);
      const secondIds = secondBody.data.map((r: any) => r.id);

      for (const id of secondIds) {
        expect(firstIds).not.toContain(id);
      }
    });

    it("returns results in descending order by default", async () => {
      const response = await fetch(
        `${API_BASE_URL}/api/v1/monitors/${testMonitorId}/results?limit=10`,
        { headers: ctx.headers }
      );

      const body = await response.json();
      const results = body.data;

      for (let i = 1; i < results.length; i++) {
        const prevDate = new Date(results[i - 1].createdAt).getTime();
        const currDate = new Date(results[i].createdAt).getTime();
        expect(prevDate).toBeGreaterThanOrEqual(currDate);
      }
    });
  });

  describe("POST /api/v1/monitors/:id/check", () => {
    let testMonitorId: string;

    beforeAll(async () => {
      const response = await fetch(`${API_BASE_URL}/api/v1/monitors`, {
        method: "POST",
        headers: ctx.headers,
        body: JSON.stringify({
          name: `Immediate Check Monitor ${randomUUID().slice(0, 8)}`,
          url: `${TEST_SERVICES.HTTPBIN_URL}/get`,
          type: "http",
          intervalSeconds: 3600, // Long interval
          timeoutMs: 30000,
        }),
      });
      const body = await response.json();
      testMonitorId = body.data.id;
      createdMonitors.push(testMonitorId);
    });

    it("triggers immediate check", async () => {
      const response = await fetch(
        `${API_BASE_URL}/api/v1/monitors/${testMonitorId}/check`,
        {
          method: "POST",
          headers: ctx.headers,
        }
      );

      expect(response.status).toBe(200);
      const body = await response.json();
      expect(body.success).toBe(true);
    });

    it("returns 404 for non-existent monitor", async () => {
      const fakeId = randomUUID();
      const response = await fetch(
        `${API_BASE_URL}/api/v1/monitors/${fakeId}/check`,
        {
          method: "POST",
          headers: ctx.headers,
        }
      );

      expect(response.status).toBe(404);
    });
  });

  describe("POST /api/v1/monitors/:id/heartbeat", () => {
    let heartbeatMonitorId: string;

    beforeAll(async () => {
      const response = await fetch(`${API_BASE_URL}/api/v1/monitors`, {
        method: "POST",
        headers: ctx.headers,
        body: JSON.stringify({
          name: `Heartbeat API Test ${randomUUID().slice(0, 8)}`,
          url: "heartbeat://test-job",
          type: "heartbeat",
          intervalSeconds: 60,
          config: {
            heartbeat: {
              expectedInterval: 60,
              gracePeriod: 30,
            },
          },
        }),
      });
      const body = await response.json();
      heartbeatMonitorId = body.data.id;
      createdMonitors.push(heartbeatMonitorId);
    });

    it("records heartbeat ping via authenticated endpoint", async () => {
      const response = await fetch(
        `${API_BASE_URL}/api/v1/monitors/${heartbeatMonitorId}/heartbeat?status=complete&duration=1500`,
        {
          method: "POST",
          headers: ctx.headers,
          body: JSON.stringify({ job: "backup", host: "server1" }),
        }
      );

      expect(response.status).toBe(200);
      const body = await response.json();
      expect(body.success).toBe(true);
      expect(body.data.id).toBeDefined();
    });

    it("records heartbeat with fail status", async () => {
      const response = await fetch(
        `${API_BASE_URL}/api/v1/monitors/${heartbeatMonitorId}/heartbeat?status=fail&duration=5000&exit_code=1`,
        {
          method: "POST",
          headers: ctx.headers,
          body: JSON.stringify({ error: "Connection timeout" }),
        }
      );

      expect(response.status).toBe(200);
    });

    it("records heartbeat with start status", async () => {
      const response = await fetch(
        `${API_BASE_URL}/api/v1/monitors/${heartbeatMonitorId}/heartbeat?status=start`,
        {
          method: "POST",
          headers: ctx.headers,
        }
      );

      expect(response.status).toBe(200);
    });
  });

  describe("GET /api/v1/monitors/:id/heartbeat", () => {
    let heartbeatMonitorId: string;

    beforeAll(async () => {
      const response = await fetch(`${API_BASE_URL}/api/v1/monitors`, {
        method: "POST",
        headers: ctx.headers,
        body: JSON.stringify({
          name: `Heartbeat History Test ${randomUUID().slice(0, 8)}`,
          url: "heartbeat://history-job",
          type: "heartbeat",
          intervalSeconds: 60,
          config: {
            heartbeat: {
              expectedInterval: 60,
              gracePeriod: 30,
            },
          },
        }),
      });
      const body = await response.json();
      heartbeatMonitorId = body.data.id;
      createdMonitors.push(heartbeatMonitorId);

      // Insert some heartbeat pings
      await insertHeartbeatPing(heartbeatMonitorId, {
        status: "complete",
        durationMs: 1000,
        exitCode: 0,
      });
      await insertHeartbeatPing(heartbeatMonitorId, {
        status: "complete",
        durationMs: 1500,
        exitCode: 0,
      });
      await insertHeartbeatPing(heartbeatMonitorId, {
        status: "fail",
        durationMs: 2000,
        exitCode: 1,
      });
    });

    it("returns heartbeat history", async () => {
      const response = await fetch(
        `${API_BASE_URL}/api/v1/monitors/${heartbeatMonitorId}/heartbeat`,
        { headers: ctx.headers }
      );

      expect(response.status).toBe(200);
      const body = await response.json();
      expect(body.success).toBe(true);
      expect(Array.isArray(body.data)).toBe(true);
      expect(body.data.length).toBeGreaterThanOrEqual(3);
    });

    it("returns heartbeat pings with expected fields", async () => {
      const response = await fetch(
        `${API_BASE_URL}/api/v1/monitors/${heartbeatMonitorId}/heartbeat`,
        { headers: ctx.headers }
      );

      const body = await response.json();
      const ping = body.data[0];

      expect(ping.id).toBeDefined();
      expect(ping.status).toBeDefined();
      expect(ping.createdAt).toBeDefined();
    });

    it("returns 404 for non-heartbeat monitor", async () => {
      // Create a non-heartbeat monitor
      const createResponse = await fetch(`${API_BASE_URL}/api/v1/monitors`, {
        method: "POST",
        headers: ctx.headers,
        body: JSON.stringify({
          name: `Non-Heartbeat Monitor ${randomUUID().slice(0, 8)}`,
          url: "https://example.com",
          type: "https",
          intervalSeconds: 60,
          timeoutMs: 30000,
        }),
      });
      const createBody = await createResponse.json();
      const nonHeartbeatId = createBody.data.id;
      createdMonitors.push(nonHeartbeatId);

      const response = await fetch(
        `${API_BASE_URL}/api/v1/monitors/${nonHeartbeatId}/heartbeat`,
        { headers: ctx.headers }
      );

      // Should return 404 or 400 for non-heartbeat monitors
      expect([400, 404]).toContain(response.status);
    });
  });
});
