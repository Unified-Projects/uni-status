/**
 * Bug Fixes Tests
 *
 * End-to-end tests for the bug fixes implemented:
 * 1. API Key Expiration - 30 days was showing as 82 years (double multiplication)
 * 2. Audit Export 404 - Missing organization ID in export URL
 * 3. On-call Rotation Participants - Should accept array of user IDs
 * 4. Consecutive Degraded/Down Checks - New fields for monitors
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { Client } from "pg";
import { bootstrapTestContext, TestContext } from "../helpers/context";
import { randomUUID } from "crypto";

const API_URL = (process.env.API_BASE_URL ?? "http://api:3001") + "/api/v1";
const DEFAULT_DB_URL =
  "postgresql://uni_status:uni_status_dev@postgres:5432/uni_status?sslmode=disable";

let ctx: TestContext;
let dbClient: Client;

beforeAll(async () => {
  dbClient = new Client({
    connectionString: process.env.DATABASE_URL ?? DEFAULT_DB_URL,
  });
  await dbClient.connect();
  ctx = await bootstrapTestContext();
});

afterAll(async () => {
  await dbClient?.end();
});

describe("Bug Fixes", () => {
  describe("API Key Expiration Fix", () => {
    it("creates API key with correct 30-day expiration", async () => {
      // 30 days in milliseconds (sent by frontend)
      const thirtyDaysMs = 30 * 24 * 60 * 60 * 1000;

      const response = await fetch(
        `${API_URL}/organizations/${ctx.organizationId}/api-keys`,
        {
          method: "POST",
          headers: ctx.headers,
          body: JSON.stringify({
            name: "30 Day Expiry Key",
            scopes: ["read"],
            expiresIn: thirtyDaysMs,
          }),
        }
      );

      expect(response.status).toBe(201);
      const { data } = await response.json();

      expect(data.expiresAt).toBeDefined();

      // Calculate expected expiration (should be ~30 days from now)
      const expiresAt = new Date(data.expiresAt).getTime();
      const now = Date.now();
      const daysUntilExpiry = (expiresAt - now) / (1000 * 60 * 60 * 24);

      // Should be between 29.9 and 30.1 days (accounting for execution time)
      expect(daysUntilExpiry).toBeGreaterThan(29.9);
      expect(daysUntilExpiry).toBeLessThan(30.1);

      // Should NOT be 82 years (the bug was double multiplication by 1000)
      expect(daysUntilExpiry).toBeLessThan(100);
    });

    it("creates API key with correct 7-day expiration", async () => {
      const sevenDaysMs = 7 * 24 * 60 * 60 * 1000;

      const response = await fetch(
        `${API_URL}/organizations/${ctx.organizationId}/api-keys`,
        {
          method: "POST",
          headers: ctx.headers,
          body: JSON.stringify({
            name: "7 Day Expiry Key",
            scopes: ["read"],
            expiresIn: sevenDaysMs,
          }),
        }
      );

      expect(response.status).toBe(201);
      const { data } = await response.json();

      const expiresAt = new Date(data.expiresAt).getTime();
      const now = Date.now();
      const daysUntilExpiry = (expiresAt - now) / (1000 * 60 * 60 * 24);

      expect(daysUntilExpiry).toBeGreaterThan(6.9);
      expect(daysUntilExpiry).toBeLessThan(7.1);
    });

    it("creates API key with correct 90-day expiration", async () => {
      const ninetyDaysMs = 90 * 24 * 60 * 60 * 1000;

      const response = await fetch(
        `${API_URL}/organizations/${ctx.organizationId}/api-keys`,
        {
          method: "POST",
          headers: ctx.headers,
          body: JSON.stringify({
            name: "90 Day Expiry Key",
            scopes: ["read"],
            expiresIn: ninetyDaysMs,
          }),
        }
      );

      expect(response.status).toBe(201);
      const { data } = await response.json();

      const expiresAt = new Date(data.expiresAt).getTime();
      const now = Date.now();
      const daysUntilExpiry = (expiresAt - now) / (1000 * 60 * 60 * 24);

      expect(daysUntilExpiry).toBeGreaterThan(89.9);
      expect(daysUntilExpiry).toBeLessThan(90.1);
    });

    it("creates API key with no expiration when not specified", async () => {
      const response = await fetch(
        `${API_URL}/organizations/${ctx.organizationId}/api-keys`,
        {
          method: "POST",
          headers: ctx.headers,
          body: JSON.stringify({
            name: "No Expiry Key",
            scopes: ["read"],
          }),
        }
      );

      expect(response.status).toBe(201);
      const { data } = await response.json();

      // Should have no expiration
      expect(data.expiresAt).toBeNull();
    });
  });

  describe("Audit Export Fix", () => {
    it("exports audit logs with organization ID in query param", async () => {
      // First, create some audit log entries by performing an action
      await fetch(`${API_URL}/organizations/${ctx.organizationId}`, {
        method: "PATCH",
        headers: ctx.headers,
        body: JSON.stringify({ name: "Audit Export Test Org" }),
      });

      // Test export endpoint with organization ID as query param
      const response = await fetch(
        `${API_URL}/audit/export?format=json&organizationId=${ctx.organizationId}`,
        {
          method: "GET",
          headers: {
            Authorization: ctx.headers.Authorization,
            // No X-Organization-Id header - relying on query param
          },
        }
      );

      // Should not return 404 anymore
      expect(response.status).not.toBe(404);
      // Should be either 200 (success) or a redirect
      expect([200, 301, 302]).toContain(response.status);
    });

    it("exports audit logs in CSV format", async () => {
      const response = await fetch(
        `${API_URL}/audit/export?format=csv&organizationId=${ctx.organizationId}`,
        {
          method: "GET",
          headers: {
            Authorization: ctx.headers.Authorization,
          },
        }
      );

      expect(response.status).not.toBe(404);
    });

    it("exports audit logs with date range filters", async () => {
      const now = new Date();
      const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

      const response = await fetch(
        `${API_URL}/audit/export?format=json&organizationId=${ctx.organizationId}&from=${weekAgo.toISOString()}&to=${now.toISOString()}`,
        {
          method: "GET",
          headers: {
            Authorization: ctx.headers.Authorization,
          },
        }
      );

      expect(response.status).not.toBe(404);
    });
  });

  describe("On-call Rotation Participants Fix", () => {
    it("creates rotation with array of participant user IDs", async () => {
      const response = await fetch(`${API_URL}/oncall/rotations`, {
        method: "POST",
        headers: ctx.headers,
        body: JSON.stringify({
          name: "Multi-Participant Rotation",
          description: "Testing multi-participant support",
          timezone: "UTC",
          rotationStart: new Date().toISOString(),
          shiftDurationMinutes: 60,
          participants: [ctx.userId], // Array of user IDs
          handoffNotificationMinutes: 30,
          handoffChannels: [],
          active: true,
        }),
      });

      expect(response.status).toBe(201);
      const { data } = await response.json();
      expect(data.participants).toEqual([ctx.userId]);
      expect(Array.isArray(data.participants)).toBe(true);
    });

    it("updates rotation with multiple participants", async () => {
      // First create a rotation
      const createResponse = await fetch(`${API_URL}/oncall/rotations`, {
        method: "POST",
        headers: ctx.headers,
        body: JSON.stringify({
          name: "Update Participants Test",
          timezone: "UTC",
          rotationStart: new Date().toISOString(),
          shiftDurationMinutes: 60,
          participants: [ctx.userId],
          handoffNotificationMinutes: 30,
          handoffChannels: [],
          active: true,
        }),
      });

      expect(createResponse.status).toBe(201);
      const { data: rotation } = await createResponse.json();

      // Create a second user for multi-participant test
      const secondUserId = randomUUID();
      const now = new Date().toISOString();
      await dbClient.query(
        `INSERT INTO "user" (id, name, email, "emailVerified", "createdAt", "updatedAt")
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [secondUserId, "Second User", `second-${secondUserId}@example.com`, true, now, now]
      );
      await dbClient.query(
        `INSERT INTO organization_members (id, organization_id, user_id, role, joined_at, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [randomUUID(), ctx.organizationId, secondUserId, "member", now, now, now]
      );

      // Update with multiple participants
      const updateResponse = await fetch(
        `${API_URL}/oncall/rotations/${rotation.id}`,
        {
          method: "PATCH",
          headers: ctx.headers,
          body: JSON.stringify({
            participants: [ctx.userId, secondUserId],
          }),
        }
      );

      expect(updateResponse.status).toBe(200);
      const { data: updatedRotation } = await updateResponse.json();
      expect(updatedRotation.participants).toHaveLength(2);
      expect(updatedRotation.participants).toContain(ctx.userId);
      expect(updatedRotation.participants).toContain(secondUserId);
    });

    it("rejects rotation with empty participants array", async () => {
      const response = await fetch(`${API_URL}/oncall/rotations`, {
        method: "POST",
        headers: ctx.headers,
        body: JSON.stringify({
          name: "Empty Participants Test",
          timezone: "UTC",
          rotationStart: new Date().toISOString(),
          shiftDurationMinutes: 60,
          participants: [], // Empty array should be rejected
          handoffNotificationMinutes: 30,
          handoffChannels: [],
          active: true,
        }),
      });

      // Should reject empty participants
      expect(response.status).toBeGreaterThanOrEqual(400);
    });
  });

  describe("Consecutive Degraded/Down Checks Fix", () => {
    it("creates monitor with degradedAfterCount field", async () => {
      const response = await fetch(`${API_URL}/monitors`, {
        method: "POST",
        headers: ctx.headers,
        body: JSON.stringify({
          name: "Consecutive Degraded Test",
          type: "http",
          url: "https://example.com",
          interval: 60,
          timeout: 30000,
          degradedAfterCount: 3, // Require 3 consecutive degraded checks
        }),
      });

      expect(response.status).toBe(201);
      const { data } = await response.json();
      expect(data.degradedAfterCount).toBe(3);
    });

    it("creates monitor with downAfterCount field", async () => {
      const response = await fetch(`${API_URL}/monitors`, {
        method: "POST",
        headers: ctx.headers,
        body: JSON.stringify({
          name: "Consecutive Down Test",
          type: "http",
          url: "https://example.com",
          interval: 60,
          timeout: 30000,
          downAfterCount: 5, // Require 5 consecutive failures
        }),
      });

      expect(response.status).toBe(201);
      const { data } = await response.json();
      expect(data.downAfterCount).toBe(5);
    });

    it("creates monitor with both consecutive check fields", async () => {
      const response = await fetch(`${API_URL}/monitors`, {
        method: "POST",
        headers: ctx.headers,
        body: JSON.stringify({
          name: "Both Consecutive Checks Test",
          type: "http",
          url: "https://example.com",
          interval: 60,
          timeout: 30000,
          degradedAfterCount: 2,
          downAfterCount: 3,
        }),
      });

      expect(response.status).toBe(201);
      const { data } = await response.json();
      expect(data.degradedAfterCount).toBe(2);
      expect(data.downAfterCount).toBe(3);
    });

    it("defaults to 1 for consecutive check fields when not specified", async () => {
      const response = await fetch(`${API_URL}/monitors`, {
        method: "POST",
        headers: ctx.headers,
        body: JSON.stringify({
          name: "Default Consecutive Test",
          type: "http",
          url: "https://example.com",
          interval: 60,
          timeout: 30000,
        }),
      });

      expect(response.status).toBe(201);
      const { data } = await response.json();
      // Should default to 1 (immediate status change)
      expect(data.degradedAfterCount).toBe(1);
      expect(data.downAfterCount).toBe(1);
    });

    it("updates monitor consecutive check fields", async () => {
      // First create a monitor
      const createResponse = await fetch(`${API_URL}/monitors`, {
        method: "POST",
        headers: ctx.headers,
        body: JSON.stringify({
          name: "Update Consecutive Test",
          type: "http",
          url: "https://example.com",
          interval: 60,
          timeout: 30000,
        }),
      });

      const { data: monitor } = await createResponse.json();

      // Update the consecutive check fields
      const updateResponse = await fetch(`${API_URL}/monitors/${monitor.id}`, {
        method: "PATCH",
        headers: ctx.headers,
        body: JSON.stringify({
          degradedAfterCount: 4,
          downAfterCount: 6,
        }),
      });

      expect(updateResponse.status).toBe(200);
      const { data: updatedMonitor } = await updateResponse.json();
      expect(updatedMonitor.degradedAfterCount).toBe(4);
      expect(updatedMonitor.downAfterCount).toBe(6);
    });

    it("rejects consecutive check values outside valid range", async () => {
      // Test value too low (< 1)
      const lowResponse = await fetch(`${API_URL}/monitors`, {
        method: "POST",
        headers: ctx.headers,
        body: JSON.stringify({
          name: "Invalid Low Consecutive Test",
          type: "http",
          url: "https://example.com",
          interval: 60,
          timeout: 30000,
          degradedAfterCount: 0, // Should be at least 1
        }),
      });

      expect(lowResponse.status).toBeGreaterThanOrEqual(400);

      // Test value too high (> 10)
      const highResponse = await fetch(`${API_URL}/monitors`, {
        method: "POST",
        headers: ctx.headers,
        body: JSON.stringify({
          name: "Invalid High Consecutive Test",
          type: "http",
          url: "https://example.com",
          interval: 60,
          timeout: 30000,
          degradedAfterCount: 11, // Should be at most 10
        }),
      });

      expect(highResponse.status).toBeGreaterThanOrEqual(400);
    });
  });

  describe("Audit Log Filter Fix", () => {
    it("returns audit logs without filters", async () => {
      const response = await fetch(
        `${API_URL}/audit?organizationId=${ctx.organizationId}`,
        {
          method: "GET",
          headers: ctx.headers,
        }
      );

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.success).toBe(true);
      expect(Array.isArray(data.data)).toBe(true);
    });

    it("returns audit logs with action filter", async () => {
      const response = await fetch(
        `${API_URL}/audit?organizationId=${ctx.organizationId}&action=organization.update`,
        {
          method: "GET",
          headers: ctx.headers,
        }
      );

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.success).toBe(true);
    });

    it("returns audit logs with resource type filter", async () => {
      const response = await fetch(
        `${API_URL}/audit?organizationId=${ctx.organizationId}&resourceType=organization`,
        {
          method: "GET",
          headers: ctx.headers,
        }
      );

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.success).toBe(true);
    });

    it("returns audit logs with user filter", async () => {
      const response = await fetch(
        `${API_URL}/audit?organizationId=${ctx.organizationId}&userId=${ctx.userId}`,
        {
          method: "GET",
          headers: ctx.headers,
        }
      );

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.success).toBe(true);
    });

    it("returns audit logs with date range filter", async () => {
      const now = new Date();
      const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

      const response = await fetch(
        `${API_URL}/audit?organizationId=${ctx.organizationId}&from=${weekAgo.toISOString()}&to=${now.toISOString()}`,
        {
          method: "GET",
          headers: ctx.headers,
        }
      );

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.success).toBe(true);
    });

    it("returns audit logs with multiple filters combined", async () => {
      const response = await fetch(
        `${API_URL}/audit?organizationId=${ctx.organizationId}&action=organization.update&resourceType=organization&userId=${ctx.userId}`,
        {
          method: "GET",
          headers: ctx.headers,
        }
      );

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.success).toBe(true);
    });
  });

  describe("Monitor Dependencies Fix", () => {
    it("creates monitor with dependencies", async () => {
      // First create a parent monitor
      const parentResponse = await fetch(`${API_URL}/monitors`, {
        method: "POST",
        headers: ctx.headers,
        body: JSON.stringify({
          name: "Parent Monitor",
          type: "http",
          url: "https://example.com/parent",
          interval: 60,
          timeout: 30000,
        }),
      });

      expect(parentResponse.status).toBe(201);
      const { data: parentMonitor } = await parentResponse.json();

      // Create a child monitor that depends on parent
      const childResponse = await fetch(`${API_URL}/monitors`, {
        method: "POST",
        headers: ctx.headers,
        body: JSON.stringify({
          name: "Child Monitor",
          type: "http",
          url: "https://example.com/child",
          interval: 60,
          timeout: 30000,
          dependsOn: [parentMonitor.id],
        }),
      });

      expect(childResponse.status).toBe(201);
      const { data: childMonitor } = await childResponse.json();
      expect(childMonitor.dependsOn).toContain(parentMonitor.id);
    });

    it("adds dependency to existing monitor", async () => {
      // Create two monitors
      const monitor1Response = await fetch(`${API_URL}/monitors`, {
        method: "POST",
        headers: ctx.headers,
        body: JSON.stringify({
          name: "Monitor 1",
          type: "http",
          url: "https://example.com/1",
          interval: 60,
          timeout: 30000,
        }),
      });
      const { data: monitor1 } = await monitor1Response.json();

      const monitor2Response = await fetch(`${API_URL}/monitors`, {
        method: "POST",
        headers: ctx.headers,
        body: JSON.stringify({
          name: "Monitor 2",
          type: "http",
          url: "https://example.com/2",
          interval: 60,
          timeout: 30000,
        }),
      });
      const { data: monitor2 } = await monitor2Response.json();

      // Add dependency
      const updateResponse = await fetch(
        `${API_URL}/monitors/${monitor2.id}`,
        {
          method: "PATCH",
          headers: ctx.headers,
          body: JSON.stringify({
            dependsOn: [monitor1.id],
          }),
        }
      );

      expect(updateResponse.status).toBe(200);
      const { data: updatedMonitor } = await updateResponse.json();
      expect(updatedMonitor.dependsOn).toContain(monitor1.id);
    });

    it("removes dependency from monitor", async () => {
      // Create parent monitor
      const parentResponse = await fetch(`${API_URL}/monitors`, {
        method: "POST",
        headers: ctx.headers,
        body: JSON.stringify({
          name: "Parent for Remove Test",
          type: "http",
          url: "https://example.com/remove-parent",
          interval: 60,
          timeout: 30000,
        }),
      });
      const { data: parent } = await parentResponse.json();

      // Create child with dependency
      const childResponse = await fetch(`${API_URL}/monitors`, {
        method: "POST",
        headers: ctx.headers,
        body: JSON.stringify({
          name: "Child for Remove Test",
          type: "http",
          url: "https://example.com/remove-child",
          interval: 60,
          timeout: 30000,
          dependsOn: [parent.id],
        }),
      });
      const { data: child } = await childResponse.json();

      // Remove dependency
      const updateResponse = await fetch(`${API_URL}/monitors/${child.id}`, {
        method: "PATCH",
        headers: ctx.headers,
        body: JSON.stringify({
          dependsOn: [],
        }),
      });

      expect(updateResponse.status).toBe(200);
      const { data: updatedChild } = await updateResponse.json();
      expect(updatedChild.dependsOn).toEqual([]);
    });
  });

  describe("Audit Export Primary Path Fix", () => {
    // These tests ensure the primary /audit-logs/ path works, not just the legacy /audit/ alias
    it("exports audit logs using primary /audit-logs/export path (JSON)", async () => {
      const response = await fetch(
        `${API_URL}/audit-logs/export?format=json&organizationId=${ctx.organizationId}`,
        {
          method: "GET",
          headers: {
            Authorization: ctx.headers.Authorization,
          },
        }
      );

      // Should not return 404
      expect(response.status).not.toBe(404);
      expect([200, 301, 302]).toContain(response.status);
    });

    it("exports audit logs using primary /audit-logs/export path (CSV)", async () => {
      const response = await fetch(
        `${API_URL}/audit-logs/export?format=csv&organizationId=${ctx.organizationId}`,
        {
          method: "GET",
          headers: {
            Authorization: ctx.headers.Authorization,
          },
        }
      );

      expect(response.status).not.toBe(404);
      expect([200, 301, 302]).toContain(response.status);
    });

    it("exports audit logs with date range using primary path", async () => {
      const now = new Date();
      const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

      const response = await fetch(
        `${API_URL}/audit-logs/export?format=json&organizationId=${ctx.organizationId}&from=${weekAgo.toISOString()}&to=${now.toISOString()}`,
        {
          method: "GET",
          headers: {
            Authorization: ctx.headers.Authorization,
          },
        }
      );

      expect(response.status).not.toBe(404);
      expect([200, 301, 302]).toContain(response.status);
    });
  });
});
