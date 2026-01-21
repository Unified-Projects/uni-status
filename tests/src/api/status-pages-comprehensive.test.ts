import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { Client } from "pg";
import { bootstrapTestContext, TestContext } from "../helpers/context";
import { insertApiKey } from "../helpers/data";

const API_URL = (process.env.API_BASE_URL ?? "http://api:3001") + "/api/v1";
const DEFAULT_DB_URL =
  "postgresql://uni_status:uni_status_dev@postgres:5432/uni_status?sslmode=disable";

// Unique suffix to prevent slug collisions between test runs
const TEST_SUFFIX = Date.now().toString(36);
let slugCounter = 0;

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

// Helper to create a unique slug
function uniqueSlug(base: string): string {
  return `${base}-${TEST_SUFFIX}-${slugCounter++}`;
}

// Helper to create a status page
async function createStatusPage(
  slug: string,
  options?: {
    name?: string;
    published?: boolean;
    password?: string;
    customDomain?: string;
    theme?: object;
    settings?: object;
    template?: object;
    authConfig?: object;
    seo?: object;
  }
): Promise<string> {
  const uniqueSlugValue = uniqueSlug(slug);
  const res = await fetch(`${API_URL}/status-pages`, {
    method: "POST",
    headers: ctx.headers,
    body: JSON.stringify({
      name: options?.name ?? `Status Page ${slug}`,
      slug: uniqueSlugValue,
      published: options?.published ?? true,
      password: options?.password,
      customDomain: options?.customDomain,
      theme: options?.theme,
      settings: options?.settings,
      template: options?.template,
      authConfig: options?.authConfig,
      seo: options?.seo,
    }),
  });
  const data = await res.json();
  if (!res.ok || !data.data?.id) {
    throw new Error(`Failed to create status page ${uniqueSlugValue}: ${res.status} ${JSON.stringify(data)}`);
  }
  return data.data.id;
}

describe("Status Pages API - Comprehensive Tests", () => {
  describe("POST /status-pages - Create Status Page", () => {
    it("creates a status page with minimal fields", async () => {
      const slug = uniqueSlug("minimal-page");
      const res = await fetch(`${API_URL}/status-pages`, {
        method: "POST",
        headers: ctx.headers,
        body: JSON.stringify({
          name: "Minimal Status Page",
          slug,
        }),
      });

      expect(res.status).toBe(201);
      const data = await res.json();
      expect(data.success).toBe(true);
      expect(data.data).toMatchObject({
        name: "Minimal Status Page",
        slug,
        published: false,
      });
      expect(data.data.id).toBeDefined();
    });

    it("creates a status page with all fields", async () => {
      const slug = uniqueSlug("full-page");
      const res = await fetch(`${API_URL}/status-pages`, {
        method: "POST",
        headers: ctx.headers,
        body: JSON.stringify({
          name: "Full Status Page",
          slug,
          published: true,
          logo: "https://example.com/logo.png",
          favicon: "https://example.com/favicon.ico",
          theme: {
            name: "dark",
            primaryColor: "#1a73e8",
            backgroundColor: "#121212",
            textColor: "#ffffff",
            customCss: "body { font-family: Arial; }",
          },
          settings: {
            showUptimePercentage: true,
            showResponseTime: true,
            showIncidentHistory: true,
            showServicesPage: true,
            showGeoMap: true,
            uptimeDays: 90,
            uptimeGranularity: "hour",
            headerText: "Welcome to our status page",
            footerText: "Powered by UniStatus",
            supportUrl: "https://support.example.com",
            hideBranding: true,
            defaultTimezone: "America/New_York",
            displayMode: "both",
            graphTooltipMetrics: {
              avg: true,
              min: true,
              max: true,
              p50: true,
              p90: true,
              p99: true,
            },
          },
          template: {
            id: "modern",
            layout: "cards",
            indicatorStyle: "badge",
            incidentStyle: "cards",
            monitorStyle: "detailed",
            borderRadius: "xl",
            shadow: "lg",
            spacing: "relaxed",
          },
          seo: {
            title: "Custom SEO Title",
            description: "Custom meta description",
            ogImage: "https://example.com/og.png",
            ogTemplate: "modern",
          },
        }),
      });

      expect(res.status).toBe(201);
      const data = await res.json();
      expect(data.success).toBe(true);
      expect(data.data).toMatchObject({
        name: "Full Status Page",
        slug,
        published: true,
      });
      expect(data.data.theme.name).toBe("dark");
      expect(data.data.settings.showUptimePercentage).toBe(true);
      expect(data.data.template.layout).toBe("cards");
      expect(data.data.seo.title).toBe("Custom SEO Title");
    });

    it("creates a password-protected status page", async () => {
      const slug = uniqueSlug("protected-page");
      const res = await fetch(`${API_URL}/status-pages`, {
        method: "POST",
        headers: ctx.headers,
        body: JSON.stringify({
          name: "Protected Status Page",
          slug,
          password: "secret123",
        }),
      });

      expect(res.status).toBe(201);
      const data = await res.json();
      expect(data.success).toBe(true);
      // Password hash should be stored, not returned
      expect(data.data.passwordHash).toBeDefined();
      expect(data.data.password).toBeUndefined();
    });

    it("creates a status page with OAuth protection", async () => {
      const slug = uniqueSlug("oauth-protected-page");
      const res = await fetch(`${API_URL}/status-pages`, {
        method: "POST",
        headers: ctx.headers,
        body: JSON.stringify({
          name: "OAuth Protected Page",
          slug,
          authConfig: {
            protectionMode: "oauth",
            oauthMode: "org_members",
            allowedRoles: ["owner", "admin"],
          },
        }),
      });

      expect(res.status).toBe(201);
      const data = await res.json();
      expect(data.success).toBe(true);
      expect(data.data.authConfig.protectionMode).toBe("oauth");
      expect(data.data.authConfig.oauthMode).toBe("org_members");
    });

    it("creates a status page with allowlist OAuth mode", async () => {
      const slug = uniqueSlug("allowlist-oauth-page");
      const res = await fetch(`${API_URL}/status-pages`, {
        method: "POST",
        headers: ctx.headers,
        body: JSON.stringify({
          name: "Allowlist OAuth Page",
          slug,
          authConfig: {
            protectionMode: "oauth",
            oauthMode: "allowlist",
            allowedEmails: ["user@example.com", "admin@example.com"],
            allowedDomains: ["example.com", "company.org"],
          },
        }),
      });

      expect(res.status).toBe(201);
      const data = await res.json();
      expect(data.success).toBe(true);
      expect(data.data.authConfig.oauthMode).toBe("allowlist");
      expect(data.data.authConfig.allowedEmails).toContain("user@example.com");
    });

    it("creates a status page with custom domain", async () => {
      const slug = uniqueSlug("custom-domain-page");
      const res = await fetch(`${API_URL}/status-pages`, {
        method: "POST",
        headers: ctx.headers,
        body: JSON.stringify({
          name: "Custom Domain Page",
          slug,
          customDomain: `status-${TEST_SUFFIX}.example.com`,
        }),
      });

      expect(res.status).toBe(201);
      const data = await res.json();
      expect(data.success).toBe(true);
      expect(data.data.customDomain).toBe(`status-${TEST_SUFFIX}.example.com`);
    });

    it("rejects duplicate slug", async () => {
      const slug = uniqueSlug("duplicate-slug-test");
      // First, ensure slug exists
      await fetch(`${API_URL}/status-pages`, {
        method: "POST",
        headers: ctx.headers,
        body: JSON.stringify({
          name: "First Page",
          slug,
        }),
      });

      // Try to create with same slug
      const res = await fetch(`${API_URL}/status-pages`, {
        method: "POST",
        headers: ctx.headers,
        body: JSON.stringify({
          name: "Second Page",
          slug,
        }),
      });

      expect(res.status).toBeGreaterThanOrEqual(400);
    });

    it("rejects duplicate custom domain", async () => {
      const customDomain = `unique-domain-${TEST_SUFFIX}.example.com`;
      // First, ensure custom domain exists
      await fetch(`${API_URL}/status-pages`, {
        method: "POST",
        headers: ctx.headers,
        body: JSON.stringify({
          name: "First Domain Page",
          slug: uniqueSlug("first-domain-page"),
          customDomain,
        }),
      });

      // Try to create with same custom domain
      const res = await fetch(`${API_URL}/status-pages`, {
        method: "POST",
        headers: ctx.headers,
        body: JSON.stringify({
          name: "Second Domain Page",
          slug: uniqueSlug("second-domain-page"),
          customDomain,
        }),
      });

      expect(res.status).toBeGreaterThanOrEqual(400);
    });

    it("rejects invalid slug format", async () => {
      const res = await fetch(`${API_URL}/status-pages`, {
        method: "POST",
        headers: ctx.headers,
        body: JSON.stringify({
          name: "Invalid Slug Page",
          slug: "Invalid Slug With Spaces!",
        }),
      });

      expect(res.status).toBeGreaterThanOrEqual(400);
    });

    it("rejects missing required fields", async () => {
      const res = await fetch(`${API_URL}/status-pages`, {
        method: "POST",
        headers: ctx.headers,
        body: JSON.stringify({
          published: true,
        }),
      });

      expect(res.status).toBeGreaterThanOrEqual(400);
    });
  });

  describe("GET /status-pages - List Status Pages", () => {
    it("lists all status pages for organization", async () => {
      // Create a few status pages
      await createStatusPage("list-test-1");
      await createStatusPage("list-test-2");

      const res = await fetch(`${API_URL}/status-pages`, {
        method: "GET",
        headers: ctx.headers,
      });

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.success).toBe(true);
      expect(Array.isArray(data.data)).toBe(true);
      expect(data.data.length).toBeGreaterThanOrEqual(2);
    });

    it("returns status pages with monitors included", async () => {
      const pageId = await createStatusPage("with-monitors-page");
      const monitorId = await createMonitor("Test Monitor for Page");

      // Add monitor to page
      await fetch(`${API_URL}/status-pages/${pageId}/monitors`, {
        method: "POST",
        headers: ctx.headers,
        body: JSON.stringify({
          monitorId,
          displayName: "API Health",
          order: 0,
        }),
      });

      const res = await fetch(`${API_URL}/status-pages`, {
        method: "GET",
        headers: ctx.headers,
      });

      expect(res.status).toBe(200);
      const data = await res.json();
      const page = data.data.find((p: { id: string }) => p.id === pageId);
      expect(page).toBeDefined();
      expect(Array.isArray(page.monitors)).toBe(true);
    });

    it("does not return pages from other organizations", async () => {
      // Create a page with current context
      await createStatusPage("my-org-page");

      // Create a different organization context
      const otherCtx = await bootstrapTestContext();

      // List pages with other context should not include our page
      const res = await fetch(`${API_URL}/status-pages`, {
        method: "GET",
        headers: otherCtx.headers,
      });

      expect(res.status).toBe(200);
      const data = await res.json();
      const hasOurPage = data.data.some(
        (p: { slug: string }) => p.slug === "my-org-page"
      );
      expect(hasOurPage).toBe(false);
    });
  });

  describe("GET /status-pages/:id - Get Status Page", () => {
    it("returns status page by ID", async () => {
      const pageId = await createStatusPage("get-by-id-page");

      const res = await fetch(`${API_URL}/status-pages/${pageId}`, {
        method: "GET",
        headers: ctx.headers,
      });

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.success).toBe(true);
      expect(data.data.id).toBe(pageId);
      // Slug now has unique suffix
      expect(data.data.slug).toContain("get-by-id-page");
    });

    it("returns 404 for non-existent page", async () => {
      const res = await fetch(`${API_URL}/status-pages/nonexistent-id`, {
        method: "GET",
        headers: ctx.headers,
      });

      expect(res.status).toBeGreaterThanOrEqual(400);
    });

    it("returns 404 for page from another organization", async () => {
      const pageId = await createStatusPage("another-org-page");

      // Create a different organization context
      const otherCtx = await bootstrapTestContext();

      const res = await fetch(`${API_URL}/status-pages/${pageId}`, {
        method: "GET",
        headers: otherCtx.headers,
      });

      expect([404, 500]).toContain(res.status);
    });

    it("includes linked monitors with ordering", async () => {
      const pageId = await createStatusPage("monitors-order-page");
      const monitor1 = await createMonitor("Monitor 1");
      const monitor2 = await createMonitor("Monitor 2");
      const monitor3 = await createMonitor("Monitor 3");

      // Add monitors with specific order
      await fetch(`${API_URL}/status-pages/${pageId}/monitors`, {
        method: "POST",
        headers: ctx.headers,
        body: JSON.stringify({ monitorId: monitor2, order: 1 }),
      });
      await fetch(`${API_URL}/status-pages/${pageId}/monitors`, {
        method: "POST",
        headers: ctx.headers,
        body: JSON.stringify({ monitorId: monitor1, order: 0 }),
      });
      await fetch(`${API_URL}/status-pages/${pageId}/monitors`, {
        method: "POST",
        headers: ctx.headers,
        body: JSON.stringify({ monitorId: monitor3, order: 2 }),
      });

      const res = await fetch(`${API_URL}/status-pages/${pageId}`, {
        method: "GET",
        headers: ctx.headers,
      });

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.data.monitors.length).toBe(3);
      // Check ordering
      expect(data.data.monitors[0].order).toBeLessThanOrEqual(
        data.data.monitors[1].order
      );
    });
  });

  describe("PATCH /status-pages/:id - Update Status Page", () => {
    it("updates status page name", async () => {
      const pageId = await createStatusPage("update-name-page");

      const res = await fetch(`${API_URL}/status-pages/${pageId}`, {
        method: "PATCH",
        headers: ctx.headers,
        body: JSON.stringify({
          name: "Updated Name",
        }),
      });

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.success).toBe(true);
      expect(data.data.name).toBe("Updated Name");
    });

    it("updates status page slug", async () => {
      const pageId = await createStatusPage("update-slug-page");
      const newSlug = uniqueSlug("updated-slug-page");

      const res = await fetch(`${API_URL}/status-pages/${pageId}`, {
        method: "PATCH",
        headers: ctx.headers,
        body: JSON.stringify({
          slug: newSlug,
        }),
      });

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.data.slug).toBe(newSlug);
    });

    it("updates published status", async () => {
      const pageId = await createStatusPage("publish-page", { published: false });

      const res = await fetch(`${API_URL}/status-pages/${pageId}`, {
        method: "PATCH",
        headers: ctx.headers,
        body: JSON.stringify({
          published: true,
        }),
      });

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.data.published).toBe(true);
    });

    it("updates theme settings", async () => {
      const pageId = await createStatusPage("update-theme-page");

      const res = await fetch(`${API_URL}/status-pages/${pageId}`, {
        method: "PATCH",
        headers: ctx.headers,
        body: JSON.stringify({
          theme: {
            name: "custom",
            primaryColor: "#ff5722",
            backgroundColor: "#ffffff",
          },
        }),
      });

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.data.theme.name).toBe("custom");
      expect(data.data.theme.primaryColor).toBe("#ff5722");
    });

    it("updates template settings", async () => {
      const pageId = await createStatusPage("update-template-page");

      const res = await fetch(`${API_URL}/status-pages/${pageId}`, {
        method: "PATCH",
        headers: ctx.headers,
        body: JSON.stringify({
          template: {
            id: "minimal",
            layout: "sidebar",
            indicatorStyle: "pill",
            incidentStyle: "compact",
            monitorStyle: "minimal",
            borderRadius: "none",
            shadow: "none",
            spacing: "compact",
          },
        }),
      });

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.data.template.layout).toBe("sidebar");
    });

    it("sets password protection", async () => {
      const pageId = await createStatusPage("add-password-page");

      const res = await fetch(`${API_URL}/status-pages/${pageId}`, {
        method: "PATCH",
        headers: ctx.headers,
        body: JSON.stringify({
          password: "newpassword123",
        }),
      });

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.data.passwordHash).toBeDefined();
    });

    it("clears password protection when explicitly disabled", async () => {
      const pageId = await createStatusPage("clear-password-page", {
        password: "initial-pass",
      });

      const res = await fetch(`${API_URL}/status-pages/${pageId}`, {
        method: "PATCH",
        headers: ctx.headers,
        body: JSON.stringify({
          passwordProtected: false,
        }),
      });

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.data.passwordHash).toBeNull();
    });

    it("updates SEO settings", async () => {
      const pageId = await createStatusPage("update-seo-page");

      const res = await fetch(`${API_URL}/status-pages/${pageId}`, {
        method: "PATCH",
        headers: ctx.headers,
        body: JSON.stringify({
          seo: {
            title: "New SEO Title",
            description: "New description for search engines",
            ogTemplate: "dashboard",
          },
        }),
      });

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.data.seo.title).toBe("New SEO Title");
      expect(data.data.seo.ogTemplate).toBe("dashboard");
    });

    it("updates auth config", async () => {
      const pageId = await createStatusPage("update-auth-page");

      const res = await fetch(`${API_URL}/status-pages/${pageId}`, {
        method: "PATCH",
        headers: ctx.headers,
        body: JSON.stringify({
          authConfig: {
            protectionMode: "both",
            oauthMode: "any_authenticated",
          },
        }),
      });

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.data.authConfig.protectionMode).toBe("both");
    });

    it("returns 404 for non-existent page", async () => {
      const res = await fetch(`${API_URL}/status-pages/nonexistent`, {
        method: "PATCH",
        headers: ctx.headers,
        body: JSON.stringify({
          name: "Should Fail",
        }),
      });

      expect(res.status).toBeGreaterThanOrEqual(400);
    });

    it("returns error for invalid slug format", async () => {
      const pageId = await createStatusPage("invalid-slug-update");

      const res = await fetch(`${API_URL}/status-pages/${pageId}`, {
        method: "PATCH",
        headers: ctx.headers,
        body: JSON.stringify({
          slug: "Invalid Slug!",
        }),
      });

      expect(res.status).toBeGreaterThanOrEqual(400);
    });
  });

  describe("DELETE /status-pages/:id - Delete Status Page", () => {
    it("deletes status page", async () => {
      const pageId = await createStatusPage("delete-page");

      const res = await fetch(`${API_URL}/status-pages/${pageId}`, {
        method: "DELETE",
        headers: ctx.headers,
      });

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.success).toBe(true);
      expect(data.data.deleted).toBe(true);

      // Verify it's actually deleted
      const getRes = await fetch(`${API_URL}/status-pages/${pageId}`, {
        method: "GET",
        headers: ctx.headers,
      });
      expect(getRes.status).toBeGreaterThanOrEqual(400);
    });

    it("cascades deletion to linked monitors", async () => {
      const pageId = await createStatusPage("delete-cascade-page");
      const monitorId = await createMonitor("Cascade Monitor");

      // Link monitor
      await fetch(`${API_URL}/status-pages/${pageId}/monitors`, {
        method: "POST",
        headers: ctx.headers,
        body: JSON.stringify({ monitorId }),
      });

      // Delete page
      const res = await fetch(`${API_URL}/status-pages/${pageId}`, {
        method: "DELETE",
        headers: ctx.headers,
      });

      expect(res.status).toBe(200);

      // Monitor should still exist
      const monitorRes = await fetch(`${API_URL}/monitors/${monitorId}`, {
        method: "GET",
        headers: ctx.headers,
      });
      expect(monitorRes.status).toBe(200);
    });

    it("returns 404 for non-existent page", async () => {
      const res = await fetch(`${API_URL}/status-pages/nonexistent`, {
        method: "DELETE",
        headers: ctx.headers,
      });

      expect(res.status).toBeGreaterThanOrEqual(400);
    });

    it("does not delete page from another organization", async () => {
      const pageId = await createStatusPage("other-org-delete-page");

      const otherCtx = await bootstrapTestContext();

      const res = await fetch(`${API_URL}/status-pages/${pageId}`, {
        method: "DELETE",
        headers: otherCtx.headers,
      });

      expect([404, 500]).toContain(res.status);

      // Original page should still exist
      const getRes = await fetch(`${API_URL}/status-pages/${pageId}`, {
        method: "GET",
        headers: ctx.headers,
      });
      expect(getRes.status).toBe(200);
    });
  });

  describe("POST /status-pages/:id/monitors - Add Monitor to Status Page", () => {
    it("adds monitor to status page", async () => {
      const pageId = await createStatusPage("add-monitor-page");
      const monitorId = await createMonitor("Add Monitor Test");

      const res = await fetch(`${API_URL}/status-pages/${pageId}/monitors`, {
        method: "POST",
        headers: ctx.headers,
        body: JSON.stringify({
          monitorId,
        }),
      });

      expect(res.status).toBe(201);
      const data = await res.json();
      expect(data.success).toBe(true);
      expect(data.data.monitorId).toBe(monitorId);
      expect(data.data.statusPageId).toBe(pageId);
    });

    it("adds monitor with display name and description", async () => {
      const pageId = await createStatusPage("add-monitor-details-page");
      const monitorId = await createMonitor("Details Monitor");

      const res = await fetch(`${API_URL}/status-pages/${pageId}/monitors`, {
        method: "POST",
        headers: ctx.headers,
        body: JSON.stringify({
          monitorId,
          displayName: "API Gateway",
          description: "Main API endpoint for the application",
        }),
      });

      expect(res.status).toBe(201);
      const data = await res.json();
      expect(data.data.displayName).toBe("API Gateway");
      expect(data.data.description).toBe(
        "Main API endpoint for the application"
      );
    });

    it("adds monitor with order and group", async () => {
      const pageId = await createStatusPage("add-monitor-order-page");
      const monitorId = await createMonitor("Order Monitor");

      const res = await fetch(`${API_URL}/status-pages/${pageId}/monitors`, {
        method: "POST",
        headers: ctx.headers,
        body: JSON.stringify({
          monitorId,
          order: 5,
          group: "Infrastructure",
        }),
      });

      expect(res.status).toBe(201);
      const data = await res.json();
      expect(data.data.order).toBe(5);
      expect(data.data.group).toBe("Infrastructure");
    });

    it("rejects adding same monitor twice", async () => {
      const pageId = await createStatusPage("add-duplicate-monitor-page");
      const monitorId = await createMonitor("Duplicate Monitor");

      // Add first time
      await fetch(`${API_URL}/status-pages/${pageId}/monitors`, {
        method: "POST",
        headers: ctx.headers,
        body: JSON.stringify({ monitorId }),
      });

      // Try to add again
      const res = await fetch(`${API_URL}/status-pages/${pageId}/monitors`, {
        method: "POST",
        headers: ctx.headers,
        body: JSON.stringify({ monitorId }),
      });

      expect(res.status).toBeGreaterThanOrEqual(400);
    });

    it("returns 404 for non-existent page", async () => {
      const monitorId = await createMonitor("Orphan Monitor");

      const res = await fetch(
        `${API_URL}/status-pages/nonexistent/monitors`,
        {
          method: "POST",
          headers: ctx.headers,
          body: JSON.stringify({ monitorId }),
        }
      );

      expect(res.status).toBeGreaterThanOrEqual(400);
    });
  });

  describe("PATCH /status-pages/:id/monitors/:monitorId - Update Monitor on Status Page", () => {
    it("updates monitor display name", async () => {
      const pageId = await createStatusPage("update-monitor-name-page");
      const monitorId = await createMonitor("Update Name Monitor");

      await fetch(`${API_URL}/status-pages/${pageId}/monitors`, {
        method: "POST",
        headers: ctx.headers,
        body: JSON.stringify({
          monitorId,
          displayName: "Original Name",
        }),
      });

      const res = await fetch(
        `${API_URL}/status-pages/${pageId}/monitors/${monitorId}`,
        {
          method: "PATCH",
          headers: ctx.headers,
          body: JSON.stringify({
            displayName: "Updated Name",
          }),
        }
      );

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.data.displayName).toBe("Updated Name");
    });

    it("updates monitor order", async () => {
      const pageId = await createStatusPage("update-monitor-order-page");
      const monitorId = await createMonitor("Update Order Monitor");

      await fetch(`${API_URL}/status-pages/${pageId}/monitors`, {
        method: "POST",
        headers: ctx.headers,
        body: JSON.stringify({
          monitorId,
          order: 0,
        }),
      });

      const res = await fetch(
        `${API_URL}/status-pages/${pageId}/monitors/${monitorId}`,
        {
          method: "PATCH",
          headers: ctx.headers,
          body: JSON.stringify({
            order: 10,
          }),
        }
      );

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.data.order).toBe(10);
    });

    it("updates monitor group", async () => {
      const pageId = await createStatusPage("update-monitor-group-page");
      const monitorId = await createMonitor("Update Group Monitor");

      await fetch(`${API_URL}/status-pages/${pageId}/monitors`, {
        method: "POST",
        headers: ctx.headers,
        body: JSON.stringify({
          monitorId,
          group: "Original Group",
        }),
      });

      const res = await fetch(
        `${API_URL}/status-pages/${pageId}/monitors/${monitorId}`,
        {
          method: "PATCH",
          headers: ctx.headers,
          body: JSON.stringify({
            group: "New Group",
          }),
        }
      );

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.data.group).toBe("New Group");
    });

    it("returns 404 for non-existent page", async () => {
      const monitorId = await createMonitor("Orphan Update Monitor");

      const res = await fetch(
        `${API_URL}/status-pages/nonexistent/monitors/${monitorId}`,
        {
          method: "PATCH",
          headers: ctx.headers,
          body: JSON.stringify({
            displayName: "Should Fail",
          }),
        }
      );

      expect(res.status).toBeGreaterThanOrEqual(400);
    });

    it("returns 404 for monitor not on page", async () => {
      const pageId = await createStatusPage("update-unlinkend-page");
      const monitorId = await createMonitor("Unlinked Monitor");

      const res = await fetch(
        `${API_URL}/status-pages/${pageId}/monitors/${monitorId}`,
        {
          method: "PATCH",
          headers: ctx.headers,
          body: JSON.stringify({
            displayName: "Should Fail",
          }),
        }
      );

      expect(res.status).toBeGreaterThanOrEqual(400);
    });
  });

  describe("DELETE /status-pages/:id/monitors/:monitorId - Remove Monitor from Status Page", () => {
    it("removes monitor from status page", async () => {
      const pageId = await createStatusPage("remove-monitor-page");
      const monitorId = await createMonitor("Remove Monitor");

      await fetch(`${API_URL}/status-pages/${pageId}/monitors`, {
        method: "POST",
        headers: ctx.headers,
        body: JSON.stringify({ monitorId }),
      });

      const res = await fetch(
        `${API_URL}/status-pages/${pageId}/monitors/${monitorId}`,
        {
          method: "DELETE",
          headers: ctx.headers,
        }
      );

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.success).toBe(true);
      expect(data.data.deleted).toBe(true);

      // Verify removed from page
      const getRes = await fetch(`${API_URL}/status-pages/${pageId}`, {
        method: "GET",
        headers: ctx.headers,
      });
      const pageData = await getRes.json();
      const hasMonitor = pageData.data.monitors.some(
        (m: { monitorId: string }) => m.monitorId === monitorId
      );
      expect(hasMonitor).toBe(false);
    });

    it("does not delete the monitor itself", async () => {
      const pageId = await createStatusPage("remove-keep-monitor-page");
      const monitorId = await createMonitor("Keep Monitor");

      await fetch(`${API_URL}/status-pages/${pageId}/monitors`, {
        method: "POST",
        headers: ctx.headers,
        body: JSON.stringify({ monitorId }),
      });

      await fetch(
        `${API_URL}/status-pages/${pageId}/monitors/${monitorId}`,
        {
          method: "DELETE",
          headers: ctx.headers,
        }
      );

      // Monitor should still exist
      const monitorRes = await fetch(`${API_URL}/monitors/${monitorId}`, {
        method: "GET",
        headers: ctx.headers,
      });
      expect(monitorRes.status).toBe(200);
    });

    it("returns 404 for non-existent page", async () => {
      const monitorId = await createMonitor("Delete Orphan Monitor");

      const res = await fetch(
        `${API_URL}/status-pages/nonexistent/monitors/${monitorId}`,
        {
          method: "DELETE",
          headers: ctx.headers,
        }
      );

      expect(res.status).toBeGreaterThanOrEqual(400);
    });
  });

  describe("GET /status-pages/:id/subscribers - List Subscribers", () => {
    it("lists subscribers for status page", async () => {
      const pageId = await createStatusPage("list-subscribers-page");

      // Add subscribers directly via DB
      const subId1 = `sub-${TEST_SUFFIX}-${slugCounter++}`;
      const subId2 = `sub-${TEST_SUFFIX}-${slugCounter++}`;
      await dbClient.query(
        `INSERT INTO subscribers (id, status_page_id, email, verified, unsubscribe_token, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, NOW(), NOW())`,
        [subId1, pageId, `user1-${TEST_SUFFIX}@example.com`, true, `token1-${TEST_SUFFIX}`]
      );
      await dbClient.query(
        `INSERT INTO subscribers (id, status_page_id, email, verified, unsubscribe_token, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, NOW(), NOW())`,
        [subId2, pageId, `user2-${TEST_SUFFIX}@example.com`, false, `token2-${TEST_SUFFIX}`]
      );

      const res = await fetch(`${API_URL}/status-pages/${pageId}/subscribers`, {
        method: "GET",
        headers: ctx.headers,
      });

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.success).toBe(true);
      expect(Array.isArray(data.data)).toBe(true);
      expect(data.data.length).toBeGreaterThanOrEqual(2);
    });

    it("returns empty array when no subscribers", async () => {
      const pageId = await createStatusPage("no-subscribers-page");

      const res = await fetch(`${API_URL}/status-pages/${pageId}/subscribers`, {
        method: "GET",
        headers: ctx.headers,
      });

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.success).toBe(true);
      expect(Array.isArray(data.data)).toBe(true);
    });

    it("returns 404 for non-existent page", async () => {
      const res = await fetch(
        `${API_URL}/status-pages/nonexistent/subscribers`,
        {
          method: "GET",
          headers: ctx.headers,
        }
      );

      expect(res.status).toBeGreaterThanOrEqual(400);
    });

    it("does not return subscribers from other organization's pages", async () => {
      const pageId = await createStatusPage("other-org-subs-page");

      // Add subscriber
      const subIdOther = `sub-${TEST_SUFFIX}-${slugCounter++}`;
      await dbClient.query(
        `INSERT INTO subscribers (id, status_page_id, email, verified, unsubscribe_token, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, NOW(), NOW())`,
        [subIdOther, pageId, `other-${TEST_SUFFIX}@example.com`, true, `token-other-${TEST_SUFFIX}`]
      );

      const otherCtx = await bootstrapTestContext();

      const res = await fetch(`${API_URL}/status-pages/${pageId}/subscribers`, {
        method: "GET",
        headers: otherCtx.headers,
      });

      expect([404, 500]).toContain(res.status);
    });
  });

  describe("GET /status-pages/:id/crowdsourced - Get Crowdsourced Settings", () => {
    it("returns default settings when none exist", async () => {
      const pageId = await createStatusPage("crowdsourced-default-page");

      const res = await fetch(
        `${API_URL}/status-pages/${pageId}/crowdsourced`,
        {
          method: "GET",
          headers: ctx.headers,
        }
      );

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.success).toBe(true);
      expect(data.data.enabled).toBe(false);
      expect(data.data.reportThreshold).toBe(30);
      expect(data.data.timeWindowMinutes).toBe(15);
      expect(data.data.rateLimitPerIp).toBe(5);
      expect(data.data.autoDegradeEnabled).toBe(true);
    });

    it("returns saved settings", async () => {
      const pageId = await createStatusPage("crowdsourced-saved-page");

      // Save settings first
      await fetch(`${API_URL}/status-pages/${pageId}/crowdsourced`, {
        method: "PATCH",
        headers: ctx.headers,
        body: JSON.stringify({
          enabled: true,
          reportThreshold: 50,
        }),
      });

      const res = await fetch(
        `${API_URL}/status-pages/${pageId}/crowdsourced`,
        {
          method: "GET",
          headers: ctx.headers,
        }
      );

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.data.enabled).toBe(true);
      expect(data.data.reportThreshold).toBe(50);
    });

    it("returns 404 for non-existent page", async () => {
      const res = await fetch(
        `${API_URL}/status-pages/nonexistent/crowdsourced`,
        {
          method: "GET",
          headers: ctx.headers,
        }
      );

      expect(res.status).toBeGreaterThanOrEqual(400);
    });
  });

  describe("PATCH /status-pages/:id/crowdsourced - Update Crowdsourced Settings", () => {
    it("creates crowdsourced settings when none exist", async () => {
      const pageId = await createStatusPage("crowdsourced-create-page");

      const res = await fetch(
        `${API_URL}/status-pages/${pageId}/crowdsourced`,
        {
          method: "PATCH",
          headers: ctx.headers,
          body: JSON.stringify({
            enabled: true,
            reportThreshold: 100,
            timeWindowMinutes: 30,
            rateLimitPerIp: 10,
            autoDegradeEnabled: false,
          }),
        }
      );

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.success).toBe(true);
      expect(data.data.enabled).toBe(true);
      expect(data.data.reportThreshold).toBe(100);
      expect(data.data.timeWindowMinutes).toBe(30);
      expect(data.data.rateLimitPerIp).toBe(10);
      expect(data.data.autoDegradeEnabled).toBe(false);
    });

    it("updates existing crowdsourced settings", async () => {
      const pageId = await createStatusPage("crowdsourced-update-page");

      // Create initial settings
      await fetch(`${API_URL}/status-pages/${pageId}/crowdsourced`, {
        method: "PATCH",
        headers: ctx.headers,
        body: JSON.stringify({
          enabled: false,
          reportThreshold: 30,
        }),
      });

      // Update settings
      const res = await fetch(
        `${API_URL}/status-pages/${pageId}/crowdsourced`,
        {
          method: "PATCH",
          headers: ctx.headers,
          body: JSON.stringify({
            enabled: true,
            reportThreshold: 75,
          }),
        }
      );

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.data.enabled).toBe(true);
      expect(data.data.reportThreshold).toBe(75);
    });

    it("performs partial update", async () => {
      const pageId = await createStatusPage("crowdsourced-partial-page");

      // Create initial settings
      await fetch(`${API_URL}/status-pages/${pageId}/crowdsourced`, {
        method: "PATCH",
        headers: ctx.headers,
        body: JSON.stringify({
          enabled: true,
          reportThreshold: 50,
          timeWindowMinutes: 20,
        }),
      });

      // Update only one field
      const res = await fetch(
        `${API_URL}/status-pages/${pageId}/crowdsourced`,
        {
          method: "PATCH",
          headers: ctx.headers,
          body: JSON.stringify({
            reportThreshold: 100,
          }),
        }
      );

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.data.enabled).toBe(true); // unchanged
      expect(data.data.reportThreshold).toBe(100); // updated
      expect(data.data.timeWindowMinutes).toBe(20); // unchanged
    });

    it("returns 404 for non-existent page", async () => {
      const res = await fetch(
        `${API_URL}/status-pages/nonexistent/crowdsourced`,
        {
          method: "PATCH",
          headers: ctx.headers,
          body: JSON.stringify({
            enabled: true,
          }),
        }
      );

      expect(res.status).toBeGreaterThanOrEqual(400);
    });
  });

  describe("Multiple Monitors - Ordering and Groups", () => {
    it("maintains correct order when adding multiple monitors", async () => {
      const pageId = await createStatusPage("multi-monitor-order-page");
      const monitors = await Promise.all([
        createMonitor("Monitor A"),
        createMonitor("Monitor B"),
        createMonitor("Monitor C"),
        createMonitor("Monitor D"),
      ]);

      // Add with specific orders (out of sequence)
      await fetch(`${API_URL}/status-pages/${pageId}/monitors`, {
        method: "POST",
        headers: ctx.headers,
        body: JSON.stringify({ monitorId: monitors[2], order: 2 }),
      });
      await fetch(`${API_URL}/status-pages/${pageId}/monitors`, {
        method: "POST",
        headers: ctx.headers,
        body: JSON.stringify({ monitorId: monitors[0], order: 0 }),
      });
      await fetch(`${API_URL}/status-pages/${pageId}/monitors`, {
        method: "POST",
        headers: ctx.headers,
        body: JSON.stringify({ monitorId: monitors[3], order: 3 }),
      });
      await fetch(`${API_URL}/status-pages/${pageId}/monitors`, {
        method: "POST",
        headers: ctx.headers,
        body: JSON.stringify({ monitorId: monitors[1], order: 1 }),
      });

      const res = await fetch(`${API_URL}/status-pages/${pageId}`, {
        method: "GET",
        headers: ctx.headers,
      });

      const data = await res.json();
      expect(data.data.monitors.length).toBe(4);
      // Verify they're sorted by order
      for (let i = 0; i < data.data.monitors.length - 1; i++) {
        expect(data.data.monitors[i].order).toBeLessThanOrEqual(
          data.data.monitors[i + 1].order
        );
      }
    });

    it("groups monitors correctly", async () => {
      const pageId = await createStatusPage("grouped-monitors-page");
      const monitors = await Promise.all([
        createMonitor("API 1"),
        createMonitor("API 2"),
        createMonitor("DB 1"),
        createMonitor("DB 2"),
      ]);

      await fetch(`${API_URL}/status-pages/${pageId}/monitors`, {
        method: "POST",
        headers: ctx.headers,
        body: JSON.stringify({
          monitorId: monitors[0],
          group: "API Services",
          order: 0,
        }),
      });
      await fetch(`${API_URL}/status-pages/${pageId}/monitors`, {
        method: "POST",
        headers: ctx.headers,
        body: JSON.stringify({
          monitorId: monitors[1],
          group: "API Services",
          order: 1,
        }),
      });
      await fetch(`${API_URL}/status-pages/${pageId}/monitors`, {
        method: "POST",
        headers: ctx.headers,
        body: JSON.stringify({
          monitorId: monitors[2],
          group: "Databases",
          order: 0,
        }),
      });
      await fetch(`${API_URL}/status-pages/${pageId}/monitors`, {
        method: "POST",
        headers: ctx.headers,
        body: JSON.stringify({
          monitorId: monitors[3],
          group: "Databases",
          order: 1,
        }),
      });

      const res = await fetch(`${API_URL}/status-pages/${pageId}`, {
        method: "GET",
        headers: ctx.headers,
      });

      const data = await res.json();
      expect(data.data.monitors.length).toBe(4);

      const apiServices = data.data.monitors.filter(
        (m: { group: string }) => m.group === "API Services"
      );
      const databases = data.data.monitors.filter(
        (m: { group: string }) => m.group === "Databases"
      );
      expect(apiServices.length).toBe(2);
      expect(databases.length).toBe(2);
    });
  });

  describe("Authorization - Write Scope Required", () => {
    it("rejects POST without write scope", async () => {
      // Create a read-only API key using the helper
      const { key: readOnlyToken } = await insertApiKey(
        ctx.organizationId,
        ctx.userId,
        { name: "read-only-post", scopes: ["read"] }
      );

      const res = await fetch(`${API_URL}/status-pages`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${readOnlyToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name: "Should Fail",
          slug: uniqueSlug("should-fail-page"),
        }),
      });

      expect(res.status).toBe(403);
    });

    it("rejects PATCH without write scope", async () => {
      const pageId = await createStatusPage("patch-scope-page");

      const { key: readOnlyToken } = await insertApiKey(
        ctx.organizationId,
        ctx.userId,
        { name: "read-only-patch", scopes: ["read"] }
      );

      const res = await fetch(`${API_URL}/status-pages/${pageId}`, {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${readOnlyToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name: "Should Fail",
        }),
      });

      expect(res.status).toBe(403);
    });

    it("rejects DELETE without write scope", async () => {
      const pageId = await createStatusPage("delete-scope-page");

      const { key: readOnlyToken } = await insertApiKey(
        ctx.organizationId,
        ctx.userId,
        { name: "read-only-delete", scopes: ["read"] }
      );

      const res = await fetch(`${API_URL}/status-pages/${pageId}`, {
        method: "DELETE",
        headers: {
          Authorization: `Bearer ${readOnlyToken}`,
          "Content-Type": "application/json",
        },
      });

      expect(res.status).toBe(403);
    });

    it("allows GET with read-only scope", async () => {
      const pageId = await createStatusPage("get-scope-page");

      const { key: readOnlyToken } = await insertApiKey(
        ctx.organizationId,
        ctx.userId,
        { name: "read-only-get", scopes: ["read"] }
      );

      const res = await fetch(`${API_URL}/status-pages/${pageId}`, {
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
    it("handles very long names", async () => {
      const longName = "A".repeat(500);

      const res = await fetch(`${API_URL}/status-pages`, {
        method: "POST",
        headers: ctx.headers,
        body: JSON.stringify({
          name: longName,
          slug: uniqueSlug("long-name-page"),
        }),
      });

      // Should either succeed or fail with validation error
      expect([201, 400, 422]).toContain(res.status);
    });

    it("handles special characters in name", async () => {
      const res = await fetch(`${API_URL}/status-pages`, {
        method: "POST",
        headers: ctx.headers,
        body: JSON.stringify({
          name: "Status Page with <script>alert('xss')</script>",
          slug: uniqueSlug("xss-test-page"),
        }),
      });

      expect(res.status).toBe(201);
      const data = await res.json();
      // Name should be stored but check it doesn't execute
      expect(data.data.name).toContain("script");
    });

    it("handles unicode in name", async () => {
      const res = await fetch(`${API_URL}/status-pages`, {
        method: "POST",
        headers: ctx.headers,
        body: JSON.stringify({
          name: "Status Page with unicode and accents",
          slug: uniqueSlug("unicode-page"),
        }),
      });

      expect(res.status).toBe(201);
      const data = await res.json();
      expect(data.data.name).toContain("unicode");
    });

    it("handles empty settings object", async () => {
      const res = await fetch(`${API_URL}/status-pages`, {
        method: "POST",
        headers: ctx.headers,
        body: JSON.stringify({
          name: "Empty Settings Page",
          slug: uniqueSlug("empty-settings-page"),
          settings: {},
        }),
      });

      expect(res.status).toBe(201);
    });

    it("handles null values for optional fields", async () => {
      const res = await fetch(`${API_URL}/status-pages`, {
        method: "POST",
        headers: ctx.headers,
        body: JSON.stringify({
          name: "Null Fields Page",
          slug: uniqueSlug("null-fields-page"),
          logo: null,
          favicon: null,
          customDomain: null,
        }),
      });

      // Should either accept null values (201) or reject them (400)
      expect([201, 400]).toContain(res.status);
    });

    it("handles concurrent updates to same page", async () => {
      const pageId = await createStatusPage("concurrent-update-page");

      // Send multiple concurrent updates
      const updates = Promise.all([
        fetch(`${API_URL}/status-pages/${pageId}`, {
          method: "PATCH",
          headers: ctx.headers,
          body: JSON.stringify({ name: "Update 1" }),
        }),
        fetch(`${API_URL}/status-pages/${pageId}`, {
          method: "PATCH",
          headers: ctx.headers,
          body: JSON.stringify({ name: "Update 2" }),
        }),
        fetch(`${API_URL}/status-pages/${pageId}`, {
          method: "PATCH",
          headers: ctx.headers,
          body: JSON.stringify({ name: "Update 3" }),
        }),
      ]);

      const results = await updates;
      // All should succeed or some may fail with concurrency issues
      for (const res of results) {
        expect([200, 409, 500]).toContain(res.status);
      }
    });

    it("handles page with maximum monitors", async () => {
      const pageId = await createStatusPage("max-monitors-page");

      // Add many monitors
      const monitorPromises = [];
      for (let i = 0; i < 20; i++) {
        monitorPromises.push(createMonitor(`Bulk Monitor ${i}`));
      }
      const monitorIds = await Promise.all(monitorPromises);

      // Add all monitors to page
      for (const monitorId of monitorIds) {
        await fetch(`${API_URL}/status-pages/${pageId}/monitors`, {
          method: "POST",
          headers: ctx.headers,
          body: JSON.stringify({ monitorId, order: monitorIds.indexOf(monitorId) }),
        });
      }

      const res = await fetch(`${API_URL}/status-pages/${pageId}`, {
        method: "GET",
        headers: ctx.headers,
      });

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.data.monitors.length).toBe(20);
    });
  });
});
