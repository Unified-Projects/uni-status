import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { Client } from "pg";
import { bootstrapTestContext, TestContext } from "../helpers/context";
import { randomUUID, randomBytes } from "crypto";

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

// Helper to create a second user with member role
async function createMemberUser(): Promise<{
  userId: string;
  memberId: string;
  token: string;
  headers: Record<string, string>;
}> {
  const userId = randomUUID();
  const memberId = randomUUID();
  const now = new Date().toISOString();

  // Create user
  await dbClient.query(
    `INSERT INTO "user" (id, name, email, "emailVerified", "createdAt", "updatedAt")
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [userId, "Member User", `${userId}@example.com`, true, now, now]
  );

  // Add as member to our org
  await dbClient.query(
    `INSERT INTO organization_members (id, organization_id, user_id, role, joined_at, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [memberId, ctx.organizationId, userId, "member", now, now, now]
  );

  // Create API key
  const token = `us_${randomBytes(16).toString("hex")}`;
  const keyPrefix = token.slice(0, 8);
  await dbClient.query(
    `INSERT INTO api_keys (id, organization_id, name, key_hash, key_prefix, scopes, created_by, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
    [
      randomUUID(),
      ctx.organizationId,
      "member-key",
      token,
      keyPrefix,
      JSON.stringify(["read", "write"]),
      userId,
      now,
      now,
    ]
  );

  return {
    userId,
    memberId,
    token,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
  };
}

// Helper to create an SSO provider
async function createSsoProvider(
  options?: {
    providerId?: string;
    name?: string;
    type?: "oidc" | "saml";
    issuer?: string;
    domain?: string;
    enabled?: boolean;
  }
): Promise<string> {
  const res = await fetch(
    `${API_URL}/sso/organizations/${ctx.organizationId}/providers`,
    {
      method: "POST",
      headers: ctx.headers,
      body: JSON.stringify({
        providerId: options?.providerId ?? `provider-${Date.now()}`,
        name: options?.name ?? "Test SSO Provider",
        type: options?.type ?? "oidc",
        issuer: options?.issuer ?? "https://auth.example.com",
        domain: options?.domain ?? `test-${Date.now()}.example.com`,
        oidcConfig: options?.type === "saml" ? undefined : {
          clientId: "test-client-id",
          clientSecret: "test-client-secret",
        },
        samlConfig: options?.type === "saml" ? {
          entryPoint: "https://idp.example.com/sso",
          cert: "test-cert",
        } : undefined,
      }),
    }
  );
  if (!res.ok) {
    const body = await res.text();
    console.error(`createSsoProvider failed: ${res.status} - ${body}`);
    throw new Error(`createSsoProvider failed: ${res.status} - ${body}`);
  }
  const data = await res.json();
  if (!data.data?.id) {
    console.error(`createSsoProvider returned no id: ${JSON.stringify(data)}`);
    throw new Error(`createSsoProvider returned no id: ${JSON.stringify(data)}`);
  }
  return data.data.id;
}

// Helper to create a domain
async function createDomain(domain: string): Promise<string> {
  const res = await fetch(
    `${API_URL}/sso/organizations/${ctx.organizationId}/domains`,
    {
      method: "POST",
      headers: ctx.headers,
      body: JSON.stringify({ domain }),
    }
  );
  if (!res.ok) {
    const body = await res.text();
    console.error(`createDomain failed for ${domain}: ${res.status} - ${body}`);
    throw new Error(`createDomain failed: ${res.status} - ${body}`);
  }
  const data = await res.json();
  if (!data.data?.id) {
    console.error(`createDomain returned no id: ${JSON.stringify(data)}`);
    throw new Error(`createDomain returned no id: ${JSON.stringify(data)}`);
  }
  return data.data.id;
}

describe("SSO API - Comprehensive Tests", () => {
  describe("GET /auth/sso/providers - List Global OAuth Providers (Public)", () => {
    it("returns list of enabled global providers", async () => {
      const res = await fetch(`${API_URL}/auth/sso/providers`, {
        method: "GET",
      });

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.success).toBe(true);
      expect(Array.isArray(data.data)).toBe(true);
    });

    it("does not require authentication", async () => {
      const res = await fetch(`${API_URL}/auth/sso/providers`, {
        method: "GET",
        // No auth headers
      });

      expect(res.status).toBe(200);
    });

    it("returns provider details", async () => {
      const res = await fetch(`${API_URL}/auth/sso/providers`, {
        method: "GET",
      });

      const data = await res.json();
      // If providers are enabled, check structure
      if (data.data.length > 0) {
        expect(data.data[0]).toHaveProperty("id");
        expect(data.data[0]).toHaveProperty("name");
        expect(data.data[0]).toHaveProperty("icon");
      }
    });
  });

  describe("GET /auth/sso/discover - SSO Discovery (Public)", () => {
    it("returns hasSSO=false for unknown domain", async () => {
      const res = await fetch(
        `${API_URL}/auth/sso/discover?email=test@unknown-domain-12345.com`,
        { method: "GET" }
      );

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.success).toBe(true);
      expect(data.data.hasSSO).toBe(false);
    });

    it("returns hasSSO=false for invalid email", async () => {
      const res = await fetch(`${API_URL}/auth/sso/discover?email=invalid`, {
        method: "GET",
      });

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.data.hasSSO).toBe(false);
    });

    it("returns hasSSO=false when no email provided", async () => {
      const res = await fetch(`${API_URL}/auth/sso/discover`, {
        method: "GET",
      });

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.data.hasSSO).toBe(false);
    });

    it("returns SSO info for verified domain with SSO provider", async () => {
      // Create and verify domain with SSO
      const domainName = `sso-discover-${Date.now()}.example.com`;
      const domainId = await createDomain(domainName);
      const providerId = await createSsoProvider({ domain: domainName });

      // Mark domain as verified and link SSO
      await dbClient.query(
        `UPDATE organization_domains
         SET verified = true, verified_at = NOW(), sso_provider_id = $1
         WHERE id = $2`,
        [providerId, domainId]
      );

      const res = await fetch(
        `${API_URL}/auth/sso/discover?email=user@${domainName}`,
        { method: "GET" }
      );

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.data.hasSSO).toBe(true);
      expect(data.data.redirectUrl).toBeDefined();
    });

    it("does not require authentication", async () => {
      const res = await fetch(
        `${API_URL}/auth/sso/discover?email=test@example.com`,
        { method: "GET" }
      );

      expect(res.status).toBe(200);
    });
  });

  describe("SSO Providers - CRUD Operations", () => {
    describe("GET /sso/organizations/:id/providers - List Providers", () => {
      it("lists SSO providers for organization", async () => {
        await createSsoProvider({ name: "List Test Provider" });

        const res = await fetch(
          `${API_URL}/sso/organizations/${ctx.organizationId}/providers`,
          {
            method: "GET",
            headers: ctx.headers,
          }
        );

        expect(res.status).toBe(200);
        const data = await res.json();
        expect(data.success).toBe(true);
        expect(Array.isArray(data.data)).toBe(true);
        expect(data.data.length).toBeGreaterThanOrEqual(1);
      });

      it("does not expose sensitive config", async () => {
        await createSsoProvider({ name: "Secret Provider" });

        const res = await fetch(
          `${API_URL}/sso/organizations/${ctx.organizationId}/providers`,
          {
            method: "GET",
            headers: ctx.headers,
          }
        );

        const data = await res.json();
        for (const provider of data.data) {
          expect(provider.oidcConfig).toBeUndefined();
          expect(provider.samlConfig).toBeUndefined();
          expect(provider.hasOidcConfig).toBeDefined();
          expect(provider.hasSamlConfig).toBeDefined();
        }
      });

      it("requires admin or owner role", async () => {
        const memberUser = await createMemberUser();

        const res = await fetch(
          `${API_URL}/sso/organizations/${ctx.organizationId}/providers`,
          {
            method: "GET",
            headers: memberUser.headers,
          }
        );

        expect(res.status).toBeGreaterThanOrEqual(400);
      });
    });

    describe("POST /sso/organizations/:id/providers - Create Provider", () => {
      it("creates OIDC provider", async () => {
        const res = await fetch(
          `${API_URL}/sso/organizations/${ctx.organizationId}/providers`,
          {
            method: "POST",
            headers: ctx.headers,
            body: JSON.stringify({
              providerId: `oidc-${Date.now()}`,
              name: "OIDC Provider",
              type: "oidc",
              issuer: "https://auth.example.com",
              domain: `oidc-${Date.now()}.example.com`,
              oidcConfig: {
                clientId: "client-id",
                clientSecret: "client-secret",
                scopes: ["openid", "profile", "email"],
              },
            }),
          }
        );

        expect(res.status).toBe(201);
        const data = await res.json();
        expect(data.success).toBe(true);
        expect(data.data.type).toBe("oidc");
        expect(data.data.enabled).toBe(true);
      });

      it("creates SAML provider", async () => {
        const res = await fetch(
          `${API_URL}/sso/organizations/${ctx.organizationId}/providers`,
          {
            method: "POST",
            headers: ctx.headers,
            body: JSON.stringify({
              providerId: `saml-${Date.now()}`,
              name: "SAML Provider",
              type: "saml",
              issuer: "https://idp.example.com",
              domain: `saml-${Date.now()}.example.com`,
              samlConfig: {
                entryPoint: "https://idp.example.com/sso",
                cert: "-----BEGIN CERTIFICATE-----\nMIIC...\n-----END CERTIFICATE-----",
              },
            }),
          }
        );

        expect(res.status).toBe(201);
        const data = await res.json();
        expect(data.data.type).toBe("saml");
      });

      it("normalizes domain to lowercase", async () => {
        const res = await fetch(
          `${API_URL}/sso/organizations/${ctx.organizationId}/providers`,
          {
            method: "POST",
            headers: ctx.headers,
            body: JSON.stringify({
              providerId: `case-${Date.now()}`,
              name: "Case Test Provider",
              type: "oidc",
              issuer: "https://auth.example.com",
              domain: `UPPERCASE-${Date.now()}.EXAMPLE.COM`,
              oidcConfig: { clientId: "id", clientSecret: "secret" },
            }),
          }
        );

        expect(res.status).toBe(201);
        const data = await res.json();
        expect(data.data.domain).toMatch(/^uppercase-/);
        expect(data.data.domain).toMatch(/\.example\.com$/);
      });

      it("requires admin or owner role", async () => {
        const memberUser = await createMemberUser();

        const res = await fetch(
          `${API_URL}/sso/organizations/${ctx.organizationId}/providers`,
          {
            method: "POST",
            headers: memberUser.headers,
            body: JSON.stringify({
              providerId: "should-fail",
              name: "Should Fail",
              type: "oidc",
              issuer: "https://auth.example.com",
            }),
          }
        );

        expect(res.status).toBeGreaterThanOrEqual(400);
      });
    });

    describe("PATCH /sso/organizations/:id/providers/:providerId - Update Provider", () => {
      it("updates provider name", async () => {
        const providerId = await createSsoProvider({ name: "Original Name" });

        const res = await fetch(
          `${API_URL}/sso/organizations/${ctx.organizationId}/providers/${providerId}`,
          {
            method: "PATCH",
            headers: ctx.headers,
            body: JSON.stringify({
              name: "Updated Name",
            }),
          }
        );

        expect(res.status).toBe(200);
        const data = await res.json();
        expect(data.data.name).toBe("Updated Name");
      });

      it("updates provider issuer", async () => {
        const providerId = await createSsoProvider({
          issuer: "https://old.example.com",
        });

        const res = await fetch(
          `${API_URL}/sso/organizations/${ctx.organizationId}/providers/${providerId}`,
          {
            method: "PATCH",
            headers: ctx.headers,
            body: JSON.stringify({
              issuer: "https://new.example.com",
            }),
          }
        );

        expect(res.status).toBe(200);
        const data = await res.json();
        expect(data.data.issuer).toBe("https://new.example.com");
      });

      it("enables/disables provider", async () => {
        const providerId = await createSsoProvider();

        // Disable
        let res = await fetch(
          `${API_URL}/sso/organizations/${ctx.organizationId}/providers/${providerId}`,
          {
            method: "PATCH",
            headers: ctx.headers,
            body: JSON.stringify({ enabled: false }),
          }
        );

        expect(res.status).toBe(200);
        let data = await res.json();
        expect(data.data.enabled).toBe(false);

        // Re-enable
        res = await fetch(
          `${API_URL}/sso/organizations/${ctx.organizationId}/providers/${providerId}`,
          {
            method: "PATCH",
            headers: ctx.headers,
            body: JSON.stringify({ enabled: true }),
          }
        );

        data = await res.json();
        expect(data.data.enabled).toBe(true);
      });

      it("updates OIDC config", async () => {
        const providerId = await createSsoProvider({ type: "oidc" });

        const res = await fetch(
          `${API_URL}/sso/organizations/${ctx.organizationId}/providers/${providerId}`,
          {
            method: "PATCH",
            headers: ctx.headers,
            body: JSON.stringify({
              oidcConfig: {
                clientId: "new-client-id",
                clientSecret: "new-client-secret",
                scopes: ["openid", "profile"],
              },
            }),
          }
        );

        expect(res.status).toBe(200);
      });

      it("returns 404 for non-existent provider", async () => {
        const res = await fetch(
          `${API_URL}/sso/organizations/${ctx.organizationId}/providers/nonexistent`,
          {
            method: "PATCH",
            headers: ctx.headers,
            body: JSON.stringify({ name: "Should Fail" }),
          }
        );

        expect(res.status).toBeGreaterThanOrEqual(400);
      });

      it("requires admin or owner role", async () => {
        const providerId = await createSsoProvider();
        const memberUser = await createMemberUser();

        const res = await fetch(
          `${API_URL}/sso/organizations/${ctx.organizationId}/providers/${providerId}`,
          {
            method: "PATCH",
            headers: memberUser.headers,
            body: JSON.stringify({ name: "Should Fail" }),
          }
        );

        expect(res.status).toBeGreaterThanOrEqual(400);
      });
    });

    describe("DELETE /sso/organizations/:id/providers/:providerId - Delete Provider", () => {
      it("deletes provider", async () => {
        const providerId = await createSsoProvider({ name: "To Delete" });

        const res = await fetch(
          `${API_URL}/sso/organizations/${ctx.organizationId}/providers/${providerId}`,
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

      it("returns 404 for non-existent provider", async () => {
        const res = await fetch(
          `${API_URL}/sso/organizations/${ctx.organizationId}/providers/nonexistent`,
          {
            method: "DELETE",
            headers: ctx.headers,
          }
        );

        expect(res.status).toBeGreaterThanOrEqual(400);
      });

      it("requires admin or owner role", async () => {
        const providerId = await createSsoProvider();
        const memberUser = await createMemberUser();

        const res = await fetch(
          `${API_URL}/sso/organizations/${ctx.organizationId}/providers/${providerId}`,
          {
            method: "DELETE",
            headers: memberUser.headers,
          }
        );

        expect(res.status).toBeGreaterThanOrEqual(400);
      });
    });

    describe("POST /sso/organizations/:id/providers/:providerId/test - Test Provider", () => {
      it("tests OIDC provider connection", async () => {
        const providerId = await createSsoProvider({
          type: "oidc",
          issuer: "https://accounts.google.com", // Real discoverable endpoint
        });

        const res = await fetch(
          `${API_URL}/sso/organizations/${ctx.organizationId}/providers/${providerId}/test`,
          {
            method: "POST",
            headers: ctx.headers,
          }
        );

        // May succeed or fail depending on network access
        expect([200, 500]).toContain(res.status);
        const data = await res.json();
        expect(data).toHaveProperty("success");
      });

      it("returns 404 for non-existent provider", async () => {
        const res = await fetch(
          `${API_URL}/sso/organizations/${ctx.organizationId}/providers/nonexistent/test`,
          {
            method: "POST",
            headers: ctx.headers,
          }
        );

        expect(res.status).toBeGreaterThanOrEqual(400);
      });

      it("requires admin or owner role", async () => {
        const providerId = await createSsoProvider();
        const memberUser = await createMemberUser();

        const res = await fetch(
          `${API_URL}/sso/organizations/${ctx.organizationId}/providers/${providerId}/test`,
          {
            method: "POST",
            headers: memberUser.headers,
          }
        );

        expect(res.status).toBeGreaterThanOrEqual(400);
      });
    });
  });

  describe("Organization Domains - CRUD Operations", () => {
    describe("GET /sso/organizations/:id/domains - List Domains", () => {
      it("lists domains for organization", async () => {
        await createDomain(`list-domain-${Date.now()}.example.com`);

        const res = await fetch(
          `${API_URL}/sso/organizations/${ctx.organizationId}/domains`,
          {
            method: "GET",
            headers: ctx.headers,
          }
        );

        expect(res.status).toBe(200);
        const data = await res.json();
        expect(data.success).toBe(true);
        expect(Array.isArray(data.data)).toBe(true);
      });

      it("includes domain settings", async () => {
        const domainId = await createDomain(`settings-domain-${Date.now()}.example.com`);

        const res = await fetch(
          `${API_URL}/sso/organizations/${ctx.organizationId}/domains`,
          {
            method: "GET",
            headers: ctx.headers,
          }
        );

        const data = await res.json();
        const domain = data.data.find((d: { id: string }) => d.id === domainId);
        expect(domain).toBeDefined();
        expect(domain).toHaveProperty("verified");
        expect(domain).toHaveProperty("autoJoinEnabled");
        expect(domain).toHaveProperty("ssoRequired");
      });

      it("includes verification token for unverified domains", async () => {
        const domainId = await createDomain(`unverified-${Date.now()}.example.com`);

        const res = await fetch(
          `${API_URL}/sso/organizations/${ctx.organizationId}/domains`,
          {
            method: "GET",
            headers: ctx.headers,
          }
        );

        const data = await res.json();
        const domain = data.data.find((d: { id: string }) => d.id === domainId);
        expect(domain.verified).toBe(false);
        expect(domain.verificationToken).toBeDefined();
      });

      it("hides verification token for verified domains", async () => {
        const domainId = await createDomain(`verified-hide-${Date.now()}.example.com`);

        // Mark as verified
        await dbClient.query(
          `UPDATE organization_domains SET verified = true WHERE id = $1`,
          [domainId]
        );

        const res = await fetch(
          `${API_URL}/sso/organizations/${ctx.organizationId}/domains`,
          {
            method: "GET",
            headers: ctx.headers,
          }
        );

        const data = await res.json();
        const domain = data.data.find((d: { id: string }) => d.id === domainId);
        expect(domain.verified).toBe(true);
        expect(domain.verificationToken).toBeNull();
      });

      it("requires admin or owner role", async () => {
        const memberUser = await createMemberUser();

        const res = await fetch(
          `${API_URL}/sso/organizations/${ctx.organizationId}/domains`,
          {
            method: "GET",
            headers: memberUser.headers,
          }
        );

        expect(res.status).toBeGreaterThanOrEqual(400);
      });
    });

    describe("POST /sso/organizations/:id/domains - Add Domain", () => {
      it("adds domain", async () => {
        const domain = `add-domain-${Date.now()}.example.com`;

        const res = await fetch(
          `${API_URL}/sso/organizations/${ctx.organizationId}/domains`,
          {
            method: "POST",
            headers: ctx.headers,
            body: JSON.stringify({ domain }),
          }
        );

        expect(res.status).toBe(201);
        const data = await res.json();
        expect(data.success).toBe(true);
        expect(data.data.domain).toBe(domain.toLowerCase());
        expect(data.data.verified).toBe(false);
        expect(data.data.verificationToken).toBeDefined();
      });

      it("returns verification instructions", async () => {
        const domain = `verify-instructions-${Date.now()}.example.com`;

        const res = await fetch(
          `${API_URL}/sso/organizations/${ctx.organizationId}/domains`,
          {
            method: "POST",
            headers: ctx.headers,
            body: JSON.stringify({ domain }),
          }
        );

        const data = await res.json();
        expect(data.data.verificationInstructions).toBeDefined();
        expect(data.data.verificationInstructions.type).toBe("dns_txt");
        expect(data.data.verificationInstructions.name).toContain("_uni-status");
      });

      it("normalizes domain to lowercase", async () => {
        const res = await fetch(
          `${API_URL}/sso/organizations/${ctx.organizationId}/domains`,
          {
            method: "POST",
            headers: ctx.headers,
            body: JSON.stringify({
              domain: `UPPERCASE-DOMAIN-${Date.now()}.EXAMPLE.COM`,
            }),
          }
        );

        expect(res.status).toBe(201);
        const data = await res.json();
        expect(data.data.domain).toMatch(/^uppercase-domain-/);
      });

      it("rejects invalid domain format", async () => {
        const res = await fetch(
          `${API_URL}/sso/organizations/${ctx.organizationId}/domains`,
          {
            method: "POST",
            headers: ctx.headers,
            body: JSON.stringify({
              domain: "not a valid domain!",
            }),
          }
        );

        expect(res.status).toBeGreaterThanOrEqual(400);
      });

      it("rejects already registered domain", async () => {
        const domain = `duplicate-${Date.now()}.example.com`;

        // Add first time
        await fetch(
          `${API_URL}/sso/organizations/${ctx.organizationId}/domains`,
          {
            method: "POST",
            headers: ctx.headers,
            body: JSON.stringify({ domain }),
          }
        );

        // Try to add again
        const res = await fetch(
          `${API_URL}/sso/organizations/${ctx.organizationId}/domains`,
          {
            method: "POST",
            headers: ctx.headers,
            body: JSON.stringify({ domain }),
          }
        );

        expect(res.status).toBeGreaterThanOrEqual(400);
      });

      it("requires admin or owner role", async () => {
        const memberUser = await createMemberUser();

        const res = await fetch(
          `${API_URL}/sso/organizations/${ctx.organizationId}/domains`,
          {
            method: "POST",
            headers: memberUser.headers,
            body: JSON.stringify({
              domain: `member-domain-${Date.now()}.example.com`,
            }),
          }
        );

        expect(res.status).toBeGreaterThanOrEqual(400);
      });
    });

    describe("POST /sso/organizations/:id/domains/:domainId/verify - Verify Domain", () => {
      it("returns already verified for verified domains", async () => {
        const domainId = await createDomain(`already-verified-${Date.now()}.example.com`);

        // Mark as verified
        await dbClient.query(
          `UPDATE organization_domains SET verified = true, verified_at = NOW() WHERE id = $1`,
          [domainId]
        );

        const res = await fetch(
          `${API_URL}/sso/organizations/${ctx.organizationId}/domains/${domainId}/verify`,
          {
            method: "POST",
            headers: ctx.headers,
          }
        );

        expect(res.status).toBe(200);
        const data = await res.json();
        expect(data.data.verified).toBe(true);
        expect(data.data.message).toContain("already verified");
      });

      it("returns verification failed for unverified domains", async () => {
        const domainId = await createDomain(`not-verified-${Date.now()}.example.com`);

        const res = await fetch(
          `${API_URL}/sso/organizations/${ctx.organizationId}/domains/${domainId}/verify`,
          {
            method: "POST",
            headers: ctx.headers,
          }
        );

        // Will fail since DNS record doesn't exist
        expect(res.status).toBe(200);
        const data = await res.json();
        expect(data.success).toBe(false);
        expect(data.error.code).toMatch(/DNS|VERIFICATION/);
      });

      it("returns 404 for non-existent domain", async () => {
        const res = await fetch(
          `${API_URL}/sso/organizations/${ctx.organizationId}/domains/nonexistent/verify`,
          {
            method: "POST",
            headers: ctx.headers,
          }
        );

        expect(res.status).toBeGreaterThanOrEqual(400);
      });

      it("requires admin or owner role", async () => {
        const domainId = await createDomain(`member-verify-${Date.now()}.example.com`);
        const memberUser = await createMemberUser();

        const res = await fetch(
          `${API_URL}/sso/organizations/${ctx.organizationId}/domains/${domainId}/verify`,
          {
            method: "POST",
            headers: memberUser.headers,
          }
        );

        expect(res.status).toBeGreaterThanOrEqual(400);
      });
    });

    describe("PATCH /sso/organizations/:id/domains/:domainId - Update Domain", () => {
      it("updates auto-join settings", async () => {
        const domainId = await createDomain(`autojoin-${Date.now()}.example.com`);

        const res = await fetch(
          `${API_URL}/sso/organizations/${ctx.organizationId}/domains/${domainId}`,
          {
            method: "PATCH",
            headers: ctx.headers,
            body: JSON.stringify({
              autoJoinEnabled: true,
              autoJoinRole: "viewer",
            }),
          }
        );

        expect(res.status).toBe(200);
        const data = await res.json();
        expect(data.data.autoJoinEnabled).toBe(true);
        expect(data.data.autoJoinRole).toBe("viewer");
      });

      it("links SSO provider to domain", async () => {
        const domainId = await createDomain(`link-sso-${Date.now()}.example.com`);
        const providerId = await createSsoProvider();

        const res = await fetch(
          `${API_URL}/sso/organizations/${ctx.organizationId}/domains/${domainId}`,
          {
            method: "PATCH",
            headers: ctx.headers,
            body: JSON.stringify({
              ssoProviderId: providerId,
              ssoRequired: true,
            }),
          }
        );

        expect(res.status).toBe(200);
        const data = await res.json();
        expect(data.data.ssoProviderId).toBe(providerId);
        expect(data.data.ssoRequired).toBe(true);
      });

      it("unlinks SSO provider", async () => {
        const domainId = await createDomain(`unlink-sso-${Date.now()}.example.com`);
        const providerId = await createSsoProvider();

        // First link
        await fetch(
          `${API_URL}/sso/organizations/${ctx.organizationId}/domains/${domainId}`,
          {
            method: "PATCH",
            headers: ctx.headers,
            body: JSON.stringify({ ssoProviderId: providerId }),
          }
        );

        // Then unlink
        const res = await fetch(
          `${API_URL}/sso/organizations/${ctx.organizationId}/domains/${domainId}`,
          {
            method: "PATCH",
            headers: ctx.headers,
            body: JSON.stringify({ ssoProviderId: null }),
          }
        );

        expect(res.status).toBe(200);
        const data = await res.json();
        expect(data.data.ssoProviderId).toBeNull();
      });

      it("returns 404 for non-existent domain", async () => {
        const res = await fetch(
          `${API_URL}/sso/organizations/${ctx.organizationId}/domains/nonexistent`,
          {
            method: "PATCH",
            headers: ctx.headers,
            body: JSON.stringify({ autoJoinEnabled: true }),
          }
        );

        expect(res.status).toBeGreaterThanOrEqual(400);
      });

      it("requires admin or owner role", async () => {
        const domainId = await createDomain(`member-update-${Date.now()}.example.com`);
        const memberUser = await createMemberUser();

        const res = await fetch(
          `${API_URL}/sso/organizations/${ctx.organizationId}/domains/${domainId}`,
          {
            method: "PATCH",
            headers: memberUser.headers,
            body: JSON.stringify({ autoJoinEnabled: true }),
          }
        );

        expect(res.status).toBeGreaterThanOrEqual(400);
      });
    });

    describe("DELETE /sso/organizations/:id/domains/:domainId - Delete Domain", () => {
      it("deletes domain", async () => {
        const domainId = await createDomain(`delete-domain-${Date.now()}.example.com`);

        const res = await fetch(
          `${API_URL}/sso/organizations/${ctx.organizationId}/domains/${domainId}`,
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

      it("returns 404 for non-existent domain", async () => {
        const res = await fetch(
          `${API_URL}/sso/organizations/${ctx.organizationId}/domains/nonexistent`,
          {
            method: "DELETE",
            headers: ctx.headers,
          }
        );

        expect(res.status).toBeGreaterThanOrEqual(400);
      });

      it("requires admin or owner role", async () => {
        const domainId = await createDomain(`member-delete-${Date.now()}.example.com`);
        const memberUser = await createMemberUser();

        const res = await fetch(
          `${API_URL}/sso/organizations/${ctx.organizationId}/domains/${domainId}`,
          {
            method: "DELETE",
            headers: memberUser.headers,
          }
        );

        expect(res.status).toBeGreaterThanOrEqual(400);
      });
    });
  });

  describe("Resource Scopes", () => {
    describe("GET /sso/organizations/:id/members/:memberId/scopes - List Member Scopes", () => {
      it("lists scopes for member", async () => {
        const memberUser = await createMemberUser();

        const res = await fetch(
          `${API_URL}/sso/organizations/${ctx.organizationId}/members/${memberUser.memberId}/scopes`,
          {
            method: "GET",
            headers: ctx.headers,
          }
        );

        expect(res.status).toBe(200);
        const data = await res.json();
        expect(data.success).toBe(true);
        expect(Array.isArray(data.data)).toBe(true);
      });

      it("requires admin or owner role", async () => {
        const memberUser = await createMemberUser();

        const res = await fetch(
          `${API_URL}/sso/organizations/${ctx.organizationId}/members/${memberUser.memberId}/scopes`,
          {
            method: "GET",
            headers: memberUser.headers,
          }
        );

        expect(res.status).toBeGreaterThanOrEqual(400);
      });
    });

    describe("POST /sso/organizations/:id/members/:memberId/scopes - Add Scope", () => {
      it("adds resource scope to member", async () => {
        const memberUser = await createMemberUser();

        const res = await fetch(
          `${API_URL}/sso/organizations/${ctx.organizationId}/members/${memberUser.memberId}/scopes`,
          {
            method: "POST",
            headers: ctx.headers,
            body: JSON.stringify({
              resourceType: "monitor",
              resourceId: null,
              role: "admin",
            }),
          }
        );

        expect(res.status).toBe(201);
        const data = await res.json();
        expect(data.success).toBe(true);
        expect(data.data.resourceType).toBe("monitor");
        expect(data.data.role).toBe("admin");
      });

      it("adds scope for specific resource", async () => {
        const memberUser = await createMemberUser();
        const monitorId = randomUUID();

        const res = await fetch(
          `${API_URL}/sso/organizations/${ctx.organizationId}/members/${memberUser.memberId}/scopes`,
          {
            method: "POST",
            headers: ctx.headers,
            body: JSON.stringify({
              resourceType: "monitor",
              resourceId: monitorId,
              role: "viewer",
            }),
          }
        );

        expect(res.status).toBe(201);
        const data = await res.json();
        expect(data.data.resourceId).toBe(monitorId);
      });

      it("requires admin or owner role", async () => {
        const memberUser = await createMemberUser();

        const res = await fetch(
          `${API_URL}/sso/organizations/${ctx.organizationId}/members/${memberUser.memberId}/scopes`,
          {
            method: "POST",
            headers: memberUser.headers,
            body: JSON.stringify({
              resourceType: "monitor",
              role: "viewer",
            }),
          }
        );

        expect(res.status).toBeGreaterThanOrEqual(400);
      });
    });

    describe("DELETE /sso/organizations/:id/members/:memberId/scopes/:scopeId - Delete Scope", () => {
      it("deletes resource scope", async () => {
        const memberUser = await createMemberUser();

        // Create a scope first
        const createRes = await fetch(
          `${API_URL}/sso/organizations/${ctx.organizationId}/members/${memberUser.memberId}/scopes`,
          {
            method: "POST",
            headers: ctx.headers,
            body: JSON.stringify({
              resourceType: "monitor",
              role: "viewer",
            }),
          }
        );
        const { data: scope } = await createRes.json();

        // Delete it
        const res = await fetch(
          `${API_URL}/sso/organizations/${ctx.organizationId}/members/${memberUser.memberId}/scopes/${scope.id}`,
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

      it("returns 404 for non-existent scope", async () => {
        const memberUser = await createMemberUser();

        const res = await fetch(
          `${API_URL}/sso/organizations/${ctx.organizationId}/members/${memberUser.memberId}/scopes/nonexistent`,
          {
            method: "DELETE",
            headers: ctx.headers,
          }
        );

        expect(res.status).toBeGreaterThanOrEqual(400);
      });

      it("requires admin or owner role", async () => {
        const memberUser = await createMemberUser();

        // Create a scope as admin
        const createRes = await fetch(
          `${API_URL}/sso/organizations/${ctx.organizationId}/members/${memberUser.memberId}/scopes`,
          {
            method: "POST",
            headers: ctx.headers,
            body: JSON.stringify({
              resourceType: "monitor",
              role: "viewer",
            }),
          }
        );
        const { data: scope } = await createRes.json();

        // Try to delete as member
        const res = await fetch(
          `${API_URL}/sso/organizations/${ctx.organizationId}/members/${memberUser.memberId}/scopes/${scope.id}`,
          {
            method: "DELETE",
            headers: memberUser.headers,
          }
        );

        expect(res.status).toBeGreaterThanOrEqual(400);
      });
    });
  });

  describe("Edge Cases (Domain Management)", () => {
    it("handles special characters in domain names", async () => {
      const res = await fetch(
        `${API_URL}/sso/organizations/${ctx.organizationId}/domains`,
        {
          method: "POST",
          headers: ctx.headers,
          body: JSON.stringify({
            domain: `test-domain-with-dashes-${Date.now()}.example.com`,
          }),
        }
      );

      if (res.status !== 201) {
        const body = await res.text();
        console.error(`Domain creation failed: ${res.status} - ${body}`);
      }
      expect(res.status).toBe(201);
    });

    it("rejects domains with underscores", async () => {
      const res = await fetch(
        `${API_URL}/sso/organizations/${ctx.organizationId}/domains`,
        {
          method: "POST",
          headers: ctx.headers,
          body: JSON.stringify({
            domain: "test_domain.example.com",
          }),
        }
      );

      expect(res.status).toBeGreaterThanOrEqual(400);
    });

    it("handles concurrent domain additions", async () => {
      const baseTime = Date.now();
      const domains = [
        `concurrent1-${baseTime}.example.com`,
        `concurrent2-${baseTime}.example.com`,
        `concurrent3-${baseTime}.example.com`,
      ];

      const promises = domains.map((domain) =>
        fetch(
          `${API_URL}/sso/organizations/${ctx.organizationId}/domains`,
          {
            method: "POST",
            headers: ctx.headers,
            body: JSON.stringify({ domain }),
          }
        )
      );

      const results = await Promise.all(promises);
      for (const res of results) {
        expect(res.status).toBe(201);
      }
    });

    it("handles long domain names", async () => {
      // Create a valid but long domain with unique timestamp
      const timestamp = Date.now().toString(36);
      const longSubdomain = `long${timestamp}${"a".repeat(50)}`;
      const domain = `${longSubdomain}.example.com`;

      const res = await fetch(
        `${API_URL}/sso/organizations/${ctx.organizationId}/domains`,
        {
          method: "POST",
          headers: ctx.headers,
          body: JSON.stringify({ domain }),
        }
      );

      // May succeed or fail depending on length limits, but 500 indicates server error
      if (res.status === 500) {
        const body = await res.text();
        console.error(`Long domain creation failed with 500: ${body}`);
      }
      expect([201, 400, 422]).toContain(res.status);
    });
  });

  describe("Provider Edge Cases", () => {
    it("handles provider with minimal config", async () => {
      const res = await fetch(
        `${API_URL}/sso/organizations/${ctx.organizationId}/providers`,
        {
          method: "POST",
          headers: ctx.headers,
          body: JSON.stringify({
            providerId: `minimal-${Date.now()}`,
            name: "Minimal Provider",
            type: "oidc",
            issuer: "https://auth.example.com",
          }),
        }
      );

      expect(res.status).toBe(201);
    });
  });
});
