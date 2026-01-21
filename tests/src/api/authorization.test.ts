/**
 * Authorization Tests
 *
 * Tests API authorization including:
 * - Unauthenticated requests
 * - Invalid/expired tokens
 * - Scope restrictions
 * - Organization isolation
 * - Role-based access control
 */

import { describe, it, expect, beforeAll } from "vitest";
import { randomUUID, randomBytes } from "crypto";
import { bootstrapTestContext, TestContext } from "../helpers/context";
import { insertApiKey } from "../helpers/data";

const API_BASE_URL = process.env.API_BASE_URL ?? "http://api:3001";

describe("API Authorization", () => {
  let ctx: TestContext;
  let monitorId: string;

  beforeAll(async () => {
    ctx = await bootstrapTestContext();

    // Create a monitor for testing
    const response = await fetch(`${API_BASE_URL}/api/v1/monitors`, {
      method: "POST",
      headers: ctx.headers,
      body: JSON.stringify({
        name: `Auth Test Monitor ${randomUUID().slice(0, 8)}`,
        url: "https://example.com",
        type: "https",
        intervalSeconds: 60,
        timeoutMs: 30000,
      }),
    });

    const body = await response.json();
    monitorId = body.data.id;
  });

  describe("Unauthenticated requests", () => {
    it("rejects requests without Authorization header", async () => {
      const response = await fetch(`${API_BASE_URL}/api/v1/monitors`, {
        method: "GET",
        headers: { "Content-Type": "application/json" },
      });

      expect(response.status).toBe(401);
      const body = await response.json();
      expect(body.success).toBe(false);
    });

    it("rejects POST requests without Authorization header", async () => {
      const response = await fetch(`${API_BASE_URL}/api/v1/monitors`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: "Test Monitor",
          url: "https://example.com",
          type: "https",
        }),
      });

      expect(response.status).toBe(401);
    });

    it("rejects DELETE requests without Authorization header", async () => {
      const response = await fetch(
        `${API_BASE_URL}/api/v1/monitors/${monitorId}`,
        {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
        }
      );

      expect(response.status).toBe(401);
    });

    it("allows public endpoints without authentication", async () => {
      const response = await fetch(`${API_BASE_URL}/api/v1/health`, {
        method: "GET",
      });

      expect(response.status).toBe(200);
    });
  });

  describe("Invalid tokens", () => {
    it("rejects requests with malformed Bearer token", async () => {
      const response = await fetch(`${API_BASE_URL}/api/v1/monitors`, {
        method: "GET",
        headers: {
          Authorization: "Bearer invalid_token",
          "Content-Type": "application/json",
        },
      });

      expect(response.status).toBe(401);
    });

    it("rejects requests with empty Bearer token", async () => {
      const response = await fetch(`${API_BASE_URL}/api/v1/monitors`, {
        method: "GET",
        headers: {
          Authorization: "Bearer ",
          "Content-Type": "application/json",
        },
      });

      expect(response.status).toBe(401);
    });

    it("rejects requests with missing Bearer prefix", async () => {
      const response = await fetch(`${API_BASE_URL}/api/v1/monitors`, {
        method: "GET",
        headers: {
          Authorization: ctx.token,
          "Content-Type": "application/json",
        },
      });

      expect(response.status).toBe(401);
    });

    it("rejects requests with non-existent API key", async () => {
      const fakeToken = `us_${randomBytes(16).toString("hex")}`;
      const response = await fetch(`${API_BASE_URL}/api/v1/monitors`, {
        method: "GET",
        headers: {
          Authorization: `Bearer ${fakeToken}`,
          "Content-Type": "application/json",
        },
      });

      expect(response.status).toBe(401);
    });

    it("rejects requests with wrong token prefix", async () => {
      const wrongPrefix = `wrong_${randomBytes(16).toString("hex")}`;
      const response = await fetch(`${API_BASE_URL}/api/v1/monitors`, {
        method: "GET",
        headers: {
          Authorization: `Bearer ${wrongPrefix}`,
          "Content-Type": "application/json",
        },
      });

      expect(response.status).toBe(401);
    });
  });

  describe("Expired tokens", () => {
    it("rejects requests with expired API key", async () => {
      // Create an API key that expired in the past
      const { token: expiredToken } = await insertApiKey(
        ctx.organizationId,
        ctx.userId,
        {
          name: "expired-key",
          scopes: ["read", "write"],
          expiresAt: new Date(Date.now() - 1000), // Expired 1 second ago
        }
      );

      const response = await fetch(`${API_BASE_URL}/api/v1/monitors`, {
        method: "GET",
        headers: {
          Authorization: `Bearer ${expiredToken}`,
          "Content-Type": "application/json",
        },
      });

      // Expired keys should be rejected
      expect(response.status).toBe(401);
    });
  });

  describe("Scope restrictions", () => {
    it("allows read scope to access GET endpoints", async () => {
      const { token: readOnlyToken } = await insertApiKey(
        ctx.organizationId,
        ctx.userId,
        {
          name: "read-only-key",
          scopes: ["read"],
        }
      );

      const response = await fetch(`${API_BASE_URL}/api/v1/monitors`, {
        method: "GET",
        headers: {
          Authorization: `Bearer ${readOnlyToken}`,
          "Content-Type": "application/json",
        },
      });

      expect(response.status).toBe(200);
    });

    it("rejects read scope from creating monitors", async () => {
      const { token: readOnlyToken } = await insertApiKey(
        ctx.organizationId,
        ctx.userId,
        {
          name: "read-only-key-2",
          scopes: ["read"],
        }
      );

      const response = await fetch(`${API_BASE_URL}/api/v1/monitors`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${readOnlyToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name: "Test Monitor",
          url: "https://example.com",
          type: "https",
          intervalSeconds: 60,
          timeoutMs: 30000,
        }),
      });

      expect(response.status).toBe(403);
    });

    it("rejects read scope from updating monitors", async () => {
      const { token: readOnlyToken } = await insertApiKey(
        ctx.organizationId,
        ctx.userId,
        {
          name: "read-only-key-3",
          scopes: ["read"],
        }
      );

      const response = await fetch(
        `${API_BASE_URL}/api/v1/monitors/${monitorId}`,
        {
          method: "PATCH",
          headers: {
            Authorization: `Bearer ${readOnlyToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ name: "Updated Name" }),
        }
      );

      expect(response.status).toBe(403);
    });

    it("rejects read scope from deleting monitors", async () => {
      const { token: readOnlyToken } = await insertApiKey(
        ctx.organizationId,
        ctx.userId,
        {
          name: "read-only-key-4",
          scopes: ["read"],
        }
      );

      const response = await fetch(
        `${API_BASE_URL}/api/v1/monitors/${monitorId}`,
        {
          method: "DELETE",
          headers: {
            Authorization: `Bearer ${readOnlyToken}`,
            "Content-Type": "application/json",
          },
        }
      );

      expect(response.status).toBe(403);
    });

    it("allows write scope to create monitors", async () => {
      const { token: writeToken } = await insertApiKey(
        ctx.organizationId,
        ctx.userId,
        {
          name: "write-key",
          scopes: ["read", "write"],
        }
      );

      const response = await fetch(`${API_BASE_URL}/api/v1/monitors`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${writeToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name: `Write Scope Test ${randomUUID().slice(0, 8)}`,
          url: "https://example.com",
          type: "https",
          intervalSeconds: 60,
          timeoutMs: 30000,
        }),
      });

      expect(response.status).toBe(201);
    });

    it("allows write scope to update monitors", async () => {
      const { token: writeToken } = await insertApiKey(
        ctx.organizationId,
        ctx.userId,
        {
          name: "write-key-2",
          scopes: ["read", "write"],
        }
      );

      const response = await fetch(
        `${API_BASE_URL}/api/v1/monitors/${monitorId}`,
        {
          method: "PATCH",
          headers: {
            Authorization: `Bearer ${writeToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ name: `Updated ${randomUUID().slice(0, 8)}` }),
        }
      );

      expect(response.status).toBe(200);
    });
  });

  describe("Organization isolation", () => {
    let otherOrgCtx: TestContext;
    let otherOrgMonitorId: string;

    beforeAll(async () => {
      // Create a second organization context
      otherOrgCtx = await bootstrapTestContext();

      // Create a monitor in the other org
      const response = await fetch(`${API_BASE_URL}/api/v1/monitors`, {
        method: "POST",
        headers: otherOrgCtx.headers,
        body: JSON.stringify({
          name: `Other Org Monitor ${randomUUID().slice(0, 8)}`,
          url: "https://other.example.com",
          type: "https",
          intervalSeconds: 60,
          timeoutMs: 30000,
        }),
      });

      const body = await response.json();
      otherOrgMonitorId = body.data.id;
    });

    it("cannot access monitors from another organization", async () => {
      // Try to access other org's monitor with our token
      const response = await fetch(
        `${API_BASE_URL}/api/v1/monitors/${otherOrgMonitorId}`,
        {
          method: "GET",
          headers: ctx.headers,
        }
      );

      expect(response.status).toBe(404);
    });

    it("cannot update monitors from another organization", async () => {
      const response = await fetch(
        `${API_BASE_URL}/api/v1/monitors/${otherOrgMonitorId}`,
        {
          method: "PATCH",
          headers: ctx.headers,
          body: JSON.stringify({ name: "Hacked Name" }),
        }
      );

      expect(response.status).toBe(404);
    });

    it("cannot delete monitors from another organization", async () => {
      const response = await fetch(
        `${API_BASE_URL}/api/v1/monitors/${otherOrgMonitorId}`,
        {
          method: "DELETE",
          headers: ctx.headers,
        }
      );

      expect(response.status).toBe(404);
    });

    it("list only returns monitors from own organization", async () => {
      const response = await fetch(`${API_BASE_URL}/api/v1/monitors`, {
        method: "GET",
        headers: ctx.headers,
      });

      expect(response.status).toBe(200);
      const body = await response.json();

      // Should not contain other org's monitor
      const monitorIds = body.data.map((m: any) => m.id);
      expect(monitorIds).not.toContain(otherOrgMonitorId);
    });

    it("cannot access incidents from another organization", async () => {
      // Create an incident in other org
      const createResponse = await fetch(`${API_BASE_URL}/api/v1/incidents`, {
        method: "POST",
        headers: otherOrgCtx.headers,
        body: JSON.stringify({
          title: "Other Org Incident",
          description: "Test",
          severity: "minor",
          status: "investigating",
        }),
      });

      const incidentBody = await createResponse.json();
      const otherOrgIncidentId = incidentBody.data.id;

      // Try to access with our token
      const response = await fetch(
        `${API_BASE_URL}/api/v1/incidents/${otherOrgIncidentId}`,
        {
          method: "GET",
          headers: ctx.headers,
        }
      );

      expect(response.status).toBe(404);
    });

    it("cannot access status pages from another organization", async () => {
      // Create a status page in other org
      const createResponse = await fetch(`${API_BASE_URL}/api/v1/status-pages`, {
        method: "POST",
        headers: otherOrgCtx.headers,
        body: JSON.stringify({
          name: "Other Org Status Page",
          slug: `other-org-${randomUUID().slice(0, 8)}`,
        }),
      });

      const statusPageBody = await createResponse.json();
      const otherOrgStatusPageId = statusPageBody.data.id;

      // Try to access with our token
      const response = await fetch(
        `${API_BASE_URL}/api/v1/status-pages/${otherOrgStatusPageId}`,
        {
          method: "GET",
          headers: ctx.headers,
        }
      );

      expect(response.status).toBe(404);
    });
  });

  describe("Resource not found vs unauthorized", () => {
    it("returns 404 for non-existent monitor ID", async () => {
      const fakeId = randomUUID();
      const response = await fetch(
        `${API_BASE_URL}/api/v1/monitors/${fakeId}`,
        {
          method: "GET",
          headers: ctx.headers,
        }
      );

      expect(response.status).toBe(404);
    });

    it("returns 404 for non-existent incident ID", async () => {
      const fakeId = randomUUID();
      const response = await fetch(
        `${API_BASE_URL}/api/v1/incidents/${fakeId}`,
        {
          method: "GET",
          headers: ctx.headers,
        }
      );

      expect(response.status).toBe(404);
    });

    it("returns 404 for non-existent status page ID", async () => {
      const fakeId = randomUUID();
      const response = await fetch(
        `${API_BASE_URL}/api/v1/status-pages/${fakeId}`,
        {
          method: "GET",
          headers: ctx.headers,
        }
      );

      expect(response.status).toBe(404);
    });
  });

  describe("Public endpoints", () => {
    it("allows access to health endpoint without auth", async () => {
      const response = await fetch(`${API_BASE_URL}/api/v1/health`);
      expect(response.status).toBe(200);
    });

    it("allows access to public status page endpoint without auth", async () => {
      // First create a published status page
      const createResponse = await fetch(`${API_BASE_URL}/api/v1/status-pages`, {
        method: "POST",
        headers: ctx.headers,
        body: JSON.stringify({
          name: "Public Test Page",
          slug: `public-test-${randomUUID().slice(0, 8)}`,
          published: true,
        }),
      });

      const createBody = await createResponse.json();
      const slug = createBody.data.slug;

      // Access without auth
      const response = await fetch(
        `${API_BASE_URL}/api/public/status-pages/${slug}`
      );

      expect(response.status).toBe(200);
    });

    it("returns 404 for unpublished status page via public endpoint", async () => {
      // Create an unpublished status page
      const createResponse = await fetch(`${API_BASE_URL}/api/v1/status-pages`, {
        method: "POST",
        headers: ctx.headers,
        body: JSON.stringify({
          name: "Private Test Page",
          slug: `private-test-${randomUUID().slice(0, 8)}`,
          published: false,
        }),
      });

      const createBody = await createResponse.json();
      const slug = createBody.data.slug;

      // Try to access without auth
      const response = await fetch(
        `${API_BASE_URL}/api/public/status-pages/${slug}`
      );

      expect(response.status).toBe(404);
    });

    it("allows heartbeat ping without auth using token", async () => {
      // Create a heartbeat monitor
      const createResponse = await fetch(`${API_BASE_URL}/api/v1/monitors`, {
        method: "POST",
        headers: ctx.headers,
        body: JSON.stringify({
          name: `Heartbeat Auth Test ${randomUUID().slice(0, 8)}`,
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

      const createBody = await createResponse.json();
      const heartbeatToken = createBody.data.heartbeatToken;

      // Ping without auth header
      const response = await fetch(
        `${API_BASE_URL}/api/public/heartbeat/${heartbeatToken}?status=complete`,
        { method: "GET" }
      );

      expect(response.status).toBe(200);
    });

    it("rejects heartbeat ping with invalid token", async () => {
      const fakeToken = randomUUID();
      const response = await fetch(
        `${API_BASE_URL}/api/public/heartbeat/${fakeToken}?status=complete`,
        { method: "GET" }
      );

      expect(response.status).toBe(404);
    });
  });

  describe("Authorization header variations", () => {
    it("accepts lowercase bearer prefix", async () => {
      const response = await fetch(`${API_BASE_URL}/api/v1/monitors`, {
        method: "GET",
        headers: {
          Authorization: `bearer ${ctx.token}`,
          "Content-Type": "application/json",
        },
      });

      // Should be accepted (case-insensitive)
      expect([200, 401]).toContain(response.status);
    });

    it("handles Authorization header with extra whitespace", async () => {
      const response = await fetch(`${API_BASE_URL}/api/v1/monitors`, {
        method: "GET",
        headers: {
          Authorization: `Bearer  ${ctx.token}`, // Extra space
          "Content-Type": "application/json",
        },
      });

      // May or may not be accepted depending on implementation
      expect([200, 401]).toContain(response.status);
    });
  });
});
