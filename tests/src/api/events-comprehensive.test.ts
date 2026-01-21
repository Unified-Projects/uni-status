import { describe, it, expect, beforeAll } from "vitest";
import { bootstrapTestContext, TestContext } from "../helpers/context";
import {
  insertOrganization,
  insertUser,
  insertApiKey,
  insertMonitor,
  insertIncident,
  insertMaintenanceWindow,
} from "../helpers/data";

const API_BASE_URL = process.env.API_BASE_URL ?? "http://api:3001";
const apiUrl = `${API_BASE_URL}/api/v1`;

describe("Events API (Unified Events)", () => {
  let ctx: TestContext;
  let orgId: string;
  let userId: string;
  let adminToken: string;
  let readOnlyToken: string;
  let otherOrgId: string;
  let otherOrgToken: string;
  let testMonitorId: string;
  let testIncidentId: string;
  let testMaintenanceId: string;

  beforeAll(async () => {
    ctx = await bootstrapTestContext();

    // Create test organization
    const org = await insertOrganization({ name: "Events Test Org" });
    orgId = org.id;

    // Create admin user with API key
    const adminUser = await insertUser({
      email: "events-admin@test.com",
      name: "Events Admin",
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
      name: "Events Test Monitor",
      type: "http",
      url: "https://example.com",
    });
    testMonitorId = monitor.id;

    // Create test incident
    const incident = await insertIncident(orgId, {
      title: "Test Incident for Events",
      severity: "minor",
      status: "investigating",
      userId: adminUser.id,
      affectedMonitors: [testMonitorId],
    });
    testIncidentId = incident.id;

    // Create test maintenance window
    const now = new Date();
    const futureStart = new Date(now.getTime() + 60 * 60 * 1000); // 1 hour from now
    const futureEnd = new Date(now.getTime() + 2 * 60 * 60 * 1000); // 2 hours from now

    const maintenance = await insertMaintenanceWindow(orgId, adminUser.id, {
      name: "Test Maintenance Window",
      startsAt: futureStart,
      endsAt: futureEnd,
      affectedMonitors: [testMonitorId],
    });
    testMaintenanceId = maintenance.id;

    // Create another organization for isolation tests
    const otherOrg = await insertOrganization({ name: "Other Events Org" });
    otherOrgId = otherOrg.id;

    const otherUser = await insertUser({
      email: "other-events@test.com",
      name: "Other Events User",
    });
    const otherKey = await insertApiKey(otherOrgId, {
      userId: otherUser.id,
      scope: "admin",
    });
    otherOrgToken = otherKey.key;
  });

  // ==========================================
  // List Unified Events
  // ==========================================
  describe("GET /events", () => {
    it("lists unified events (incidents + maintenance)", async () => {
      const res = await fetch(`${apiUrl}/events`, {
        headers: {
          Authorization: `Bearer ${adminToken}`,
        },
      });

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.success).toBe(true);
      expect(body.data.events).toBeDefined();
      expect(Array.isArray(body.data.events)).toBe(true);
      expect(body.data.total).toBeDefined();
      expect(body.data.hasMore).toBeDefined();
      expect(body.data.counts.incidents).toBeDefined();
      expect(body.data.counts.maintenance).toBeDefined();
    });

    it("returns events sorted by start date descending", async () => {
      const res = await fetch(`${apiUrl}/events`, {
        headers: {
          Authorization: `Bearer ${adminToken}`,
        },
      });

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.success).toBe(true);

      for (let i = 1; i < body.data.events.length; i++) {
        const prev = new Date(body.data.events[i - 1].startedAt).getTime();
        const curr = new Date(body.data.events[i].startedAt).getTime();
        expect(prev).toBeGreaterThanOrEqual(curr);
      }
    });

    it("includes both incident and maintenance event types", async () => {
      const res = await fetch(`${apiUrl}/events`, {
        headers: {
          Authorization: `Bearer ${adminToken}`,
        },
      });

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.success).toBe(true);

      const types = new Set(body.data.events.map((e: any) => e.type));
      // Should have at least incidents (we created one)
      expect(types.has("incident") || types.has("maintenance")).toBe(true);
    });

    describe("Type Filtering", () => {
      it("filters to only incidents", async () => {
        const res = await fetch(`${apiUrl}/events?types=incident`, {
          headers: {
            Authorization: `Bearer ${adminToken}`,
          },
        });

        expect(res.status).toBe(200);
        const body = await res.json();
        expect(body.success).toBe(true);

        for (const event of body.data.events) {
          expect(event.type).toBe("incident");
        }
      });

      it("filters to only maintenance", async () => {
        const res = await fetch(`${apiUrl}/events?types=maintenance`, {
          headers: {
            Authorization: `Bearer ${adminToken}`,
          },
        });

        expect(res.status).toBe(200);
        const body = await res.json();
        expect(body.success).toBe(true);

        for (const event of body.data.events) {
          expect(event.type).toBe("maintenance");
        }
      });

      it("filters to multiple types", async () => {
        const res = await fetch(`${apiUrl}/events?types=incident,maintenance`, {
          headers: {
            Authorization: `Bearer ${adminToken}`,
          },
        });

        expect(res.status).toBe(200);
        const body = await res.json();
        expect(body.success).toBe(true);
      });
    });

    describe("Status Filtering", () => {
      it("filters incidents by status", async () => {
        const res = await fetch(`${apiUrl}/events?types=incident&status=investigating`, {
          headers: {
            Authorization: `Bearer ${adminToken}`,
          },
        });

        expect(res.status).toBe(200);
        const body = await res.json();
        expect(body.success).toBe(true);

        for (const event of body.data.events) {
          expect(event.status).toBe("investigating");
        }
      });

      it("filters by multiple statuses", async () => {
        const res = await fetch(
          `${apiUrl}/events?types=incident&status=investigating,identified`,
          {
            headers: {
              Authorization: `Bearer ${adminToken}`,
            },
          }
        );

        expect(res.status).toBe(200);
        const body = await res.json();
        expect(body.success).toBe(true);

        for (const event of body.data.events) {
          expect(["investigating", "identified"]).toContain(event.status);
        }
      });

      it("filters maintenance by computed status", async () => {
        const res = await fetch(`${apiUrl}/events?types=maintenance&status=scheduled`, {
          headers: {
            Authorization: `Bearer ${adminToken}`,
          },
        });

        expect(res.status).toBe(200);
        const body = await res.json();
        expect(body.success).toBe(true);

        for (const event of body.data.events) {
          expect(event.status).toBe("scheduled");
        }
      });
    });

    describe("Severity Filtering", () => {
      it("filters by severity", async () => {
        const res = await fetch(`${apiUrl}/events?severity=minor`, {
          headers: {
            Authorization: `Bearer ${adminToken}`,
          },
        });

        expect(res.status).toBe(200);
        const body = await res.json();
        expect(body.success).toBe(true);

        for (const event of body.data.events) {
          expect(event.severity).toBe("minor");
        }
      });

      it("filters to maintenance severity", async () => {
        const res = await fetch(`${apiUrl}/events?severity=maintenance`, {
          headers: {
            Authorization: `Bearer ${adminToken}`,
          },
        });

        expect(res.status).toBe(200);
        const body = await res.json();
        expect(body.success).toBe(true);

        for (const event of body.data.events) {
          expect(event.type).toBe("maintenance");
        }
      });
    });

    describe("Monitor Filtering", () => {
      it("filters by affected monitors", async () => {
        const res = await fetch(`${apiUrl}/events?monitors=${testMonitorId}`, {
          headers: {
            Authorization: `Bearer ${adminToken}`,
          },
        });

        expect(res.status).toBe(200);
        const body = await res.json();
        expect(body.success).toBe(true);

        for (const event of body.data.events) {
          expect(event.affectedMonitors).toContain(testMonitorId);
        }
      });
    });

    describe("Date Range Filtering", () => {
      it("filters by start date", async () => {
        const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
        const res = await fetch(`${apiUrl}/events?startDate=${yesterday}`, {
          headers: {
            Authorization: `Bearer ${adminToken}`,
          },
        });

        expect(res.status).toBe(200);
        const body = await res.json();
        expect(body.success).toBe(true);

        for (const event of body.data.events) {
          expect(new Date(event.startedAt).getTime()).toBeGreaterThanOrEqual(
            new Date(yesterday).getTime()
          );
        }
      });

      it("filters by end date", async () => {
        const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
        const res = await fetch(`${apiUrl}/events?endDate=${tomorrow}`, {
          headers: {
            Authorization: `Bearer ${adminToken}`,
          },
        });

        expect(res.status).toBe(200);
        const body = await res.json();
        expect(body.success).toBe(true);
      });

      it("filters by date range", async () => {
        const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
        const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
        const res = await fetch(
          `${apiUrl}/events?startDate=${yesterday}&endDate=${tomorrow}`,
          {
            headers: {
              Authorization: `Bearer ${adminToken}`,
            },
          }
        );

        expect(res.status).toBe(200);
        const body = await res.json();
        expect(body.success).toBe(true);
      });
    });

    describe("Search", () => {
      it("searches by title", async () => {
        const res = await fetch(`${apiUrl}/events?search=Test`, {
          headers: {
            Authorization: `Bearer ${adminToken}`,
          },
        });

        expect(res.status).toBe(200);
        const body = await res.json();
        expect(body.success).toBe(true);
      });
    });

    describe("Pagination", () => {
      it("respects limit parameter", async () => {
        const res = await fetch(`${apiUrl}/events?limit=1`, {
          headers: {
            Authorization: `Bearer ${adminToken}`,
          },
        });

        expect(res.status).toBe(200);
        const body = await res.json();
        expect(body.success).toBe(true);
        expect(body.data.events.length).toBeLessThanOrEqual(1);
      });

      it("respects offset parameter", async () => {
        const res = await fetch(`${apiUrl}/events?offset=1`, {
          headers: {
            Authorization: `Bearer ${adminToken}`,
          },
        });

        expect(res.status).toBe(200);
        const body = await res.json();
        expect(body.success).toBe(true);
      });

      it("indicates hasMore correctly", async () => {
        const res = await fetch(`${apiUrl}/events?limit=1`, {
          headers: {
            Authorization: `Bearer ${adminToken}`,
          },
        });

        expect(res.status).toBe(200);
        const body = await res.json();
        expect(body.success).toBe(true);

        if (body.data.total > 1) {
          expect(body.data.hasMore).toBe(true);
        }
      });

      it("enforces max limit of 100", async () => {
        const res = await fetch(`${apiUrl}/events?limit=200`, {
          headers: {
            Authorization: `Bearer ${adminToken}`,
          },
        });

        expect(res.status).toBe(200);
        const body = await res.json();
        expect(body.success).toBe(true);
        expect(body.data.events.length).toBeLessThanOrEqual(100);
      });
    });

    it("includes affected monitor details", async () => {
      const res = await fetch(`${apiUrl}/events`, {
        headers: {
          Authorization: `Bearer ${adminToken}`,
        },
      });

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.success).toBe(true);

      // Find events with affected monitors
      const eventsWithMonitors = body.data.events.filter(
        (e: any) => e.affectedMonitors.length > 0
      );

      for (const event of eventsWithMonitors) {
        expect(event.affectedMonitorDetails).toBeDefined();
        expect(Array.isArray(event.affectedMonitorDetails)).toBe(true);
      }
    });
  });

  // ==========================================
  // Get Single Event
  // ==========================================
  describe("GET /events/:type/:id", () => {
    describe("Incident Events", () => {
      it("gets a specific incident event", async () => {
        const res = await fetch(`${apiUrl}/events/incident/${testIncidentId}`, {
          headers: {
            Authorization: `Bearer ${adminToken}`,
          },
        });

        expect(res.status).toBe(200);
        const body = await res.json();
        expect(body.success).toBe(true);
        expect(body.data.id).toBe(testIncidentId);
        expect(body.data.type).toBe("incident");
        expect(body.data.title).toBe("Test Incident for Events");
      });

      it("includes incident updates", async () => {
        const res = await fetch(`${apiUrl}/events/incident/${testIncidentId}`, {
          headers: {
            Authorization: `Bearer ${adminToken}`,
          },
        });

        expect(res.status).toBe(200);
        const body = await res.json();
        expect(body.success).toBe(true);
        expect(body.data.updates).toBeDefined();
        expect(Array.isArray(body.data.updates)).toBe(true);
      });

      it("includes subscriber count", async () => {
        const res = await fetch(`${apiUrl}/events/incident/${testIncidentId}`, {
          headers: {
            Authorization: `Bearer ${adminToken}`,
          },
        });

        expect(res.status).toBe(200);
        const body = await res.json();
        expect(body.success).toBe(true);
        expect(typeof body.data.subscriberCount).toBe("number");
      });

      it("returns 404 for non-existent incident", async () => {
        const res = await fetch(`${apiUrl}/events/incident/non-existent-id`, {
          headers: {
            Authorization: `Bearer ${adminToken}`,
          },
        });

        expect(res.status).toBe(404);
        const body = await res.json();
        expect(body.success).toBe(false);
      });
    });

    describe("Maintenance Events", () => {
      it("gets a specific maintenance event", async () => {
        const res = await fetch(`${apiUrl}/events/maintenance/${testMaintenanceId}`, {
          headers: {
            Authorization: `Bearer ${adminToken}`,
          },
        });

        expect(res.status).toBe(200);
        const body = await res.json();
        expect(body.success).toBe(true);
        expect(body.data.id).toBe(testMaintenanceId);
        expect(body.data.type).toBe("maintenance");
        expect(body.data.title).toBe("Test Maintenance Window");
      });

      it("includes computed status", async () => {
        const res = await fetch(`${apiUrl}/events/maintenance/${testMaintenanceId}`, {
          headers: {
            Authorization: `Bearer ${adminToken}`,
          },
        });

        expect(res.status).toBe(200);
        const body = await res.json();
        expect(body.success).toBe(true);
        expect(["scheduled", "active", "completed"]).toContain(body.data.status);
      });

      it("includes timezone info", async () => {
        const res = await fetch(`${apiUrl}/events/maintenance/${testMaintenanceId}`, {
          headers: {
            Authorization: `Bearer ${adminToken}`,
          },
        });

        expect(res.status).toBe(200);
        const body = await res.json();
        expect(body.success).toBe(true);
        expect(body.data.timezone).toBeDefined();
      });

      it("returns 404 for non-existent maintenance", async () => {
        const res = await fetch(`${apiUrl}/events/maintenance/non-existent-id`, {
          headers: {
            Authorization: `Bearer ${adminToken}`,
          },
        });

        expect(res.status).toBe(404);
        const body = await res.json();
        expect(body.success).toBe(false);
      });
    });

    it("returns 400 for invalid event type", async () => {
      const res = await fetch(`${apiUrl}/events/invalid/some-id`, {
        headers: {
          Authorization: `Bearer ${adminToken}`,
        },
      });

      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.success).toBe(false);
    });
  });

  // ==========================================
  // Event Subscriptions
  // ==========================================
  describe("Event Subscriptions", () => {
    describe("POST /events/:type/:id/subscribe", () => {
      it("subscribes to incident updates", async () => {
        const res = await fetch(`${apiUrl}/events/incident/${testIncidentId}/subscribe`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${adminToken}`,
          },
          body: JSON.stringify({
            channels: { email: true },
          }),
        });

        expect(res.status).toBe(201);
        const body = await res.json();
        expect(body.success).toBe(true);
        expect(body.data.id).toBeDefined();
        expect(body.data.eventType).toBe("incident");
        expect(body.data.eventId).toBe(testIncidentId);
        expect(body.data.verified).toBe(true);
      });

      it("subscribes to maintenance updates", async () => {
        const res = await fetch(
          `${apiUrl}/events/maintenance/${testMaintenanceId}/subscribe`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${adminToken}`,
            },
            body: JSON.stringify({
              channels: { email: true },
            }),
          }
        );

        expect(res.status).toBe(201);
        const body = await res.json();
        expect(body.success).toBe(true);
        expect(body.data.eventType).toBe("maintenance");
      });

      it("updates existing subscription channels", async () => {
        // First subscription
        await fetch(`${apiUrl}/events/incident/${testIncidentId}/subscribe`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${adminToken}`,
          },
          body: JSON.stringify({
            channels: { email: true },
          }),
        });

        // Update subscription
        const res = await fetch(`${apiUrl}/events/incident/${testIncidentId}/subscribe`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${adminToken}`,
          },
          body: JSON.stringify({
            channels: { email: true, slack: true },
          }),
        });

        expect(res.status).toBe(200);
        const body = await res.json();
        expect(body.success).toBe(true);
      });

      it("returns 400 for invalid event type", async () => {
        const res = await fetch(`${apiUrl}/events/invalid/some-id/subscribe`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${adminToken}`,
          },
        });

        expect(res.status).toBe(400);
        const body = await res.json();
        expect(body.success).toBe(false);
      });

      it("returns 404 for non-existent event", async () => {
        const res = await fetch(`${apiUrl}/events/incident/non-existent-id/subscribe`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${adminToken}`,
          },
        });

        expect(res.status).toBe(404);
        const body = await res.json();
        expect(body.success).toBe(false);
      });
    });

    describe("DELETE /events/:type/:id/subscribe", () => {
      it("unsubscribes from event updates", async () => {
        // First subscribe
        await fetch(`${apiUrl}/events/maintenance/${testMaintenanceId}/subscribe`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${adminToken}`,
          },
        });

        // Then unsubscribe
        const res = await fetch(
          `${apiUrl}/events/maintenance/${testMaintenanceId}/subscribe`,
          {
            method: "DELETE",
            headers: {
              Authorization: `Bearer ${adminToken}`,
            },
          }
        );

        expect(res.status).toBe(200);
        const body = await res.json();
        expect(body.success).toBe(true);
        expect(body.data.id).toBeDefined();
      });

      it("returns 404 when not subscribed", async () => {
        // Create a new incident
        const incident = await insertIncident(orgId, {
          title: "Unsubscribe Test",
          severity: "minor",
          status: "investigating",
          userId,
        });

        const res = await fetch(`${apiUrl}/events/incident/${incident.id}/subscribe`, {
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

    describe("GET /events/subscriptions", () => {
      it("lists user's event subscriptions", async () => {
        const res = await fetch(`${apiUrl}/events/subscriptions`, {
          headers: {
            Authorization: `Bearer ${adminToken}`,
          },
        });

        expect(res.status).toBe(200);
        const body = await res.json();
        expect(body.success).toBe(true);
        expect(Array.isArray(body.data)).toBe(true);
      });

      it("returns subscriptions for authenticated user only", async () => {
        const res = await fetch(`${apiUrl}/events/subscriptions`, {
          headers: {
            Authorization: `Bearer ${adminToken}`,
          },
        });

        expect(res.status).toBe(200);
        const body = await res.json();
        expect(body.success).toBe(true);

        for (const subscription of body.data) {
          expect(subscription.userId).toBe(userId);
        }
      });
    });
  });

  // ==========================================
  // Event Export
  // ==========================================
  describe("GET /events/:type/:id/export", () => {
    it("exports incident as JSON", async () => {
      const res = await fetch(
        `${apiUrl}/events/incident/${testIncidentId}/export?format=json`,
        {
          headers: {
            Authorization: `Bearer ${adminToken}`,
          },
        }
      );

      expect(res.status).toBe(200);
      expect(res.headers.get("Content-Type")).toContain("application/json");
      expect(res.headers.get("Content-Disposition")).toContain("attachment");
    });

    it("exports incident as ICS", async () => {
      const res = await fetch(
        `${apiUrl}/events/incident/${testIncidentId}/export?format=ics`,
        {
          headers: {
            Authorization: `Bearer ${adminToken}`,
          },
        }
      );

      expect(res.status).toBe(200);
      expect(res.headers.get("Content-Type")).toContain("text/calendar");
      expect(res.headers.get("Content-Disposition")).toContain(".ics");

      const content = await res.text();
      expect(content).toContain("BEGIN:VCALENDAR");
      expect(content).toContain("END:VCALENDAR");
    });

    it("exports maintenance as JSON", async () => {
      const res = await fetch(
        `${apiUrl}/events/maintenance/${testMaintenanceId}/export?format=json`,
        {
          headers: {
            Authorization: `Bearer ${adminToken}`,
          },
        }
      );

      expect(res.status).toBe(200);
      expect(res.headers.get("Content-Type")).toContain("application/json");
    });

    it("exports maintenance as ICS", async () => {
      const res = await fetch(
        `${apiUrl}/events/maintenance/${testMaintenanceId}/export?format=ics`,
        {
          headers: {
            Authorization: `Bearer ${adminToken}`,
          },
        }
      );

      expect(res.status).toBe(200);
      expect(res.headers.get("Content-Type")).toContain("text/calendar");

      const content = await res.text();
      expect(content).toContain("BEGIN:VEVENT");
      expect(content).toContain("MAINTENANCE");
    });

    it("defaults to JSON format", async () => {
      const res = await fetch(`${apiUrl}/events/incident/${testIncidentId}/export`, {
        headers: {
          Authorization: `Bearer ${adminToken}`,
        },
      });

      expect(res.status).toBe(200);
      expect(res.headers.get("Content-Type")).toContain("application/json");
    });

    it("returns 404 for non-existent event", async () => {
      const res = await fetch(`${apiUrl}/events/incident/non-existent-id/export`, {
        headers: {
          Authorization: `Bearer ${adminToken}`,
        },
      });

      expect(res.status).toBe(404);
    });

    it("returns 400 for invalid event type", async () => {
      const res = await fetch(`${apiUrl}/events/invalid/some-id/export`, {
        headers: {
          Authorization: `Bearer ${adminToken}`,
        },
      });

      expect(res.status).toBe(400);
    });
  });

  // ==========================================
  // Authorization
  // ==========================================
  describe("Authorization", () => {
    it("requires authentication for listing events", async () => {
      const res = await fetch(`${apiUrl}/events`);
      expect(res.status).toBe(401);
    });

    it("requires authentication for getting event", async () => {
      const res = await fetch(`${apiUrl}/events/incident/${testIncidentId}`);
      expect(res.status).toBe(401);
    });

    it("requires authentication for subscribing", async () => {
      const res = await fetch(`${apiUrl}/events/incident/${testIncidentId}/subscribe`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
      });
      expect(res.status).toBe(401);
    });

    it("requires authentication for unsubscribing", async () => {
      const res = await fetch(`${apiUrl}/events/incident/${testIncidentId}/subscribe`, {
        method: "DELETE",
      });
      expect(res.status).toBe(401);
    });

    it("requires authentication for listing subscriptions", async () => {
      const res = await fetch(`${apiUrl}/events/subscriptions`);
      expect(res.status).toBe(401);
    });

    it("requires authentication for export", async () => {
      const res = await fetch(`${apiUrl}/events/incident/${testIncidentId}/export`);
      expect(res.status).toBe(401);
    });

    it("allows read-only access for listing events", async () => {
      const res = await fetch(`${apiUrl}/events`, {
        headers: {
          Authorization: `Bearer ${readOnlyToken}`,
        },
      });
      expect(res.status).toBe(200);
    });

    it("allows read-only access for getting event", async () => {
      const res = await fetch(`${apiUrl}/events/incident/${testIncidentId}`, {
        headers: {
          Authorization: `Bearer ${readOnlyToken}`,
        },
      });
      expect(res.status).toBe(200);
    });

    it("allows read-only access for export", async () => {
      const res = await fetch(`${apiUrl}/events/incident/${testIncidentId}/export`, {
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
    it("cannot get incident from another organization", async () => {
      const res = await fetch(`${apiUrl}/events/incident/${testIncidentId}`, {
        headers: {
          Authorization: `Bearer ${otherOrgToken}`,
        },
      });

      expect(res.status).toBe(404);
      const body = await res.json();
      expect(body.success).toBe(false);
    });

    it("cannot get maintenance from another organization", async () => {
      const res = await fetch(`${apiUrl}/events/maintenance/${testMaintenanceId}`, {
        headers: {
          Authorization: `Bearer ${otherOrgToken}`,
        },
      });

      expect(res.status).toBe(404);
      const body = await res.json();
      expect(body.success).toBe(false);
    });

    it("cannot subscribe to event from another organization", async () => {
      const res = await fetch(`${apiUrl}/events/incident/${testIncidentId}/subscribe`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${otherOrgToken}`,
        },
      });

      expect(res.status).toBe(404);
      const body = await res.json();
      expect(body.success).toBe(false);
    });

    it("cannot export event from another organization", async () => {
      const res = await fetch(`${apiUrl}/events/incident/${testIncidentId}/export`, {
        headers: {
          Authorization: `Bearer ${otherOrgToken}`,
        },
      });

      expect(res.status).toBe(404);
    });

    it("does not list events from another organization", async () => {
      const res = await fetch(`${apiUrl}/events`, {
        headers: {
          Authorization: `Bearer ${otherOrgToken}`,
        },
      });

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.success).toBe(true);

      const incidentIds = body.data.events
        .filter((e: any) => e.type === "incident")
        .map((e: any) => e.id);
      expect(incidentIds).not.toContain(testIncidentId);

      const maintenanceIds = body.data.events
        .filter((e: any) => e.type === "maintenance")
        .map((e: any) => e.id);
      expect(maintenanceIds).not.toContain(testMaintenanceId);
    });
  });

  // ==========================================
  // Audit Logging
  // ==========================================
  describe("Audit Logging", () => {
    it("creates audit entry when subscribing to event", async () => {
      const incident = await insertIncident(orgId, {
        title: "Audit Subscribe Test",
        severity: "minor",
        status: "investigating",
        userId,
      });

      await fetch(`${apiUrl}/events/incident/${incident.id}/subscribe`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${adminToken}`,
        },
      });

      const auditRes = await fetch(
        `${apiUrl}/audit-logs?action=event_subscription.create&limit=1`,
        {
          headers: {
            Authorization: `Bearer ${adminToken}`,
          },
        }
      );

      expect(auditRes.status).toBe(200);
      const auditBody = await auditRes.json();
      expect(auditBody.success).toBe(true);
      expect(auditBody.data.data.length).toBeGreaterThan(0);
      expect(auditBody.data.data[0].action).toBe("event_subscription.create");
    });

    it("creates audit entry when unsubscribing from event", async () => {
      const incident = await insertIncident(orgId, {
        title: "Audit Unsubscribe Test",
        severity: "minor",
        status: "investigating",
        userId,
      });

      // Subscribe first
      await fetch(`${apiUrl}/events/incident/${incident.id}/subscribe`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${adminToken}`,
        },
      });

      // Then unsubscribe
      await fetch(`${apiUrl}/events/incident/${incident.id}/subscribe`, {
        method: "DELETE",
        headers: {
          Authorization: `Bearer ${adminToken}`,
        },
      });

      const auditRes = await fetch(
        `${apiUrl}/audit-logs?action=event_subscription.delete&limit=1`,
        {
          headers: {
            Authorization: `Bearer ${adminToken}`,
          },
        }
      );

      expect(auditRes.status).toBe(200);
      const auditBody = await auditRes.json();
      expect(auditBody.success).toBe(true);
      expect(auditBody.data.data.length).toBeGreaterThan(0);
      expect(auditBody.data.data[0].action).toBe("event_subscription.delete");
    });
  });

  // ==========================================
  // Event Data Structure
  // ==========================================
  describe("Event Data Structure", () => {
    it("incident events have correct structure", async () => {
      const res = await fetch(`${apiUrl}/events/incident/${testIncidentId}`, {
        headers: {
          Authorization: `Bearer ${adminToken}`,
        },
      });

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.success).toBe(true);

      const event = body.data;
      expect(event.id).toBeDefined();
      expect(event.type).toBe("incident");
      expect(event.title).toBeDefined();
      expect(event.description).toBeDefined();
      expect(event.status).toBeDefined();
      expect(event.severity).toBeDefined();
      expect(event.affectedMonitors).toBeDefined();
      expect(event.startedAt).toBeDefined();
      expect(event.updates).toBeDefined();
      expect(event.createdAt).toBeDefined();
      expect(event.updatedAt).toBeDefined();
    });

    it("maintenance events have correct structure", async () => {
      const res = await fetch(`${apiUrl}/events/maintenance/${testMaintenanceId}`, {
        headers: {
          Authorization: `Bearer ${adminToken}`,
        },
      });

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.success).toBe(true);

      const event = body.data;
      expect(event.id).toBeDefined();
      expect(event.type).toBe("maintenance");
      expect(event.title).toBeDefined();
      expect(event.status).toBeDefined();
      expect(event.severity).toBe("maintenance");
      expect(event.affectedMonitors).toBeDefined();
      expect(event.startedAt).toBeDefined();
      expect(event.endedAt).toBeDefined();
      expect(event.timezone).toBeDefined();
      expect(event.updates).toBeDefined();
      expect(Array.isArray(event.updates)).toBe(true);
      expect(event.createdAt).toBeDefined();
      expect(event.updatedAt).toBeDefined();
    });
  });
});
