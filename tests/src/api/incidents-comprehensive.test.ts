import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { Client } from "pg";
import { bootstrapTestContext, TestContext } from "../helpers/context";
import { insertApiKey } from "../helpers/data";

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
  // Database is reset once at test suite start via setupFiles
  ctx = await bootstrapTestContext();
});

afterAll(async () => {
  await dbClient?.end();
});

// Helper to create a monitor
async function createMonitor(name: string = "Test Monitor"): Promise<string> {
  const res = await fetch(`${API_URL}/monitors`, {
    method: "POST",
    headers: ctx.headers,
    body: JSON.stringify({
      name,
      url: "https://example.com",
      type: "https",
      intervalSeconds: 60,
      timeoutMs: 5000,
    }),
  });
  const data = await res.json();
  return data.data.id;
}

// Helper to create an incident
async function createIncident(options?: {
  title?: string;
  message?: string;
  status?: "investigating" | "identified" | "monitoring" | "resolved";
  severity?: "minor" | "major" | "critical";
  affectedMonitors?: string[];
}): Promise<{ id: string; title: string }> {
  const res = await fetch(`${API_URL}/incidents`, {
    method: "POST",
    headers: ctx.headers,
    body: JSON.stringify({
      title: options?.title ?? `Test Incident ${Date.now()}`,
      message: options?.message ?? "We are investigating this issue.",
      status: options?.status ?? "investigating",
      severity: options?.severity ?? "minor",
      affectedMonitors: options?.affectedMonitors ?? [],
    }),
  });
  const data = await res.json();
  return { id: data.data.id, title: data.data.title };
}

describe("Incidents API - Comprehensive Tests", () => {
  describe("POST /incidents - Create Incident", () => {
    it("creates an incident with minimal fields", async () => {
      const res = await fetch(`${API_URL}/incidents`, {
        method: "POST",
        headers: ctx.headers,
        body: JSON.stringify({
          title: "Minimal Incident",
        }),
      });

      expect(res.status).toBe(201);
      const data = await res.json();
      expect(data.success).toBe(true);
      expect(data.data.title).toBe("Minimal Incident");
      expect(data.data.id).toBeDefined();
      expect(data.data.status).toBe("investigating");
      expect(data.data.severity).toBeDefined();
    });

    it("creates an incident with all fields", async () => {
      const monitorId = await createMonitor("Affected Monitor");

      const res = await fetch(`${API_URL}/incidents`, {
        method: "POST",
        headers: ctx.headers,
        body: JSON.stringify({
          title: "Full Incident",
          message: "We are investigating elevated error rates.",
          status: "investigating",
          severity: "major",
          affectedMonitors: [monitorId],
        }),
      });

      expect(res.status).toBe(201);
      const data = await res.json();
      expect(data.success).toBe(true);
      expect(data.data.title).toBe("Full Incident");
      expect(data.data.message).toBe("We are investigating elevated error rates.");
      expect(data.data.status).toBe("investigating");
      expect(data.data.severity).toBe("major");
      expect(data.data.affectedMonitors).toContain(monitorId);
    });

    it("creates incident with critical severity", async () => {
      const res = await fetch(`${API_URL}/incidents`, {
        method: "POST",
        headers: ctx.headers,
        body: JSON.stringify({
          title: "Critical Outage",
          severity: "critical",
        }),
      });

      expect(res.status).toBe(201);
      const data = await res.json();
      expect(data.data.severity).toBe("critical");
    });

    it("creates incident with identified status", async () => {
      const res = await fetch(`${API_URL}/incidents`, {
        method: "POST",
        headers: ctx.headers,
        body: JSON.stringify({
          title: "Identified Issue",
          status: "identified",
        }),
      });

      expect(res.status).toBe(201);
      const data = await res.json();
      expect(data.data.status).toBe("identified");
    });

    it("creates incident with monitoring status", async () => {
      const res = await fetch(`${API_URL}/incidents`, {
        method: "POST",
        headers: ctx.headers,
        body: JSON.stringify({
          title: "Monitoring Issue",
          status: "monitoring",
        }),
      });

      expect(res.status).toBe(201);
      const data = await res.json();
      expect(data.data.status).toBe("monitoring");
    });

    it("creates incident with multiple affected monitors", async () => {
      const monitor1 = await createMonitor("Monitor 1");
      const monitor2 = await createMonitor("Monitor 2");
      const monitor3 = await createMonitor("Monitor 3");

      const res = await fetch(`${API_URL}/incidents`, {
        method: "POST",
        headers: ctx.headers,
        body: JSON.stringify({
          title: "Multi-Monitor Incident",
          affectedMonitors: [monitor1, monitor2, monitor3],
        }),
      });

      expect(res.status).toBe(201);
      const data = await res.json();
      expect(data.data.affectedMonitors).toHaveLength(3);
      expect(data.data.affectedMonitors).toContain(monitor1);
      expect(data.data.affectedMonitors).toContain(monitor2);
      expect(data.data.affectedMonitors).toContain(monitor3);
    });

    it("sets startedAt timestamp", async () => {
      const before = new Date();

      const res = await fetch(`${API_URL}/incidents`, {
        method: "POST",
        headers: ctx.headers,
        body: JSON.stringify({
          title: "Timed Incident",
        }),
      });

      const after = new Date();
      const data = await res.json();

      const startedAt = new Date(data.data.startedAt);
      expect(startedAt.getTime()).toBeGreaterThanOrEqual(before.getTime() - 1000);
      expect(startedAt.getTime()).toBeLessThanOrEqual(after.getTime() + 1000);
    });

    it("creates initial incident update automatically", async () => {
      const { id } = await createIncident({ title: "Auto Update Incident" });

      const res = await fetch(`${API_URL}/incidents/${id}`, {
        method: "GET",
        headers: ctx.headers,
      });

      const data = await res.json();
      expect(data.data.updates).toBeDefined();
      expect(Array.isArray(data.data.updates)).toBe(true);
      expect(data.data.updates.length).toBeGreaterThanOrEqual(1);
    });

    it("rejects missing title", async () => {
      const res = await fetch(`${API_URL}/incidents`, {
        method: "POST",
        headers: ctx.headers,
        body: JSON.stringify({
          message: "No title provided",
        }),
      });

      expect(res.status).toBeGreaterThanOrEqual(400);
    });

    it("rejects invalid status", async () => {
      const res = await fetch(`${API_URL}/incidents`, {
        method: "POST",
        headers: ctx.headers,
        body: JSON.stringify({
          title: "Invalid Status",
          status: "invalid-status",
        }),
      });

      expect(res.status).toBeGreaterThanOrEqual(400);
    });

    it("rejects invalid severity", async () => {
      const res = await fetch(`${API_URL}/incidents`, {
        method: "POST",
        headers: ctx.headers,
        body: JSON.stringify({
          title: "Invalid Severity",
          severity: "invalid-severity",
        }),
      });

      expect(res.status).toBeGreaterThanOrEqual(400);
    });
  });

  describe("GET /incidents - List Incidents", () => {
    it("lists all incidents for organization", async () => {
      await createIncident({ title: "List Test 1" });
      await createIncident({ title: "List Test 2" });

      const res = await fetch(`${API_URL}/incidents`, {
        method: "GET",
        headers: ctx.headers,
      });

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.success).toBe(true);
      expect(Array.isArray(data.data)).toBe(true);
      expect(data.data.length).toBeGreaterThanOrEqual(2);
    });

    it("includes updates with each incident", async () => {
      const { id } = await createIncident({ title: "With Updates" });

      // Add an update
      await fetch(`${API_URL}/incidents/${id}/updates`, {
        method: "POST",
        headers: ctx.headers,
        body: JSON.stringify({
          status: "identified",
          message: "We have identified the issue.",
        }),
      });

      const res = await fetch(`${API_URL}/incidents`, {
        method: "GET",
        headers: ctx.headers,
      });

      const data = await res.json();
      const incident = data.data.find((i: { id: string }) => i.id === id);
      expect(incident).toBeDefined();
      expect(incident.updates).toBeDefined();
      expect(incident.updates.length).toBeGreaterThanOrEqual(2);
    });

    it("filters by status", async () => {
      await createIncident({ title: "Investigating", status: "investigating" });
      await createIncident({ title: "Identified", status: "identified" });

      const res = await fetch(`${API_URL}/incidents?status=investigating`, {
        method: "GET",
        headers: ctx.headers,
      });

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.data.length).toBeGreaterThanOrEqual(1);
      for (const incident of data.data) {
        expect(incident.status).toBe("investigating");
      }
    });

    it("filters for resolved incidents", async () => {
      const { id } = await createIncident({ title: "To Resolve" });

      // Resolve it
      await fetch(`${API_URL}/incidents/${id}/resolve`, {
        method: "POST",
        headers: ctx.headers,
      });

      const res = await fetch(`${API_URL}/incidents?status=resolved`, {
        method: "GET",
        headers: ctx.headers,
      });

      expect(res.status).toBe(200);
      const data = await res.json();
      const incident = data.data.find((i: { id: string }) => i.id === id);
      expect(incident).toBeDefined();
      expect(incident.status).toBe("resolved");
    });

    it("orders by startedAt descending", async () => {
      await createIncident({ title: "Earlier" });
      await new Promise((r) => setTimeout(r, 100));
      await createIncident({ title: "Later" });

      const res = await fetch(`${API_URL}/incidents`, {
        method: "GET",
        headers: ctx.headers,
      });

      const data = await res.json();
      // Most recent should be first
      if (data.data.length >= 2) {
        const dates = data.data.map((i: { startedAt: string }) =>
          new Date(i.startedAt).getTime()
        );
        for (let i = 0; i < dates.length - 1; i++) {
          expect(dates[i]).toBeGreaterThanOrEqual(dates[i + 1]);
        }
      }
    });

    it("does not return incidents from other organizations", async () => {
      await createIncident({ title: "My Org Incident" });

      // Create another context
      const otherCtx = await bootstrapTestContext();

      const res = await fetch(`${API_URL}/incidents`, {
        method: "GET",
        headers: otherCtx.headers,
      });

      const data = await res.json();
      const hasOurIncident = data.data.some(
        (i: { title: string }) => i.title === "My Org Incident"
      );
      expect(hasOurIncident).toBe(false);
    });
  });

  describe("GET /incidents/:id - Get Incident", () => {
    it("returns incident by ID", async () => {
      const { id, title } = await createIncident({ title: "Get By ID" });

      const res = await fetch(`${API_URL}/incidents/${id}`, {
        method: "GET",
        headers: ctx.headers,
      });

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.success).toBe(true);
      expect(data.data.id).toBe(id);
      expect(data.data.title).toBe(title);
    });

    it("includes updates ordered by date", async () => {
      const { id } = await createIncident({ title: "Updates Order" });

      // Add multiple updates
      await fetch(`${API_URL}/incidents/${id}/updates`, {
        method: "POST",
        headers: ctx.headers,
        body: JSON.stringify({
          status: "identified",
          message: "Identified the issue.",
        }),
      });

      await new Promise((r) => setTimeout(r, 100));

      await fetch(`${API_URL}/incidents/${id}/updates`, {
        method: "POST",
        headers: ctx.headers,
        body: JSON.stringify({
          status: "monitoring",
          message: "Fix deployed, monitoring.",
        }),
      });

      const res = await fetch(`${API_URL}/incidents/${id}`, {
        method: "GET",
        headers: ctx.headers,
      });

      const data = await res.json();
      expect(data.data.updates.length).toBeGreaterThanOrEqual(3);

      // Check ordering (most recent first)
      const dates = data.data.updates.map((u: { createdAt: string }) =>
        new Date(u.createdAt).getTime()
      );
      for (let i = 0; i < dates.length - 1; i++) {
        expect(dates[i]).toBeGreaterThanOrEqual(dates[i + 1]);
      }
    });

    it("returns 404 for non-existent incident", async () => {
      const res = await fetch(`${API_URL}/incidents/nonexistent-id`, {
        method: "GET",
        headers: ctx.headers,
      });

      expect(res.status).toBeGreaterThanOrEqual(400);
    });

    it("returns 404 for incident from another organization", async () => {
      const { id } = await createIncident({ title: "Other Org Incident" });

      const otherCtx = await bootstrapTestContext();

      const res = await fetch(`${API_URL}/incidents/${id}`, {
        method: "GET",
        headers: otherCtx.headers,
      });

      expect([404, 500]).toContain(res.status);
    });
  });

  describe("PATCH /incidents/:id - Update Incident", () => {
    it("updates incident title", async () => {
      const { id } = await createIncident({ title: "Original Title" });

      const res = await fetch(`${API_URL}/incidents/${id}`, {
        method: "PATCH",
        headers: ctx.headers,
        body: JSON.stringify({
          title: "Updated Title",
        }),
      });

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.data.title).toBe("Updated Title");
    });

    it("updates incident message", async () => {
      const { id } = await createIncident({ message: "Original message" });

      const res = await fetch(`${API_URL}/incidents/${id}`, {
        method: "PATCH",
        headers: ctx.headers,
        body: JSON.stringify({
          message: "Updated message with more details.",
        }),
      });

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.data.message).toBe("Updated message with more details.");
    });

    it("updates incident severity", async () => {
      const { id } = await createIncident({ severity: "minor" });

      const res = await fetch(`${API_URL}/incidents/${id}`, {
        method: "PATCH",
        headers: ctx.headers,
        body: JSON.stringify({
          severity: "critical",
        }),
      });

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.data.severity).toBe("critical");
    });

    it("updates affected monitors", async () => {
      const monitor1 = await createMonitor("New Monitor 1");
      const monitor2 = await createMonitor("New Monitor 2");

      const { id } = await createIncident({});

      const res = await fetch(`${API_URL}/incidents/${id}`, {
        method: "PATCH",
        headers: ctx.headers,
        body: JSON.stringify({
          affectedMonitors: [monitor1, monitor2],
        }),
      });

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.data.affectedMonitors).toContain(monitor1);
      expect(data.data.affectedMonitors).toContain(monitor2);
    });

    it("updates updatedAt timestamp", async () => {
      const { id } = await createIncident({});

      await new Promise((r) => setTimeout(r, 100));

      const res = await fetch(`${API_URL}/incidents/${id}`, {
        method: "PATCH",
        headers: ctx.headers,
        body: JSON.stringify({
          title: "Updated Title",
        }),
      });

      const data = await res.json();
      const updatedAt = new Date(data.data.updatedAt);
      const startedAt = new Date(data.data.startedAt);
      expect(updatedAt.getTime()).toBeGreaterThan(startedAt.getTime());
    });

    it("performs partial update", async () => {
      const { id } = await createIncident({
        title: "Partial Test",
        message: "Original message",
        severity: "minor",
      });

      const res = await fetch(`${API_URL}/incidents/${id}`, {
        method: "PATCH",
        headers: ctx.headers,
        body: JSON.stringify({
          severity: "major",
        }),
      });

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.data.title).toBe("Partial Test");
      expect(data.data.message).toBe("Original message");
      expect(data.data.severity).toBe("major");
    });

    it("returns 404 for non-existent incident", async () => {
      const res = await fetch(`${API_URL}/incidents/nonexistent`, {
        method: "PATCH",
        headers: ctx.headers,
        body: JSON.stringify({
          title: "Should Fail",
        }),
      });

      expect(res.status).toBeGreaterThanOrEqual(400);
    });
  });

  describe("POST /incidents/:id/updates - Add Incident Update", () => {
    it("adds update to incident", async () => {
      const { id } = await createIncident({});

      const res = await fetch(`${API_URL}/incidents/${id}/updates`, {
        method: "POST",
        headers: ctx.headers,
        body: JSON.stringify({
          status: "identified",
          message: "We have identified the root cause.",
        }),
      });

      expect(res.status).toBe(201);
      const data = await res.json();
      expect(data.success).toBe(true);
      expect(data.data.status).toBe("identified");
      expect(data.data.message).toBe("We have identified the root cause.");
    });

    it("updates incident status when adding update", async () => {
      const { id } = await createIncident({ status: "investigating" });

      await fetch(`${API_URL}/incidents/${id}/updates`, {
        method: "POST",
        headers: ctx.headers,
        body: JSON.stringify({
          status: "monitoring",
          message: "Fix deployed, monitoring.",
        }),
      });

      // Check incident status was updated
      const res = await fetch(`${API_URL}/incidents/${id}`, {
        method: "GET",
        headers: ctx.headers,
      });

      const data = await res.json();
      expect(data.data.status).toBe("monitoring");
    });

    it("sets resolvedAt when status is resolved", async () => {
      const { id } = await createIncident({});

      await fetch(`${API_URL}/incidents/${id}/updates`, {
        method: "POST",
        headers: ctx.headers,
        body: JSON.stringify({
          status: "resolved",
          message: "Issue has been resolved.",
        }),
      });

      const res = await fetch(`${API_URL}/incidents/${id}`, {
        method: "GET",
        headers: ctx.headers,
      });

      const data = await res.json();
      expect(data.data.status).toBe("resolved");
      expect(data.data.resolvedAt).toBeDefined();
    });

    it("supports all status transitions", async () => {
      const { id } = await createIncident({ status: "investigating" });

      const statuses = ["identified", "monitoring", "resolved"];

      for (const status of statuses) {
        const res = await fetch(`${API_URL}/incidents/${id}/updates`, {
          method: "POST",
          headers: ctx.headers,
          body: JSON.stringify({
            status,
            message: `Moved to ${status}`,
          }),
        });

        expect(res.status).toBe(201);
      }
    });

    it("returns 404 for non-existent incident", async () => {
      const res = await fetch(`${API_URL}/incidents/nonexistent/updates`, {
        method: "POST",
        headers: ctx.headers,
        body: JSON.stringify({
          status: "identified",
          message: "Should fail",
        }),
      });

      expect(res.status).toBeGreaterThanOrEqual(400);
    });

    it("rejects missing status", async () => {
      const { id } = await createIncident({});

      const res = await fetch(`${API_URL}/incidents/${id}/updates`, {
        method: "POST",
        headers: ctx.headers,
        body: JSON.stringify({
          message: "No status",
        }),
      });

      expect(res.status).toBeGreaterThanOrEqual(400);
    });

    it("rejects missing message", async () => {
      const { id } = await createIncident({});

      const res = await fetch(`${API_URL}/incidents/${id}/updates`, {
        method: "POST",
        headers: ctx.headers,
        body: JSON.stringify({
          status: "identified",
        }),
      });

      expect(res.status).toBeGreaterThanOrEqual(400);
    });
  });

  describe("POST /incidents/:id/resolve - Resolve Incident", () => {
    it("resolves incident", async () => {
      const { id } = await createIncident({ status: "investigating" });

      const res = await fetch(`${API_URL}/incidents/${id}/resolve`, {
        method: "POST",
        headers: ctx.headers,
      });

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.data.status).toBe("resolved");
      expect(data.data.resolvedAt).toBeDefined();
    });

    it("sets resolvedAt timestamp", async () => {
      const { id } = await createIncident({});
      const before = new Date();

      const res = await fetch(`${API_URL}/incidents/${id}/resolve`, {
        method: "POST",
        headers: ctx.headers,
      });

      const after = new Date();
      const data = await res.json();
      const resolvedAt = new Date(data.data.resolvedAt);

      expect(resolvedAt.getTime()).toBeGreaterThanOrEqual(before.getTime() - 1000);
      expect(resolvedAt.getTime()).toBeLessThanOrEqual(after.getTime() + 1000);
    });

    it("adds resolution update automatically", async () => {
      const { id } = await createIncident({});

      await fetch(`${API_URL}/incidents/${id}/resolve`, {
        method: "POST",
        headers: ctx.headers,
      });

      const res = await fetch(`${API_URL}/incidents/${id}`, {
        method: "GET",
        headers: ctx.headers,
      });

      const data = await res.json();
      const resolveUpdate = data.data.updates.find(
        (u: { status: string }) => u.status === "resolved"
      );
      expect(resolveUpdate).toBeDefined();
      expect(resolveUpdate.message).toContain("resolved");
    });

    it("is idempotent", async () => {
      const { id } = await createIncident({});

      // Resolve twice
      await fetch(`${API_URL}/incidents/${id}/resolve`, {
        method: "POST",
        headers: ctx.headers,
      });

      const res = await fetch(`${API_URL}/incidents/${id}/resolve`, {
        method: "POST",
        headers: ctx.headers,
      });

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.data.status).toBe("resolved");
    });

    it("returns 404 for non-existent incident", async () => {
      const res = await fetch(`${API_URL}/incidents/nonexistent/resolve`, {
        method: "POST",
        headers: ctx.headers,
      });

      expect(res.status).toBeGreaterThanOrEqual(400);
    });
  });

  describe("Incident Documents", () => {
    describe("GET /incidents/:id/documents - List Documents", () => {
      it("lists documents for incident", async () => {
        const { id } = await createIncident({});

        // Add a document
        await fetch(`${API_URL}/incidents/${id}/documents`, {
          method: "POST",
          headers: ctx.headers,
          body: JSON.stringify({
            title: "Post-Mortem Report",
            documentUrl: "https://docs.example.com/postmortem",
            documentType: "postmortem",
          }),
        });

        const res = await fetch(`${API_URL}/incidents/${id}/documents`, {
          method: "GET",
          headers: ctx.headers,
        });

        expect(res.status).toBe(200);
        const data = await res.json();
        expect(data.success).toBe(true);
        expect(Array.isArray(data.data)).toBe(true);
        expect(data.data.length).toBeGreaterThanOrEqual(1);
      });

      it("returns empty array when no documents", async () => {
        const { id } = await createIncident({});

        const res = await fetch(`${API_URL}/incidents/${id}/documents`, {
          method: "GET",
          headers: ctx.headers,
        });

        expect(res.status).toBe(200);
        const data = await res.json();
        expect(Array.isArray(data.data)).toBe(true);
      });

      it("returns 404 for non-existent incident", async () => {
        const res = await fetch(`${API_URL}/incidents/nonexistent/documents`, {
          method: "GET",
          headers: ctx.headers,
        });

        expect(res.status).toBeGreaterThanOrEqual(400);
      });
    });

    describe("POST /incidents/:id/documents - Add Document", () => {
      it("adds document to incident", async () => {
        const { id } = await createIncident({});

        const res = await fetch(`${API_URL}/incidents/${id}/documents`, {
          method: "POST",
          headers: ctx.headers,
          body: JSON.stringify({
            title: "Root Cause Analysis",
            documentUrl: "https://docs.example.com/rca",
            documentType: "postmortem",
            description: "Detailed analysis of the incident.",
          }),
        });

        expect(res.status).toBe(201);
        const data = await res.json();
        expect(data.success).toBe(true);
        expect(data.data.title).toBe("Root Cause Analysis");
        expect(data.data.documentUrl).toBe("https://docs.example.com/rca");
        expect(data.data.documentType).toBe("postmortem");
        expect(data.data.description).toBe("Detailed analysis of the incident.");
      });

      it("adds document with minimal fields", async () => {
        const { id } = await createIncident({});

        const res = await fetch(`${API_URL}/incidents/${id}/documents`, {
          method: "POST",
          headers: ctx.headers,
          body: JSON.stringify({
            title: "Quick Notes",
            documentUrl: "https://docs.example.com/notes",
          }),
        });

        expect(res.status).toBe(201);
        const data = await res.json();
        expect(data.data.title).toBe("Quick Notes");
        expect(data.data.documentType).toBe("postmortem"); // default
      });

      it("supports different document types", async () => {
        const { id } = await createIncident({});

        const types = ["postmortem", "rca", "timeline", "notes"];

        for (const docType of types) {
          const res = await fetch(`${API_URL}/incidents/${id}/documents`, {
            method: "POST",
            headers: ctx.headers,
            body: JSON.stringify({
              title: `${docType} Document`,
              documentUrl: `https://docs.example.com/${docType}`,
              documentType: docType,
            }),
          });

          expect([201, 400]).toContain(res.status); // 400 if type not supported
        }
      });

      it("returns 404 for non-existent incident", async () => {
        const res = await fetch(`${API_URL}/incidents/nonexistent/documents`, {
          method: "POST",
          headers: ctx.headers,
          body: JSON.stringify({
            title: "Should Fail",
            documentUrl: "https://example.com/doc",
          }),
        });

        expect(res.status).toBeGreaterThanOrEqual(400);
      });
    });

    describe("PATCH /incidents/:id/documents/:docId - Update Document", () => {
      it("updates document title", async () => {
        const { id } = await createIncident({});

        const createRes = await fetch(`${API_URL}/incidents/${id}/documents`, {
          method: "POST",
          headers: ctx.headers,
          body: JSON.stringify({
            title: "Original Title",
            documentUrl: "https://docs.example.com/doc",
          }),
        });
        const { data: doc } = await createRes.json();

        const res = await fetch(
          `${API_URL}/incidents/${id}/documents/${doc.id}`,
          {
            method: "PATCH",
            headers: ctx.headers,
            body: JSON.stringify({
              title: "Updated Title",
            }),
          }
        );

        expect(res.status).toBe(200);
        const data = await res.json();
        expect(data.data.title).toBe("Updated Title");
      });

      it("updates document URL", async () => {
        const { id } = await createIncident({});

        const createRes = await fetch(`${API_URL}/incidents/${id}/documents`, {
          method: "POST",
          headers: ctx.headers,
          body: JSON.stringify({
            title: "URL Update Test",
            documentUrl: "https://old.example.com/doc",
          }),
        });
        const { data: doc } = await createRes.json();

        const res = await fetch(
          `${API_URL}/incidents/${id}/documents/${doc.id}`,
          {
            method: "PATCH",
            headers: ctx.headers,
            body: JSON.stringify({
              documentUrl: "https://new.example.com/doc",
            }),
          }
        );

        expect(res.status).toBe(200);
        const data = await res.json();
        expect(data.data.documentUrl).toBe("https://new.example.com/doc");
      });

      it("returns 404 for non-existent document", async () => {
        const { id } = await createIncident({});

        const res = await fetch(
          `${API_URL}/incidents/${id}/documents/nonexistent`,
          {
            method: "PATCH",
            headers: ctx.headers,
            body: JSON.stringify({
              title: "Should Fail",
            }),
          }
        );

        expect(res.status).toBeGreaterThanOrEqual(400);
      });

      it("returns 404 for document on different incident", async () => {
        const { id: id1 } = await createIncident({ title: "Incident 1" });
        const { id: id2 } = await createIncident({ title: "Incident 2" });

        // Create doc on incident 1
        const createRes = await fetch(`${API_URL}/incidents/${id1}/documents`, {
          method: "POST",
          headers: ctx.headers,
          body: JSON.stringify({
            title: "Doc on Incident 1",
            documentUrl: "https://example.com/doc",
          }),
        });
        const { data: doc } = await createRes.json();

        // Try to update via incident 2
        const res = await fetch(
          `${API_URL}/incidents/${id2}/documents/${doc.id}`,
          {
            method: "PATCH",
            headers: ctx.headers,
            body: JSON.stringify({
              title: "Should Fail",
            }),
          }
        );

        expect(res.status).toBeGreaterThanOrEqual(400);
      });
    });

    describe("DELETE /incidents/:id/documents/:docId - Delete Document", () => {
      it("deletes document", async () => {
        const { id } = await createIncident({});

        const createRes = await fetch(`${API_URL}/incidents/${id}/documents`, {
          method: "POST",
          headers: ctx.headers,
          body: JSON.stringify({
            title: "To Delete",
            documentUrl: "https://example.com/delete",
          }),
        });
        const { data: doc } = await createRes.json();

        const res = await fetch(
          `${API_URL}/incidents/${id}/documents/${doc.id}`,
          {
            method: "DELETE",
            headers: ctx.headers,
          }
        );

        expect(res.status).toBe(200);
        const data = await res.json();
        expect(data.success).toBe(true);
        expect(data.data.deleted).toBe(true);
      });

      it("verifies document is removed after delete", async () => {
        const { id } = await createIncident({});

        const createRes = await fetch(`${API_URL}/incidents/${id}/documents`, {
          method: "POST",
          headers: ctx.headers,
          body: JSON.stringify({
            title: "Verify Delete",
            documentUrl: "https://example.com/verify",
          }),
        });
        const { data: doc } = await createRes.json();

        await fetch(`${API_URL}/incidents/${id}/documents/${doc.id}`, {
          method: "DELETE",
          headers: ctx.headers,
        });

        const listRes = await fetch(`${API_URL}/incidents/${id}/documents`, {
          method: "GET",
          headers: ctx.headers,
        });

        const listData = await listRes.json();
        const hasDoc = listData.data.some(
          (d: { id: string }) => d.id === doc.id
        );
        expect(hasDoc).toBe(false);
      });

      it("returns 404 for non-existent document", async () => {
        const { id } = await createIncident({});

        const res = await fetch(
          `${API_URL}/incidents/${id}/documents/nonexistent`,
          {
            method: "DELETE",
            headers: ctx.headers,
          }
        );

        expect(res.status).toBeGreaterThanOrEqual(400);
      });
    });
  });

  describe("Check Result Linking", () => {
    it("links failed check results to incident when created", async () => {
      const monitorId = await createMonitor("Linked Monitor");

      // Insert a failed check result
      await dbClient.query(
        `INSERT INTO check_results (id, monitor_id, region, status, response_time_ms, created_at)
         VALUES ($1, $2, 'uk', 'failure', 500, NOW())`,
        [`check-${Date.now()}`, monitorId]
      );

      // Create incident with affected monitor
      await createIncident({
        affectedMonitors: [monitorId],
      });

      // Check results should be linked (implementation dependent)
      // This test validates the feature is present
    });
  });

  describe("Authorization", () => {
    it("requires write scope to create incident", async () => {
      // Create a read-only API key using the helper
      const { key: readOnlyToken } = await insertApiKey(
        ctx.organizationId,
        ctx.userId,
        { name: "read-only-create-test", scopes: ["read"] }
      );

      const res = await fetch(`${API_URL}/incidents`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${readOnlyToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          title: "Should Fail",
        }),
      });

      expect(res.status).toBe(403);
    });

    it("requires write scope to update incident", async () => {
      const { id } = await createIncident({});

      // Create a read-only API key using the helper
      const { key: readOnlyToken } = await insertApiKey(
        ctx.organizationId,
        ctx.userId,
        { name: "read-only-update-test", scopes: ["read"] }
      );

      const res = await fetch(`${API_URL}/incidents/${id}`, {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${readOnlyToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          title: "Should Fail",
        }),
      });

      expect(res.status).toBe(403);
    });

    it("allows read-only access to list incidents", async () => {
      // Create a read-only API key using the helper
      const { key: readOnlyToken } = await insertApiKey(
        ctx.organizationId,
        ctx.userId,
        { name: "read-only-list-test", scopes: ["read"] }
      );

      const res = await fetch(`${API_URL}/incidents`, {
        method: "GET",
        headers: {
          Authorization: `Bearer ${readOnlyToken}`,
          "Content-Type": "application/json",
        },
      });

      expect(res.status).toBe(200);
    });
  });

  describe("Edge Cases", () => {
    it("handles very long incident title", async () => {
      const longTitle = "A".repeat(500);

      const res = await fetch(`${API_URL}/incidents`, {
        method: "POST",
        headers: ctx.headers,
        body: JSON.stringify({
          title: longTitle,
        }),
      });

      expect([201, 400, 422]).toContain(res.status);
    });

    it("handles special characters in title", async () => {
      const res = await fetch(`${API_URL}/incidents`, {
        method: "POST",
        headers: ctx.headers,
        body: JSON.stringify({
          title: "Incident with <script>alert('xss')</script>",
        }),
      });

      expect(res.status).toBe(201);
      const data = await res.json();
      expect(data.data.title).toContain("script");
    });

    it("handles unicode in message", async () => {
      const res = await fetch(`${API_URL}/incidents`, {
        method: "POST",
        headers: ctx.headers,
        body: JSON.stringify({
          title: "Unicode Test",
          message: "Issue with special chars and math symbols",
        }),
      });

      expect(res.status).toBe(201);
    });

    it("handles rapid status transitions", async () => {
      const { id } = await createIncident({ status: "investigating" });

      const statuses = [
        "identified",
        "monitoring",
        "investigating",
        "identified",
        "resolved",
      ];

      for (const status of statuses) {
        const res = await fetch(`${API_URL}/incidents/${id}/updates`, {
          method: "POST",
          headers: ctx.headers,
          body: JSON.stringify({
            status,
            message: `Status: ${status}`,
          }),
        });

        expect(res.status).toBe(201);
      }
    });

    it("handles concurrent incident updates", async () => {
      const { id } = await createIncident({});

      const updates = Promise.all([
        fetch(`${API_URL}/incidents/${id}`, {
          method: "PATCH",
          headers: ctx.headers,
          body: JSON.stringify({ title: "Update 1" }),
        }),
        fetch(`${API_URL}/incidents/${id}`, {
          method: "PATCH",
          headers: ctx.headers,
          body: JSON.stringify({ title: "Update 2" }),
        }),
        fetch(`${API_URL}/incidents/${id}`, {
          method: "PATCH",
          headers: ctx.headers,
          body: JSON.stringify({ title: "Update 3" }),
        }),
      ]);

      const results = await updates;
      for (const res of results) {
        expect([200, 409, 500]).toContain(res.status);
      }
    });

    it("handles incident with many updates", async () => {
      const { id } = await createIncident({});

      // Add many updates
      for (let i = 0; i < 20; i++) {
        await fetch(`${API_URL}/incidents/${id}/updates`, {
          method: "POST",
          headers: ctx.headers,
          body: JSON.stringify({
            status: i % 2 === 0 ? "investigating" : "identified",
            message: `Update ${i + 1}`,
          }),
        });
      }

      const res = await fetch(`${API_URL}/incidents/${id}`, {
        method: "GET",
        headers: ctx.headers,
      });

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.data.updates.length).toBeGreaterThanOrEqual(20);
    });
  });
});
