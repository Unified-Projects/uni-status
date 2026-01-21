import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { nanoid, customAlphabet } from "nanoid";
import bcrypt from "bcrypt";
import { bootstrapTestContext, type TestContext } from "../helpers/context";
import {
  createMonitor,
  createStatusPage,
  linkMonitorToStatusPage,
  insertCheckResults,
  setMonitorStatus,
} from "../helpers/data";

const API_BASE_URL = process.env.API_BASE_URL ?? "http://api:3001";

// Generate valid slugs (only lowercase letters, numbers, and hyphens)
const validSlugId = customAlphabet("0123456789abcdefghijklmnopqrstuvwxyz", 8);

describe("Public API Comprehensive Tests", () => {
  let ctx: TestContext;
  let apiUrl: string;

  beforeAll(async () => {
    ctx = await bootstrapTestContext();
    // Public API doesn't need /api/v1 prefix
    apiUrl = `${API_BASE_URL}/api`;
  });

  afterAll(async () => {
    await ctx.cleanup();
  });

  // ==========================================
  // Status Page Access
  // ==========================================

  describe("GET /public/status-pages/:slug", () => {
    describe("public access (no protection)", () => {
      it("returns status page data for published page", async () => {
        const slug = `public-page-${validSlugId()}`;
        await createStatusPage(ctx, { slug, published: true });

        const response = await fetch(`${apiUrl}/public/status-pages/${slug}`);
        expect(response.status).toBe(200);

        const json = await response.json();
        expect(json.success).toBe(true);
        expect(json.data).toBeDefined();
        expect(json.data.slug).toBe(slug);
      });

      it("returns 404 for non-existent slug", async () => {
        const response = await fetch(`${apiUrl}/public/status-pages/non-existent-slug-${nanoid()}`);
        expect(response.status).toBe(404);

        const json = await response.json();
        expect(json.success).toBe(false);
        expect(json.error.code).toBe("NOT_FOUND");
      });

      it("returns 404 for unpublished page", async () => {
        const slug = `unpublished-${validSlugId()}`;
        await createStatusPage(ctx, { slug, published: false });

        const response = await fetch(`${apiUrl}/public/status-pages/${slug}`);
        expect(response.status).toBe(404);

        const json = await response.json();
        expect(json.error.code).toBe("NOT_PUBLISHED");
      });

      it("includes linked monitors in response", async () => {
        const slug = `with-monitors-${validSlugId()}`;
        const pageId = await createStatusPage(ctx, { slug, published: true });
        const monitorId = await createMonitor(ctx, { type: "http" });
        await linkMonitorToStatusPage(ctx, pageId, monitorId);

        const response = await fetch(`${apiUrl}/public/status-pages/${slug}`);
        expect(response.status).toBe(200);

        const json = await response.json();
        expect(json.data.monitors).toBeDefined();
        expect(json.data.monitors.length).toBeGreaterThan(0);
      });

      it("includes incidents in response", async () => {
        const slug = `with-incidents-${validSlugId()}`;
        const pageId = await createStatusPage(ctx, { slug, published: true });
        const monitorId = await createMonitor(ctx, { type: "http" });
        await linkMonitorToStatusPage(ctx, pageId, monitorId);

        // Create an incident affecting the monitor
        await ctx.dbClient`
          INSERT INTO incidents (id, organization_id, title, message, status, severity, affected_monitors, started_at, created_by, created_at, updated_at)
          VALUES (
            ${nanoid()},
            ${ctx.organizationId},
            'Test Incident',
            'Test message',
            'investigating',
            'major',
            ${JSON.stringify([monitorId])},
            NOW(),
            ${ctx.userId},
            NOW(),
            NOW()
          )
        `;

        const response = await fetch(`${apiUrl}/public/status-pages/${slug}`);
        expect(response.status).toBe(200);

        const json = await response.json();
        // API returns activeIncidents not incidents
        expect(json.data.activeIncidents).toBeDefined();
      });
    });

    describe("password protection", () => {
      it("returns 401 with auth requirements for password-protected page", async () => {
        const slug = `password-protected-${validSlugId()}`;
        const passwordHash = await bcrypt.hash("testpassword123", 10);

        await ctx.dbClient`
          INSERT INTO status_pages (id, organization_id, name, slug, published, password_hash, auth_config, created_at, updated_at)
          VALUES (
            ${nanoid()},
            ${ctx.organizationId},
            'Password Protected Page',
            ${slug},
            true,
            ${passwordHash},
            ${JSON.stringify({ protectionMode: "password" })}::jsonb,
            NOW(),
            NOW()
          )
        `;

        const response = await fetch(`${apiUrl}/public/status-pages/${slug}`);
        expect(response.status).toBe(401);

        const json = await response.json();
        expect(json.error.code).toBe("AUTH_REQUIRED");
        expect(json.meta.requiresPassword).toBe(true);
      });
    });

    describe("OAuth protection", () => {
      it("returns 401 with OAuth requirements for OAuth-protected page", async () => {
        const slug = `oauth-protected-${validSlugId()}`;

        await ctx.dbClient`
          INSERT INTO status_pages (id, organization_id, name, slug, published, auth_config, created_at, updated_at)
          VALUES (
            ${nanoid()},
            ${ctx.organizationId},
            'OAuth Protected Page',
            ${slug},
            true,
            ${JSON.stringify({ protectionMode: "oauth", oauthMode: "any_authenticated" })}::jsonb,
            NOW(),
            NOW()
          )
        `;

        const response = await fetch(`${apiUrl}/public/status-pages/${slug}`);
        expect(response.status).toBe(401);

        const json = await response.json();
        expect(json.error.code).toBe("AUTH_REQUIRED");
        expect(json.meta.requiresOAuth).toBe(true);
      });
    });
  });

  // ==========================================
  // Password Verification
  // ==========================================

  describe("POST /public/status-pages/:slug/verify-password", () => {
    it("returns token for correct password", async () => {
      const slug = `verify-pw-${validSlugId()}`;
      const password = "correctpassword";
      const passwordHash = await bcrypt.hash(password, 10);

      await ctx.dbClient`
        INSERT INTO status_pages (id, organization_id, name, slug, published, password_hash, auth_config, created_at, updated_at)
        VALUES (
          ${nanoid()},
          ${ctx.organizationId},
          'Password Protected Page',
          ${slug},
          true,
          ${passwordHash},
          ${JSON.stringify({ protectionMode: "password" })}::jsonb,
          NOW(),
          NOW()
        )
      `;

      const response = await fetch(`${apiUrl}/public/status-pages/${slug}/verify-password`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });

      expect(response.status).toBe(200);

      const json = await response.json();
      expect(json.success).toBe(true);
      expect(json.data.token).toBeDefined();
      expect(json.data.expiresAt).toBeDefined();
    });

    it("returns 401 for incorrect password", async () => {
      const slug = `verify-pw-wrong-${validSlugId()}`;
      const passwordHash = await bcrypt.hash("correctpassword", 10);

      await ctx.dbClient`
        INSERT INTO status_pages (id, organization_id, name, slug, published, password_hash, auth_config, created_at, updated_at)
        VALUES (
          ${nanoid()},
          ${ctx.organizationId},
          'Password Protected Page',
          ${slug},
          true,
          ${passwordHash},
          ${JSON.stringify({ protectionMode: "password" })}::jsonb,
          NOW(),
          NOW()
        )
      `;

      const response = await fetch(`${apiUrl}/public/status-pages/${slug}/verify-password`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password: "wrongpassword" }),
      });

      expect(response.status).toBe(401);

      const json = await response.json();
      expect(json.error.code).toBe("INVALID_PASSWORD");
    });

    it("returns 400 if password not provided", async () => {
      const slug = `verify-pw-no-pw-${validSlugId()}`;
      await createStatusPage(ctx, { slug, published: true });

      const response = await fetch(`${apiUrl}/public/status-pages/${slug}/verify-password`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });

      expect(response.status).toBe(400);
    });

    it("returns 404 for non-existent page", async () => {
      const response = await fetch(`${apiUrl}/public/status-pages/non-existent-${nanoid()}/verify-password`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password: "test" }),
      });

      expect(response.status).toBe(404);
    });

    it("returns 400 for page without password protection", async () => {
      const slug = `no-pw-protection-${validSlugId()}`;
      await createStatusPage(ctx, { slug, published: true });

      const response = await fetch(`${apiUrl}/public/status-pages/${slug}/verify-password`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password: "test" }),
      });

      expect(response.status).toBe(400);

      const json = await response.json();
      expect(json.error.code).toBe("NOT_PROTECTED");
    });
  });

  // ==========================================
  // OAuth Verification
  // ==========================================

  describe("POST /public/status-pages/:slug/verify-oauth", () => {
    it("returns 400 if email not provided", async () => {
      const slug = `verify-oauth-${validSlugId()}`;

      await ctx.dbClient`
        INSERT INTO status_pages (id, organization_id, name, slug, published, auth_config, created_at, updated_at)
        VALUES (
          ${nanoid()},
          ${ctx.organizationId},
          'OAuth Protected Page',
          ${slug},
          true,
          ${JSON.stringify({ protectionMode: "oauth", oauthMode: "any_authenticated" })}::jsonb,
          NOW(),
          NOW()
        )
      `;

      const response = await fetch(`${apiUrl}/public/status-pages/${slug}/verify-oauth`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });

      expect(response.status).toBe(400);

      const json = await response.json();
      expect(json.error.code).toBe("INVALID_REQUEST");
    });

    it("returns 400 for page without OAuth protection", async () => {
      const slug = `no-oauth-protection-${validSlugId()}`;
      await createStatusPage(ctx, { slug, published: true });

      const response = await fetch(`${apiUrl}/public/status-pages/${slug}/verify-oauth`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: "test@example.com" }),
      });

      expect(response.status).toBe(400);

      const json = await response.json();
      expect(json.error.code).toBe("NOT_OAUTH_PROTECTED");
    });

    it("grants access for any_authenticated mode", async () => {
      const slug = `oauth-any-auth-${validSlugId()}`;

      await ctx.dbClient`
        INSERT INTO status_pages (id, organization_id, name, slug, published, auth_config, created_at, updated_at)
        VALUES (
          ${nanoid()},
          ${ctx.organizationId},
          'OAuth Page',
          ${slug},
          true,
          ${JSON.stringify({ protectionMode: "oauth", oauthMode: "any_authenticated" })}::jsonb,
          NOW(),
          NOW()
        )
      `;

      const response = await fetch(`${apiUrl}/public/status-pages/${slug}/verify-oauth`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: "test@example.com" }),
      });

      expect(response.status).toBe(200);

      const json = await response.json();
      expect(json.success).toBe(true);
      expect(json.data.token).toBeDefined();
    });

    it("denies access for allowlist mode when email not in list", async () => {
      const slug = `oauth-allowlist-${validSlugId()}`;

      await ctx.dbClient`
        INSERT INTO status_pages (id, organization_id, name, slug, published, auth_config, created_at, updated_at)
        VALUES (
          ${nanoid()},
          ${ctx.organizationId},
          'OAuth Allowlist Page',
          ${slug},
          true,
          ${JSON.stringify({ protectionMode: "oauth", oauthMode: "allowlist", allowedEmails: ["allowed@example.com"], allowedDomains: [] })}::jsonb,
          NOW(),
          NOW()
        )
      `;

      const response = await fetch(`${apiUrl}/public/status-pages/${slug}/verify-oauth`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: "notallowed@example.com" }),
      });

      expect(response.status).toBe(403);

      const json = await response.json();
      expect(json.error.code).toBe("ACCESS_DENIED");
    });

    it("grants access for allowlist mode when email is in list", async () => {
      const slug = `oauth-allowlist-ok-${validSlugId()}`;

      await ctx.dbClient`
        INSERT INTO status_pages (id, organization_id, name, slug, published, auth_config, created_at, updated_at)
        VALUES (
          ${nanoid()},
          ${ctx.organizationId},
          'OAuth Allowlist Page',
          ${slug},
          true,
          ${JSON.stringify({ protectionMode: "oauth", oauthMode: "allowlist", allowedEmails: ["allowed@example.com"], allowedDomains: [] })}::jsonb,
          NOW(),
          NOW()
        )
      `;

      const response = await fetch(`${apiUrl}/public/status-pages/${slug}/verify-oauth`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: "allowed@example.com" }),
      });

      expect(response.status).toBe(200);
    });

    it("grants access for allowlist mode when domain is in list", async () => {
      const slug = `oauth-domain-ok-${validSlugId()}`;

      await ctx.dbClient`
        INSERT INTO status_pages (id, organization_id, name, slug, published, auth_config, created_at, updated_at)
        VALUES (
          ${nanoid()},
          ${ctx.organizationId},
          'OAuth Domain Page',
          ${slug},
          true,
          ${JSON.stringify({ protectionMode: "oauth", oauthMode: "allowlist", allowedEmails: [], allowedDomains: ["allowed-domain.com"] })}::jsonb,
          NOW(),
          NOW()
        )
      `;

      const response = await fetch(`${apiUrl}/public/status-pages/${slug}/verify-oauth`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: "anyone@allowed-domain.com" }),
      });

      expect(response.status).toBe(200);
    });
  });

  // ==========================================
  // Auth Config
  // ==========================================

  describe("GET /public/status-pages/:slug/auth-config", () => {
    it("returns auth config for published page", async () => {
      const slug = `auth-config-${validSlugId()}`;

      await ctx.dbClient`
        INSERT INTO status_pages (id, organization_id, name, slug, published, auth_config, created_at, updated_at)
        VALUES (
          ${nanoid()},
          ${ctx.organizationId},
          'Auth Config Page',
          ${slug},
          true,
          ${JSON.stringify({ protectionMode: "oauth", oauthMode: "allowlist" })}::jsonb,
          NOW(),
          NOW()
        )
      `;

      const response = await fetch(`${apiUrl}/public/status-pages/${slug}/auth-config`);
      expect(response.status).toBe(200);

      const json = await response.json();
      expect(json.success).toBe(true);
      expect(json.data.protectionMode).toBe("oauth");
      expect(json.data.oauthMode).toBe("allowlist");
      expect(json.data.requiresOAuth).toBe(true);
    });

    it("returns 404 for non-existent page", async () => {
      const response = await fetch(`${apiUrl}/public/status-pages/non-existent-${nanoid()}/auth-config`);
      expect(response.status).toBe(404);
    });
  });

  // ==========================================
  // Status Page Subscriptions
  // ==========================================

  describe("POST /public/status-pages/:slug/subscribe", () => {
    it("creates subscription and sends verification email", async () => {
      const slug = `subscribe-${validSlugId()}`;
      await createStatusPage(ctx, { slug, published: true });

      const response = await fetch(`${apiUrl}/public/status-pages/${slug}/subscribe`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: `test-${validSlugId()}@example.com` }),
      });

      expect(response.status).toBe(200);

      const json = await response.json();
      expect(json.success).toBe(true);
      expect(json.data.message).toContain("Verification email sent");
    });

    it("returns 400 for invalid email", async () => {
      const slug = `subscribe-invalid-${validSlugId()}`;
      await createStatusPage(ctx, { slug, published: true });

      const response = await fetch(`${apiUrl}/public/status-pages/${slug}/subscribe`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: "invalid-email" }),
      });

      expect(response.status).toBe(400);

      const json = await response.json();
      expect(json.error.code).toBe("INVALID_EMAIL");
    });

    it("returns 404 for non-existent page", async () => {
      const response = await fetch(`${apiUrl}/public/status-pages/non-existent-${nanoid()}/subscribe`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: "test@example.com" }),
      });

      expect(response.status).toBe(404);
    });

    it("handles already subscribed and verified email", async () => {
      const slug = `subscribe-existing-${validSlugId()}`;
      const pageId = await createStatusPage(ctx, { slug, published: true });
      const email = `existing-${validSlugId()}@example.com`;

      // Create verified subscriber
      await ctx.dbClient`
        INSERT INTO subscribers (id, status_page_id, email, verified, unsubscribe_token, channels, created_at, updated_at)
        VALUES (
          ${nanoid()},
          ${pageId},
          ${email.toLowerCase()},
          true,
          ${nanoid(32)},
          ${JSON.stringify({ email: true })}::jsonb,
          NOW(),
          NOW()
        )
      `;

      const response = await fetch(`${apiUrl}/public/status-pages/${slug}/subscribe`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });

      expect(response.status).toBe(200);

      const json = await response.json();
      expect(json.data.message).toContain("already subscribed");
    });

    it("resends verification for unverified subscriber", async () => {
      const slug = `subscribe-resend-${validSlugId()}`;
      const pageId = await createStatusPage(ctx, { slug, published: true });
      const email = `unverified-${validSlugId()}@example.com`;

      // Create unverified subscriber
      await ctx.dbClient`
        INSERT INTO subscribers (id, status_page_id, email, verified, verification_token, unsubscribe_token, channels, created_at, updated_at)
        VALUES (
          ${nanoid()},
          ${pageId},
          ${email.toLowerCase()},
          false,
          ${nanoid(32)},
          ${nanoid(32)},
          ${JSON.stringify({ email: true })}::jsonb,
          NOW(),
          NOW()
        )
      `;

      const response = await fetch(`${apiUrl}/public/status-pages/${slug}/subscribe`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });

      expect(response.status).toBe(200);

      const json = await response.json();
      expect(json.data.message).toContain("Verification email sent");
    });
  });

  describe("GET /public/status-pages/:slug/subscribe/verify", () => {
    it("redirects with error for missing token", async () => {
      const slug = `verify-sub-${validSlugId()}`;
      await createStatusPage(ctx, { slug, published: true });

      const response = await fetch(`${apiUrl}/public/status-pages/${slug}/subscribe/verify`, {
        redirect: "manual",
      });

      expect(response.status).toBe(302);
      expect(response.headers.get("Location")).toContain("error=invalid_token");
    });

    it("redirects with error for invalid token", async () => {
      const slug = `verify-sub-invalid-${validSlugId()}`;
      await createStatusPage(ctx, { slug, published: true });

      const response = await fetch(`${apiUrl}/public/status-pages/${slug}/subscribe/verify?token=invalid-token`, {
        redirect: "manual",
      });

      expect(response.status).toBe(302);
      expect(response.headers.get("Location")).toContain("error=invalid_token");
    });

    it("verifies subscription with valid token", async () => {
      const slug = `verify-sub-valid-${validSlugId()}`;
      const pageId = await createStatusPage(ctx, { slug, published: true });
      const verificationToken = nanoid(32);

      await ctx.dbClient`
        INSERT INTO subscribers (id, status_page_id, email, verified, verification_token, unsubscribe_token, channels, created_at, updated_at)
        VALUES (
          ${nanoid()},
          ${pageId},
          'verify-me@example.com',
          false,
          ${verificationToken},
          ${nanoid(32)},
          ${JSON.stringify({ email: true })}::jsonb,
          NOW(),
          NOW()
        )
      `;

      const response = await fetch(`${apiUrl}/public/status-pages/${slug}/subscribe/verify?token=${verificationToken}`, {
        redirect: "manual",
      });

      expect(response.status).toBe(302);
      expect(response.headers.get("Location")).toContain("message=subscribed");

      // Verify in database
      const [subscriber] = await ctx.dbClient`
        SELECT verified FROM subscribers WHERE verification_token IS NULL AND status_page_id = ${pageId}
      `;
      expect(subscriber.verified).toBe(true);
    });
  });

  describe("GET /public/status-pages/:slug/unsubscribe", () => {
    it("unsubscribes with valid token", async () => {
      const slug = `unsub-${validSlugId()}`;
      const pageId = await createStatusPage(ctx, { slug, published: true });
      const unsubscribeToken = nanoid(32);
      const subscriberId = nanoid();

      await ctx.dbClient`
        INSERT INTO subscribers (id, status_page_id, email, verified, unsubscribe_token, channels, created_at, updated_at)
        VALUES (
          ${subscriberId},
          ${pageId},
          'unsub-me@example.com',
          true,
          ${unsubscribeToken},
          ${JSON.stringify({ email: true })}::jsonb,
          NOW(),
          NOW()
        )
      `;

      const response = await fetch(`${apiUrl}/public/status-pages/${slug}/unsubscribe?token=${unsubscribeToken}`, {
        redirect: "manual",
      });

      expect(response.status).toBe(302);
      expect(response.headers.get("Location")).toContain("message=unsubscribed");

      // Verify deleted
      const [subscriber] = await ctx.dbClient`SELECT id FROM subscribers WHERE id = ${subscriberId}`;
      expect(subscriber).toBeUndefined();
    });
  });

  // ==========================================
  // Heartbeat Endpoint
  // ==========================================

  describe("ALL /public/heartbeat/:token", () => {
    it("accepts heartbeat ping with GET", async () => {
      const heartbeatToken = nanoid(32);
      const monitorId = nanoid();

      await ctx.dbClient`
        INSERT INTO monitors (id, organization_id, name, type, url, heartbeat_token, status, config, regions, interval_seconds, created_by, created_at, updated_at)
        VALUES (
          ${monitorId},
          ${ctx.organizationId},
          'Heartbeat Monitor',
          'heartbeat',
          'heartbeat://internal',
          ${heartbeatToken},
          'active',
          ${JSON.stringify({ heartbeat: { expectedIntervalSeconds: 60 } })}::jsonb,
          ${JSON.stringify(["uk"])}::jsonb,
          60,
          ${ctx.userId},
          NOW(),
          NOW()
        )
      `;

      const response = await fetch(`${apiUrl}/public/heartbeat/${heartbeatToken}`);
      expect(response.status).toBe(200);

      const json = await response.json();
      expect(json.success).toBe(true);
      expect(json.data.status).toBe("complete");
      expect(json.data.id).toBeDefined();
    });

    it("accepts heartbeat ping with POST", async () => {
      const heartbeatToken = nanoid(32);
      const monitorId = nanoid();

      await ctx.dbClient`
        INSERT INTO monitors (id, organization_id, name, type, url, heartbeat_token, status, config, regions, interval_seconds, created_by, created_at, updated_at)
        VALUES (
          ${monitorId},
          ${ctx.organizationId},
          'Heartbeat Monitor POST',
          'heartbeat',
          'heartbeat://internal',
          ${heartbeatToken},
          'active',
          ${JSON.stringify({ heartbeat: { expectedIntervalSeconds: 60 } })}::jsonb,
          ${JSON.stringify(["uk"])}::jsonb,
          60,
          ${ctx.userId},
          NOW(),
          NOW()
        )
      `;

      const response = await fetch(`${apiUrl}/public/heartbeat/${heartbeatToken}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ customField: "test" }),
      });

      expect(response.status).toBe(200);

      const json = await response.json();
      expect(json.success).toBe(true);
    });

    it("accepts status parameter (start, complete, fail)", async () => {
      const heartbeatToken = nanoid(32);
      const monitorId = nanoid();

      await ctx.dbClient`
        INSERT INTO monitors (id, organization_id, name, type, url, heartbeat_token, status, config, regions, interval_seconds, created_by, created_at, updated_at)
        VALUES (
          ${monitorId},
          ${ctx.organizationId},
          'Heartbeat Status Test',
          'heartbeat',
          'heartbeat://internal',
          ${heartbeatToken},
          'active',
          ${JSON.stringify({ heartbeat: { expectedIntervalSeconds: 60 } })}::jsonb,
          ${JSON.stringify(["uk"])}::jsonb,
          60,
          ${ctx.userId},
          NOW(),
          NOW()
        )
      `;

      const responseStart = await fetch(`${apiUrl}/public/heartbeat/${heartbeatToken}?status=start`);
      expect(responseStart.status).toBe(200);
      const jsonStart = await responseStart.json();
      expect(jsonStart.data.status).toBe("start");

      const responseFail = await fetch(`${apiUrl}/public/heartbeat/${heartbeatToken}?status=fail`);
      expect(responseFail.status).toBe(200);
      const jsonFail = await responseFail.json();
      expect(jsonFail.data.status).toBe("fail");
    });

    it("accepts duration and exit_code parameters", async () => {
      const heartbeatToken = nanoid(32);
      const monitorId = nanoid();

      await ctx.dbClient`
        INSERT INTO monitors (id, organization_id, name, type, url, heartbeat_token, status, config, regions, interval_seconds, created_by, created_at, updated_at)
        VALUES (
          ${monitorId},
          ${ctx.organizationId},
          'Heartbeat Params Test',
          'heartbeat',
          'heartbeat://internal',
          ${heartbeatToken},
          'active',
          ${JSON.stringify({ heartbeat: { expectedIntervalSeconds: 60 } })}::jsonb,
          ${JSON.stringify(["uk"])}::jsonb,
          60,
          ${ctx.userId},
          NOW(),
          NOW()
        )
      `;

      const response = await fetch(`${apiUrl}/public/heartbeat/${heartbeatToken}?duration=1500&exit_code=0`);
      expect(response.status).toBe(200);

      // Verify stored in database
      const [ping] = await ctx.dbClient`
        SELECT duration_ms, exit_code FROM heartbeat_pings WHERE monitor_id = ${monitorId} ORDER BY created_at DESC LIMIT 1
      `;
      expect(ping.duration_ms).toBe(1500);
      expect(ping.exit_code).toBe(0);
    });

    it("returns 404 for invalid token", async () => {
      const response = await fetch(`${apiUrl}/public/heartbeat/invalid-token-${nanoid()}`);
      expect(response.status).toBe(404);

      const json = await response.json();
      expect(json.error.code).toBe("NOT_FOUND");
    });

    it("returns 400 for paused monitor", async () => {
      const heartbeatToken = nanoid(32);
      const monitorId = nanoid();

      await ctx.dbClient`
        INSERT INTO monitors (id, organization_id, name, type, url, heartbeat_token, status, paused, config, regions, interval_seconds, created_by, created_at, updated_at)
        VALUES (
          ${monitorId},
          ${ctx.organizationId},
          'Paused Heartbeat',
          'heartbeat',
          'heartbeat://internal',
          ${heartbeatToken},
          'active',
          true,
          ${JSON.stringify({ heartbeat: { expectedIntervalSeconds: 60 } })}::jsonb,
          ${JSON.stringify(["uk"])}::jsonb,
          60,
          ${ctx.userId},
          NOW(),
          NOW()
        )
      `;

      const response = await fetch(`${apiUrl}/public/heartbeat/${heartbeatToken}`);
      expect(response.status).toBe(400);

      const json = await response.json();
      expect(json.error.code).toBe("PAUSED");
    });

    it("updates monitor status to down on fail ping", async () => {
      const heartbeatToken = nanoid(32);
      const monitorId = nanoid();

      await ctx.dbClient`
        INSERT INTO monitors (id, organization_id, name, type, url, heartbeat_token, status, config, regions, interval_seconds, created_by, created_at, updated_at)
        VALUES (
          ${monitorId},
          ${ctx.organizationId},
          'Heartbeat Fail Test',
          'heartbeat',
          'heartbeat://internal',
          ${heartbeatToken},
          'active',
          ${JSON.stringify({ heartbeat: { expectedIntervalSeconds: 60 } })}::jsonb,
          ${JSON.stringify(["uk"])}::jsonb,
          60,
          ${ctx.userId},
          NOW(),
          NOW()
        )
      `;

      await fetch(`${apiUrl}/public/heartbeat/${heartbeatToken}?status=fail`);

      const [monitor] = await ctx.dbClient`SELECT status FROM monitors WHERE id = ${monitorId}`;
      expect(monitor.status).toBe("down");
    });
  });

  // ==========================================
  // Crowdsourced Reports
  // ==========================================

  describe("POST /public/status-pages/:slug/report-down", () => {
    it("returns 404 for non-existent status page", async () => {
      const response = await fetch(`${apiUrl}/public/status-pages/non-existent-${nanoid()}/report-down`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ monitorId: nanoid() }),
      });

      expect(response.status).toBe(404);
    });

    it("returns 403 when crowdsourced reports are disabled", async () => {
      const slug = `crowd-disabled-${validSlugId()}`;
      await createStatusPage(ctx, { slug, published: true });

      const response = await fetch(`${apiUrl}/public/status-pages/${slug}/report-down`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ monitorId: nanoid() }),
      });

      expect(response.status).toBe(403);

      const json = await response.json();
      expect(json.error.code).toBe("DISABLED");
    });

    it("returns 400 for missing monitorId", async () => {
      const slug = `crowd-no-monitor-${validSlugId()}`;
      const pageId = await createStatusPage(ctx, { slug, published: true });

      // Enable crowdsourced settings
      await ctx.dbClient`
        INSERT INTO crowdsourced_settings (id, status_page_id, enabled, report_threshold, time_window_minutes, rate_limit_per_ip, auto_degrade_enabled, created_at, updated_at)
        VALUES (${nanoid()}, ${pageId}, true, 5, 30, 10, false, NOW(), NOW())
      `;

      const response = await fetch(`${apiUrl}/public/status-pages/${slug}/report-down`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });

      expect(response.status).toBe(400);

      const json = await response.json();
      expect(json.error.code).toBe("MISSING_MONITOR_ID");
    });

    it("returns 404 for monitor not on status page", async () => {
      const slug = `crowd-wrong-monitor-${validSlugId()}`;
      const pageId = await createStatusPage(ctx, { slug, published: true });

      await ctx.dbClient`
        INSERT INTO crowdsourced_settings (id, status_page_id, enabled, report_threshold, time_window_minutes, rate_limit_per_ip, auto_degrade_enabled, created_at, updated_at)
        VALUES (${nanoid()}, ${pageId}, true, 5, 30, 10, false, NOW(), NOW())
      `;

      const response = await fetch(`${apiUrl}/public/status-pages/${slug}/report-down`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ monitorId: nanoid() }),
      });

      expect(response.status).toBe(404);

      const json = await response.json();
      expect(json.error.code).toBe("MONITOR_NOT_FOUND");
    });

    it("accepts valid report and returns count", async () => {
      const slug = `crowd-valid-${validSlugId()}`;
      const pageId = await createStatusPage(ctx, { slug, published: true });
      const monitorId = await createMonitor(ctx, { type: "http" });
      await linkMonitorToStatusPage(ctx, pageId, monitorId);

      await ctx.dbClient`
        INSERT INTO crowdsourced_settings (id, status_page_id, enabled, report_threshold, time_window_minutes, rate_limit_per_ip, auto_degrade_enabled, created_at, updated_at)
        VALUES (${nanoid()}, ${pageId}, true, 5, 30, 10, false, NOW(), NOW())
      `;

      const response = await fetch(`${apiUrl}/public/status-pages/${slug}/report-down`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ monitorId }),
      });

      expect(response.status).toBe(200);

      const json = await response.json();
      expect(json.success).toBe(true);
      expect(json.data.acknowledged).toBe(true);
      expect(json.data.reportCount).toBeGreaterThanOrEqual(1);
      expect(json.data.threshold).toBe(5);
    });

    it("handles duplicate reports gracefully", async () => {
      const slug = `crowd-dupe-${validSlugId()}`;
      const pageId = await createStatusPage(ctx, { slug, published: true });
      const monitorId = await createMonitor(ctx, { type: "http" });
      await linkMonitorToStatusPage(ctx, pageId, monitorId);

      await ctx.dbClient`
        INSERT INTO crowdsourced_settings (id, status_page_id, enabled, report_threshold, time_window_minutes, rate_limit_per_ip, auto_degrade_enabled, created_at, updated_at)
        VALUES (${nanoid()}, ${pageId}, true, 5, 30, 10, false, NOW(), NOW())
      `;

      // First report
      await fetch(`${apiUrl}/public/status-pages/${slug}/report-down`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ monitorId }),
      });

      // Second report (duplicate within 5 minutes)
      const response = await fetch(`${apiUrl}/public/status-pages/${slug}/report-down`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ monitorId }),
      });

      expect(response.status).toBe(200);

      const json = await response.json();
      expect(json.data.duplicate).toBe(true);
    });
  });

  describe("GET /public/status-pages/:slug/report-counts", () => {
    it("returns counts when crowdsourced is enabled", async () => {
      const slug = `crowd-counts-${validSlugId()}`;
      const pageId = await createStatusPage(ctx, { slug, published: true });
      const monitorId = await createMonitor(ctx, { type: "http" });
      await linkMonitorToStatusPage(ctx, pageId, monitorId);

      await ctx.dbClient`
        INSERT INTO crowdsourced_settings (id, status_page_id, enabled, report_threshold, time_window_minutes, rate_limit_per_ip, auto_degrade_enabled, created_at, updated_at)
        VALUES (${nanoid()}, ${pageId}, true, 5, 30, 10, false, NOW(), NOW())
      `;

      // Add a report
      await ctx.dbClient`
        INSERT INTO crowdsourced_reports (id, status_page_id, monitor_id, ip_hash, expires_at, created_at)
        VALUES (${nanoid()}, ${pageId}, ${monitorId}, 'hash123', NOW() + INTERVAL '30 minutes', NOW())
      `;

      const response = await fetch(`${apiUrl}/public/status-pages/${slug}/report-counts`);
      expect(response.status).toBe(200);

      const json = await response.json();
      expect(json.success).toBe(true);
      expect(json.data.enabled).toBe(true);
      expect(json.data.threshold).toBe(5);
      expect(json.data.counts[monitorId]).toBe(1);
    });

    it("returns enabled=false when crowdsourced is disabled", async () => {
      const slug = `crowd-counts-disabled-${validSlugId()}`;
      await createStatusPage(ctx, { slug, published: true });

      const response = await fetch(`${apiUrl}/public/status-pages/${slug}/report-counts`);
      expect(response.status).toBe(200);

      const json = await response.json();
      expect(json.data.enabled).toBe(false);
    });
  });

  // ==========================================
  // Component Subscriptions
  // ==========================================

  describe("POST /public/status-pages/:slug/components/:monitorId/subscribe", () => {
    it("creates component subscription", async () => {
      const slug = `comp-sub-${validSlugId()}`;
      const pageId = await createStatusPage(ctx, { slug, published: true });
      const monitorId = await createMonitor(ctx, { type: "http" });
      await linkMonitorToStatusPage(ctx, pageId, monitorId);

      const response = await fetch(`${apiUrl}/public/status-pages/${slug}/components/${monitorId}/subscribe`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: `component-sub-${validSlugId()}@example.com` }),
      });

      expect(response.status).toBe(200);

      const json = await response.json();
      expect(json.success).toBe(true);
      expect(json.data.message).toContain("Verification email sent");
    });

    it("returns 400 for invalid email", async () => {
      const slug = `comp-sub-invalid-${validSlugId()}`;
      const pageId = await createStatusPage(ctx, { slug, published: true });
      const monitorId = await createMonitor(ctx, { type: "http" });
      await linkMonitorToStatusPage(ctx, pageId, monitorId);

      const response = await fetch(`${apiUrl}/public/status-pages/${slug}/components/${monitorId}/subscribe`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: "invalid" }),
      });

      expect(response.status).toBe(400);

      const json = await response.json();
      expect(json.error.code).toBe("INVALID_EMAIL");
    });

    it("returns 404 for monitor not on status page", async () => {
      const slug = `comp-sub-404-${validSlugId()}`;
      await createStatusPage(ctx, { slug, published: true });

      const response = await fetch(`${apiUrl}/public/status-pages/${slug}/components/${nanoid()}/subscribe`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: "test@example.com" }),
      });

      expect(response.status).toBe(404);

      const json = await response.json();
      expect(json.error.code).toBe("MONITOR_NOT_FOUND");
    });

    it("accepts notifyOn preferences", async () => {
      const slug = `comp-sub-notify-${validSlugId()}`;
      const pageId = await createStatusPage(ctx, { slug, published: true });
      const monitorId = await createMonitor(ctx, { type: "http" });
      await linkMonitorToStatusPage(ctx, pageId, monitorId);
      const email = `notify-prefs-${validSlugId()}@example.com`;

      const response = await fetch(`${apiUrl}/public/status-pages/${slug}/components/${monitorId}/subscribe`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email,
          notifyOn: { newIncident: true, newMaintenance: false, statusChange: true },
        }),
      });

      expect(response.status).toBe(200);

      // Verify preferences stored
      const [subscription] = await ctx.dbClient`
        SELECT notify_on FROM component_subscriptions WHERE email = ${email.toLowerCase()}
      `;
      expect(subscription.notify_on.statusChange).toBe(true);
      expect(subscription.notify_on.newMaintenance).toBe(false);
    });
  });

  describe("GET /public/status-pages/:slug/components/:monitorId/subscribers/count", () => {
    it("returns count of verified subscribers", async () => {
      const slug = `comp-count-${validSlugId()}`;
      const pageId = await createStatusPage(ctx, { slug, published: true });
      const monitorId = await createMonitor(ctx, { type: "http" });
      await linkMonitorToStatusPage(ctx, pageId, monitorId);

      // Add verified subscriber
      await ctx.dbClient`
        INSERT INTO component_subscriptions (id, status_page_id, monitor_id, email, verified, unsubscribe_token, channels, notify_on, created_at, updated_at)
        VALUES (${nanoid()}, ${pageId}, ${monitorId}, 'verified@example.com', true, ${nanoid(32)}, ${JSON.stringify({ email: true })}::jsonb, ${JSON.stringify({ newIncident: true })}::jsonb, NOW(), NOW())
      `;

      // Add unverified subscriber
      await ctx.dbClient`
        INSERT INTO component_subscriptions (id, status_page_id, monitor_id, email, verified, verification_token, unsubscribe_token, channels, notify_on, created_at, updated_at)
        VALUES (${nanoid()}, ${pageId}, ${monitorId}, 'unverified@example.com', false, ${nanoid(32)}, ${nanoid(32)}, ${JSON.stringify({ email: true })}::jsonb, ${JSON.stringify({ newIncident: true })}::jsonb, NOW(), NOW())
      `;

      const response = await fetch(`${apiUrl}/public/status-pages/${slug}/components/${monitorId}/subscribers/count`);
      expect(response.status).toBe(200);

      const json = await response.json();
      expect(json.success).toBe(true);
      expect(json.data.count).toBe(1); // Only verified
    });
  });

  describe("GET /public/status-pages/:slug/components/:monitorId/subscription-status", () => {
    it("returns subscription status for email", async () => {
      const slug = `comp-status-${validSlugId()}`;
      const pageId = await createStatusPage(ctx, { slug, published: true });
      const monitorId = await createMonitor(ctx, { type: "http" });
      await linkMonitorToStatusPage(ctx, pageId, monitorId);
      const email = "subscribed@example.com";

      await ctx.dbClient`
        INSERT INTO component_subscriptions (id, status_page_id, monitor_id, email, verified, unsubscribe_token, channels, notify_on, created_at, updated_at)
        VALUES (${nanoid()}, ${pageId}, ${monitorId}, ${email}, true, ${nanoid(32)}, ${JSON.stringify({ email: true })}::jsonb, ${JSON.stringify({ newIncident: true, statusChange: true })}::jsonb, NOW(), NOW())
      `;

      const response = await fetch(`${apiUrl}/public/status-pages/${slug}/components/${monitorId}/subscription-status?email=${encodeURIComponent(email)}`);
      expect(response.status).toBe(200);

      const json = await response.json();
      expect(json.success).toBe(true);
      expect(json.data.isSubscribed).toBe(true);
      expect(json.data.notifyOn).toBeDefined();
    });

    it("returns isSubscribed=false for non-subscribed email", async () => {
      const slug = `comp-status-no-${validSlugId()}`;
      const pageId = await createStatusPage(ctx, { slug, published: true });
      const monitorId = await createMonitor(ctx, { type: "http" });
      await linkMonitorToStatusPage(ctx, pageId, monitorId);

      const response = await fetch(`${apiUrl}/public/status-pages/${slug}/components/${monitorId}/subscription-status?email=not-subscribed@example.com`);
      expect(response.status).toBe(200);

      const json = await response.json();
      expect(json.data.isSubscribed).toBe(false);
    });
  });

  describe("GET /public/components/unsubscribe", () => {
    it("unsubscribes with valid token", async () => {
      const slug = `comp-unsub-${validSlugId()}`;
      const pageId = await createStatusPage(ctx, { slug, published: true });
      const monitorId = await createMonitor(ctx, { type: "http" });
      await linkMonitorToStatusPage(ctx, pageId, monitorId);
      const unsubscribeToken = nanoid(32);
      const subscriptionId = nanoid();

      await ctx.dbClient`
        INSERT INTO component_subscriptions (id, status_page_id, monitor_id, email, verified, unsubscribe_token, channels, notify_on, created_at, updated_at)
        VALUES (${subscriptionId}, ${pageId}, ${monitorId}, 'comp-unsub@example.com', true, ${unsubscribeToken}, ${JSON.stringify({ email: true })}::jsonb, ${JSON.stringify({ newIncident: true })}::jsonb, NOW(), NOW())
      `;

      const response = await fetch(`${apiUrl}/public/components/unsubscribe?token=${unsubscribeToken}`, {
        redirect: "manual",
      });

      expect(response.status).toBe(302);
      expect(response.headers.get("Location")).toContain("message=unsubscribed");

      // Verify deleted
      const [subscription] = await ctx.dbClient`SELECT id FROM component_subscriptions WHERE id = ${subscriptionId}`;
      expect(subscription).toBeUndefined();
    });

    it("returns 400 for missing token", async () => {
      const response = await fetch(`${apiUrl}/public/components/unsubscribe`);
      expect(response.status).toBe(400);

      const json = await response.json();
      expect(json.error.code).toBe("INVALID_TOKEN");
    });

    it("returns 404 for invalid token", async () => {
      const response = await fetch(`${apiUrl}/public/components/unsubscribe?token=invalid-token-${nanoid()}`);
      expect(response.status).toBe(404);

      const json = await response.json();
      expect(json.error.code).toBe("NOT_FOUND");
    });
  });

  // ==========================================
  // Services Endpoint
  // ==========================================

  describe("GET /public/status-pages/:slug/services", () => {
    it("returns services data with metrics", async () => {
      const slug = `services-${validSlugId()}`;
      const pageId = await createStatusPage(ctx, { slug, published: true });
      const monitorId = await createMonitor(ctx, { type: "http" });
      await linkMonitorToStatusPage(ctx, pageId, monitorId);

      // Add check results for metrics
      await insertCheckResults(ctx, monitorId, [
        { status: "success", responseTimeMs: 100 },
        { status: "success", responseTimeMs: 150 },
      ]);

      const response = await fetch(`${apiUrl}/public/status-pages/${slug}/services`);
      expect(response.status).toBe(200);

      const json = await response.json();
      expect(json.success).toBe(true);
      expect(json.data.services).toBeDefined();
      expect(Array.isArray(json.data.services)).toBe(true);
    });

    it("supports groupBy parameter", async () => {
      const slug = `services-group-${validSlugId()}`;
      const pageId = await createStatusPage(ctx, { slug, published: true });
      const monitorId = await createMonitor(ctx, { type: "http" });
      await linkMonitorToStatusPage(ctx, pageId, monitorId, { group: "API Services" });

      const response = await fetch(`${apiUrl}/public/status-pages/${slug}/services?groupBy=group`);
      expect(response.status).toBe(200);

      const json = await response.json();
      expect(json.data.groups).toBeDefined();
      expect(json.data.groupBy).toBe("group");
    });

    it("returns 404 for non-existent page", async () => {
      const response = await fetch(`${apiUrl}/public/status-pages/non-existent-${nanoid()}/services`);
      expect(response.status).toBe(404);
    });
  });

  // ==========================================
  // Geo View
  // ==========================================

  describe("GET /public/status-pages/:slug/geo", () => {
    it("returns geo data with regions", async () => {
      const slug = `geo-${validSlugId()}`;
      const pageId = await createStatusPage(ctx, { slug, published: true });
      const monitorId = await createMonitor(ctx, { type: "http", regions: ["uk", "us-east"] });
      await linkMonitorToStatusPage(ctx, pageId, monitorId);

      const response = await fetch(`${apiUrl}/public/status-pages/${slug}/geo`);
      expect(response.status).toBe(200);

      const json = await response.json();
      expect(json.success).toBe(true);
      expect(json.data.regions).toBeDefined();
      expect(json.data.monitors).toBeDefined();
      expect(json.data.probes).toBeDefined();
      expect(json.data.incidents).toBeDefined();
    });

    it("includes quorum connections for multi-region monitors", async () => {
      const slug = `geo-quorum-${validSlugId()}`;
      const pageId = await createStatusPage(ctx, { slug, published: true });
      const monitorId = await createMonitor(ctx, { type: "http", regions: ["uk", "us-east", "eu-central"] });
      await linkMonitorToStatusPage(ctx, pageId, monitorId);

      const response = await fetch(`${apiUrl}/public/status-pages/${slug}/geo`);
      expect(response.status).toBe(200);

      const json = await response.json();
      expect(json.data.quorumConnections).toBeDefined();
      // With 3 regions, we should have at least some connections
    });

    it("returns 404 for non-existent page", async () => {
      const response = await fetch(`${apiUrl}/public/status-pages/non-existent-${nanoid()}/geo`);
      expect(response.status).toBe(404);
    });

    it("returns correct monitorCount per region for multiple monitors in same region", async () => {
      const slug = `geo-monitor-count-${validSlugId()}`;
      const pageId = await createStatusPage(ctx, { slug, published: true });

      // Create 3 monitors all in the same region (uk)
      const monitor1 = await createMonitor(ctx, { type: "http", name: "Monitor 1", regions: ["uk"] });
      const monitor2 = await createMonitor(ctx, { type: "http", name: "Monitor 2", regions: ["uk"] });
      const monitor3 = await createMonitor(ctx, { type: "http", name: "Monitor 3", regions: ["uk"] });

      await linkMonitorToStatusPage(ctx, pageId, monitor1);
      await linkMonitorToStatusPage(ctx, pageId, monitor2);
      await linkMonitorToStatusPage(ctx, pageId, monitor3);

      const response = await fetch(`${apiUrl}/public/status-pages/${slug}/geo`);
      expect(response.status).toBe(200);

      const json = await response.json();
      expect(json.success).toBe(true);
      expect(json.data.regions).toBeDefined();

      // Find the UK region
      const ukRegion = json.data.regions.find((r: { id: string }) => r.id === "uk");
      expect(ukRegion).toBeDefined();
      // The region should show 3 monitors, not 1 region
      expect(ukRegion.monitorCount).toBe(3);
    });

    it("returns correct monitorCount when monitors span multiple regions", async () => {
      const slug = `geo-multi-region-${validSlugId()}`;
      const pageId = await createStatusPage(ctx, { slug, published: true });

      // Create 2 monitors: one in uk only, one in both uk and us-east
      const monitor1 = await createMonitor(ctx, { type: "http", name: "UK Monitor", regions: ["uk"] });
      const monitor2 = await createMonitor(ctx, { type: "http", name: "Multi Monitor", regions: ["uk", "us-east"] });

      await linkMonitorToStatusPage(ctx, pageId, monitor1);
      await linkMonitorToStatusPage(ctx, pageId, monitor2);

      const response = await fetch(`${apiUrl}/public/status-pages/${slug}/geo`);
      expect(response.status).toBe(200);

      const json = await response.json();
      expect(json.success).toBe(true);

      // UK region should have 2 monitors (both monitors are in UK)
      const ukRegion = json.data.regions.find((r: { id: string }) => r.id === "uk");
      expect(ukRegion).toBeDefined();
      expect(ukRegion.monitorCount).toBe(2);

      // US East region should have 1 monitor (only monitor2)
      const usEastRegion = json.data.regions.find((r: { id: string }) => r.id === "us-east");
      expect(usEastRegion).toBeDefined();
      expect(usEastRegion.monitorCount).toBe(1);
    });
  });

  // ==========================================
  // Event Export
  // ==========================================

  describe("GET /public/status-pages/:slug/events/:type/:id/export", () => {
    it("exports incident as JSON", async () => {
      const slug = `event-export-${validSlugId()}`;
      await createStatusPage(ctx, { slug, published: true });
      const incidentId = nanoid();

      await ctx.dbClient`
        INSERT INTO incidents (id, organization_id, title, message, status, severity, started_at, created_by, created_at, updated_at)
        VALUES (${incidentId}, ${ctx.organizationId}, 'Export Test Incident', 'Test message', 'investigating', 'major', NOW(), ${ctx.userId}, NOW(), NOW())
      `;

      const response = await fetch(`${apiUrl}/public/status-pages/${slug}/events/incident/${incidentId}/export?format=json`);
      expect(response.status).toBe(200);

      const json = await response.json();
      expect(json.success).toBe(true);
      expect(json.data.id).toBe(incidentId);
      expect(json.data.type).toBe("incident");
      expect(json.data.title).toBe("Export Test Incident");
    });

    it("exports incident as ICS", async () => {
      const slug = `event-export-ics-${validSlugId()}`;
      await createStatusPage(ctx, { slug, published: true });
      const incidentId = nanoid();

      await ctx.dbClient`
        INSERT INTO incidents (id, organization_id, title, message, status, severity, started_at, created_by, created_at, updated_at)
        VALUES (${incidentId}, ${ctx.organizationId}, 'ICS Export Incident', 'Test message', 'investigating', 'major', NOW(), ${ctx.userId}, NOW(), NOW())
      `;

      const response = await fetch(`${apiUrl}/public/status-pages/${slug}/events/incident/${incidentId}/export?format=ics`);
      expect(response.status).toBe(200);
      expect(response.headers.get("Content-Type")).toContain("text/calendar");

      const icsContent = await response.text();
      expect(icsContent).toContain("BEGIN:VCALENDAR");
      expect(icsContent).toContain("BEGIN:VEVENT");
      expect(icsContent).toContain("ICS Export Incident");
    });

    it("exports maintenance as JSON", async () => {
      const slug = `event-export-maint-${validSlugId()}`;
      await createStatusPage(ctx, { slug, published: true });
      const maintenanceId = nanoid();

      await ctx.dbClient`
        INSERT INTO maintenance_windows (id, organization_id, name, description, starts_at, ends_at, created_by, created_at, updated_at)
        VALUES (${maintenanceId}, ${ctx.organizationId}, 'Scheduled Maintenance', 'Test description', NOW(), NOW() + INTERVAL '2 hours', ${ctx.userId}, NOW(), NOW())
      `;

      const response = await fetch(`${apiUrl}/public/status-pages/${slug}/events/maintenance/${maintenanceId}/export?format=json`);
      expect(response.status).toBe(200);

      const json = await response.json();
      expect(json.data.type).toBe("maintenance");
      expect(json.data.title).toBe("Scheduled Maintenance");
    });

    it("returns 400 for invalid event type", async () => {
      const slug = `event-export-invalid-${validSlugId()}`;
      await createStatusPage(ctx, { slug, published: true });

      const response = await fetch(`${apiUrl}/public/status-pages/${slug}/events/invalid/${nanoid()}/export`);
      expect(response.status).toBe(400);

      const json = await response.json();
      expect(json.error.code).toBe("INVALID_TYPE");
    });

    it("returns 404 for non-existent event", async () => {
      const slug = `event-export-404-${validSlugId()}`;
      await createStatusPage(ctx, { slug, published: true });

      const response = await fetch(`${apiUrl}/public/status-pages/${slug}/events/incident/${nanoid()}/export`);
      expect(response.status).toBe(404);
    });
  });

  // ==========================================
  // Edge Cases
  // ==========================================

  describe("Edge Cases", () => {
    it("handles empty status page (no monitors)", async () => {
      const slug = `empty-page-${validSlugId()}`;
      await createStatusPage(ctx, { slug, published: true });

      const response = await fetch(`${apiUrl}/public/status-pages/${slug}`);
      expect(response.status).toBe(200);

      const json = await response.json();
      expect(json.data.monitors).toEqual([]);
    });

    it("handles status page with many monitors", async () => {
      const slug = `many-monitors-${validSlugId()}`;
      const pageId = await createStatusPage(ctx, { slug, published: true });

      // Create 10 monitors
      for (let i = 0; i < 10; i++) {
        const monitorId = await createMonitor(ctx, { type: "http", name: `Monitor ${i}` });
        await linkMonitorToStatusPage(ctx, pageId, monitorId, { order: i });
      }

      const response = await fetch(`${apiUrl}/public/status-pages/${slug}`);
      expect(response.status).toBe(200);

      const json = await response.json();
      expect(json.data.monitors.length).toBe(10);
    });

    it("handles special characters in slug", async () => {
      // Slug with allowed special characters
      const slug = `test-page-123-${validSlugId()}`;
      await createStatusPage(ctx, { slug, published: true });

      const response = await fetch(`${apiUrl}/public/status-pages/${slug}`);
      expect(response.status).toBe(200);
    });

    it("handles concurrent subscriptions", async () => {
      const slug = `concurrent-sub-${validSlugId()}`;
      await createStatusPage(ctx, { slug, published: true });

      // Subscribe multiple emails concurrently
      const emails = Array.from({ length: 5 }, (_, i) => `concurrent-${i}-${validSlugId()}@example.com`);

      const responses = await Promise.all(
        emails.map((email) =>
          fetch(`${apiUrl}/public/status-pages/${slug}/subscribe`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ email }),
          })
        )
      );

      // All should succeed
      for (const response of responses) {
        expect(response.status).toBe(200);
      }
    });

    it("handles status page with active incidents", async () => {
      const slug = `with-active-incident-${validSlugId()}`;
      const pageId = await createStatusPage(ctx, { slug, published: true });
      const monitorId = await createMonitor(ctx, { type: "http" });
      await linkMonitorToStatusPage(ctx, pageId, monitorId);
      await setMonitorStatus(ctx, monitorId, "down");

      // Create active incident
      await ctx.dbClient`
        INSERT INTO incidents (id, organization_id, title, message, status, severity, affected_monitors, started_at, created_by, created_at, updated_at)
        VALUES (${nanoid()}, ${ctx.organizationId}, 'Active Incident', 'Something is wrong', 'investigating', 'critical', ${JSON.stringify([monitorId])}, NOW(), ${ctx.userId}, NOW(), NOW())
      `;

      const response = await fetch(`${apiUrl}/public/status-pages/${slug}`);
      expect(response.status).toBe(200);

      const json = await response.json();
      // API returns activeIncidents not incidents
      expect(json.data.activeIncidents.length).toBeGreaterThan(0);
      expect(json.data.activeIncidents[0].status).toBe("investigating");
    });
  });
});
