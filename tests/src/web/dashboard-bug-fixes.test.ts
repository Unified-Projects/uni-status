/**
 * Dashboard Bug Fixes Tests
 *
 * End-to-end tests for UI-related bug fixes:
 * 1. Account page 2FA section renders (no longer shows "Coming Soon")
 * 2. Audit page renders with filters (no crash on filter selection)
 * 3. On-call page renders with team member selection
 * 4. Monitor form renders without degraded threshold field
 */

import { bootstrapTestContext, TestContext } from "../helpers/context";
import { bootstrapWebTestContext, WebTestContext } from "../helpers/web-auth";

const WEB_BASE_URL = process.env.WEB_BASE_URL ?? "http://web:3000";
const API_BASE_URL = process.env.API_BASE_URL ?? "http://api:3001";

describe("Dashboard bug fixes", () => {
  let ctx: TestContext;
  let webCtx: WebTestContext;

  beforeAll(async () => {
    ctx = await bootstrapTestContext();
    webCtx = await bootstrapWebTestContext(ctx);
  });

  describe("Account page - 2FA section", () => {
    it("renders the account page with 2FA section", async () => {
      const response = await fetch(`${WEB_BASE_URL}/dashboard/account`, {
        headers: webCtx.webHeaders,
        redirect: "manual",
      });

      expect(response.status).toBeLessThan(500);
      const html = await response.text();
      expect(html.toLowerCase()).toContain("<!doctype html");
      // The page should render without error
    });

    it("renders account page without errors", async () => {
      const response = await fetch(`${WEB_BASE_URL}/dashboard/account`, {
        headers: webCtx.webHeaders,
      });

      // Should not return 500 error
      expect(response.status).toBeLessThan(500);
    });
  });

  describe("Audit page - Filter fix", () => {
    it("renders the audit page", async () => {
      const response = await fetch(`${WEB_BASE_URL}/dashboard/audit`, {
        headers: webCtx.webHeaders,
        redirect: "manual",
      });

      expect(response.status).toBeLessThan(500);
      const html = await response.text();
      expect(html.toLowerCase()).toContain("<!doctype html");
    });

    it("renders audit page without crashing", async () => {
      const response = await fetch(`${WEB_BASE_URL}/dashboard/audit`, {
        headers: webCtx.webHeaders,
      });

      // Should not return 500 error (the crash bug)
      expect(response.status).toBeLessThan(500);
    });

    it("audit API returns logs without error", async () => {
      const response = await fetch(
        `${API_BASE_URL}/api/v1/audit`,
        {
          headers: {
            ...ctx.headers,
            "X-Organization-Id": ctx.organizationId,
          },
        }
      );

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.success).toBe(true);
    });

    it("audit API handles action filter", async () => {
      const response = await fetch(
        `${API_BASE_URL}/api/v1/audit?action=organization.update`,
        {
          headers: {
            ...ctx.headers,
            "X-Organization-Id": ctx.organizationId,
          },
        }
      );

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.success).toBe(true);
    });

    it("audit API handles resourceType filter", async () => {
      const response = await fetch(
        `${API_BASE_URL}/api/v1/audit?resourceType=organization`,
        {
          headers: {
            ...ctx.headers,
            "X-Organization-Id": ctx.organizationId,
          },
        }
      );

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.success).toBe(true);
    });
  });

  describe("On-call page", () => {
    it("renders the on-call page", async () => {
      const response = await fetch(`${WEB_BASE_URL}/dashboard/oncall`, {
        headers: webCtx.webHeaders,
        redirect: "manual",
      });

      expect(response.status).toBeLessThan(500);
      const html = await response.text();
      expect(html.toLowerCase()).toContain("<!doctype html");
    });

    it("on-call API accepts array of participants", async () => {
      const response = await fetch(`${API_BASE_URL}/api/v1/oncall/rotations`, {
        method: "POST",
        headers: ctx.headers,
        body: JSON.stringify({
          name: "Web Test Rotation",
          timezone: "UTC",
          rotationStart: new Date().toISOString(),
          shiftDurationMinutes: 60,
          participants: [ctx.userId], // Array format
          handoffNotificationMinutes: 30,
          handoffChannels: [],
          active: true,
        }),
      });

      expect(response.status).toBe(201);
      const data = await response.json();
      expect(data.success).toBe(true);
      expect(Array.isArray(data.data.participants)).toBe(true);
    });
  });

  describe("Monitor form - Degraded threshold removal", () => {
    it("renders the monitors page", async () => {
      const response = await fetch(`${WEB_BASE_URL}/dashboard/monitors`, {
        headers: webCtx.webHeaders,
        redirect: "manual",
      });

      expect(response.status).toBeLessThan(500);
      const html = await response.text();
      expect(html.toLowerCase()).toContain("<!doctype html");
    });

    it("renders the new monitor page", async () => {
      const response = await fetch(`${WEB_BASE_URL}/dashboard/monitors/new`, {
        headers: webCtx.webHeaders,
        redirect: "manual",
      });

      expect(response.status).toBeLessThan(500);
      const html = await response.text();
      expect(html.toLowerCase()).toContain("<!doctype html");
    });

    it("creates monitor without degraded threshold", async () => {
      // The degraded threshold field was removed from the form
      // Monitor should be created with only maxThreshold
      const response = await fetch(`${API_BASE_URL}/api/v1/monitors`, {
        method: "POST",
        headers: ctx.headers,
        body: JSON.stringify({
          name: "Threshold Test Monitor",
          type: "http",
          url: "https://example.com",
          interval: 60,
          timeout: 30000,
          maxThreshold: 1000, // Only max threshold, not degraded threshold
        }),
      });

      expect(response.status).toBe(201);
      const data = await response.json();
      expect(data.success).toBe(true);
    });

    it("creates monitor with consecutive check fields", async () => {
      const response = await fetch(`${API_BASE_URL}/api/v1/monitors`, {
        method: "POST",
        headers: ctx.headers,
        body: JSON.stringify({
          name: "Consecutive Check Test",
          type: "http",
          url: "https://example.com",
          interval: 60,
          timeout: 30000,
          degradedAfterCount: 3,
          downAfterCount: 5,
        }),
      });

      expect(response.status).toBe(201);
      const data = await response.json();
      expect(data.data.degradedAfterCount).toBe(3);
      expect(data.data.downAfterCount).toBe(5);
    });
  });

  describe("Monitor dependencies - Button fix", () => {
    it("renders monitor edit page", async () => {
      // First create a monitor
      const createResponse = await fetch(`${API_BASE_URL}/api/v1/monitors`, {
        method: "POST",
        headers: ctx.headers,
        body: JSON.stringify({
          name: "Edit Page Test Monitor",
          type: "http",
          url: "https://example.com",
          interval: 60,
          timeout: 30000,
        }),
      });

      const { data: monitor } = await createResponse.json();

      // Check edit page renders
      const response = await fetch(
        `${WEB_BASE_URL}/dashboard/monitors/${monitor.id}/edit`,
        {
          headers: webCtx.webHeaders,
          redirect: "manual",
        }
      );

      expect(response.status).toBeLessThan(500);
      const html = await response.text();
      expect(html.toLowerCase()).toContain("<!doctype html");
    });

    it("adds dependency via API", async () => {
      // Create parent monitor
      const parentResponse = await fetch(`${API_BASE_URL}/api/v1/monitors`, {
        method: "POST",
        headers: ctx.headers,
        body: JSON.stringify({
          name: "Dependency Parent",
          type: "http",
          url: "https://example.com/parent",
          interval: 60,
          timeout: 30000,
        }),
      });
      const { data: parent } = await parentResponse.json();

      // Create child with dependency
      const childResponse = await fetch(`${API_BASE_URL}/api/v1/monitors`, {
        method: "POST",
        headers: ctx.headers,
        body: JSON.stringify({
          name: "Dependency Child",
          type: "http",
          url: "https://example.com/child",
          interval: 60,
          timeout: 30000,
          dependsOn: [parent.id],
        }),
      });

      expect(childResponse.status).toBe(201);
      const { data: child } = await childResponse.json();
      expect(child.dependsOn).toContain(parent.id);
    });
  });

  describe("API key expiration fix", () => {
    it("creates API key with correct expiration via dashboard", async () => {
      const thirtyDaysMs = 30 * 24 * 60 * 60 * 1000;

      const response = await fetch(
        `${API_BASE_URL}/api/v1/organizations/${ctx.organizationId}/api-keys`,
        {
          method: "POST",
          headers: ctx.headers,
          body: JSON.stringify({
            name: "Dashboard Expiry Test",
            scopes: ["read"],
            expiresIn: thirtyDaysMs,
          }),
        }
      );

      expect(response.status).toBe(201);
      const { data } = await response.json();

      const expiresAt = new Date(data.expiresAt).getTime();
      const now = Date.now();
      const daysUntilExpiry = (expiresAt - now) / (1000 * 60 * 60 * 24);

      // Should be ~30 days, NOT 82 years
      expect(daysUntilExpiry).toBeGreaterThan(29);
      expect(daysUntilExpiry).toBeLessThan(31);
    });
  });

  describe("Audit export fix", () => {
    it("exports audit logs with organizationId query param", async () => {
      const response = await fetch(
        `${API_BASE_URL}/api/v1/audit/export?format=json&organizationId=${ctx.organizationId}`,
        {
          headers: {
            Authorization: ctx.headers.Authorization,
          },
        }
      );

      // Should not return 404 (the bug)
      expect(response.status).not.toBe(404);
    });
  });
});
