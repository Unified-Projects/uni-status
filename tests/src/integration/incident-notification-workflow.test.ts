/**
 * Incident-Notification Integration Workflow Tests
 *
 * End-to-end tests that verify the complete workflow from:
 * 1. Incident creation
 * 2. Status page updates
 * 3. Subscriber notifications
 * 4. Incident resolution
 */

import { describe, it, expect, beforeAll } from "vitest";
import { bootstrapTestContext, TestContext } from "../helpers/context";
import {
  insertMonitor,
  insertStatusPage,
  linkMonitorToStatusPage,
  insertIncident,
  insertIncidentUpdate,
  insertSubscriber,
} from "../helpers/data";

const API_BASE_URL = process.env.API_BASE_URL ?? "http://api:3001";

describe("Incident-Notification Integration Workflow", () => {
  let ctx: TestContext;
  let monitorId: string;
  let statusPageId: string;
  let statusPageSlug: string;

  beforeAll(async () => {
    ctx = await bootstrapTestContext();

    // Create monitor
    const monitor = await insertMonitor(ctx.organizationId, {
      name: "Incident Workflow Monitor",
      url: "https://incident-workflow.example.com",
    });
    monitorId = monitor.id;

    // Create status page
    statusPageSlug = `incident-workflow-${Date.now()}`;
    statusPageId = await insertStatusPage(ctx.organizationId, {
      name: "Incident Workflow Status Page",
      slug: statusPageSlug,
      published: true,
    });

    // Link monitor to status page
    await linkMonitorToStatusPage(statusPageId, monitorId, {
      displayName: "Main Service",
      order: 0,
    });
  });

  // ==========================================
  // INCIDENT CREATION WORKFLOW
  // ==========================================
  describe("Incident Creation", () => {
    describe("POST /incidents", () => {
      it("creates an incident with affected monitors", async () => {
        const res = await fetch(`${API_BASE_URL}/api/v1/incidents`, {
          method: "POST",
          headers: ctx.headers,
          body: JSON.stringify({
            title: "Service Degradation",
            message: "We are investigating reports of slow response times",
            severity: "minor",
            status: "investigating",
            affectedMonitors: [monitorId],
          }),
        });

        expect(res.status).toBe(201);
        const body = await res.json();
        expect(body.success).toBe(true);
        expect(body.data.title).toBe("Service Degradation");
        expect(body.data.severity).toBe("minor");
        expect(body.data.status).toBe("investigating");
      });

      it("creates a major incident", async () => {
        const res = await fetch(`${API_BASE_URL}/api/v1/incidents`, {
          method: "POST",
          headers: ctx.headers,
          body: JSON.stringify({
            title: "Major Outage",
            message: "Service is currently unavailable",
            severity: "major",
            status: "investigating",
            affectedMonitors: [monitorId],
          }),
        });

        expect(res.status).toBe(201);
        const body = await res.json();
        expect(body.data.severity).toBe("major");
      });

      it("creates a critical incident", async () => {
        const res = await fetch(`${API_BASE_URL}/api/v1/incidents`, {
          method: "POST",
          headers: ctx.headers,
          body: JSON.stringify({
            title: "Critical System Failure",
            message: "All services are down",
            severity: "critical",
            status: "investigating",
            affectedMonitors: [monitorId],
          }),
        });

        expect(res.status).toBe(201);
        const body = await res.json();
        expect(body.data.severity).toBe("critical");
      });

      it("creates incident without affected monitors", async () => {
        const res = await fetch(`${API_BASE_URL}/api/v1/incidents`, {
          method: "POST",
          headers: ctx.headers,
          body: JSON.stringify({
            title: "General Issue",
            message: "Investigating a general issue",
            severity: "minor",
            status: "investigating",
          }),
        });

        expect(res.status).toBe(201);
      });
    });
  });

  // ==========================================
  // INCIDENT UPDATE WORKFLOW
  // ==========================================
  describe("Incident Update Workflow", () => {
    let incidentId: string;

    beforeAll(async () => {
      const incident = await insertIncident(ctx.organizationId, {
        title: "Update Workflow Incident",
        description: "Testing incident updates",
        severity: "major",
        status: "investigating",
        affectedMonitorIds: [monitorId],
      });
      incidentId = incident.id;
    });

    it("transitions from investigating to identified", async () => {
      const res = await fetch(
        `${API_BASE_URL}/api/v1/incidents/${incidentId}/updates`,
        {
          method: "POST",
          headers: ctx.headers,
          body: JSON.stringify({
            status: "identified",
            message: "We have identified the root cause",
          }),
        }
      );

      expect(res.status).toBe(201);
      const body = await res.json();
      expect(body.data.status).toBe("identified");
    });

    it("transitions from identified to monitoring", async () => {
      const res = await fetch(
        `${API_BASE_URL}/api/v1/incidents/${incidentId}/updates`,
        {
          method: "POST",
          headers: ctx.headers,
          body: JSON.stringify({
            status: "monitoring",
            message: "A fix has been applied, monitoring for stability",
          }),
        }
      );

      expect(res.status).toBe(201);
      const body = await res.json();
      expect(body.data.status).toBe("monitoring");
    });

    it("transitions from monitoring to resolved", async () => {
      const res = await fetch(
        `${API_BASE_URL}/api/v1/incidents/${incidentId}/updates`,
        {
          method: "POST",
          headers: ctx.headers,
          body: JSON.stringify({
            status: "resolved",
            message: "The issue has been resolved",
          }),
        }
      );

      expect(res.status).toBe(201);
      const body = await res.json();
      expect(body.data.status).toBe("resolved");
    });

    it("gets incident with all updates", async () => {
      const res = await fetch(
        `${API_BASE_URL}/api/v1/incidents/${incidentId}`,
        { headers: ctx.headers }
      );

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.data.updates).toBeDefined();
      expect(body.data.updates.length).toBeGreaterThanOrEqual(3);
    });
  });

  // ==========================================
  // SUBSCRIBER NOTIFICATION WORKFLOW
  // ==========================================
  describe("Subscriber Notification", () => {
    let subscriberId: string;
    let verificationToken: string;

    describe("Subscription Flow", () => {
      it("creates a subscriber via public endpoint", async () => {
        const res = await fetch(
          `${API_BASE_URL}/api/public/status-pages/${statusPageSlug}/subscribe`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              email: `subscriber-${Date.now()}@example.com`,
            }),
          }
        );

        // Subscribe endpoint returns 200 with message about verification email
        expect(res.status).toBe(200);
        const body = await res.json();
        expect(body.success).toBe(true);
      });

      it("subscriber exists in database", async () => {
        // Insert subscriber directly for testing
        const testEmail = `direct-subscriber-${Date.now()}@example.com`;
        subscriberId = await insertSubscriber(statusPageId, {
          email: testEmail,
          verified: false,
        });

        expect(subscriberId).toBeDefined();
      });
    });

    describe("Notification Triggering", () => {
      let notifyIncidentId: string;

      beforeAll(async () => {
        // Create verified subscriber
        await insertSubscriber(statusPageId, {
          email: `verified-${Date.now()}@example.com`,
          verified: true,
        });

        // Create incident that should trigger notification
        const incident = await insertIncident(ctx.organizationId, {
          title: "Notification Test Incident",
          description: "Testing notifications",
          severity: "major",
          status: "investigating",
          affectedMonitorIds: [monitorId],
        });
        notifyIncidentId = incident.id;
      });

      it("incident exists and affects monitored services", async () => {
        const res = await fetch(
          `${API_BASE_URL}/api/v1/incidents/${notifyIncidentId}`,
          { headers: ctx.headers }
        );

        expect(res.status).toBe(200);
        const body = await res.json();
        expect(body.data.affectedMonitors).toContain(monitorId);
      });
    });
  });

  // ==========================================
  // STATUS PAGE DISPLAY WORKFLOW
  // ==========================================
  describe("Status Page Display", () => {
    let activeIncidentId: string;

    beforeAll(async () => {
      const incident = await insertIncident(ctx.organizationId, {
        title: "Active Display Incident",
        description: "Testing status page display",
        severity: "minor",
        status: "investigating",
        affectedMonitorIds: [monitorId],
      });
      activeIncidentId = incident.id;
    });

    it("public status page shows active incidents", async () => {
      const res = await fetch(
        `${API_BASE_URL}/api/public/status-pages/${statusPageSlug}`,
        { headers: { "Content-Type": "application/json" } }
      );

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.success).toBe(true);
      expect(body.data.monitors).toBeDefined();
    });

    it("incidents endpoint returns active incidents", async () => {
      const res = await fetch(`${API_BASE_URL}/api/v1/incidents`, {
        headers: ctx.headers,
      });

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.success).toBe(true);
      expect(Array.isArray(body.data)).toBe(true);
    });
  });

  // ==========================================
  // SCHEDULED MAINTENANCE WORKFLOW
  // ==========================================
  describe("Scheduled Maintenance", () => {
    describe("POST /maintenance-windows", () => {
      it("creates a scheduled maintenance window", async () => {
        const startsAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // Tomorrow
        const endsAt = new Date(Date.now() + 26 * 60 * 60 * 1000); // Tomorrow + 2 hours

        const res = await fetch(`${API_BASE_URL}/api/v1/maintenance-windows`, {
          method: "POST",
          headers: ctx.headers,
          body: JSON.stringify({
            name: "Scheduled Database Maintenance",
            description: "Routine database maintenance",
            startsAt: startsAt.toISOString(),
            endsAt: endsAt.toISOString(),
            affectedMonitors: [monitorId],
          }),
        });

        expect(res.status).toBe(201);
        const body = await res.json();
        expect(body.success).toBe(true);
        expect(body.data.name).toBe("Scheduled Database Maintenance");
      });

      it("creates maintenance starting now", async () => {
        const startsAt = new Date();
        const endsAt = new Date(Date.now() + 2 * 60 * 60 * 1000);

        const res = await fetch(`${API_BASE_URL}/api/v1/maintenance-windows`, {
          method: "POST",
          headers: ctx.headers,
          body: JSON.stringify({
            name: "Immediate Maintenance",
            startsAt: startsAt.toISOString(),
            endsAt: endsAt.toISOString(),
            affectedMonitors: [monitorId],
          }),
        });

        expect(res.status).toBe(201);
      });
    });

    describe("GET /maintenance-windows", () => {
      it("lists maintenance windows", async () => {
        const res = await fetch(`${API_BASE_URL}/api/v1/maintenance-windows`, {
          headers: ctx.headers,
        });

        expect(res.status).toBe(200);
        const body = await res.json();
        expect(body.success).toBe(true);
        expect(Array.isArray(body.data)).toBe(true);
      });
    });
  });

  // ==========================================
  // INCIDENT LISTING AND FILTERING
  // ==========================================
  describe("Incident Listing and Filtering", () => {
    beforeAll(async () => {
      // Create incidents with different statuses
      await insertIncident(ctx.organizationId, {
        title: "Resolved Test Incident",
        status: "resolved",
        resolvedAt: new Date(),
      });

      await insertIncident(ctx.organizationId, {
        title: "Monitoring Test Incident",
        status: "monitoring",
      });
    });

    it("lists all incidents", async () => {
      const res = await fetch(`${API_BASE_URL}/api/v1/incidents`, {
        headers: ctx.headers,
      });

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.success).toBe(true);
      expect(Array.isArray(body.data)).toBe(true);
      expect(body.data.length).toBeGreaterThan(0);
    });

    it("filters incidents by status", async () => {
      const res = await fetch(
        `${API_BASE_URL}/api/v1/incidents?status=investigating`,
        { headers: ctx.headers }
      );

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.success).toBe(true);
      body.data.forEach((incident: { status: string }) => {
        expect(incident.status).toBe("investigating");
      });
    });

    it("paginates incidents", async () => {
      const res = await fetch(
        `${API_BASE_URL}/api/v1/incidents?limit=5&offset=0`,
        { headers: ctx.headers }
      );

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.data.length).toBeLessThanOrEqual(5);
    });
  });

  // ==========================================
  // INCIDENT EDITING
  // ==========================================
  describe("Incident Editing", () => {
    let editIncidentId: string;

    beforeAll(async () => {
      const incident = await insertIncident(ctx.organizationId, {
        title: "Editable Incident",
        description: "Original description",
        severity: "minor",
        status: "investigating",
      });
      editIncidentId = incident.id;
    });

    it("updates incident title", async () => {
      const res = await fetch(
        `${API_BASE_URL}/api/v1/incidents/${editIncidentId}`,
        {
          method: "PATCH",
          headers: ctx.headers,
          body: JSON.stringify({ title: "Updated Incident Title" }),
        }
      );

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.data.title).toBe("Updated Incident Title");
    });

    it("updates incident severity", async () => {
      const res = await fetch(
        `${API_BASE_URL}/api/v1/incidents/${editIncidentId}`,
        {
          method: "PATCH",
          headers: ctx.headers,
          body: JSON.stringify({ severity: "major" }),
        }
      );

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.data.severity).toBe("major");
    });

    it("adds affected monitors", async () => {
      const res = await fetch(
        `${API_BASE_URL}/api/v1/incidents/${editIncidentId}`,
        {
          method: "PATCH",
          headers: ctx.headers,
          body: JSON.stringify({ affectedMonitors: [monitorId] }),
        }
      );

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.data.affectedMonitors).toContain(monitorId);
    });
  });

  // ==========================================
  // INCIDENT RESOLUTION
  // ==========================================
  describe("Incident Resolution", () => {
    it("resolves an incident via status update", async () => {
      // Create incident to resolve
      const incident = await insertIncident(ctx.organizationId, {
        title: "Resolution Test Incident",
        status: "investigating",
      });

      // Update incident status to resolved
      const res = await fetch(
        `${API_BASE_URL}/api/v1/incidents/${incident.id}/updates`,
        {
          method: "POST",
          headers: ctx.headers,
          body: JSON.stringify({
            status: "resolved",
            message: "Issue has been resolved",
          }),
        }
      );

      expect(res.status).toBe(201);
      const body = await res.json();
      expect(body.success).toBe(true);

      // Verify incident is now resolved
      const getRes = await fetch(
        `${API_BASE_URL}/api/v1/incidents/${incident.id}`,
        { headers: ctx.headers }
      );
      expect(getRes.status).toBe(200);
      const getBody = await getRes.json();
      expect(getBody.data.status).toBe("resolved");
    });
  });

  // ==========================================
  // CROSS-ORG ISOLATION
  // ==========================================
  describe("Cross-Organization Isolation", () => {
    let otherCtx: TestContext;
    let otherIncidentId: string;

    beforeAll(async () => {
      otherCtx = await bootstrapTestContext();

      const incident = await insertIncident(otherCtx.organizationId, {
        title: "Other Org Incident",
        status: "investigating",
      });
      otherIncidentId = incident.id;
    });

    it("cannot access other org incidents", async () => {
      const res = await fetch(
        `${API_BASE_URL}/api/v1/incidents/${otherIncidentId}`,
        { headers: ctx.headers }
      );

      expect(res.status).toBe(404);
    });

    it("cannot update other org incidents", async () => {
      const res = await fetch(
        `${API_BASE_URL}/api/v1/incidents/${otherIncidentId}`,
        {
          method: "PATCH",
          headers: ctx.headers,
          body: JSON.stringify({ title: "Hacked!" }),
        }
      );

      expect(res.status).toBe(404);
    });

    it("cannot delete other org incidents", async () => {
      const res = await fetch(
        `${API_BASE_URL}/api/v1/incidents/${otherIncidentId}`,
        {
          method: "DELETE",
          headers: ctx.headers,
        }
      );

      expect(res.status).toBe(404);
    });

    it("cannot add updates to other org incidents", async () => {
      const res = await fetch(
        `${API_BASE_URL}/api/v1/incidents/${otherIncidentId}/updates`,
        {
          method: "POST",
          headers: ctx.headers,
          body: JSON.stringify({
            status: "resolved",
            message: "Hacked!",
          }),
        }
      );

      expect(res.status).toBe(404);
    });
  });
});
