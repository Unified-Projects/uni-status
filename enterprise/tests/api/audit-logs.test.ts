/**
 * Audit Logs Tests
 *
 * Tests for audit logging functionality across organization operations:
 * - Organization create/update/delete
 * - Member invitations
 * - API key create/delete
 * - Settings updates (integrations, credentials)
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

// Helper to fetch audit logs for an organization
async function getAuditLogs(organizationId: string, action?: string) {
  let query = `SELECT * FROM audit_logs WHERE organization_id = $1`;
  const params: string[] = [organizationId];

  if (action) {
    query += ` AND action = $2`;
    params.push(action);
  }

  query += ` ORDER BY created_at DESC`;

  const result = await dbClient.query(query, params);
  return result.rows;
}

describe("Audit Logs", () => {
  describe("Organization Operations", () => {
    it("logs organization creation", async () => {
      const slug = `audit-test-${randomUUID().slice(0, 8).toLowerCase()}`;

      // Create organization
      const createResponse = await fetch(`${API_URL}/organizations`, {
        method: "POST",
        headers: ctx.headers,
        body: JSON.stringify({
          name: "Audit Test Org",
          slug,
        }),
      });

      expect(createResponse.status).toBe(201);
      const { data: org } = await createResponse.json();

      // Check audit log was created
      const logs = await getAuditLogs(org.id, "organization.create");
      expect(logs.length).toBeGreaterThan(0);

      const log = logs[0];
      expect(log.action).toBe("organization.create");
      expect(log.resource_type).toBe("organization");
      expect(log.resource_id).toBe(org.id);
      expect(log.resource_name).toBe("Audit Test Org");
    });

    it("logs organization update", async () => {
      // Update the test organization
      const updateResponse = await fetch(`${API_URL}/organizations/${ctx.organizationId}`, {
        method: "PATCH",
        headers: ctx.headers,
        body: JSON.stringify({
          name: "Updated Org Name",
        }),
      });

      expect(updateResponse.status).toBe(200);

      // Check audit log
      const logs = await getAuditLogs(ctx.organizationId, "organization.update");
      expect(logs.length).toBeGreaterThan(0);

      const log = logs[0];
      expect(log.action).toBe("organization.update");
      expect(log.resource_type).toBe("organization");
      expect(log.metadata).toBeDefined();
    });
  });

  describe("Member Operations", () => {
    it("logs member invitation", async () => {
      const email = `invite-${randomUUID().slice(0, 8)}@example.com`;

      const inviteResponse = await fetch(`${API_URL}/organizations/${ctx.organizationId}/invitations`, {
        method: "POST",
        headers: ctx.headers,
        body: JSON.stringify({
          email,
          role: "member",
        }),
      });

      expect(inviteResponse.status).toBe(201);

      // Check audit log
      const logs = await getAuditLogs(ctx.organizationId, "organization.member_invite");
      expect(logs.length).toBeGreaterThan(0);

      const log = logs[0];
      expect(log.action).toBe("organization.member_invite");
      expect(log.resource_name).toBe(email);
      expect(log.metadata.after.email).toBe(email);
      expect(log.metadata.after.role).toBe("member");
    });
  });

  describe("API Key Operations", () => {
    let testKeyId: string;

    it("logs API key creation", async () => {
      const createResponse = await fetch(`${API_URL}/organizations/${ctx.organizationId}/api-keys`, {
        method: "POST",
        headers: ctx.headers,
        body: JSON.stringify({
          name: "Audit Test Key",
          scopes: ["read"],
        }),
      });

      expect(createResponse.status).toBe(201);
      const { data: key } = await createResponse.json();
      testKeyId = key.id;

      // Check audit log
      const logs = await getAuditLogs(ctx.organizationId, "api_key.create");
      expect(logs.length).toBeGreaterThan(0);

      const log = logs[0];
      expect(log.action).toBe("api_key.create");
      expect(log.resource_type).toBe("api_key");
      expect(log.resource_id).toBe(testKeyId);
      expect(log.resource_name).toBe("Audit Test Key");
    });

    it("logs API key deletion", async () => {
      // Delete the key
      const deleteResponse = await fetch(`${API_URL}/organizations/${ctx.organizationId}/api-keys/${testKeyId}`, {
        method: "DELETE",
        headers: ctx.headers,
      });

      expect(deleteResponse.status).toBe(200);

      // Check audit log
      const logs = await getAuditLogs(ctx.organizationId, "api_key.delete");
      expect(logs.length).toBeGreaterThan(0);

      const log = logs[0];
      expect(log.action).toBe("api_key.delete");
      expect(log.resource_type).toBe("api_key");
      expect(log.resource_id).toBe(testKeyId);
    });
  });

  describe("Settings Operations", () => {
    it("logs integrations update", async () => {
      const updateResponse = await fetch(`${API_URL}/organizations/${ctx.organizationId}/integrations`, {
        method: "PATCH",
        headers: ctx.headers,
        body: JSON.stringify({
          pagespeed: {
            enabled: true,
          },
        }),
      });

      expect(updateResponse.status).toBe(200);

      // Check audit log
      const logs = await getAuditLogs(ctx.organizationId, "settings.update");
      const integrationLogs = logs.filter(l => l.resource_name === "Integrations");
      expect(integrationLogs.length).toBeGreaterThan(0);

      const log = integrationLogs[0];
      expect(log.action).toBe("settings.update");
      expect(log.resource_type).toBe("organization");
    });

    it("logs credentials update", async () => {
      const updateResponse = await fetch(`${API_URL}/organizations/${ctx.organizationId}/credentials`, {
        method: "PATCH",
        headers: ctx.headers,
        body: JSON.stringify({
          smtp: {
            host: "smtp.example.com",
            port: 587,
            fromAddress: "noreply@example.com",
            enabled: true,
          },
        }),
      });

      expect(updateResponse.status).toBe(200);

      // Check audit log
      const logs = await getAuditLogs(ctx.organizationId, "settings.update");
      const credentialLogs = logs.filter(l => l.resource_name === "Credentials");
      expect(credentialLogs.length).toBeGreaterThan(0);

      const log = credentialLogs[0];
      expect(log.action).toBe("settings.update");
      expect(log.metadata.after.updatedCredentialTypes).toContain("smtp");
    });
  });
});
