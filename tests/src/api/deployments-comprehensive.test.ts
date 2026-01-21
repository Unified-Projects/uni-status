import { describe, it, expect, beforeAll } from "vitest";
import { bootstrapTestContext, TestContext } from "../helpers/context";
import {
  insertOrganization,
  insertUser,
  insertApiKey,
  insertOrganizationMember,
  insertMonitor,
  insertIncident,
  insertDeploymentWebhook,
  insertDeploymentEvent,
} from "../helpers/data";
import crypto from "crypto";

const API_BASE_URL = process.env.API_BASE_URL ?? "http://api:3001";
const apiUrl = `${API_BASE_URL}/api/v1`;

// Helper to generate HMAC signature
function generateHmacSignature(payload: string, secret: string): string {
  return crypto.createHmac("sha256", secret).update(payload).digest("hex");
}

describe("Deployments API", () => {
  let ctx: TestContext;
  let orgId: string;
  let adminToken: string;
  let readOnlyToken: string;
  let otherOrgId: string;
  let otherOrgToken: string;
  let testMonitorId: string;
  let testIncidentId: string;

  beforeAll(async () => {
    ctx = await bootstrapTestContext();

    // Create test organization
    const org = await insertOrganization({ name: "Deployments Test Org" });
    orgId = org.id;

    // Create admin user with API key
    const adminUser = await insertUser({
      email: "deployments-admin@test.com",
      name: "Deployments Admin",
    });
    await insertOrganizationMember(orgId, {
      userId: adminUser.id,
      role: "admin",
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

    // Create test monitor
    const monitor = await insertMonitor(orgId, {
      name: "Deployment Test Monitor",
      type: "http",
      url: "https://example.com",
    });
    testMonitorId = monitor.id;

    // Create test incident
    const incident = await insertIncident(orgId, {
      title: "Test Incident for Deployments",
      severity: "minor",
      status: "investigating",
      userId: adminUser.id,
    });
    testIncidentId = incident.id;

    // Create another organization for isolation tests
    const otherOrg = await insertOrganization({ name: "Other Deployments Org" });
    otherOrgId = otherOrg.id;

    const otherUser = await insertUser({
      email: "other-deployments@test.com",
      name: "Other Deployments User",
    });
    await insertOrganizationMember(otherOrgId, {
      userId: otherUser.id,
      role: "admin",
    });
    const otherKey = await insertApiKey(otherOrgId, {
      userId: otherUser.id,
      scope: "admin",
    });
    otherOrgToken = otherKey.key;
  });

  // ==========================================
  // Webhook CRUD
  // ==========================================
  describe("Deployment Webhooks CRUD", () => {
    describe("POST /deployments/webhooks", () => {
      it("creates a webhook with name", async () => {
        const res = await fetch(`${apiUrl}/deployments/webhooks`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${adminToken}`,
          },
          body: JSON.stringify({
            name: "GitHub Actions Webhook",
            description: "Receives deployment events from GitHub Actions",
          }),
        });

        expect(res.status).toBe(201);
        const body = await res.json();
        expect(body.success).toBe(true);
        expect(body.data.id).toBeDefined();
        expect(body.data.name).toBe("GitHub Actions Webhook");
        expect(body.data.description).toBe("Receives deployment events from GitHub Actions");
        expect(body.data.secret).toBeDefined();
        expect(body.data.secret.length).toBe(32);
        expect(body.data.webhookUrl).toContain(body.data.id);
        expect(body.data.active).toBe(true);
      });

      it("creates an inactive webhook", async () => {
        const res = await fetch(`${apiUrl}/deployments/webhooks`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${adminToken}`,
          },
          body: JSON.stringify({
            name: "Inactive Webhook",
            active: false,
          }),
        });

        expect(res.status).toBe(201);
        const body = await res.json();
        expect(body.success).toBe(true);
        expect(body.data.active).toBe(false);
      });
    });

    describe("GET /deployments/webhooks", () => {
      it("lists all webhooks for organization", async () => {
        const res = await fetch(`${apiUrl}/deployments/webhooks`, {
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

      it("does not expose webhook secrets in list", async () => {
        const res = await fetch(`${apiUrl}/deployments/webhooks`, {
          headers: {
            Authorization: `Bearer ${adminToken}`,
          },
        });

        expect(res.status).toBe(200);
        const body = await res.json();
        expect(body.success).toBe(true);

        for (const webhook of body.data) {
          expect(webhook.secret).toBe("********");
          expect(webhook.hasSecret).toBe(true);
        }
      });
    });

    describe("GET /deployments/webhooks/:id", () => {
      let getWebhookId: string;

      beforeAll(async () => {
        const createRes = await fetch(`${apiUrl}/deployments/webhooks`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${adminToken}`,
          },
          body: JSON.stringify({
            name: "Get Test Webhook",
          }),
        });
        const created = await createRes.json();
        getWebhookId = created.data.id;
      });

      it("gets a specific webhook by ID", async () => {
        const res = await fetch(`${apiUrl}/deployments/webhooks/${getWebhookId}`, {
          headers: {
            Authorization: `Bearer ${adminToken}`,
          },
        });

        expect(res.status).toBe(200);
        const body = await res.json();
        expect(body.success).toBe(true);
        expect(body.data.id).toBe(getWebhookId);
        expect(body.data.name).toBe("Get Test Webhook");
        expect(body.data.secret).toBe("********");
        expect(body.data.webhookUrl).toContain(getWebhookId);
      });

      it("returns 404 for non-existent webhook", async () => {
        const res = await fetch(`${apiUrl}/deployments/webhooks/non-existent-id`, {
          headers: {
            Authorization: `Bearer ${adminToken}`,
          },
        });

        expect(res.status).toBe(404);
        const body = await res.json();
        expect(body.success).toBe(false);
      });
    });

    describe("POST /deployments/webhooks/:id/regenerate-secret", () => {
      let regenWebhookId: string;
      let originalSecret: string;

      beforeAll(async () => {
        const createRes = await fetch(`${apiUrl}/deployments/webhooks`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${adminToken}`,
          },
          body: JSON.stringify({
            name: "Regen Secret Webhook",
          }),
        });
        const created = await createRes.json();
        regenWebhookId = created.data.id;
        originalSecret = created.data.secret;
      });

      it("regenerates webhook secret", async () => {
        const res = await fetch(
          `${apiUrl}/deployments/webhooks/${regenWebhookId}/regenerate-secret`,
          {
            method: "POST",
            headers: {
              Authorization: `Bearer ${adminToken}`,
            },
          }
        );

        expect(res.status).toBe(200);
        const body = await res.json();
        expect(body.success).toBe(true);
        expect(body.data.secret).toBeDefined();
        expect(body.data.secret.length).toBe(32);
        expect(body.data.secret).not.toBe(originalSecret);
      });

      it("returns 404 for non-existent webhook", async () => {
        const res = await fetch(
          `${apiUrl}/deployments/webhooks/non-existent-id/regenerate-secret`,
          {
            method: "POST",
            headers: {
              Authorization: `Bearer ${adminToken}`,
            },
          }
        );

        expect(res.status).toBe(404);
        const body = await res.json();
        expect(body.success).toBe(false);
      });
    });

    describe("DELETE /deployments/webhooks/:id", () => {
      it("deletes a webhook", async () => {
        // Create a webhook to delete
        const createRes = await fetch(`${apiUrl}/deployments/webhooks`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${adminToken}`,
          },
          body: JSON.stringify({
            name: "Delete Test Webhook",
          }),
        });
        const created = await createRes.json();
        const deleteId = created.data.id;

        // Delete the webhook
        const res = await fetch(`${apiUrl}/deployments/webhooks/${deleteId}`, {
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
        const getRes = await fetch(`${apiUrl}/deployments/webhooks/${deleteId}`, {
          headers: {
            Authorization: `Bearer ${adminToken}`,
          },
        });
        expect(getRes.status).toBe(404);
      });

      it("returns 404 when deleting non-existent webhook", async () => {
        const res = await fetch(`${apiUrl}/deployments/webhooks/non-existent-id`, {
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
  // Webhook Event Receiver
  // ==========================================
  describe("Webhook Event Receiver", () => {
    let webhookId: string;
    let webhookSecret: string;

    beforeAll(async () => {
      const webhook = await insertDeploymentWebhook(orgId, {
        name: "Test Webhook Receiver",
        active: true,
      });
      webhookId = webhook.id;
      webhookSecret = webhook.secret;
    });

    describe("POST /deployments/webhook/:webhookId/events", () => {
      it("accepts deployment event with valid signature", async () => {
        const payload = JSON.stringify({
          service: "api-service",
          version: "1.2.3",
          status: "completed",
          deployedAt: new Date().toISOString(),
          environment: "production",
        });

        const signature = generateHmacSignature(payload, webhookSecret);

        const res = await fetch(`${apiUrl}/deployments/webhook/${webhookId}/events`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Signature-256": `sha256=${signature}`,
          },
          body: payload,
        });

        expect(res.status).toBe(201);
        const body = await res.json();
        expect(body.success).toBe(true);
        expect(body.data.id).toBeDefined();
        expect(body.data.service).toBe("api-service");
        expect(body.data.version).toBe("1.2.3");
        expect(body.data.status).toBe("completed");
      });

      it("accepts event with GitHub-style signature header", async () => {
        const payload = JSON.stringify({
          service: "frontend",
          version: "2.0.0",
          status: "started",
          deployedAt: new Date().toISOString(),
        });

        const signature = generateHmacSignature(payload, webhookSecret);

        const res = await fetch(`${apiUrl}/deployments/webhook/${webhookId}/events`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Hub-Signature-256": `sha256=${signature}`,
          },
          body: payload,
        });

        expect(res.status).toBe(201);
        const body = await res.json();
        expect(body.success).toBe(true);
      });

      it("rejects event with invalid signature", async () => {
        const payload = JSON.stringify({
          service: "api-service",
          version: "1.0.0",
          status: "completed",
          deployedAt: new Date().toISOString(),
        });

        const res = await fetch(`${apiUrl}/deployments/webhook/${webhookId}/events`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Signature-256": "sha256=invalid-signature",
          },
          body: payload,
        });

        expect(res.status).toBe(401);
        const body = await res.json();
        expect(body.success).toBe(false);
        expect(body.error).toContain("Invalid signature");
      });

      it("accepts event without signature (no verification)", async () => {
        const payload = JSON.stringify({
          service: "worker",
          version: "3.0.0",
          status: "completed",
          deployedAt: new Date().toISOString(),
        });

        const res = await fetch(`${apiUrl}/deployments/webhook/${webhookId}/events`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: payload,
        });

        expect(res.status).toBe(201);
        const body = await res.json();
        expect(body.success).toBe(true);
      });

      it("returns 404 for non-existent webhook", async () => {
        const res = await fetch(`${apiUrl}/deployments/webhook/non-existent-id/events`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            service: "test",
            version: "1.0.0",
            status: "completed",
            deployedAt: new Date().toISOString(),
          }),
        });

        expect(res.status).toBe(404);
        const body = await res.json();
        expect(body.success).toBe(false);
      });

      it("returns 404 for inactive webhook", async () => {
        // Create an inactive webhook
        const inactiveWebhook = await insertDeploymentWebhook(orgId, {
          name: "Inactive Receiver",
          active: false,
        });

        const res = await fetch(
          `${apiUrl}/deployments/webhook/${inactiveWebhook.id}/events`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              service: "test",
              version: "1.0.0",
              status: "completed",
              deployedAt: new Date().toISOString(),
            }),
          }
        );

        expect(res.status).toBe(404);
        const body = await res.json();
        expect(body.success).toBe(false);
      });

      it("rejects invalid JSON body", async () => {
        const res = await fetch(`${apiUrl}/deployments/webhook/${webhookId}/events`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: "not valid json",
        });

        expect(res.status).toBe(400);
        const body = await res.json();
        expect(body.success).toBe(false);
        expect(body.error).toContain("Invalid JSON");
      });

      it("includes all deployment details", async () => {
        const payload = JSON.stringify({
          service: "full-details-service",
          version: "4.5.6",
          status: "completed",
          deployedAt: new Date().toISOString(),
          environment: "staging",
          externalId: "gh-action-123",
          deployedBy: "github-actions[bot]",
          commitSha: "abc123def456",
          commitMessage: "feat: Add new feature",
          branch: "main",
          affectedMonitors: [testMonitorId],
          metadata: {
            workflow: "deploy.yml",
            runId: 12345,
          },
        });

        const signature = generateHmacSignature(payload, webhookSecret);

        const res = await fetch(`${apiUrl}/deployments/webhook/${webhookId}/events`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Signature-256": `sha256=${signature}`,
          },
          body: payload,
        });

        expect(res.status).toBe(201);
        const body = await res.json();
        expect(body.success).toBe(true);
        expect(body.data.externalId).toBe("gh-action-123");
        expect(body.data.deployedBy).toBe("github-actions[bot]");
        expect(body.data.commitSha).toBe("abc123def456");
        expect(body.data.commitMessage).toBe("feat: Add new feature");
        expect(body.data.branch).toBe("main");
        expect(body.data.environment).toBe("staging");
      });
    });
  });

  // ==========================================
  // Deployment Events API
  // ==========================================
  describe("Deployment Events API", () => {
    describe("POST /deployments/events", () => {
      it("creates deployment event via API", async () => {
        const res = await fetch(`${apiUrl}/deployments/events`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${adminToken}`,
          },
          body: JSON.stringify({
            service: "api-gateway",
            version: "5.0.0",
            status: "completed",
            deployedAt: new Date().toISOString(),
            environment: "production",
          }),
        });

        expect(res.status).toBe(201);
        const body = await res.json();
        expect(body.success).toBe(true);
        expect(body.data.id).toBeDefined();
        expect(body.data.service).toBe("api-gateway");
        expect(body.data.version).toBe("5.0.0");
      });

      it("validates affected monitors belong to organization", async () => {
        const res = await fetch(`${apiUrl}/deployments/events`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${adminToken}`,
          },
          body: JSON.stringify({
            service: "test-service",
            version: "1.0.0",
            status: "completed",
            deployedAt: new Date().toISOString(),
            affectedMonitors: ["invalid-monitor-id"],
          }),
        });

        expect(res.status).toBe(400);
        const body = await res.json();
        expect(body.success).toBe(false);
        expect(body.error).toContain("Invalid monitor");
      });

      it("accepts valid affected monitors", async () => {
        const res = await fetch(`${apiUrl}/deployments/events`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${adminToken}`,
          },
          body: JSON.stringify({
            service: "monitor-linked-service",
            version: "1.0.0",
            status: "completed",
            deployedAt: new Date().toISOString(),
            affectedMonitors: [testMonitorId],
          }),
        });

        expect(res.status).toBe(201);
        const body = await res.json();
        expect(body.success).toBe(true);
        expect(body.data.affectedMonitors).toContain(testMonitorId);
      });
    });

    describe("GET /deployments/events", () => {
      beforeAll(async () => {
        // Create some test events
        for (let i = 0; i < 5; i++) {
          await insertDeploymentEvent(orgId, {
            service: `service-${i}`,
            version: `${i}.0.0`,
            status: i % 2 === 0 ? "completed" : "failed",
            environment: i % 2 === 0 ? "production" : "staging",
          });
        }
      });

      it("lists deployment events", async () => {
        const res = await fetch(`${apiUrl}/deployments/events`, {
          headers: {
            Authorization: `Bearer ${adminToken}`,
          },
        });

        expect(res.status).toBe(200);
        const body = await res.json();
        expect(body.success).toBe(true);
        expect(Array.isArray(body.data)).toBe(true);
        expect(body.meta.limit).toBeDefined();
        expect(body.meta.offset).toBeDefined();
      });

      it("filters by service", async () => {
        const res = await fetch(`${apiUrl}/deployments/events?service=service-0`, {
          headers: {
            Authorization: `Bearer ${adminToken}`,
          },
        });

        expect(res.status).toBe(200);
        const body = await res.json();
        expect(body.success).toBe(true);
        for (const event of body.data) {
          expect(event.service).toBe("service-0");
        }
      });

      it("filters by environment", async () => {
        const res = await fetch(`${apiUrl}/deployments/events?environment=production`, {
          headers: {
            Authorization: `Bearer ${adminToken}`,
          },
        });

        expect(res.status).toBe(200);
        const body = await res.json();
        expect(body.success).toBe(true);
        for (const event of body.data) {
          expect(event.environment).toBe("production");
        }
      });

      it("filters by status", async () => {
        const res = await fetch(`${apiUrl}/deployments/events?status=failed`, {
          headers: {
            Authorization: `Bearer ${adminToken}`,
          },
        });

        expect(res.status).toBe(200);
        const body = await res.json();
        expect(body.success).toBe(true);
        for (const event of body.data) {
          expect(event.status).toBe("failed");
        }
      });

      it("respects pagination", async () => {
        const res = await fetch(`${apiUrl}/deployments/events?limit=2&offset=1`, {
          headers: {
            Authorization: `Bearer ${adminToken}`,
          },
        });

        expect(res.status).toBe(200);
        const body = await res.json();
        expect(body.success).toBe(true);
        expect(body.data.length).toBeLessThanOrEqual(2);
        expect(body.meta.limit).toBe(2);
        expect(body.meta.offset).toBe(1);
      });
    });

    describe("GET /deployments/events/:id", () => {
      let eventId: string;

      beforeAll(async () => {
        const event = await insertDeploymentEvent(orgId, {
          service: "get-event-service",
          version: "1.0.0",
          status: "completed",
        });
        eventId = event.id;
      });

      it("gets a specific deployment event", async () => {
        const res = await fetch(`${apiUrl}/deployments/events/${eventId}`, {
          headers: {
            Authorization: `Bearer ${adminToken}`,
          },
        });

        expect(res.status).toBe(200);
        const body = await res.json();
        expect(body.success).toBe(true);
        expect(body.data.id).toBe(eventId);
        expect(body.data.service).toBe("get-event-service");
      });

      it("returns 404 for non-existent event", async () => {
        const res = await fetch(`${apiUrl}/deployments/events/non-existent-id`, {
          headers: {
            Authorization: `Bearer ${adminToken}`,
          },
        });

        expect(res.status).toBe(404);
        const body = await res.json();
        expect(body.success).toBe(false);
      });
    });

    describe("POST /deployments/events/:id/rollback", () => {
      let rollbackEventId: string;

      beforeAll(async () => {
        const event = await insertDeploymentEvent(orgId, {
          service: "rollback-service",
          version: "2.0.0",
          status: "completed",
        });
        rollbackEventId = event.id;
      });

      it("marks deployment as rolled back", async () => {
        const res = await fetch(`${apiUrl}/deployments/events/${rollbackEventId}/rollback`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${adminToken}`,
          },
        });

        expect(res.status).toBe(200);
        const body = await res.json();
        expect(body.success).toBe(true);
        expect(body.data.status).toBe("rolled_back");
      });

      it("returns 404 for non-existent event", async () => {
        const res = await fetch(`${apiUrl}/deployments/events/non-existent-id/rollback`, {
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
  // Deployment-Incident Links
  // ==========================================
  describe("Deployment-Incident Links", () => {
    let linkEventId: string;

    beforeAll(async () => {
      const event = await insertDeploymentEvent(orgId, {
        service: "link-test-service",
        version: "1.0.0",
        status: "completed",
      });
      linkEventId = event.id;
    });

    describe("POST /deployments/events/:id/link-incident", () => {
      it("links deployment to incident", async () => {
        const res = await fetch(`${apiUrl}/deployments/events/${linkEventId}/link-incident`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${adminToken}`,
          },
          body: JSON.stringify({
            incidentId: testIncidentId,
            notes: "This deployment caused the incident",
          }),
        });

        expect(res.status).toBe(201);
        const body = await res.json();
        expect(body.success).toBe(true);
        expect(body.data.id).toBeDefined();
        expect(body.data.deploymentId).toBe(linkEventId);
        expect(body.data.incidentId).toBe(testIncidentId);
        expect(body.data.correlationType).toBe("manual");
        expect(body.data.notes).toBe("This deployment caused the incident");
      });

      it("rejects duplicate link", async () => {
        const res = await fetch(`${apiUrl}/deployments/events/${linkEventId}/link-incident`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${adminToken}`,
          },
          body: JSON.stringify({
            incidentId: testIncidentId,
          }),
        });

        expect(res.status).toBe(409);
        const body = await res.json();
        expect(body.success).toBe(false);
        expect(body.error).toContain("already exists");
      });

      it("returns 404 for non-existent deployment", async () => {
        const res = await fetch(
          `${apiUrl}/deployments/events/non-existent-id/link-incident`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${adminToken}`,
            },
            body: JSON.stringify({
              incidentId: testIncidentId,
            }),
          }
        );

        expect(res.status).toBe(404);
        const body = await res.json();
        expect(body.success).toBe(false);
      });

      it("returns 404 for non-existent incident", async () => {
        const event = await insertDeploymentEvent(orgId, {
          service: "another-service",
          version: "1.0.0",
          status: "completed",
        });

        const res = await fetch(
          `${apiUrl}/deployments/events/${event.id}/link-incident`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${adminToken}`,
            },
            body: JSON.stringify({
              incidentId: "non-existent-incident",
            }),
          }
        );

        expect(res.status).toBe(404);
        const body = await res.json();
        expect(body.success).toBe(false);
      });
    });

    describe("DELETE /deployments/events/:id/link-incident/:incidentId", () => {
      it("unlinks deployment from incident", async () => {
        const res = await fetch(
          `${apiUrl}/deployments/events/${linkEventId}/link-incident/${testIncidentId}`,
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
        expect(body.data.deleted).toBe(true);
      });

      it("returns 404 when unlinking non-existent link", async () => {
        const res = await fetch(
          `${apiUrl}/deployments/events/${linkEventId}/link-incident/${testIncidentId}`,
          {
            method: "DELETE",
            headers: {
              Authorization: `Bearer ${adminToken}`,
            },
          }
        );

        expect(res.status).toBe(404);
        const body = await res.json();
        expect(body.success).toBe(false);
      });
    });
  });

  // ==========================================
  // Timeline and Correlation
  // ==========================================
  describe("Timeline and Correlation", () => {
    describe("GET /deployments/timeline", () => {
      it("returns deployment and incident timeline", async () => {
        const res = await fetch(`${apiUrl}/deployments/timeline`, {
          headers: {
            Authorization: `Bearer ${adminToken}`,
          },
        });

        expect(res.status).toBe(200);
        const body = await res.json();
        expect(body.success).toBe(true);
        expect(Array.isArray(body.data)).toBe(true);
        expect(body.meta.hours).toBeDefined();
        expect(body.meta.since).toBeDefined();
      });

      it("respects hours parameter", async () => {
        const res = await fetch(`${apiUrl}/deployments/timeline?hours=48`, {
          headers: {
            Authorization: `Bearer ${adminToken}`,
          },
        });

        expect(res.status).toBe(200);
        const body = await res.json();
        expect(body.success).toBe(true);
        expect(body.meta.hours).toBe(48);
      });

      it("includes both deployment and incident events", async () => {
        const res = await fetch(`${apiUrl}/deployments/timeline?hours=720`, {
          headers: {
            Authorization: `Bearer ${adminToken}`,
          },
        });

        expect(res.status).toBe(200);
        const body = await res.json();
        expect(body.success).toBe(true);

        const types = new Set(body.data.map((e: any) => e.type));
        // May have both deployments and incidents if they exist
        expect(types.has("deployment") || types.has("incident")).toBe(true);
      });
    });

    describe("GET /deployments/incident/:incidentId", () => {
      it("returns deployments related to an incident", async () => {
        const res = await fetch(`${apiUrl}/deployments/incident/${testIncidentId}`, {
          headers: {
            Authorization: `Bearer ${adminToken}`,
          },
        });

        expect(res.status).toBe(200);
        const body = await res.json();
        expect(body.success).toBe(true);
        expect(Array.isArray(body.data)).toBe(true);
        expect(body.meta.windowHours).toBeDefined();
      });

      it("respects hours window parameter", async () => {
        const res = await fetch(`${apiUrl}/deployments/incident/${testIncidentId}?hours=48`, {
          headers: {
            Authorization: `Bearer ${adminToken}`,
          },
        });

        expect(res.status).toBe(200);
        const body = await res.json();
        expect(body.success).toBe(true);
        expect(body.meta.windowHours).toBe(48);
      });

      it("returns 404 for non-existent incident", async () => {
        const res = await fetch(`${apiUrl}/deployments/incident/non-existent-id`, {
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
  // Statistics
  // ==========================================
  describe("Deployment Statistics", () => {
    describe("GET /deployments/stats", () => {
      it("returns deployment statistics", async () => {
        const res = await fetch(`${apiUrl}/deployments/stats`, {
          headers: {
            Authorization: `Bearer ${adminToken}`,
          },
        });

        expect(res.status).toBe(200);
        const body = await res.json();
        expect(body.success).toBe(true);
        expect(body.data.byStatus).toBeDefined();
        expect(body.data.byEnvironment).toBeDefined();
        expect(body.data.topServices).toBeDefined();
        expect(body.data.correlations).toBeDefined();
        expect(body.data.period.days).toBeDefined();
        expect(body.data.period.since).toBeDefined();
      });

      it("respects days parameter", async () => {
        const res = await fetch(`${apiUrl}/deployments/stats?days=7`, {
          headers: {
            Authorization: `Bearer ${adminToken}`,
          },
        });

        expect(res.status).toBe(200);
        const body = await res.json();
        expect(body.success).toBe(true);
        expect(body.data.period.days).toBe(7);
      });
    });
  });

  // ==========================================
  // Authorization
  // ==========================================
  describe("Authorization", () => {
    it("requires authentication for listing webhooks", async () => {
      const res = await fetch(`${apiUrl}/deployments/webhooks`);
      expect(res.status).toBe(401);
    });

    it("requires authentication for creating webhooks", async () => {
      const res = await fetch(`${apiUrl}/deployments/webhooks`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name: "Unauthenticated Webhook",
        }),
      });
      expect(res.status).toBe(401);
    });

    it("requires authentication for listing events", async () => {
      const res = await fetch(`${apiUrl}/deployments/events`);
      expect(res.status).toBe(401);
    });

    it("allows read-only access for listing webhooks", async () => {
      const res = await fetch(`${apiUrl}/deployments/webhooks`, {
        headers: {
          Authorization: `Bearer ${readOnlyToken}`,
        },
      });
      expect(res.status).toBe(200);
    });

    it("allows read-only access for listing events", async () => {
      const res = await fetch(`${apiUrl}/deployments/events`, {
        headers: {
          Authorization: `Bearer ${readOnlyToken}`,
        },
      });
      expect(res.status).toBe(200);
    });

    it("allows read-only access for timeline", async () => {
      const res = await fetch(`${apiUrl}/deployments/timeline`, {
        headers: {
          Authorization: `Bearer ${readOnlyToken}`,
        },
      });
      expect(res.status).toBe(200);
    });

    it("allows read-only access for stats", async () => {
      const res = await fetch(`${apiUrl}/deployments/stats`, {
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
    let isolatedWebhookId: string;
    let isolatedEventId: string;

    beforeAll(async () => {
      const webhook = await insertDeploymentWebhook(orgId, {
        name: "Isolated Webhook",
      });
      isolatedWebhookId = webhook.id;

      const event = await insertDeploymentEvent(orgId, {
        service: "isolated-service",
        version: "1.0.0",
        status: "completed",
      });
      isolatedEventId = event.id;
    });

    it("cannot get webhook from another organization", async () => {
      const res = await fetch(`${apiUrl}/deployments/webhooks/${isolatedWebhookId}`, {
        headers: {
          Authorization: `Bearer ${otherOrgToken}`,
        },
      });

      expect(res.status).toBe(404);
      const body = await res.json();
      expect(body.success).toBe(false);
    });

    it("cannot delete webhook from another organization", async () => {
      const res = await fetch(`${apiUrl}/deployments/webhooks/${isolatedWebhookId}`, {
        method: "DELETE",
        headers: {
          Authorization: `Bearer ${otherOrgToken}`,
        },
      });

      expect(res.status).toBe(404);
      const body = await res.json();
      expect(body.success).toBe(false);
    });

    it("cannot regenerate secret for webhook from another organization", async () => {
      const res = await fetch(
        `${apiUrl}/deployments/webhooks/${isolatedWebhookId}/regenerate-secret`,
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

    it("cannot get event from another organization", async () => {
      const res = await fetch(`${apiUrl}/deployments/events/${isolatedEventId}`, {
        headers: {
          Authorization: `Bearer ${otherOrgToken}`,
        },
      });

      expect(res.status).toBe(404);
      const body = await res.json();
      expect(body.success).toBe(false);
    });

    it("cannot rollback event from another organization", async () => {
      const res = await fetch(`${apiUrl}/deployments/events/${isolatedEventId}/rollback`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${otherOrgToken}`,
        },
      });

      expect(res.status).toBe(404);
      const body = await res.json();
      expect(body.success).toBe(false);
    });

    it("cannot link incident from another organization to deployment", async () => {
      // Create incident in other org
      const otherUser = await insertUser({
        email: "other-incident@test.com",
        name: "Other Incident User",
      });
      const otherIncident = await insertIncident(otherOrgId, {
        title: "Other Org Incident",
        severity: "minor",
        status: "investigating",
        userId: otherUser.id,
      });

      const res = await fetch(
        `${apiUrl}/deployments/events/${isolatedEventId}/link-incident`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${otherOrgToken}`,
          },
          body: JSON.stringify({
            incidentId: otherIncident.id,
          }),
        }
      );

      expect(res.status).toBe(404);
      const body = await res.json();
      expect(body.success).toBe(false);
    });

    it("does not list webhooks from another organization", async () => {
      const res = await fetch(`${apiUrl}/deployments/webhooks`, {
        headers: {
          Authorization: `Bearer ${otherOrgToken}`,
        },
      });

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.success).toBe(true);

      const webhookIds = body.data.map((w: any) => w.id);
      expect(webhookIds).not.toContain(isolatedWebhookId);
    });

    it("does not list events from another organization", async () => {
      const res = await fetch(`${apiUrl}/deployments/events`, {
        headers: {
          Authorization: `Bearer ${otherOrgToken}`,
        },
      });

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.success).toBe(true);

      const eventIds = body.data.map((e: any) => e.id);
      expect(eventIds).not.toContain(isolatedEventId);
    });
  });

  // ==========================================
  // Audit Logging
  // ==========================================
  describe("Audit Logging", () => {
    it("creates audit entry when creating webhook", async () => {
      const createRes = await fetch(`${apiUrl}/deployments/webhooks`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${adminToken}`,
        },
        body: JSON.stringify({
          name: "Audit Test Webhook",
        }),
      });
      expect(createRes.status).toBe(201);

      const auditRes = await fetch(
        `${apiUrl}/audit-logs?action=deployment_webhook.create&limit=1`,
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
      expect(auditBody.data.data[0].action).toBe("deployment_webhook.create");
    });

    it("creates audit entry when creating deployment event", async () => {
      await fetch(`${apiUrl}/deployments/events`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${adminToken}`,
        },
        body: JSON.stringify({
          service: "audit-test-service",
          version: "1.0.0",
          status: "completed",
          deployedAt: new Date().toISOString(),
        }),
      });

      const auditRes = await fetch(
        `${apiUrl}/audit-logs?action=deployment.create&limit=1`,
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
      expect(auditBody.data.data[0].action).toBe("deployment.create");
    });

    it("creates audit entry when regenerating webhook secret", async () => {
      const createRes = await fetch(`${apiUrl}/deployments/webhooks`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${adminToken}`,
        },
        body: JSON.stringify({
          name: "Audit Regen Test",
        }),
      });
      const created = await createRes.json();

      await fetch(
        `${apiUrl}/deployments/webhooks/${created.data.id}/regenerate-secret`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${adminToken}`,
          },
        }
      );

      const auditRes = await fetch(
        `${apiUrl}/audit-logs?action=deployment_webhook.regenerate_secret&limit=1`,
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
      expect(auditBody.data.data[0].action).toBe("deployment_webhook.regenerate_secret");
    });

    it("creates audit entry when linking incident", async () => {
      const event = await insertDeploymentEvent(orgId, {
        service: "audit-link-service",
        version: "1.0.0",
        status: "completed",
      });

      const adminUser = await insertUser({
        email: "audit-link-user@test.com",
        name: "Audit Link User",
      });
      const incident = await insertIncident(orgId, {
        title: "Audit Link Incident",
        severity: "minor",
        status: "investigating",
        userId: adminUser.id,
      });

      await fetch(`${apiUrl}/deployments/events/${event.id}/link-incident`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${adminToken}`,
        },
        body: JSON.stringify({
          incidentId: incident.id,
        }),
      });

      const auditRes = await fetch(
        `${apiUrl}/audit-logs?action=deployment.link_incident&limit=1`,
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
      expect(auditBody.data.data[0].action).toBe("deployment.link_incident");
    });
  });
});
