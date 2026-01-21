import { describe, it, expect, beforeAll } from "vitest";
import { bootstrapTestContext, TestContext } from "../helpers/context";
import {
  insertOrganization,
  insertUser,
  insertApiKey,
  insertMonitor,
} from "../helpers/data";

const API_BASE_URL = process.env.API_BASE_URL ?? "http://api:3001";
const apiUrl = `${API_BASE_URL}/api/v1`;

describe("Probes API", () => {
  let ctx: TestContext;
  let orgId: string;
  let adminToken: string;
  let readOnlyToken: string;
  let otherOrgId: string;
  let otherOrgToken: string;
  let testMonitorId: string;

  beforeAll(async () => {
    ctx = await bootstrapTestContext();

    // Create test organization
    const org = await insertOrganization({ name: "Probes Test Org" });
    orgId = org.id;

    // Create admin user with API key
    const adminUser = await insertUser({
      email: "probes-admin@test.com",
      name: "Probes Admin",
    });
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

    // Create a test monitor
    const monitor = await insertMonitor(orgId, {
      name: "Probe Test Monitor",
      type: "http",
      url: "https://example.com",
    });
    testMonitorId = monitor.id;

    // Create another organization for isolation tests
    const otherOrg = await insertOrganization({ name: "Other Probes Org" });
    otherOrgId = otherOrg.id;

    const otherUser = await insertUser({
      email: "other-probes@test.com",
      name: "Other Probes User",
    });
    const otherKey = await insertApiKey(otherOrgId, {
      userId: otherUser.id,
      scope: "admin",
    });
    otherOrgToken = otherKey.key;
  });

  // ==========================================
  // Probe Management CRUD
  // ==========================================
  describe("Probe Management CRUD", () => {
    describe("POST /probes", () => {
      it("creates a probe with name and region", async () => {
        const res = await fetch(`${apiUrl}/probes`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${adminToken}`,
          },
          body: JSON.stringify({
            name: "US East Probe",
            description: "Private probe in US East datacenter",
            region: "us-east-1",
          }),
        });

        expect(res.status).toBe(201);
        const body = await res.json();
        expect(body.success).toBe(true);
        expect(body.data.id).toBeDefined();
        expect(body.data.name).toBe("US East Probe");
        expect(body.data.description).toBe("Private probe in US East datacenter");
        expect(body.data.region).toBe("us-east-1");
        expect(body.data.status).toBe("pending");
        // Auth token should be returned on creation
        expect(body.data.authToken).toBeDefined();
        expect(body.data.authToken.length).toBe(48);
        expect(body.data.installCommand).toContain(body.data.authToken);
      });

      it("creates a probe with minimal data", async () => {
        const res = await fetch(`${apiUrl}/probes`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${adminToken}`,
          },
          body: JSON.stringify({
            name: "Minimal Probe",
          }),
        });

        expect(res.status).toBe(201);
        const body = await res.json();
        expect(body.success).toBe(true);
        expect(body.data.name).toBe("Minimal Probe");
      });
    });

    describe("GET /probes", () => {
      it("lists all probes for organization", async () => {
        const res = await fetch(`${apiUrl}/probes`, {
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

      it("does not expose auth tokens in list", async () => {
        const res = await fetch(`${apiUrl}/probes`, {
          headers: {
            Authorization: `Bearer ${adminToken}`,
          },
        });

        expect(res.status).toBe(200);
        const body = await res.json();
        expect(body.success).toBe(true);

        for (const probe of body.data) {
          // Auth token should be undefined or redacted
          expect(probe.authToken).toBeUndefined();
          // Prefix should be shown as partial
          expect(probe.authTokenPrefix).toContain("...");
        }
      });

      it("includes assigned monitor count", async () => {
        const res = await fetch(`${apiUrl}/probes`, {
          headers: {
            Authorization: `Bearer ${adminToken}`,
          },
        });

        expect(res.status).toBe(200);
        const body = await res.json();
        expect(body.success).toBe(true);

        for (const probe of body.data) {
          expect(typeof probe.assignedMonitorCount).toBe("number");
        }
      });
    });

    describe("GET /probes/:id", () => {
      let testProbeId: string;

      beforeAll(async () => {
        const createRes = await fetch(`${apiUrl}/probes`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${adminToken}`,
          },
          body: JSON.stringify({
            name: "Get Test Probe",
            region: "eu-west-1",
          }),
        });
        const created = await createRes.json();
        testProbeId = created.data.id;
      });

      it("gets a specific probe by ID", async () => {
        const res = await fetch(`${apiUrl}/probes/${testProbeId}`, {
          headers: {
            Authorization: `Bearer ${adminToken}`,
          },
        });

        expect(res.status).toBe(200);
        const body = await res.json();
        expect(body.success).toBe(true);
        expect(body.data.id).toBe(testProbeId);
        expect(body.data.name).toBe("Get Test Probe");
        expect(body.data.region).toBe("eu-west-1");
      });

      it("includes assignments in response", async () => {
        const res = await fetch(`${apiUrl}/probes/${testProbeId}`, {
          headers: {
            Authorization: `Bearer ${adminToken}`,
          },
        });

        expect(res.status).toBe(200);
        const body = await res.json();
        expect(body.success).toBe(true);
        expect(Array.isArray(body.data.assignments)).toBe(true);
      });

      it("includes recent heartbeats", async () => {
        const res = await fetch(`${apiUrl}/probes/${testProbeId}`, {
          headers: {
            Authorization: `Bearer ${adminToken}`,
          },
        });

        expect(res.status).toBe(200);
        const body = await res.json();
        expect(body.success).toBe(true);
        expect(Array.isArray(body.data.recentHeartbeats)).toBe(true);
      });

      it("does not expose auth token", async () => {
        const res = await fetch(`${apiUrl}/probes/${testProbeId}`, {
          headers: {
            Authorization: `Bearer ${adminToken}`,
          },
        });

        expect(res.status).toBe(200);
        const body = await res.json();
        expect(body.success).toBe(true);
        expect(body.data.authToken).toBeUndefined();
        expect(body.data.authTokenPrefix).toContain("...");
      });

      it("returns 404 for non-existent probe", async () => {
        const res = await fetch(`${apiUrl}/probes/non-existent-id`, {
          headers: {
            Authorization: `Bearer ${adminToken}`,
          },
        });

        expect(res.status).toBe(404);
        const body = await res.json();
        expect(body.success).toBe(false);
      });
    });

    describe("PATCH /probes/:id", () => {
      let updateProbeId: string;

      beforeAll(async () => {
        const createRes = await fetch(`${apiUrl}/probes`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${adminToken}`,
          },
          body: JSON.stringify({
            name: "Update Test Probe",
          }),
        });
        const created = await createRes.json();
        updateProbeId = created.data.id;
      });

      it("updates probe name", async () => {
        const res = await fetch(`${apiUrl}/probes/${updateProbeId}`, {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${adminToken}`,
          },
          body: JSON.stringify({
            name: "Updated Probe Name",
          }),
        });

        expect(res.status).toBe(200);
        const body = await res.json();
        expect(body.success).toBe(true);
        expect(body.data.name).toBe("Updated Probe Name");
      });

      it("updates probe description", async () => {
        const res = await fetch(`${apiUrl}/probes/${updateProbeId}`, {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${adminToken}`,
          },
          body: JSON.stringify({
            description: "New description for the probe",
          }),
        });

        expect(res.status).toBe(200);
        const body = await res.json();
        expect(body.success).toBe(true);
        expect(body.data.description).toBe("New description for the probe");
      });

      it("updates probe region", async () => {
        const res = await fetch(`${apiUrl}/probes/${updateProbeId}`, {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${adminToken}`,
          },
          body: JSON.stringify({
            region: "ap-southeast-1",
          }),
        });

        expect(res.status).toBe(200);
        const body = await res.json();
        expect(body.success).toBe(true);
        expect(body.data.region).toBe("ap-southeast-1");
      });

      it("updates probe status", async () => {
        const res = await fetch(`${apiUrl}/probes/${updateProbeId}`, {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${adminToken}`,
          },
          body: JSON.stringify({
            status: "disabled",
          }),
        });

        expect(res.status).toBe(200);
        const body = await res.json();
        expect(body.success).toBe(true);
        expect(body.data.status).toBe("disabled");
      });

      it("returns 404 when updating non-existent probe", async () => {
        const res = await fetch(`${apiUrl}/probes/non-existent-id`, {
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

    describe("DELETE /probes/:id", () => {
      it("deletes a probe", async () => {
        // Create a probe to delete
        const createRes = await fetch(`${apiUrl}/probes`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${adminToken}`,
          },
          body: JSON.stringify({
            name: "Delete Test Probe",
          }),
        });
        const created = await createRes.json();
        const deleteId = created.data.id;

        // Delete the probe
        const res = await fetch(`${apiUrl}/probes/${deleteId}`, {
          method: "DELETE",
          headers: {
            Authorization: `Bearer ${adminToken}`,
          },
        });

        expect(res.status).toBe(200);
        const body = await res.json();
        expect(body.success).toBe(true);
        expect(body.data.deleted).toBe(true);

        // Verify it's deleted
        const getRes = await fetch(`${apiUrl}/probes/${deleteId}`, {
          headers: {
            Authorization: `Bearer ${adminToken}`,
          },
        });
        expect(getRes.status).toBe(404);
      });

      it("returns 404 when deleting non-existent probe", async () => {
        const res = await fetch(`${apiUrl}/probes/non-existent-id`, {
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
  // Token Regeneration
  // ==========================================
  describe("Token Regeneration", () => {
    describe("POST /probes/:id/regenerate-token", () => {
      let tokenProbeId: string;
      let originalToken: string;

      beforeAll(async () => {
        const createRes = await fetch(`${apiUrl}/probes`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${adminToken}`,
          },
          body: JSON.stringify({
            name: "Token Regen Probe",
          }),
        });
        const created = await createRes.json();
        tokenProbeId = created.data.id;
        originalToken = created.data.authToken;
      });

      it("regenerates auth token", async () => {
        const res = await fetch(`${apiUrl}/probes/${tokenProbeId}/regenerate-token`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${adminToken}`,
          },
        });

        expect(res.status).toBe(200);
        const body = await res.json();
        expect(body.success).toBe(true);
        expect(body.data.authToken).toBeDefined();
        expect(body.data.authToken.length).toBe(48);
        expect(body.data.authToken).not.toBe(originalToken);
      });

      it("sets probe status to pending after token regeneration", async () => {
        const res = await fetch(`${apiUrl}/probes/${tokenProbeId}/regenerate-token`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${adminToken}`,
          },
        });

        expect(res.status).toBe(200);
        const body = await res.json();
        expect(body.success).toBe(true);
        expect(body.data.status).toBe("pending");
      });

      it("returns 404 when regenerating token for non-existent probe", async () => {
        const res = await fetch(`${apiUrl}/probes/non-existent-id/regenerate-token`, {
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
  });

  // ==========================================
  // Probe Assignments
  // ==========================================
  describe("Probe Assignments", () => {
    let assignProbeId: string;

    beforeAll(async () => {
      const createRes = await fetch(`${apiUrl}/probes`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${adminToken}`,
        },
        body: JSON.stringify({
          name: "Assignment Test Probe",
        }),
      });
      const created = await createRes.json();
      assignProbeId = created.data.id;
    });

    describe("POST /probes/:id/assign", () => {
      it("assigns probe to monitor", async () => {
        const res = await fetch(`${apiUrl}/probes/${assignProbeId}/assign`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${adminToken}`,
          },
          body: JSON.stringify({
            monitorId: testMonitorId,
            priority: 1,
            exclusive: false,
          }),
        });

        expect(res.status).toBe(201);
        const body = await res.json();
        expect(body.success).toBe(true);
        expect(body.data.id).toBeDefined();
        expect(body.data.probeId).toBe(assignProbeId);
        expect(body.data.monitorId).toBe(testMonitorId);
        expect(body.data.priority).toBe(1);
        expect(body.data.exclusive).toBe(false);
      });

      it("rejects duplicate assignment", async () => {
        const res = await fetch(`${apiUrl}/probes/${assignProbeId}/assign`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${adminToken}`,
          },
          body: JSON.stringify({
            monitorId: testMonitorId,
          }),
        });

        expect(res.status).toBe(409);
        const body = await res.json();
        expect(body.success).toBe(false);
        expect(body.error).toContain("already exists");
      });

      it("returns 404 when assigning to non-existent probe", async () => {
        const res = await fetch(`${apiUrl}/probes/non-existent-id/assign`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${adminToken}`,
          },
          body: JSON.stringify({
            monitorId: testMonitorId,
          }),
        });

        expect(res.status).toBe(404);
        const body = await res.json();
        expect(body.success).toBe(false);
      });

      it("returns 404 when assigning to non-existent monitor", async () => {
        const res = await fetch(`${apiUrl}/probes/${assignProbeId}/assign`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${adminToken}`,
          },
          body: JSON.stringify({
            monitorId: "non-existent-monitor",
          }),
        });

        expect(res.status).toBe(404);
        const body = await res.json();
        expect(body.success).toBe(false);
      });

      it("assigns with priority and exclusive flags", async () => {
        // Create another monitor for this test
        const monitor = await insertMonitor(orgId, {
          name: "Priority Test Monitor",
          type: "http",
          url: "https://priority-test.com",
        });

        const res = await fetch(`${apiUrl}/probes/${assignProbeId}/assign`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${adminToken}`,
          },
          body: JSON.stringify({
            monitorId: monitor.id,
            priority: 10,
            exclusive: true,
          }),
        });

        expect(res.status).toBe(201);
        const body = await res.json();
        expect(body.success).toBe(true);
        expect(body.data.priority).toBe(10);
        expect(body.data.exclusive).toBe(true);
      });
    });

    describe("DELETE /probes/:id/assign/:monitorId", () => {
      it("removes probe assignment", async () => {
        const res = await fetch(`${apiUrl}/probes/${assignProbeId}/assign/${testMonitorId}`, {
          method: "DELETE",
          headers: {
            Authorization: `Bearer ${adminToken}`,
          },
        });

        expect(res.status).toBe(200);
        const body = await res.json();
        expect(body.success).toBe(true);
        expect(body.data.deleted).toBe(true);
      });

      it("returns 404 when removing non-existent assignment", async () => {
        const res = await fetch(`${apiUrl}/probes/${assignProbeId}/assign/non-existent-monitor`, {
          method: "DELETE",
          headers: {
            Authorization: `Bearer ${adminToken}`,
          },
        });

        expect(res.status).toBe(404);
        const body = await res.json();
        expect(body.success).toBe(false);
      });

      it("returns 404 when removing from non-existent probe", async () => {
        const res = await fetch(`${apiUrl}/probes/non-existent-id/assign/${testMonitorId}`, {
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
  // Probe Agent Endpoints
  // ==========================================
  describe("Probe Agent Endpoints", () => {
    let agentProbeId: string;
    let agentToken: string;

    beforeAll(async () => {
      const createRes = await fetch(`${apiUrl}/probes`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${adminToken}`,
        },
        body: JSON.stringify({
          name: "Agent Test Probe",
          region: "private",
        }),
      });
      const created = await createRes.json();
      agentProbeId = created.data.id;
      agentToken = created.data.authToken;
    });

    describe("POST /probes/agent/heartbeat", () => {
      it("accepts heartbeat with probe token", async () => {
        const res = await fetch(`${apiUrl}/probes/agent/heartbeat`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${agentToken}`,
          },
          body: JSON.stringify({
            version: "1.0.0",
            metrics: {
              cpuUsage: 45.5,
              memoryUsage: 60.2,
            },
            metadata: {
              os: "linux",
              arch: "x64",
            },
          }),
        });

        expect(res.status).toBe(200);
        const body = await res.json();
        expect(body.success).toBe(true);
        expect(body.data.heartbeatId).toBeDefined();
        expect(body.data.timestamp).toBeDefined();
      });

      it("updates probe status to active after heartbeat", async () => {
        await fetch(`${apiUrl}/probes/agent/heartbeat`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${agentToken}`,
          },
          body: JSON.stringify({
            version: "1.0.0",
          }),
        });

        // Check probe status
        const getRes = await fetch(`${apiUrl}/probes/${agentProbeId}`, {
          headers: {
            Authorization: `Bearer ${adminToken}`,
          },
        });

        expect(getRes.status).toBe(200);
        const body = await getRes.json();
        expect(body.data.status).toBe("active");
      });

      it("rejects heartbeat without token", async () => {
        const res = await fetch(`${apiUrl}/probes/agent/heartbeat`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            version: "1.0.0",
          }),
        });

        expect(res.status).toBe(401);
        const body = await res.json();
        expect(body.success).toBe(false);
      });

      it("rejects heartbeat with invalid token", async () => {
        const res = await fetch(`${apiUrl}/probes/agent/heartbeat`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: "Bearer invalid-token-here",
          },
          body: JSON.stringify({
            version: "1.0.0",
          }),
        });

        expect(res.status).toBe(401);
        const body = await res.json();
        expect(body.success).toBe(false);
      });
    });

    describe("GET /probes/agent/jobs", () => {
      it("returns pending jobs for probe", async () => {
        const res = await fetch(`${apiUrl}/probes/agent/jobs`, {
          headers: {
            Authorization: `Bearer ${agentToken}`,
          },
        });

        expect(res.status).toBe(200);
        const body = await res.json();
        expect(body.success).toBe(true);
        expect(Array.isArray(body.data)).toBe(true);
      });

      it("respects limit parameter", async () => {
        const res = await fetch(`${apiUrl}/probes/agent/jobs?limit=5`, {
          headers: {
            Authorization: `Bearer ${agentToken}`,
          },
        });

        expect(res.status).toBe(200);
        const body = await res.json();
        expect(body.success).toBe(true);
        expect(body.data.length).toBeLessThanOrEqual(5);
      });

      it("rejects request without token", async () => {
        const res = await fetch(`${apiUrl}/probes/agent/jobs`);

        expect(res.status).toBe(401);
        const body = await res.json();
        expect(body.success).toBe(false);
      });
    });

    describe("POST /probes/agent/jobs/:jobId/result", () => {
      it("rejects result for non-existent job", async () => {
        const res = await fetch(`${apiUrl}/probes/agent/jobs/fake-job-id/result`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${agentToken}`,
          },
          body: JSON.stringify({
            monitorId: testMonitorId,
            success: true,
            responseTimeMs: 150,
            statusCode: 200,
          }),
        });

        expect(res.status).toBe(404);
        const body = await res.json();
        expect(body.success).toBe(false);
      });

      it("rejects result without token", async () => {
        const res = await fetch(`${apiUrl}/probes/agent/jobs/some-job-id/result`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            monitorId: testMonitorId,
            success: true,
            responseTimeMs: 150,
          }),
        });

        expect(res.status).toBe(401);
        const body = await res.json();
        expect(body.success).toBe(false);
      });
    });
  });

  // ==========================================
  // Probe Statistics
  // ==========================================
  describe("Probe Statistics", () => {
    let statsProbeId: string;

    beforeAll(async () => {
      const createRes = await fetch(`${apiUrl}/probes`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${adminToken}`,
        },
        body: JSON.stringify({
          name: "Stats Test Probe",
        }),
      });
      const created = await createRes.json();
      statsProbeId = created.data.id;
    });

    describe("GET /probes/:id/stats", () => {
      it("returns probe statistics", async () => {
        const res = await fetch(`${apiUrl}/probes/${statsProbeId}/stats`, {
          headers: {
            Authorization: `Bearer ${adminToken}`,
          },
        });

        expect(res.status).toBe(200);
        const body = await res.json();
        expect(body.success).toBe(true);
        expect(body.data.jobs).toBeDefined();
        expect(body.data.heartbeats).toBeDefined();
        expect(body.data.period).toBeDefined();
        expect(body.data.period.hours).toBeDefined();
        expect(body.data.period.since).toBeDefined();
      });

      it("respects hours parameter", async () => {
        const res = await fetch(`${apiUrl}/probes/${statsProbeId}/stats?hours=48`, {
          headers: {
            Authorization: `Bearer ${adminToken}`,
          },
        });

        expect(res.status).toBe(200);
        const body = await res.json();
        expect(body.success).toBe(true);
        expect(body.data.period.hours).toBe(48);
      });

      it("returns 404 for non-existent probe", async () => {
        const res = await fetch(`${apiUrl}/probes/non-existent-id/stats`, {
          headers: {
            Authorization: `Bearer ${adminToken}`,
          },
        });

        expect(res.status).toBe(404);
        const body = await res.json();
        expect(body.success).toBe(false);
      });

      it("includes average metrics when available", async () => {
        const res = await fetch(`${apiUrl}/probes/${statsProbeId}/stats`, {
          headers: {
            Authorization: `Bearer ${adminToken}`,
          },
        });

        expect(res.status).toBe(200);
        const body = await res.json();
        expect(body.success).toBe(true);
        // avgCpuUsage and avgMemoryUsage may be null if no heartbeats with metrics
        expect("avgCpuUsage" in body.data).toBe(true);
        expect("avgMemoryUsage" in body.data).toBe(true);
      });
    });
  });

  // ==========================================
  // Authorization
  // ==========================================
  describe("Authorization", () => {
    it("requires authentication for listing probes", async () => {
      const res = await fetch(`${apiUrl}/probes`);
      expect(res.status).toBe(401);
    });

    it("requires authentication for creating probes", async () => {
      const res = await fetch(`${apiUrl}/probes`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name: "Unauthenticated Probe",
        }),
      });
      expect(res.status).toBe(401);
    });

    it("allows read-only access for listing probes", async () => {
      const res = await fetch(`${apiUrl}/probes`, {
        headers: {
          Authorization: `Bearer ${readOnlyToken}`,
        },
      });
      expect(res.status).toBe(200);
    });

    it("allows read-only access for getting probe details", async () => {
      // Create with admin
      const createRes = await fetch(`${apiUrl}/probes`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${adminToken}`,
        },
        body: JSON.stringify({
          name: "Read Access Probe",
        }),
      });
      const created = await createRes.json();

      // Read with read-only token
      const res = await fetch(`${apiUrl}/probes/${created.data.id}`, {
        headers: {
          Authorization: `Bearer ${readOnlyToken}`,
        },
      });
      expect(res.status).toBe(200);
    });

    it("allows read-only access for viewing stats", async () => {
      // Create with admin
      const createRes = await fetch(`${apiUrl}/probes`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${adminToken}`,
        },
        body: JSON.stringify({
          name: "Stats Access Probe",
        }),
      });
      const created = await createRes.json();

      // View stats with read-only token
      const res = await fetch(`${apiUrl}/probes/${created.data.id}/stats`, {
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
    let isolatedProbeId: string;

    beforeAll(async () => {
      const createRes = await fetch(`${apiUrl}/probes`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${adminToken}`,
        },
        body: JSON.stringify({
          name: "Isolated Probe",
        }),
      });
      const created = await createRes.json();
      isolatedProbeId = created.data.id;
    });

    it("cannot get probe from another organization", async () => {
      const res = await fetch(`${apiUrl}/probes/${isolatedProbeId}`, {
        headers: {
          Authorization: `Bearer ${otherOrgToken}`,
        },
      });

      expect(res.status).toBe(404);
      const body = await res.json();
      expect(body.success).toBe(false);
    });

    it("cannot update probe from another organization", async () => {
      const res = await fetch(`${apiUrl}/probes/${isolatedProbeId}`, {
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

    it("cannot delete probe from another organization", async () => {
      const res = await fetch(`${apiUrl}/probes/${isolatedProbeId}`, {
        method: "DELETE",
        headers: {
          Authorization: `Bearer ${otherOrgToken}`,
        },
      });

      expect(res.status).toBe(404);
      const body = await res.json();
      expect(body.success).toBe(false);
    });

    it("cannot regenerate token for probe from another organization", async () => {
      const res = await fetch(`${apiUrl}/probes/${isolatedProbeId}/regenerate-token`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${otherOrgToken}`,
        },
      });

      expect(res.status).toBe(404);
      const body = await res.json();
      expect(body.success).toBe(false);
    });

    it("cannot get stats for probe from another organization", async () => {
      const res = await fetch(`${apiUrl}/probes/${isolatedProbeId}/stats`, {
        headers: {
          Authorization: `Bearer ${otherOrgToken}`,
        },
      });

      expect(res.status).toBe(404);
      const body = await res.json();
      expect(body.success).toBe(false);
    });

    it("cannot assign probe from another organization to monitor", async () => {
      // Create a monitor in other org
      const otherMonitor = await insertMonitor(otherOrgId, {
        name: "Other Org Monitor",
        type: "http",
        url: "https://other.com",
      });

      const res = await fetch(`${apiUrl}/probes/${isolatedProbeId}/assign`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${otherOrgToken}`,
        },
        body: JSON.stringify({
          monitorId: otherMonitor.id,
        }),
      });

      expect(res.status).toBe(404);
      const body = await res.json();
      expect(body.success).toBe(false);
    });

    it("does not list probes from another organization", async () => {
      const res = await fetch(`${apiUrl}/probes`, {
        headers: {
          Authorization: `Bearer ${otherOrgToken}`,
        },
      });

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.success).toBe(true);

      // Should not contain the isolated probe
      const probeIds = body.data.map((p: any) => p.id);
      expect(probeIds).not.toContain(isolatedProbeId);
    });
  });

  // ==========================================
  // Audit Logging
  // ==========================================
  describe("Audit Logging", () => {
    it("creates audit entry when creating probe", async () => {
      const createRes = await fetch(`${apiUrl}/probes`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${adminToken}`,
        },
        body: JSON.stringify({
          name: "Audit Test Create Probe",
        }),
      });
      expect(createRes.status).toBe(201);

      // Check audit log
      const auditRes = await fetch(`${apiUrl}/audit-logs?action=probe.create&limit=1`, {
        headers: {
          Authorization: `Bearer ${adminToken}`,
        },
      });

      expect(auditRes.status).toBe(200);
      const auditBody = await auditRes.json();
      expect(auditBody.success).toBe(true);
      // Audit API returns nested data.data structure
      expect(auditBody.data.data.length).toBeGreaterThan(0);
      expect(auditBody.data.data[0].action).toBe("probe.create");
    });

    it("creates audit entry when updating probe", async () => {
      // Create a probe
      const createRes = await fetch(`${apiUrl}/probes`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${adminToken}`,
        },
        body: JSON.stringify({
          name: "Audit Test Update Probe",
        }),
      });
      const created = await createRes.json();

      // Update it
      await fetch(`${apiUrl}/probes/${created.data.id}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${adminToken}`,
        },
        body: JSON.stringify({
          name: "Audit Test Updated Probe",
        }),
      });

      // Check audit log
      const auditRes = await fetch(`${apiUrl}/audit-logs?action=probe.update&limit=1`, {
        headers: {
          Authorization: `Bearer ${adminToken}`,
        },
      });

      expect(auditRes.status).toBe(200);
      const auditBody = await auditRes.json();
      expect(auditBody.success).toBe(true);
      expect(auditBody.data.data.length).toBeGreaterThan(0);
      expect(auditBody.data.data[0].action).toBe("probe.update");
    });

    it("creates audit entry when deleting probe", async () => {
      // Create a probe
      const createRes = await fetch(`${apiUrl}/probes`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${adminToken}`,
        },
        body: JSON.stringify({
          name: "Audit Test Delete Probe",
        }),
      });
      const created = await createRes.json();

      // Delete it
      await fetch(`${apiUrl}/probes/${created.data.id}`, {
        method: "DELETE",
        headers: {
          Authorization: `Bearer ${adminToken}`,
        },
      });

      // Check audit log
      const auditRes = await fetch(`${apiUrl}/audit-logs?action=probe.delete&limit=1`, {
        headers: {
          Authorization: `Bearer ${adminToken}`,
        },
      });

      expect(auditRes.status).toBe(200);
      const auditBody = await auditRes.json();
      expect(auditBody.success).toBe(true);
      expect(auditBody.data.data.length).toBeGreaterThan(0);
      expect(auditBody.data.data[0].action).toBe("probe.delete");
    });

    it("creates audit entry when regenerating token", async () => {
      // Create a probe
      const createRes = await fetch(`${apiUrl}/probes`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${adminToken}`,
        },
        body: JSON.stringify({
          name: "Audit Test Regen Probe",
        }),
      });
      const created = await createRes.json();

      // Regenerate token
      await fetch(`${apiUrl}/probes/${created.data.id}/regenerate-token`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${adminToken}`,
        },
      });

      // Check audit log
      const auditRes = await fetch(`${apiUrl}/audit-logs?action=probe.regenerate_token&limit=1`, {
        headers: {
          Authorization: `Bearer ${adminToken}`,
        },
      });

      expect(auditRes.status).toBe(200);
      const auditBody = await auditRes.json();
      expect(auditBody.success).toBe(true);
      expect(auditBody.data.data.length).toBeGreaterThan(0);
      expect(auditBody.data.data[0].action).toBe("probe.regenerate_token");
    });

    it("creates audit entry when assigning monitor", async () => {
      // Create a probe
      const createRes = await fetch(`${apiUrl}/probes`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${adminToken}`,
        },
        body: JSON.stringify({
          name: "Audit Test Assign Probe",
        }),
      });
      const created = await createRes.json();

      // Create a monitor
      const monitor = await insertMonitor(orgId, {
        name: "Audit Assign Monitor",
        type: "http",
        url: "https://audit-assign.com",
      });

      // Assign
      await fetch(`${apiUrl}/probes/${created.data.id}/assign`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${adminToken}`,
        },
        body: JSON.stringify({
          monitorId: monitor.id,
        }),
      });

      // Check audit log
      const auditRes = await fetch(`${apiUrl}/audit-logs?action=probe.assign_monitor&limit=1`, {
        headers: {
          Authorization: `Bearer ${adminToken}`,
        },
      });

      expect(auditRes.status).toBe(200);
      const auditBody = await auditRes.json();
      expect(auditBody.success).toBe(true);
      expect(auditBody.data.data.length).toBeGreaterThan(0);
      expect(auditBody.data.data[0].action).toBe("probe.assign_monitor");
    });
  });

  // ==========================================
  // Disabled Probe Authentication
  // ==========================================
  describe("Disabled Probe Authentication", () => {
    it("rejects heartbeat from disabled probe", async () => {
      // Create a probe
      const createRes = await fetch(`${apiUrl}/probes`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${adminToken}`,
        },
        body: JSON.stringify({
          name: "Disabled Test Probe",
        }),
      });
      const created = await createRes.json();
      const probeToken = created.data.authToken;

      // Disable the probe
      await fetch(`${apiUrl}/probes/${created.data.id}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${adminToken}`,
        },
        body: JSON.stringify({
          status: "disabled",
        }),
      });

      // Try to send heartbeat
      const res = await fetch(`${apiUrl}/probes/agent/heartbeat`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${probeToken}`,
        },
        body: JSON.stringify({
          version: "1.0.0",
        }),
      });

      expect(res.status).toBe(401);
      const body = await res.json();
      expect(body.success).toBe(false);
    });
  });
});
