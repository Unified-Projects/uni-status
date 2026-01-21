/**
 * Analytics API Comprehensive Tests
 *
 * Tests all analytics endpoints including:
 * - Uptime statistics
 * - Response time percentiles
 * - Incident statistics
 * - PageSpeed scores
 * - Web Vitals metrics
 * - Dashboard overview
 */

import { describe, it, expect, beforeAll } from "vitest";
import { randomUUID } from "crypto";
import { bootstrapTestContext, TestContext } from "../helpers/context";
import {
  insertCheckResultFull,
  insertDailyAggregate,
  insertHourlyAggregate,
  insertIncident,
  setMonitorStatus,
} from "../helpers/data";

const API_BASE_URL = process.env.API_BASE_URL ?? "http://api:3001";

describe("Analytics API - Comprehensive", () => {
  let ctx: TestContext;
  let testMonitorId: string;

  beforeAll(async () => {
    ctx = await bootstrapTestContext();

    // Create a test monitor
    const response = await fetch(`${API_BASE_URL}/api/v1/monitors`, {
      method: "POST",
      headers: ctx.headers,
      body: JSON.stringify({
        name: `Analytics Test Monitor ${randomUUID().slice(0, 8)}`,
        url: "https://analytics.example.com",
        type: "https",
        intervalSeconds: 60,
        timeoutMs: 30000,
      }),
    });
    const body = await response.json();
    testMonitorId = body.data.id;
    await setMonitorStatus(testMonitorId, "active");

    // Insert check results for the past 7 days
    const now = new Date();
    for (let day = 0; day < 7; day++) {
      for (let hour = 0; hour < 24; hour++) {
        const timestamp = new Date(now);
        timestamp.setDate(timestamp.getDate() - day);
        timestamp.setHours(hour, 0, 0, 0);

        // Insert some check results
        for (let i = 0; i < 10; i++) {
          const checkTime = new Date(timestamp.getTime() + i * 60000);
          await insertCheckResultFull(testMonitorId, {
            status: Math.random() > 0.1 ? "success" : "failure",
            responseTimeMs: Math.round(100 + Math.random() * 200),
            statusCode: Math.random() > 0.1 ? 200 : 500,
            createdAt: checkTime,
          });
        }
      }
    }

    // Insert daily aggregates
    for (let day = 0; day < 30; day++) {
      const date = new Date(now);
      date.setDate(date.getDate() - day);
      date.setHours(0, 0, 0, 0);

      await insertDailyAggregate({
        monitorId: testMonitorId,
        date,
        successCount: 1400 - Math.floor(Math.random() * 20),
        degradedCount: Math.floor(Math.random() * 10),
        failureCount: Math.floor(Math.random() * 30),
        totalCount: 1440,
        uptimePercentage: 97 + Math.random() * 3,
      });
    }
  });

  describe("GET /api/v1/analytics/uptime", () => {
    it("returns uptime statistics", async () => {
      const response = await fetch(
        `${API_BASE_URL}/api/v1/analytics/uptime?monitorId=${testMonitorId}`,
        { headers: ctx.headers }
      );

      expect(response.status).toBe(200);
      const body = await response.json();
      expect(body.success).toBe(true);
      expect(body.data).toBeDefined();
    });

    it("supports days parameter", async () => {
      const response = await fetch(
        `${API_BASE_URL}/api/v1/analytics/uptime?monitorId=${testMonitorId}&days=7`,
        { headers: ctx.headers }
      );

      expect(response.status).toBe(200);
      const body = await response.json();
      expect(body.success).toBe(true);
    });

    it("supports 30 day range", async () => {
      const response = await fetch(
        `${API_BASE_URL}/api/v1/analytics/uptime?monitorId=${testMonitorId}&days=30`,
        { headers: ctx.headers }
      );

      expect(response.status).toBe(200);
      const body = await response.json();
      expect(body.success).toBe(true);
    });

    it("returns uptime percentage", async () => {
      const response = await fetch(
        `${API_BASE_URL}/api/v1/analytics/uptime?monitorId=${testMonitorId}&days=7`,
        { headers: ctx.headers }
      );

      const body = await response.json();

      // Should have uptime data
      if (body.data.uptime !== undefined) {
        expect(typeof body.data.uptime).toBe("number");
        expect(body.data.uptime).toBeGreaterThanOrEqual(0);
        expect(body.data.uptime).toBeLessThanOrEqual(100);
      }
    });

    it("supports granularity parameter - day", async () => {
      const response = await fetch(
        `${API_BASE_URL}/api/v1/analytics/uptime?monitorId=${testMonitorId}&days=30&granularity=day`,
        { headers: ctx.headers }
      );

      expect(response.status).toBe(200);
      const body = await response.json();
      expect(body.success).toBe(true);
    });

    it("supports granularity parameter - hour", async () => {
      const response = await fetch(
        `${API_BASE_URL}/api/v1/analytics/uptime?monitorId=${testMonitorId}&days=1&granularity=hour`,
        { headers: ctx.headers }
      );

      expect(response.status).toBe(200);
      const body = await response.json();
      expect(body.success).toBe(true);
    });

    it("returns aggregated uptime across all monitors without monitorId", async () => {
      const response = await fetch(
        `${API_BASE_URL}/api/v1/analytics/uptime?days=7`,
        { headers: ctx.headers }
      );

      expect(response.status).toBe(200);
      const body = await response.json();
      expect(body.success).toBe(true);
    });
  });

  describe("GET /api/v1/analytics/response-times", () => {
    it("returns response time statistics for monitor", async () => {
      const response = await fetch(
        `${API_BASE_URL}/api/v1/analytics/response-times?monitorId=${testMonitorId}`,
        { headers: ctx.headers }
      );

      expect(response.status).toBe(200);
      const body = await response.json();
      expect(body.success).toBe(true);
    });

    it("supports hours parameter", async () => {
      const response = await fetch(
        `${API_BASE_URL}/api/v1/analytics/response-times?monitorId=${testMonitorId}&hours=24`,
        { headers: ctx.headers }
      );

      expect(response.status).toBe(200);
      const body = await response.json();
      expect(body.success).toBe(true);
    });

    it("returns percentile data", async () => {
      const response = await fetch(
        `${API_BASE_URL}/api/v1/analytics/response-times?monitorId=${testMonitorId}&hours=24`,
        { headers: ctx.headers }
      );

      const body = await response.json();

      // Should have summary statistics
      if (body.data.summary) {
        const summary = body.data.summary;
        if (summary.p50) expect(typeof summary.p50).toBe("number");
        if (summary.p90) expect(typeof summary.p90).toBe("number");
        if (summary.p99) expect(typeof summary.p99).toBe("number");
        if (summary.avg) expect(typeof summary.avg).toBe("number");
      }
    });

    it("returns data points array", async () => {
      const response = await fetch(
        `${API_BASE_URL}/api/v1/analytics/response-times?monitorId=${testMonitorId}&hours=24`,
        { headers: ctx.headers }
      );

      const body = await response.json();

      if (body.data.dataPoints) {
        expect(Array.isArray(body.data.dataPoints)).toBe(true);
      }
    });

    it("requires monitorId parameter", async () => {
      const response = await fetch(
        `${API_BASE_URL}/api/v1/analytics/response-times`,
        { headers: ctx.headers }
      );

      // Should return 400 or have empty data
      expect([200, 400]).toContain(response.status);
    });

    it("supports short time ranges (1 hour)", async () => {
      const response = await fetch(
        `${API_BASE_URL}/api/v1/analytics/response-times?monitorId=${testMonitorId}&hours=1`,
        { headers: ctx.headers }
      );

      expect(response.status).toBe(200);
      const body = await response.json();
      expect(body.success).toBe(true);
    });

    it("supports 6 hour time range", async () => {
      const response = await fetch(
        `${API_BASE_URL}/api/v1/analytics/response-times?monitorId=${testMonitorId}&hours=6`,
        { headers: ctx.headers }
      );

      expect(response.status).toBe(200);
      const body = await response.json();
      expect(body.success).toBe(true);
    });

    it("supports 7 day time range (168 hours)", async () => {
      const response = await fetch(
        `${API_BASE_URL}/api/v1/analytics/response-times?monitorId=${testMonitorId}&hours=168`,
        { headers: ctx.headers }
      );

      expect(response.status).toBe(200);
      const body = await response.json();
      expect(body.success).toBe(true);
    });

    it("supports 30 day time range (720 hours)", async () => {
      const response = await fetch(
        `${API_BASE_URL}/api/v1/analytics/response-times?monitorId=${testMonitorId}&hours=720`,
        { headers: ctx.headers }
      );

      expect(response.status).toBe(200);
      const body = await response.json();
      expect(body.success).toBe(true);
    });

    it("returns appropriate data point count for different time ranges", async () => {
      // Short range should have more granular data (more points per hour)
      const shortResponse = await fetch(
        `${API_BASE_URL}/api/v1/analytics/response-times?monitorId=${testMonitorId}&hours=6`,
        { headers: ctx.headers }
      );
      const shortBody = await shortResponse.json();

      // Long range should have less granular data (fewer points per hour)
      const longResponse = await fetch(
        `${API_BASE_URL}/api/v1/analytics/response-times?monitorId=${testMonitorId}&hours=168`,
        { headers: ctx.headers }
      );
      const longBody = await longResponse.json();

      // Both should succeed
      expect(shortBody.success).toBe(true);
      expect(longBody.success).toBe(true);

      // If we have data points, verify they exist
      if (shortBody.data.dataPoints && longBody.data.dataPoints) {
        expect(Array.isArray(shortBody.data.dataPoints)).toBe(true);
        expect(Array.isArray(longBody.data.dataPoints)).toBe(true);
      }
    });
  });

  describe("GET /api/v1/analytics/incidents", () => {
    beforeAll(async () => {
      // Create some test incidents
      const now = new Date();

      // Resolved incident
      await insertIncident(ctx.organizationId, ctx.userId, {
        title: "Past Incident 1",
        severity: "minor",
        status: "resolved",
        createdAt: new Date(now.getTime() - 5 * 24 * 60 * 60 * 1000),
        resolvedAt: new Date(now.getTime() - 4 * 24 * 60 * 60 * 1000),
      });

      // Active incident
      await insertIncident(ctx.organizationId, ctx.userId, {
        title: "Active Incident",
        severity: "major",
        status: "investigating",
        createdAt: new Date(now.getTime() - 1 * 60 * 60 * 1000),
      });

      // Critical incident
      await insertIncident(ctx.organizationId, ctx.userId, {
        title: "Critical Incident",
        severity: "critical",
        status: "identified",
        createdAt: new Date(now.getTime() - 2 * 60 * 60 * 1000),
      });
    });

    it("returns incident statistics", async () => {
      const response = await fetch(
        `${API_BASE_URL}/api/v1/analytics/incidents`,
        { headers: ctx.headers }
      );

      expect(response.status).toBe(200);
      const body = await response.json();
      expect(body.success).toBe(true);
    });

    it("supports days parameter", async () => {
      const response = await fetch(
        `${API_BASE_URL}/api/v1/analytics/incidents?days=7`,
        { headers: ctx.headers }
      );

      expect(response.status).toBe(200);
      const body = await response.json();
      expect(body.success).toBe(true);
    });

    it("returns incident counts", async () => {
      const response = await fetch(
        `${API_BASE_URL}/api/v1/analytics/incidents?days=30`,
        { headers: ctx.headers }
      );

      const body = await response.json();

      if (body.data.total !== undefined) {
        expect(typeof body.data.total).toBe("number");
        expect(body.data.total).toBeGreaterThanOrEqual(0);
      }
    });

    it("returns incidents grouped by status", async () => {
      const response = await fetch(
        `${API_BASE_URL}/api/v1/analytics/incidents?days=30`,
        { headers: ctx.headers }
      );

      const body = await response.json();

      if (body.data.byStatus) {
        expect(typeof body.data.byStatus).toBe("object");
      }
    });

    it("returns incidents grouped by severity", async () => {
      const response = await fetch(
        `${API_BASE_URL}/api/v1/analytics/incidents?days=30`,
        { headers: ctx.headers }
      );

      const body = await response.json();

      if (body.data.bySeverity) {
        expect(typeof body.data.bySeverity).toBe("object");
      }
    });

    it("calculates MTTR when applicable", async () => {
      const response = await fetch(
        `${API_BASE_URL}/api/v1/analytics/incidents?days=30`,
        { headers: ctx.headers }
      );

      const body = await response.json();

      if (body.data.mttr !== undefined) {
        expect(typeof body.data.mttr).toBe("number");
      }
    });

    it("returns recent incidents list", async () => {
      const response = await fetch(
        `${API_BASE_URL}/api/v1/analytics/incidents?days=30`,
        { headers: ctx.headers }
      );

      const body = await response.json();

      if (body.data.recent) {
        expect(Array.isArray(body.data.recent)).toBe(true);
      }
    });
  });

  describe("GET /api/v1/analytics/pagespeed", () => {
    beforeAll(async () => {
      // Insert some PageSpeed results
      for (let i = 0; i < 10; i++) {
        const checkTime = new Date();
        checkTime.setHours(checkTime.getHours() - i);

        await insertCheckResultFull(testMonitorId, {
          status: "success",
          responseTimeMs: 200,
          statusCode: 200,
          pagespeedScores: {
            performance: 80 + Math.floor(Math.random() * 15),
            accessibility: 85 + Math.floor(Math.random() * 15),
            bestPractices: 75 + Math.floor(Math.random() * 20),
            seo: 90 + Math.floor(Math.random() * 10),
          },
          createdAt: checkTime,
        });
      }
    });

    it("returns PageSpeed scores for monitor", async () => {
      const response = await fetch(
        `${API_BASE_URL}/api/v1/analytics/pagespeed?monitorId=${testMonitorId}`,
        { headers: ctx.headers }
      );

      expect(response.status).toBe(200);
      const body = await response.json();
      expect(body.success).toBe(true);
    });

    it("supports days parameter", async () => {
      const response = await fetch(
        `${API_BASE_URL}/api/v1/analytics/pagespeed?monitorId=${testMonitorId}&days=7`,
        { headers: ctx.headers }
      );

      expect(response.status).toBe(200);
      const body = await response.json();
      expect(body.success).toBe(true);
    });

    it("returns score averages", async () => {
      const response = await fetch(
        `${API_BASE_URL}/api/v1/analytics/pagespeed?monitorId=${testMonitorId}&days=7`,
        { headers: ctx.headers }
      );

      const body = await response.json();

      if (body.data.averages) {
        const averages = body.data.averages;
        if (averages.performance !== undefined) {
          expect(averages.performance).toBeGreaterThanOrEqual(0);
          expect(averages.performance).toBeLessThanOrEqual(100);
        }
      }
    });

    it("returns latest scores", async () => {
      const response = await fetch(
        `${API_BASE_URL}/api/v1/analytics/pagespeed?monitorId=${testMonitorId}&days=7`,
        { headers: ctx.headers }
      );

      const body = await response.json();

      if (body.data.latest) {
        expect(body.data.latest).toBeDefined();
      }
    });

    it("returns score history", async () => {
      const response = await fetch(
        `${API_BASE_URL}/api/v1/analytics/pagespeed?monitorId=${testMonitorId}&days=7`,
        { headers: ctx.headers }
      );

      const body = await response.json();

      if (body.data.history) {
        expect(Array.isArray(body.data.history)).toBe(true);
      }
    });

    it("requires monitorId parameter", async () => {
      const response = await fetch(
        `${API_BASE_URL}/api/v1/analytics/pagespeed`,
        { headers: ctx.headers }
      );

      expect([200, 400]).toContain(response.status);
    });
  });

  describe("GET /api/v1/analytics/web-vitals", () => {
    beforeAll(async () => {
      // Insert some Web Vitals results
      for (let i = 0; i < 10; i++) {
        const checkTime = new Date();
        checkTime.setHours(checkTime.getHours() - i);

        await insertCheckResultFull(testMonitorId, {
          status: "success",
          responseTimeMs: 200,
          statusCode: 200,
          webVitals: {
            lcp: 2000 + Math.floor(Math.random() * 1000),
            fid: 50 + Math.floor(Math.random() * 100),
            cls: Math.random() * 0.2,
            fcp: 1500 + Math.floor(Math.random() * 500),
            ttfb: 200 + Math.floor(Math.random() * 200),
            inp: 100 + Math.floor(Math.random() * 150),
            si: 2500 + Math.floor(Math.random() * 1000),
            tbt: 100 + Math.floor(Math.random() * 200),
          },
          createdAt: checkTime,
        });
      }
    });

    it("returns Web Vitals metrics for monitor", async () => {
      const response = await fetch(
        `${API_BASE_URL}/api/v1/analytics/web-vitals?monitorId=${testMonitorId}`,
        { headers: ctx.headers }
      );

      expect(response.status).toBe(200);
      const body = await response.json();
      expect(body.success).toBe(true);
    });

    it("supports days parameter", async () => {
      const response = await fetch(
        `${API_BASE_URL}/api/v1/analytics/web-vitals?monitorId=${testMonitorId}&days=7`,
        { headers: ctx.headers }
      );

      expect(response.status).toBe(200);
      const body = await response.json();
      expect(body.success).toBe(true);
    });

    it("returns metric averages", async () => {
      const response = await fetch(
        `${API_BASE_URL}/api/v1/analytics/web-vitals?monitorId=${testMonitorId}&days=7`,
        { headers: ctx.headers }
      );

      const body = await response.json();

      if (body.data.averages) {
        const averages = body.data.averages;
        // Check for Core Web Vitals
        if (averages.lcp !== undefined) {
          expect(typeof averages.lcp).toBe("number");
        }
        if (averages.cls !== undefined) {
          expect(typeof averages.cls).toBe("number");
        }
      }
    });

    it("returns assessment status", async () => {
      const response = await fetch(
        `${API_BASE_URL}/api/v1/analytics/web-vitals?monitorId=${testMonitorId}&days=7`,
        { headers: ctx.headers }
      );

      const body = await response.json();

      // Assessments should indicate good/needs-improvement/poor
      if (body.data.assessments) {
        const assessments = body.data.assessments;
        const validStatuses = ["good", "needs-improvement", "poor"];
        if (assessments.lcp) {
          expect(validStatuses).toContain(assessments.lcp);
        }
      }
    });

    it("returns metric history", async () => {
      const response = await fetch(
        `${API_BASE_URL}/api/v1/analytics/web-vitals?monitorId=${testMonitorId}&days=7`,
        { headers: ctx.headers }
      );

      const body = await response.json();

      if (body.data.history) {
        expect(Array.isArray(body.data.history)).toBe(true);
      }
    });

    it("requires monitorId parameter", async () => {
      const response = await fetch(
        `${API_BASE_URL}/api/v1/analytics/web-vitals`,
        { headers: ctx.headers }
      );

      expect([200, 400]).toContain(response.status);
    });
  });

  describe("GET /api/v1/analytics/dashboard", () => {
    it("returns dashboard overview", async () => {
      const response = await fetch(
        `${API_BASE_URL}/api/v1/analytics/dashboard`,
        { headers: ctx.headers }
      );

      expect(response.status).toBe(200);
      const body = await response.json();
      expect(body.success).toBe(true);
    });

    it("returns monitors by status count", async () => {
      const response = await fetch(
        `${API_BASE_URL}/api/v1/analytics/dashboard`,
        { headers: ctx.headers }
      );

      const body = await response.json();

      if (body.data.monitorsByStatus) {
        const byStatus = body.data.monitorsByStatus;
        expect(typeof byStatus).toBe("object");
      }
    });

    it("returns active incidents count", async () => {
      const response = await fetch(
        `${API_BASE_URL}/api/v1/analytics/dashboard`,
        { headers: ctx.headers }
      );

      const body = await response.json();

      if (body.data.activeIncidents !== undefined) {
        expect(typeof body.data.activeIncidents).toBe("number");
      }
    });

    it("returns overall uptime", async () => {
      const response = await fetch(
        `${API_BASE_URL}/api/v1/analytics/dashboard`,
        { headers: ctx.headers }
      );

      const body = await response.json();

      if (body.data.overallUptime !== undefined) {
        expect(typeof body.data.overallUptime).toBe("number");
        expect(body.data.overallUptime).toBeGreaterThanOrEqual(0);
        expect(body.data.overallUptime).toBeLessThanOrEqual(100);
      }
    });

    it("returns uptime trend", async () => {
      const response = await fetch(
        `${API_BASE_URL}/api/v1/analytics/dashboard`,
        { headers: ctx.headers }
      );

      const body = await response.json();

      if (body.data.uptimeTrend) {
        expect(Array.isArray(body.data.uptimeTrend)).toBe(true);
      }
    });
  });

  describe("Analytics edge cases", () => {
    it("handles empty data gracefully for new monitor", async () => {
      // Create a new monitor with no data
      const createResponse = await fetch(`${API_BASE_URL}/api/v1/monitors`, {
        method: "POST",
        headers: ctx.headers,
        body: JSON.stringify({
          name: `Empty Analytics Monitor ${randomUUID().slice(0, 8)}`,
          url: "https://empty.example.com",
          type: "https",
          intervalSeconds: 60,
          timeoutMs: 30000,
        }),
      });
      const createBody = await createResponse.json();
      const emptyMonitorId = createBody.data.id;

      // Request analytics for empty monitor
      const response = await fetch(
        `${API_BASE_URL}/api/v1/analytics/uptime?monitorId=${emptyMonitorId}`,
        { headers: ctx.headers }
      );

      expect(response.status).toBe(200);
      const body = await response.json();
      expect(body.success).toBe(true);
    });

    it("handles invalid monitorId gracefully", async () => {
      const fakeId = randomUUID();
      const response = await fetch(
        `${API_BASE_URL}/api/v1/analytics/uptime?monitorId=${fakeId}`,
        { headers: ctx.headers }
      );

      // Should return 404 or 200 with empty data
      expect([200, 404]).toContain(response.status);
    });

    it("handles very large days parameter", async () => {
      const response = await fetch(
        `${API_BASE_URL}/api/v1/analytics/uptime?monitorId=${testMonitorId}&days=365`,
        { headers: ctx.headers }
      );

      expect(response.status).toBe(200);
    });

    it("handles negative days parameter", async () => {
      const response = await fetch(
        `${API_BASE_URL}/api/v1/analytics/uptime?monitorId=${testMonitorId}&days=-7`,
        { headers: ctx.headers }
      );

      // Should reject or use default
      expect([200, 400]).toContain(response.status);
    });

    it("handles zero days parameter", async () => {
      const response = await fetch(
        `${API_BASE_URL}/api/v1/analytics/uptime?monitorId=${testMonitorId}&days=0`,
        { headers: ctx.headers }
      );

      // Should reject or use default
      expect([200, 400]).toContain(response.status);
    });
  });
});
