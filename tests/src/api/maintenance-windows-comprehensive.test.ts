import { describe, it, expect, beforeAll } from "vitest";
import { bootstrapTestContext, TestContext } from "../helpers/context";
import {
  insertOrganization,
  insertUser,
  insertApiKey,
  insertMonitor,
  insertMaintenanceWindow,
} from "../helpers/data";

const API_BASE_URL = process.env.API_BASE_URL ?? "http://api:3001";
const apiUrl = `${API_BASE_URL}/api/v1`;

describe("Maintenance Windows API", () => {
  let ctx: TestContext;
  let orgId: string;
  let userId: string;
  let adminToken: string;
  let readOnlyToken: string;
  let otherOrgId: string;
  let otherOrgToken: string;
  let testMonitorId: string;

  beforeAll(async () => {
    ctx = await bootstrapTestContext();

    // Create test organization
    const org = await insertOrganization({ name: "Maintenance Test Org" });
    orgId = org.id;

    // Create admin user with API key
    const adminUser = await insertUser({
      email: "maintenance-admin@test.com",
      name: "Maintenance Admin",
    });
    userId = adminUser.id;

    const adminKey = await insertApiKey(orgId, {
      userId: adminUser.id,
      scope: "admin",
    });
    adminToken = adminKey.key;

    // Create read-only API key
    const readKey = await insertApiKey(orgId, {
      userId: adminUser.id,
      scope: "read",
    });
    readOnlyToken = readKey.key;

    // Create test monitor
    const monitor = await insertMonitor(orgId, {
      name: "Maintenance Test Monitor",
      type: "http",
      url: "https://example.com",
    });
    testMonitorId = monitor.id;

    // Create another organization for isolation tests
    const otherOrg = await insertOrganization({ name: "Other Maintenance Org" });
    otherOrgId = otherOrg.id;

    const otherUser = await insertUser({
      email: "other-maintenance@test.com",
      name: "Other Maintenance User",
    });
    const otherKey = await insertApiKey(otherOrgId, {
      userId: otherUser.id,
      scope: "admin",
    });
    otherOrgToken = otherKey.key;
  });

  // ==========================================
  // CRUD Operations
  // ==========================================
  describe("CRUD Operations", () => {
    describe("POST /maintenance-windows", () => {
      it("creates a scheduled maintenance window", async () => {
        const now = new Date();
        const startsAt = new Date(now.getTime() + 24 * 60 * 60 * 1000); // Tomorrow
        const endsAt = new Date(now.getTime() + 26 * 60 * 60 * 1000); // Tomorrow + 2 hours

        const res = await fetch(`${apiUrl}/maintenance-windows`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${adminToken}`,
          },
          body: JSON.stringify({
            name: "Scheduled Database Maintenance",
            description: "Regular database maintenance and optimization",
            affectedMonitors: [testMonitorId],
            startsAt: startsAt.toISOString(),
            endsAt: endsAt.toISOString(),
            timezone: "America/New_York",
          }),
        });

        expect(res.status).toBe(201);
        const body = await res.json();
        expect(body.success).toBe(true);
        expect(body.data.id).toBeDefined();
        expect(body.data.name).toBe("Scheduled Database Maintenance");
        expect(body.data.description).toBe("Regular database maintenance and optimization");
        expect(body.data.affectedMonitors).toContain(testMonitorId);
        expect(body.data.timezone).toBe("America/New_York");
        expect(body.data.computedStatus).toBe("scheduled");
      });

      it("creates maintenance with notification settings", async () => {
        const now = new Date();
        const startsAt = new Date(now.getTime() + 48 * 60 * 60 * 1000);
        const endsAt = new Date(now.getTime() + 50 * 60 * 60 * 1000);

        const res = await fetch(`${apiUrl}/maintenance-windows`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${adminToken}`,
          },
          body: JSON.stringify({
            name: "Notification Test Maintenance",
            startsAt: startsAt.toISOString(),
            endsAt: endsAt.toISOString(),
            timezone: "UTC",
            affectedMonitors: [testMonitorId],
            notifySubscribers: {
              onStart: true,
              onEnd: true,
            },
          }),
        });

        expect(res.status).toBe(201);
        const body = await res.json();
        expect(body.success).toBe(true);
        expect(body.data.notifySubscribers.onStart).toBe(true);
        expect(body.data.notifySubscribers.onEnd).toBe(true);
      });

      it("creates maintenance with recurrence settings", async () => {
        const now = new Date();
        const startsAt = new Date(now.getTime() + 72 * 60 * 60 * 1000);
        const endsAt = new Date(now.getTime() + 74 * 60 * 60 * 1000);

        const res = await fetch(`${apiUrl}/maintenance-windows`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${adminToken}`,
          },
          body: JSON.stringify({
            name: "Weekly Maintenance",
            startsAt: startsAt.toISOString(),
            endsAt: endsAt.toISOString(),
            timezone: "UTC",
            affectedMonitors: [testMonitorId],
            recurrence: {
              type: "weekly",
              daysOfWeek: [0], // Sunday
            },
          }),
        });

        expect(res.status).toBe(201);
        const body = await res.json();
        expect(body.success).toBe(true);
        expect(body.data.recurrence.type).toBe("weekly");
      });

      it("creates maintenance affecting multiple monitors", async () => {
        const monitor2 = await insertMonitor(orgId, {
          name: "Second Maintenance Monitor",
          type: "http",
          url: "https://example2.com",
        });

        const now = new Date();
        const startsAt = new Date(now.getTime() + 96 * 60 * 60 * 1000);
        const endsAt = new Date(now.getTime() + 98 * 60 * 60 * 1000);

        const res = await fetch(`${apiUrl}/maintenance-windows`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${adminToken}`,
          },
          body: JSON.stringify({
            name: "Multi-Monitor Maintenance",
            affectedMonitors: [testMonitorId, monitor2.id],
            startsAt: startsAt.toISOString(),
            endsAt: endsAt.toISOString(),
            timezone: "UTC",
          }),
        });

        expect(res.status).toBe(201);
        const body = await res.json();
        expect(body.success).toBe(true);
        expect(body.data.affectedMonitors).toContain(testMonitorId);
        expect(body.data.affectedMonitors).toContain(monitor2.id);
      });
    });

    describe("GET /maintenance-windows", () => {
      it("lists all maintenance windows for organization", async () => {
        const res = await fetch(`${apiUrl}/maintenance-windows`, {
          headers: {
            Authorization: `Bearer ${adminToken}`,
          },
        });

        expect(res.status).toBe(200);
        const body = await res.json();
        expect(body.success).toBe(true);
        expect(Array.isArray(body.data)).toBe(true);
        expect(body.data.length).toBeGreaterThan(0);
      });

      it("includes computed status in response", async () => {
        const res = await fetch(`${apiUrl}/maintenance-windows`, {
          headers: {
            Authorization: `Bearer ${adminToken}`,
          },
        });

        expect(res.status).toBe(200);
        const body = await res.json();
        expect(body.success).toBe(true);

        for (const window of body.data) {
          expect(["scheduled", "active", "completed"]).toContain(window.computedStatus);
        }
      });

      it("includes creator info in response", async () => {
        const res = await fetch(`${apiUrl}/maintenance-windows`, {
          headers: {
            Authorization: `Bearer ${adminToken}`,
          },
        });

        expect(res.status).toBe(200);
        const body = await res.json();
        expect(body.success).toBe(true);

        // At least some should have creator info
        const withCreator = body.data.filter((w: any) => w.createdByUser);
        if (withCreator.length > 0) {
          expect(withCreator[0].createdByUser.id).toBeDefined();
          expect(withCreator[0].createdByUser.name).toBeDefined();
        }
      });

      describe("Status Filtering", () => {
        it("filters to upcoming maintenance", async () => {
          const res = await fetch(`${apiUrl}/maintenance-windows?status=upcoming`, {
            headers: {
              Authorization: `Bearer ${adminToken}`,
            },
          });

          expect(res.status).toBe(200);
          const body = await res.json();
          expect(body.success).toBe(true);

          for (const window of body.data) {
            expect(window.computedStatus).toBe("scheduled");
          }
        });

        it("filters to active maintenance", async () => {
          // Create an active maintenance window
          const now = new Date();
          const pastStart = new Date(now.getTime() - 60 * 60 * 1000); // 1 hour ago
          const futureEnd = new Date(now.getTime() + 60 * 60 * 1000); // 1 hour from now

          await insertMaintenanceWindow(orgId, userId, {
            name: "Currently Active Maintenance",
            startsAt: pastStart,
            endsAt: futureEnd,
          });

          const res = await fetch(`${apiUrl}/maintenance-windows?status=active`, {
            headers: {
              Authorization: `Bearer ${adminToken}`,
            },
          });

          expect(res.status).toBe(200);
          const body = await res.json();
          expect(body.success).toBe(true);

          for (const window of body.data) {
            expect(window.computedStatus).toBe("active");
          }
        });

        it("filters to past maintenance", async () => {
          // Create a past maintenance window
          const now = new Date();
          const pastStart = new Date(now.getTime() - 48 * 60 * 60 * 1000); // 2 days ago
          const pastEnd = new Date(now.getTime() - 46 * 60 * 60 * 1000);

          await insertMaintenanceWindow(orgId, userId, {
            name: "Past Maintenance",
            startsAt: pastStart,
            endsAt: pastEnd,
          });

          const res = await fetch(`${apiUrl}/maintenance-windows?status=past`, {
            headers: {
              Authorization: `Bearer ${adminToken}`,
            },
          });

          expect(res.status).toBe(200);
          const body = await res.json();
          expect(body.success).toBe(true);

          for (const window of body.data) {
            expect(window.computedStatus).toBe("completed");
          }
        });
      });
    });

    describe("GET /maintenance-windows/:id", () => {
      let getWindowId: string;

      beforeAll(async () => {
        const now = new Date();
        const startsAt = new Date(now.getTime() + 120 * 60 * 60 * 1000);
        const endsAt = new Date(now.getTime() + 122 * 60 * 60 * 1000);

        const window = await insertMaintenanceWindow(orgId, userId, {
          name: "Get Test Maintenance",
          startsAt,
          endsAt,
          affectedMonitors: [testMonitorId],
        });
        getWindowId = window.id;
      });

      it("gets a specific maintenance window", async () => {
        const res = await fetch(`${apiUrl}/maintenance-windows/${getWindowId}`, {
          headers: {
            Authorization: `Bearer ${adminToken}`,
          },
        });

        expect(res.status).toBe(200);
        const body = await res.json();
        expect(body.success).toBe(true);
        expect(body.data.id).toBe(getWindowId);
        expect(body.data.name).toBe("Get Test Maintenance");
        expect(body.data.computedStatus).toBeDefined();
      });

      it("returns 404 for non-existent window", async () => {
        const res = await fetch(`${apiUrl}/maintenance-windows/non-existent-id`, {
          headers: {
            Authorization: `Bearer ${adminToken}`,
          },
        });

        expect(res.status).toBe(404);
        const body = await res.json();
        expect(body.success).toBe(false);
      });
    });

    describe("PATCH /maintenance-windows/:id", () => {
      let updateWindowId: string;

      beforeAll(async () => {
        const now = new Date();
        const startsAt = new Date(now.getTime() + 144 * 60 * 60 * 1000);
        const endsAt = new Date(now.getTime() + 146 * 60 * 60 * 1000);

        const window = await insertMaintenanceWindow(orgId, userId, {
          name: "Update Test Maintenance",
          startsAt,
          endsAt,
        });
        updateWindowId = window.id;
      });

      it("updates maintenance window name", async () => {
        const res = await fetch(`${apiUrl}/maintenance-windows/${updateWindowId}`, {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${adminToken}`,
          },
          body: JSON.stringify({
            name: "Updated Maintenance Name",
          }),
        });

        expect(res.status).toBe(200);
        const body = await res.json();
        expect(body.success).toBe(true);
        expect(body.data.name).toBe("Updated Maintenance Name");
      });

      it("updates maintenance window description", async () => {
        const res = await fetch(`${apiUrl}/maintenance-windows/${updateWindowId}`, {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${adminToken}`,
          },
          body: JSON.stringify({
            description: "New description for maintenance",
          }),
        });

        expect(res.status).toBe(200);
        const body = await res.json();
        expect(body.success).toBe(true);
        expect(body.data.description).toBe("New description for maintenance");
      });

      it("updates affected monitors", async () => {
        const res = await fetch(`${apiUrl}/maintenance-windows/${updateWindowId}`, {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${adminToken}`,
          },
          body: JSON.stringify({
            affectedMonitors: [testMonitorId],
          }),
        });

        expect(res.status).toBe(200);
        const body = await res.json();
        expect(body.success).toBe(true);
        expect(body.data.affectedMonitors).toContain(testMonitorId);
      });

      it("updates maintenance window times", async () => {
        const now = new Date();
        const newStartsAt = new Date(now.getTime() + 168 * 60 * 60 * 1000);
        const newEndsAt = new Date(now.getTime() + 170 * 60 * 60 * 1000);

        const res = await fetch(`${apiUrl}/maintenance-windows/${updateWindowId}`, {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${adminToken}`,
          },
          body: JSON.stringify({
            startsAt: newStartsAt.toISOString(),
            endsAt: newEndsAt.toISOString(),
          }),
        });

        expect(res.status).toBe(200);
        const body = await res.json();
        expect(body.success).toBe(true);
      });

      it("updates timezone", async () => {
        const res = await fetch(`${apiUrl}/maintenance-windows/${updateWindowId}`, {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${adminToken}`,
          },
          body: JSON.stringify({
            timezone: "Europe/London",
          }),
        });

        expect(res.status).toBe(200);
        const body = await res.json();
        expect(body.success).toBe(true);
        expect(body.data.timezone).toBe("Europe/London");
      });

      it("returns 404 when updating non-existent window", async () => {
        const res = await fetch(`${apiUrl}/maintenance-windows/non-existent-id`, {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${adminToken}`,
          },
          body: JSON.stringify({
            name: "Updated",
          }),
        });

        expect(res.status).toBe(404);
        const body = await res.json();
        expect(body.success).toBe(false);
      });
    });

    describe("DELETE /maintenance-windows/:id", () => {
      it("deletes a maintenance window", async () => {
        const now = new Date();
        const startsAt = new Date(now.getTime() + 192 * 60 * 60 * 1000);
        const endsAt = new Date(now.getTime() + 194 * 60 * 60 * 1000);

        const window = await insertMaintenanceWindow(orgId, userId, {
          name: "Delete Test Maintenance",
          startsAt,
          endsAt,
        });

        const res = await fetch(`${apiUrl}/maintenance-windows/${window.id}`, {
          method: "DELETE",
          headers: {
            Authorization: `Bearer ${adminToken}`,
          },
        });

        expect(res.status).toBe(200);
        const body = await res.json();
        expect(body.success).toBe(true);
        expect(body.data.id).toBe(window.id);

        // Verify it's deleted
        const getRes = await fetch(`${apiUrl}/maintenance-windows/${window.id}`, {
          headers: {
            Authorization: `Bearer ${adminToken}`,
          },
        });
        expect(getRes.status).toBe(404);
      });

      it("returns 404 when deleting non-existent window", async () => {
        const res = await fetch(`${apiUrl}/maintenance-windows/non-existent-id`, {
          method: "DELETE",
          headers: {
            Authorization: `Bearer ${adminToken}`,
          },
        });

        expect(res.status).toBe(404);
        const body = await res.json();
        expect(body.success).toBe(false);
      });
    });
  });

  // ==========================================
  // End Early
  // ==========================================
  describe("POST /maintenance-windows/:id/end-early", () => {
    it("ends an active maintenance window early", async () => {
      const now = new Date();
      const pastStart = new Date(now.getTime() - 60 * 60 * 1000); // 1 hour ago
      const futureEnd = new Date(now.getTime() + 60 * 60 * 1000); // 1 hour from now

      const window = await insertMaintenanceWindow(orgId, userId, {
        name: "End Early Test Maintenance",
        startsAt: pastStart,
        endsAt: futureEnd,
      });

      const res = await fetch(`${apiUrl}/maintenance-windows/${window.id}/end-early`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${adminToken}`,
        },
      });

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.success).toBe(true);
      expect(body.data.computedStatus).toBe("completed");
    });

    it("returns 404 for scheduled (not started) maintenance", async () => {
      const now = new Date();
      const futureStart = new Date(now.getTime() + 24 * 60 * 60 * 1000);
      const futureEnd = new Date(now.getTime() + 26 * 60 * 60 * 1000);

      const window = await insertMaintenanceWindow(orgId, userId, {
        name: "Future Maintenance Cannot End",
        startsAt: futureStart,
        endsAt: futureEnd,
      });

      const res = await fetch(`${apiUrl}/maintenance-windows/${window.id}/end-early`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${adminToken}`,
        },
      });

      expect(res.status).toBe(404);
      const body = await res.json();
      expect(body.success).toBe(false);
    });

    it("returns 404 for already completed maintenance", async () => {
      const now = new Date();
      const pastStart = new Date(now.getTime() - 48 * 60 * 60 * 1000);
      const pastEnd = new Date(now.getTime() - 46 * 60 * 60 * 1000);

      const window = await insertMaintenanceWindow(orgId, userId, {
        name: "Past Maintenance Cannot End",
        startsAt: pastStart,
        endsAt: pastEnd,
      });

      const res = await fetch(`${apiUrl}/maintenance-windows/${window.id}/end-early`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${adminToken}`,
        },
      });

      expect(res.status).toBe(404);
      const body = await res.json();
      expect(body.success).toBe(false);
    });

    it("returns 404 for non-existent window", async () => {
      const res = await fetch(`${apiUrl}/maintenance-windows/non-existent-id/end-early`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${adminToken}`,
        },
      });

      expect(res.status).toBe(404);
      const body = await res.json();
      expect(body.success).toBe(false);
    });
  });

  // ==========================================
  // Active Monitors Endpoint
  // ==========================================
  describe("GET /maintenance-windows/active/monitors", () => {
    it("returns monitor IDs affected by active maintenance", async () => {
      const res = await fetch(`${apiUrl}/maintenance-windows/active/monitors`, {
        headers: {
          Authorization: `Bearer ${adminToken}`,
        },
      });

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.success).toBe(true);
      expect(body.data.monitorIds).toBeDefined();
      expect(Array.isArray(body.data.monitorIds)).toBe(true);
      expect(typeof body.data.activeWindows).toBe("number");
    });
  });

  // ==========================================
  // Status Computation
  // ==========================================
  describe("Status Computation", () => {
    it("computes scheduled status correctly", async () => {
      const now = new Date();
      const futureStart = new Date(now.getTime() + 72 * 60 * 60 * 1000);
      const futureEnd = new Date(now.getTime() + 74 * 60 * 60 * 1000);

      const window = await insertMaintenanceWindow(orgId, userId, {
        name: "Scheduled Status Test",
        startsAt: futureStart,
        endsAt: futureEnd,
      });

      const res = await fetch(`${apiUrl}/maintenance-windows/${window.id}`, {
        headers: {
          Authorization: `Bearer ${adminToken}`,
        },
      });

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.data.computedStatus).toBe("scheduled");
    });

    it("computes active status correctly", async () => {
      const now = new Date();
      const pastStart = new Date(now.getTime() - 30 * 60 * 1000); // 30 min ago
      const futureEnd = new Date(now.getTime() + 30 * 60 * 1000); // 30 min from now

      const window = await insertMaintenanceWindow(orgId, userId, {
        name: "Active Status Test",
        startsAt: pastStart,
        endsAt: futureEnd,
      });

      const res = await fetch(`${apiUrl}/maintenance-windows/${window.id}`, {
        headers: {
          Authorization: `Bearer ${adminToken}`,
        },
      });

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.data.computedStatus).toBe("active");
    });

    it("computes completed status correctly", async () => {
      const now = new Date();
      const pastStart = new Date(now.getTime() - 72 * 60 * 60 * 1000);
      const pastEnd = new Date(now.getTime() - 70 * 60 * 60 * 1000);

      const window = await insertMaintenanceWindow(orgId, userId, {
        name: "Completed Status Test",
        startsAt: pastStart,
        endsAt: pastEnd,
      });

      const res = await fetch(`${apiUrl}/maintenance-windows/${window.id}`, {
        headers: {
          Authorization: `Bearer ${adminToken}`,
        },
      });

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.data.computedStatus).toBe("completed");
    });
  });

  // ==========================================
  // Authorization
  // ==========================================
  describe("Authorization", () => {
    it("requires authentication for listing maintenance windows", async () => {
      const res = await fetch(`${apiUrl}/maintenance-windows`);
      expect(res.status).toBe(401);
    });

    it("requires authentication for creating maintenance windows", async () => {
      const res = await fetch(`${apiUrl}/maintenance-windows`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name: "Unauthenticated",
          startsAt: new Date().toISOString(),
          endsAt: new Date().toISOString(),
          timezone: "UTC",
        }),
      });
      expect(res.status).toBe(401);
    });

    it("allows read-only access for listing maintenance windows", async () => {
      const res = await fetch(`${apiUrl}/maintenance-windows`, {
        headers: {
          Authorization: `Bearer ${readOnlyToken}`,
        },
      });
      expect(res.status).toBe(200);
    });

    it("allows read-only access for getting maintenance window", async () => {
      const now = new Date();
      const window = await insertMaintenanceWindow(orgId, userId, {
        name: "Read Access Test",
        startsAt: new Date(now.getTime() + 200 * 60 * 60 * 1000),
        endsAt: new Date(now.getTime() + 202 * 60 * 60 * 1000),
      });

      const res = await fetch(`${apiUrl}/maintenance-windows/${window.id}`, {
        headers: {
          Authorization: `Bearer ${readOnlyToken}`,
        },
      });
      expect(res.status).toBe(200);
    });

    it("allows read-only access for active monitors endpoint", async () => {
      const res = await fetch(`${apiUrl}/maintenance-windows/active/monitors`, {
        headers: {
          Authorization: `Bearer ${readOnlyToken}`,
        },
      });
      expect(res.status).toBe(200);
    });
  });

  // ==========================================
  // Organization Isolation
  // ==========================================
  describe("Organization Isolation", () => {
    let isolatedWindowId: string;

    beforeAll(async () => {
      const now = new Date();
      const window = await insertMaintenanceWindow(orgId, userId, {
        name: "Isolated Maintenance",
        startsAt: new Date(now.getTime() + 220 * 60 * 60 * 1000),
        endsAt: new Date(now.getTime() + 222 * 60 * 60 * 1000),
      });
      isolatedWindowId = window.id;
    });

    it("cannot get maintenance window from another organization", async () => {
      const res = await fetch(`${apiUrl}/maintenance-windows/${isolatedWindowId}`, {
        headers: {
          Authorization: `Bearer ${otherOrgToken}`,
        },
      });

      expect(res.status).toBe(404);
      const body = await res.json();
      expect(body.success).toBe(false);
    });

    it("cannot update maintenance window from another organization", async () => {
      const res = await fetch(`${apiUrl}/maintenance-windows/${isolatedWindowId}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${otherOrgToken}`,
        },
        body: JSON.stringify({
          name: "Hacked Name",
        }),
      });

      expect(res.status).toBe(404);
      const body = await res.json();
      expect(body.success).toBe(false);
    });

    it("cannot delete maintenance window from another organization", async () => {
      const res = await fetch(`${apiUrl}/maintenance-windows/${isolatedWindowId}`, {
        method: "DELETE",
        headers: {
          Authorization: `Bearer ${otherOrgToken}`,
        },
      });

      expect(res.status).toBe(404);
      const body = await res.json();
      expect(body.success).toBe(false);
    });

    it("cannot end early maintenance window from another organization", async () => {
      const res = await fetch(
        `${apiUrl}/maintenance-windows/${isolatedWindowId}/end-early`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${otherOrgToken}`,
          },
        }
      );

      expect(res.status).toBe(404);
      const body = await res.json();
      expect(body.success).toBe(false);
    });

    it("does not list maintenance windows from another organization", async () => {
      const res = await fetch(`${apiUrl}/maintenance-windows`, {
        headers: {
          Authorization: `Bearer ${otherOrgToken}`,
        },
      });

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.success).toBe(true);

      const windowIds = body.data.map((w: any) => w.id);
      expect(windowIds).not.toContain(isolatedWindowId);
    });
  });
});
