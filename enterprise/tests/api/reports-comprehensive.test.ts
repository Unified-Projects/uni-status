import { describe, it, expect, beforeAll } from "vitest";
import { bootstrapTestContext, TestContext } from "../helpers/context";
import { createMonitor, createStatusPage, insertApiKey } from "../helpers/data";

const API_BASE_URL = process.env.API_BASE_URL ?? "http://api:3001";

describe("Reports API - Comprehensive", () => {
  let ctx: TestContext;
  let apiUrl: string;
  let headers: Record<string, string>;
  let readOnlyHeaders: Record<string, string>;
  let monitorId: string;
  let statusPageId: string;

  beforeAll(async () => {
    ctx = await bootstrapTestContext();
    apiUrl = `${API_BASE_URL}/api/v1`;
    headers = {
      Authorization: `Bearer ${ctx.token}`,
      "Content-Type": "application/json",
      "X-Organization-Id": ctx.organizationId,
    };

    // Create read-only API key
    const readOnly = await insertApiKey(ctx.organizationId, ctx.userId, {
      name: "read-only-key",
      scopes: ["read"],
    });
    readOnlyHeaders = {
      Authorization: `Bearer ${readOnly.token}`,
      "Content-Type": "application/json",
      "X-Organization-Id": ctx.organizationId,
    };

    // Create test monitor and status page
    monitorId = await createMonitor(
      { organizationId: ctx.organizationId, headers },
      { name: "Report Test Monitor" }
    );

    statusPageId = await createStatusPage(
      { organizationId: ctx.organizationId, headers },
      { name: "Report Test Status Page" }
    );
  });

  // ==========================================
  // Report Settings CRUD
  // ==========================================

  describe("Report Settings CRUD", () => {
    let settingsId: string;

    it("creates report settings with minimal data", async () => {
      const response = await fetch(`${apiUrl}/reports/settings`, {
        method: "POST",
        headers,
        body: JSON.stringify({
          name: "Weekly SLA Report",
        }),
      });

      expect(response.status).toBe(201);
      const body = await response.json();
      expect(body.success).toBe(true);
      expect(body.data.name).toBe("Weekly SLA Report");
      expect(body.data.reportType).toBe("sla");
      expect(body.data.frequency).toBe("monthly");
      expect(body.data.active).toBe(true);
      settingsId = body.data.id;
    });

    it("creates report settings with full configuration", async () => {
      const response = await fetch(`${apiUrl}/reports/settings`, {
        method: "POST",
        headers,
        body: JSON.stringify({
          name: "Monthly Performance Report",
          reportType: "sla",
          frequency: "monthly",
          monitorIds: [monitorId],
          statusPageIds: [statusPageId],
          includeAllMonitors: false,
          includeCharts: true,
          includeIncidents: true,
          includeMaintenanceWindows: true,
          includeResponseTimes: true,
          includeSloStatus: true,
          recipients: {
            emails: ["reports@example.com", "team@example.com"],
          },
          dayOfMonth: 1,
          timezone: "Europe/London",
          active: true,
        }),
      });

      expect(response.status).toBe(201);
      const body = await response.json();
      expect(body.success).toBe(true);
      expect(body.data.name).toBe("Monthly Performance Report");
      expect(body.data.frequency).toBe("monthly");
      expect(body.data.dayOfMonth).toBe(1);
      expect(body.data.recipients.emails).toContain("reports@example.com");
    });

    it("creates weekly report settings with day of week", async () => {
      const response = await fetch(`${apiUrl}/reports/settings`, {
        method: "POST",
        headers,
        body: JSON.stringify({
          name: "Weekly Monday Report",
          frequency: "weekly",
          dayOfWeek: 1, // Monday
          includeAllMonitors: true,
        }),
      });

      expect(response.status).toBe(201);
      const body = await response.json();
      expect(body.data.frequency).toBe("weekly");
      expect(body.data.dayOfWeek).toBe(1);
    });

    it("creates quarterly report settings", async () => {
      const response = await fetch(`${apiUrl}/reports/settings`, {
        method: "POST",
        headers,
        body: JSON.stringify({
          name: "Quarterly Executive Report",
          frequency: "quarterly",
          includeAllMonitors: true,
        }),
      });

      expect(response.status).toBe(201);
      const body = await response.json();
      expect(body.data.frequency).toBe("quarterly");
    });

    it("creates on-demand report settings (no scheduling)", async () => {
      const response = await fetch(`${apiUrl}/reports/settings`, {
        method: "POST",
        headers,
        body: JSON.stringify({
          name: "On-Demand Report",
          frequency: "on_demand",
        }),
      });

      expect(response.status).toBe(201);
      const body = await response.json();
      expect(body.data.frequency).toBe("on_demand");
      expect(body.data.nextScheduledAt).toBeNull();
    });

    it("lists all report settings", async () => {
      const response = await fetch(`${apiUrl}/reports/settings`, { headers });

      expect(response.status).toBe(200);
      const body = await response.json();
      expect(body.success).toBe(true);
      expect(Array.isArray(body.data)).toBe(true);
      expect(body.data.length).toBeGreaterThanOrEqual(1);
    });

    it("gets report settings by ID", async () => {
      const response = await fetch(`${apiUrl}/reports/settings/${settingsId}`, {
        headers,
      });

      expect(response.status).toBe(200);
      const body = await response.json();
      expect(body.success).toBe(true);
      expect(body.data.id).toBe(settingsId);
      expect(body.data.name).toBe("Weekly SLA Report");
    });

    it("returns recent reports when getting settings by ID", async () => {
      const response = await fetch(`${apiUrl}/reports/settings/${settingsId}`, {
        headers,
      });

      expect(response.status).toBe(200);
      const body = await response.json();
      expect(body.data).toHaveProperty("recentReports");
      expect(Array.isArray(body.data.recentReports)).toBe(true);
    });

    it("updates report settings", async () => {
      const response = await fetch(`${apiUrl}/reports/settings/${settingsId}`, {
        method: "PATCH",
        headers,
        body: JSON.stringify({
          name: "Updated Report Name",
          frequency: "weekly",
          dayOfWeek: 5, // Friday
          active: false,
        }),
      });

      expect(response.status).toBe(200);
      const body = await response.json();
      expect(body.success).toBe(true);
      expect(body.data.name).toBe("Updated Report Name");
      expect(body.data.frequency).toBe("weekly");
      expect(body.data.dayOfWeek).toBe(5);
      expect(body.data.active).toBe(false);
    });

    it("updates report recipients", async () => {
      const response = await fetch(`${apiUrl}/reports/settings/${settingsId}`, {
        method: "PATCH",
        headers,
        body: JSON.stringify({
          recipients: {
            emails: ["new-email@example.com"],
          },
        }),
      });

      expect(response.status).toBe(200);
      const body = await response.json();
      expect(body.data.recipients.emails).toContain("new-email@example.com");
    });

    it("deletes report settings", async () => {
      // Create one to delete
      const createRes = await fetch(`${apiUrl}/reports/settings`, {
        method: "POST",
        headers,
        body: JSON.stringify({ name: "To Delete" }),
      });
      const { data } = await createRes.json();

      const response = await fetch(`${apiUrl}/reports/settings/${data.id}`, {
        method: "DELETE",
        headers,
      });

      expect(response.status).toBe(200);
      const body = await response.json();
      expect(body.success).toBe(true);
      expect(body.data.deleted).toBe(true);

      // Verify deleted
      const getRes = await fetch(`${apiUrl}/reports/settings/${data.id}`, {
        headers,
      });
      expect(getRes.status).toBe(404);
    });
  });

  // ==========================================
  // Validation
  // ==========================================

  describe("Validation", () => {
    it("rejects invalid monitor IDs", async () => {
      const response = await fetch(`${apiUrl}/reports/settings`, {
        method: "POST",
        headers,
        body: JSON.stringify({
          name: "Invalid Monitor Report",
          monitorIds: ["non-existent-monitor-id"],
        }),
      });

      expect(response.status).toBe(400);
      const body = await response.json();
      expect(body.error).toContain("monitor");
    });

    it("rejects invalid status page IDs", async () => {
      const response = await fetch(`${apiUrl}/reports/settings`, {
        method: "POST",
        headers,
        body: JSON.stringify({
          name: "Invalid Status Page Report",
          statusPageIds: ["non-existent-page-id"],
        }),
      });

      expect(response.status).toBe(400);
      const body = await response.json();
      expect(body.error).toContain("status page");
    });

    it("rejects invalid monitor IDs on update", async () => {
      // Create settings first
      const createRes = await fetch(`${apiUrl}/reports/settings`, {
        method: "POST",
        headers,
        body: JSON.stringify({ name: "Test Settings" }),
      });
      const { data } = await createRes.json();

      const response = await fetch(`${apiUrl}/reports/settings/${data.id}`, {
        method: "PATCH",
        headers,
        body: JSON.stringify({
          monitorIds: ["invalid-id-12345"],
        }),
      });

      expect(response.status).toBe(400);
    });
  });

  // ==========================================
  // Report Generation
  // ==========================================

  describe("Report Generation", () => {
    it("generates an on-demand report", async () => {
      const periodStart = new Date();
      periodStart.setMonth(periodStart.getMonth() - 1);
      const periodEnd = new Date();

      const response = await fetch(`${apiUrl}/reports/generate`, {
        method: "POST",
        headers,
        body: JSON.stringify({
          reportType: "sla",
          periodStart: periodStart.toISOString(),
          periodEnd: periodEnd.toISOString(),
          monitorIds: [monitorId],
        }),
      });

      expect(response.status).toBe(202);
      const body = await response.json();
      expect(body.success).toBe(true);
      expect(body.data.status).toBe("pending");
      expect(body.data.reportType).toBe("sla");
    });

    it("generates a report using settings ID", async () => {
      // Create settings
      const settingsRes = await fetch(`${apiUrl}/reports/settings`, {
        method: "POST",
        headers,
        body: JSON.stringify({
          name: "Generation Test Settings",
          monitorIds: [monitorId],
        }),
      });
      const { data: settings } = await settingsRes.json();

      const periodStart = new Date();
      periodStart.setMonth(periodStart.getMonth() - 1);
      const periodEnd = new Date();

      const response = await fetch(`${apiUrl}/reports/generate`, {
        method: "POST",
        headers,
        body: JSON.stringify({
          reportType: "sla",
          periodStart: periodStart.toISOString(),
          periodEnd: periodEnd.toISOString(),
          settingsId: settings.id,
        }),
      });

      expect(response.status).toBe(202);
      const body = await response.json();
      expect(body.data.settingsId).toBe(settings.id);
    });

    it("generates a report for all monitors", async () => {
      const periodStart = new Date();
      periodStart.setMonth(periodStart.getMonth() - 1);
      const periodEnd = new Date();

      const response = await fetch(`${apiUrl}/reports/generate`, {
        method: "POST",
        headers,
        body: JSON.stringify({
          reportType: "sla",
          periodStart: periodStart.toISOString(),
          periodEnd: periodEnd.toISOString(),
          includeAllMonitors: true,
        }),
      });

      expect(response.status).toBe(202);
      const body = await response.json();
      expect(body.success).toBe(true);
      expect(body.data.includedMonitors.length).toBeGreaterThan(0);
    });

    it("lists generated reports", async () => {
      const response = await fetch(`${apiUrl}/reports`, { headers });

      expect(response.status).toBe(200);
      const body = await response.json();
      expect(body.success).toBe(true);
      expect(Array.isArray(body.data)).toBe(true);
    });

    it("lists reports with pagination", async () => {
      const response = await fetch(`${apiUrl}/reports?limit=5&offset=0`, {
        headers,
      });

      expect(response.status).toBe(200);
      const body = await response.json();
      expect(body.meta.limit).toBe(5);
      expect(body.meta.offset).toBe(0);
    });

    it("filters reports by type", async () => {
      const response = await fetch(`${apiUrl}/reports?type=sla`, { headers });

      expect(response.status).toBe(200);
      const body = await response.json();
      for (const report of body.data) {
        expect(report.reportType).toBe("sla");
      }
    });

    it("filters reports by status", async () => {
      const response = await fetch(`${apiUrl}/reports?status=pending`, {
        headers,
      });

      expect(response.status).toBe(200);
      const body = await response.json();
      for (const report of body.data) {
        expect(report.status).toBe("pending");
      }
    });

    it("gets a report by ID", async () => {
      // Generate a report first
      const periodStart = new Date();
      periodStart.setMonth(periodStart.getMonth() - 1);
      const periodEnd = new Date();

      const generateRes = await fetch(`${apiUrl}/reports/generate`, {
        method: "POST",
        headers,
        body: JSON.stringify({
          reportType: "sla",
          periodStart: periodStart.toISOString(),
          periodEnd: periodEnd.toISOString(),
          monitorIds: [monitorId],
        }),
      });
      const { data: report } = await generateRes.json();

      const response = await fetch(`${apiUrl}/reports/${report.id}`, {
        headers,
      });

      expect(response.status).toBe(200);
      const body = await response.json();
      expect(body.success).toBe(true);
      expect(body.data.id).toBe(report.id);
    });
  });

  // ==========================================
  // Report Download
  // ==========================================

  describe("Report Download", () => {
    it("returns error for pending report download", async () => {
      // Generate a report (will be pending)
      const periodStart = new Date();
      periodStart.setMonth(periodStart.getMonth() - 1);
      const periodEnd = new Date();

      const generateRes = await fetch(`${apiUrl}/reports/generate`, {
        method: "POST",
        headers,
        body: JSON.stringify({
          reportType: "sla",
          periodStart: periodStart.toISOString(),
          periodEnd: periodEnd.toISOString(),
          monitorIds: [monitorId],
        }),
      });
      const { data: report } = await generateRes.json();

      const response = await fetch(`${apiUrl}/reports/${report.id}/download`, {
        headers,
      });

      expect(response.status).toBe(400);
      const body = await response.json();
      expect(body.error).toContain("not ready");
    });

    it("returns 404 for non-existent report download", async () => {
      const response = await fetch(
        `${apiUrl}/reports/non-existent-id/download`,
        { headers }
      );

      expect(response.status).toBe(404);
    });
  });

  // ==========================================
  // Report Templates CRUD
  // ==========================================

  describe("Report Templates CRUD", () => {
    let templateId: string;

    it("creates a report template", async () => {
      const response = await fetch(`${apiUrl}/reports/templates`, {
        method: "POST",
        headers,
        body: JSON.stringify({
          name: "Custom SLA Template",
          description: "Template for SLA reports with custom branding",
          reportType: "sla",
          headerHtml: "<header><h1>{{company_name}} SLA Report</h1></header>",
          footerHtml: "<footer>Confidential</footer>",
          cssStyles: "body { font-family: Arial; }",
          branding: {
            logo: "https://example.com/logo.png",
            primaryColor: "#3B82F6",
          },
          isDefault: false,
        }),
      });

      expect(response.status).toBe(201);
      const body = await response.json();
      expect(body.success).toBe(true);
      expect(body.data.name).toBe("Custom SLA Template");
      expect(body.data.reportType).toBe("sla");
      expect(body.data.isDefault).toBe(false);
      templateId = body.data.id;
    });

    it("creates a default template (unsets other defaults)", async () => {
      const response = await fetch(`${apiUrl}/reports/templates`, {
        method: "POST",
        headers,
        body: JSON.stringify({
          name: "Default SLA Template",
          reportType: "sla",
          isDefault: true,
        }),
      });

      expect(response.status).toBe(201);
      const body = await response.json();
      expect(body.data.isDefault).toBe(true);
    });

    it("lists all templates", async () => {
      const response = await fetch(`${apiUrl}/reports/templates`, { headers });

      expect(response.status).toBe(200);
      const body = await response.json();
      expect(body.success).toBe(true);
      expect(Array.isArray(body.data)).toBe(true);
      expect(body.data.length).toBeGreaterThanOrEqual(1);
    });

    it("gets template by ID", async () => {
      const response = await fetch(`${apiUrl}/reports/templates/${templateId}`, {
        headers,
      });

      expect(response.status).toBe(200);
      const body = await response.json();
      expect(body.success).toBe(true);
      expect(body.data.id).toBe(templateId);
    });

    it("updates a template", async () => {
      const response = await fetch(`${apiUrl}/reports/templates/${templateId}`, {
        method: "PATCH",
        headers,
        body: JSON.stringify({
          name: "Updated Template Name",
          cssStyles: "body { font-family: Helvetica; }",
        }),
      });

      expect(response.status).toBe(200);
      const body = await response.json();
      expect(body.data.name).toBe("Updated Template Name");
      expect(body.data.cssStyles).toContain("Helvetica");
    });

    it("sets a template as default", async () => {
      const response = await fetch(`${apiUrl}/reports/templates/${templateId}`, {
        method: "PATCH",
        headers,
        body: JSON.stringify({
          isDefault: true,
        }),
      });

      expect(response.status).toBe(200);
      const body = await response.json();
      expect(body.data.isDefault).toBe(true);
    });

    it("deletes a template", async () => {
      // Create one to delete
      const createRes = await fetch(`${apiUrl}/reports/templates`, {
        method: "POST",
        headers,
        body: JSON.stringify({
          name: "To Delete Template",
          reportType: "sla",
        }),
      });
      const { data } = await createRes.json();

      const response = await fetch(`${apiUrl}/reports/templates/${data.id}`, {
        method: "DELETE",
        headers,
      });

      expect(response.status).toBe(200);
      const body = await response.json();
      expect(body.data.deleted).toBe(true);

      // Verify deleted
      const getRes = await fetch(`${apiUrl}/reports/templates/${data.id}`, {
        headers,
      });
      expect(getRes.status).toBe(404);
    });
  });

  // ==========================================
  // Authorization
  // ==========================================

  describe("Authorization", () => {
    it("requires authentication for listing settings", async () => {
      const response = await fetch(`${apiUrl}/reports/settings`);
      expect(response.status).toBe(401);
    });

    it("requires authentication for creating settings", async () => {
      const response = await fetch(`${apiUrl}/reports/settings`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "Test" }),
      });
      expect(response.status).toBe(401);
    });

    it("requires write scope for creating settings", async () => {
      const response = await fetch(`${apiUrl}/reports/settings`, {
        method: "POST",
        headers: readOnlyHeaders,
        body: JSON.stringify({ name: "Test" }),
      });
      expect(response.status).toBe(403);
    });

    it("requires write scope for updating settings", async () => {
      // Get an existing settings ID
      const listRes = await fetch(`${apiUrl}/reports/settings`, { headers });
      const { data } = await listRes.json();
      if (data.length === 0) return; // Skip if no settings

      const response = await fetch(`${apiUrl}/reports/settings/${data[0].id}`, {
        method: "PATCH",
        headers: readOnlyHeaders,
        body: JSON.stringify({ name: "Updated" }),
      });
      expect(response.status).toBe(403);
    });

    it("requires write scope for deleting settings", async () => {
      const listRes = await fetch(`${apiUrl}/reports/settings`, { headers });
      const { data } = await listRes.json();
      if (data.length === 0) return;

      const response = await fetch(`${apiUrl}/reports/settings/${data[0].id}`, {
        method: "DELETE",
        headers: readOnlyHeaders,
      });
      expect(response.status).toBe(403);
    });

    it("requires write scope for generating reports", async () => {
      const periodStart = new Date();
      periodStart.setMonth(periodStart.getMonth() - 1);
      const periodEnd = new Date();

      const response = await fetch(`${apiUrl}/reports/generate`, {
        method: "POST",
        headers: readOnlyHeaders,
        body: JSON.stringify({
          reportType: "sla",
          periodStart: periodStart.toISOString(),
          periodEnd: periodEnd.toISOString(),
        }),
      });
      expect(response.status).toBe(403);
    });

    it("allows read scope for listing reports", async () => {
      const response = await fetch(`${apiUrl}/reports`, {
        headers: readOnlyHeaders,
      });
      expect(response.status).toBe(200);
    });

    it("allows read scope for listing templates", async () => {
      const response = await fetch(`${apiUrl}/reports/templates`, {
        headers: readOnlyHeaders,
      });
      expect(response.status).toBe(200);
    });

    it("requires write scope for creating templates", async () => {
      const response = await fetch(`${apiUrl}/reports/templates`, {
        method: "POST",
        headers: readOnlyHeaders,
        body: JSON.stringify({
          name: "Test Template",
          reportType: "sla",
        }),
      });
      expect(response.status).toBe(403);
    });
  });

  // ==========================================
  // Organization Isolation
  // ==========================================

  describe("Organization Isolation", () => {
    let otherOrgCtx: TestContext;
    let otherHeaders: Record<string, string>;

    beforeAll(async () => {
      otherOrgCtx = await bootstrapTestContext();
      otherHeaders = {
        Authorization: `Bearer ${otherOrgCtx.token}`,
        "Content-Type": "application/json",
        "X-Organization-Id": otherOrgCtx.organizationId,
      };
    });

    it("cannot access report settings from another org", async () => {
      // Create settings in first org
      const createRes = await fetch(`${apiUrl}/reports/settings`, {
        method: "POST",
        headers,
        body: JSON.stringify({ name: "Private Settings" }),
      });
      const { data } = await createRes.json();

      // Try to access from other org
      const response = await fetch(`${apiUrl}/reports/settings/${data.id}`, {
        headers: otherHeaders,
      });
      expect(response.status).toBe(404);
    });

    it("cannot update report settings from another org", async () => {
      const listRes = await fetch(`${apiUrl}/reports/settings`, { headers });
      const { data } = await listRes.json();
      if (data.length === 0) return;

      const response = await fetch(`${apiUrl}/reports/settings/${data[0].id}`, {
        method: "PATCH",
        headers: otherHeaders,
        body: JSON.stringify({ name: "Hacked" }),
      });
      expect(response.status).toBe(404);
    });

    it("cannot delete report settings from another org", async () => {
      const listRes = await fetch(`${apiUrl}/reports/settings`, { headers });
      const { data } = await listRes.json();
      if (data.length === 0) return;

      const response = await fetch(`${apiUrl}/reports/settings/${data[0].id}`, {
        method: "DELETE",
        headers: otherHeaders,
      });
      expect(response.status).toBe(404);
    });

    it("cannot access reports from another org", async () => {
      // Generate a report in first org
      const periodStart = new Date();
      periodStart.setMonth(periodStart.getMonth() - 1);
      const periodEnd = new Date();

      const generateRes = await fetch(`${apiUrl}/reports/generate`, {
        method: "POST",
        headers,
        body: JSON.stringify({
          reportType: "sla",
          periodStart: periodStart.toISOString(),
          periodEnd: periodEnd.toISOString(),
          monitorIds: [monitorId],
        }),
      });
      const { data: report } = await generateRes.json();

      // Try to access from other org
      const response = await fetch(`${apiUrl}/reports/${report.id}`, {
        headers: otherHeaders,
      });
      expect(response.status).toBe(404);
    });

    it("cannot access templates from another org", async () => {
      // Create template in first org
      const createRes = await fetch(`${apiUrl}/reports/templates`, {
        method: "POST",
        headers,
        body: JSON.stringify({
          name: "Private Template",
          reportType: "sla",
        }),
      });
      const { data } = await createRes.json();

      // Try to access from other org
      const response = await fetch(`${apiUrl}/reports/templates/${data.id}`, {
        headers: otherHeaders,
      });
      expect(response.status).toBe(404);
    });

    it("cannot use monitors from another org in report settings", async () => {
      const response = await fetch(`${apiUrl}/reports/settings`, {
        method: "POST",
        headers: otherHeaders,
        body: JSON.stringify({
          name: "Cross-Org Report",
          monitorIds: [monitorId], // Monitor from first org
        }),
      });

      expect(response.status).toBe(400);
    });
  });

  // ==========================================
  // 404 Handling
  // ==========================================

  describe("404 Handling", () => {
    it("returns 404 for non-existent settings", async () => {
      const response = await fetch(
        `${apiUrl}/reports/settings/non-existent-id`,
        { headers }
      );
      expect(response.status).toBe(404);
    });

    it("returns 404 when updating non-existent settings", async () => {
      const response = await fetch(
        `${apiUrl}/reports/settings/non-existent-id`,
        {
          method: "PATCH",
          headers,
          body: JSON.stringify({ name: "Test" }),
        }
      );
      expect(response.status).toBe(404);
    });

    it("returns 404 when deleting non-existent settings", async () => {
      const response = await fetch(
        `${apiUrl}/reports/settings/non-existent-id`,
        {
          method: "DELETE",
          headers,
        }
      );
      expect(response.status).toBe(404);
    });

    it("returns 404 for non-existent report", async () => {
      const response = await fetch(`${apiUrl}/reports/non-existent-id`, {
        headers,
      });
      expect(response.status).toBe(404);
    });

    it("returns 404 for non-existent template", async () => {
      const response = await fetch(
        `${apiUrl}/reports/templates/non-existent-id`,
        { headers }
      );
      expect(response.status).toBe(404);
    });

    it("returns 404 when updating non-existent template", async () => {
      const response = await fetch(
        `${apiUrl}/reports/templates/non-existent-id`,
        {
          method: "PATCH",
          headers,
          body: JSON.stringify({ name: "Test" }),
        }
      );
      expect(response.status).toBe(404);
    });

    it("returns 404 when deleting non-existent template", async () => {
      const response = await fetch(
        `${apiUrl}/reports/templates/non-existent-id`,
        {
          method: "DELETE",
          headers,
        }
      );
      expect(response.status).toBe(404);
    });
  });

  // ==========================================
  // Audit Logging
  // ==========================================

  describe("Audit Logging", () => {
    it("creates audit log for settings creation", async () => {
      // Create settings
      const createRes = await fetch(`${apiUrl}/reports/settings`, {
        method: "POST",
        headers,
        body: JSON.stringify({ name: "Audit Test Settings" }),
      });
      expect(createRes.status).toBe(201);

      // Check audit logs - nested data.data structure
      const auditRes = await fetch(
        `${apiUrl}/audit-logs?resourceType=report_settings&action=report_settings.create`,
        { headers }
      );
      expect(auditRes.status).toBe(200);
      const auditBody = await auditRes.json();
      expect(auditBody.data.data.length).toBeGreaterThan(0);
    });

    it("creates audit log for settings update", async () => {
      // Create and update settings
      const createRes = await fetch(`${apiUrl}/reports/settings`, {
        method: "POST",
        headers,
        body: JSON.stringify({ name: "Update Audit Test" }),
      });
      const { data: settings } = await createRes.json();

      await fetch(`${apiUrl}/reports/settings/${settings.id}`, {
        method: "PATCH",
        headers,
        body: JSON.stringify({ name: "Updated Name" }),
      });

      // Check audit logs
      const auditRes = await fetch(
        `${apiUrl}/audit-logs?resourceType=report_settings&action=report_settings.update`,
        { headers }
      );
      expect(auditRes.status).toBe(200);
    });

    it("creates audit log for settings deletion", async () => {
      // Create and delete settings
      const createRes = await fetch(`${apiUrl}/reports/settings`, {
        method: "POST",
        headers,
        body: JSON.stringify({ name: "Delete Audit Test" }),
      });
      const { data: settings } = await createRes.json();

      await fetch(`${apiUrl}/reports/settings/${settings.id}`, {
        method: "DELETE",
        headers,
      });

      // Check audit logs
      const auditRes = await fetch(
        `${apiUrl}/audit-logs?resourceType=report_settings&action=report_settings.delete`,
        { headers }
      );
      expect(auditRes.status).toBe(200);
    });

    it("creates audit log for report generation", async () => {
      const periodStart = new Date();
      periodStart.setMonth(periodStart.getMonth() - 1);
      const periodEnd = new Date();

      await fetch(`${apiUrl}/reports/generate`, {
        method: "POST",
        headers,
        body: JSON.stringify({
          reportType: "sla",
          periodStart: periodStart.toISOString(),
          periodEnd: periodEnd.toISOString(),
          monitorIds: [monitorId],
        }),
      });

      // Check audit logs
      const auditRes = await fetch(
        `${apiUrl}/audit-logs?resourceType=sla_report&action=report.generate`,
        { headers }
      );
      expect(auditRes.status).toBe(200);
    });

    it("creates audit log for template creation", async () => {
      await fetch(`${apiUrl}/reports/templates`, {
        method: "POST",
        headers,
        body: JSON.stringify({
          name: "Audit Template Test",
          reportType: "sla",
        }),
      });

      // Check audit logs
      const auditRes = await fetch(
        `${apiUrl}/audit-logs?resourceType=report_template&action=report_template.create`,
        { headers }
      );
      expect(auditRes.status).toBe(200);
    });
  });
});
