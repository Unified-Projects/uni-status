/**
 * Report Generator Tests
 *
 * Tests for the report generation API and worker functionality.
 * Covers report settings, templates, generation, and delivery.
 */

import { describe, it, expect, beforeAll } from "vitest";
import { bootstrapTestContext, TestContext } from "../helpers/context";
import { insertMonitor, insertStatusPage } from "../helpers/data";

const API_BASE_URL = process.env.API_BASE_URL ?? "http://api:3001";

describe("Report Generator", () => {
  let ctx: TestContext;
  let monitorId1: string;
  let monitorId2: string;
  let statusPageId: string;

  beforeAll(async () => {
    ctx = await bootstrapTestContext();

    // Create monitors for reports
    const monitor1 = await insertMonitor(ctx.organizationId, {
      name: "Report Test Monitor 1",
      url: "https://example1.com",
    });
    monitorId1 = monitor1.id;

    const monitor2 = await insertMonitor(ctx.organizationId, {
      name: "Report Test Monitor 2",
      url: "https://example2.com",
    });
    monitorId2 = monitor2.id;

    // Create status page
    statusPageId = await insertStatusPage(ctx.organizationId, {
      name: "Report Test Status Page",
      slug: `report-test-${Date.now()}`,
    });
  });

  // ==========================================
  // REPORT SETTINGS
  // ==========================================
  describe("Report Settings", () => {
    describe("POST /reports/settings", () => {
      it("creates report settings with all options", async () => {
        const res = await fetch(`${API_BASE_URL}/api/v1/reports/settings`, {
          method: "POST",
          headers: ctx.headers,
          body: JSON.stringify({
            name: "Full Options Report",
            reportType: "sla",
            frequency: "monthly",
            monitorIds: [monitorId1, monitorId2],
            includeAllMonitors: false,
            includeCharts: true,
            includeIncidents: true,
            includeMaintenanceWindows: true,
            includeResponseTimes: true,
            includeSloStatus: true,
            recipients: { emails: ["report@example.com"] },
            dayOfMonth: 1,
            timezone: "Europe/London",
            active: true,
          }),
        });

        expect(res.status).toBe(201);
        const body = await res.json();
        expect(body.success).toBe(true);
        expect(body.data.name).toBe("Full Options Report");
        expect(body.data.reportType).toBe("sla");
        expect(body.data.frequency).toBe("monthly");
        expect(body.data.includeCharts).toBe(true);
        expect(body.data.nextScheduledAt).toBeDefined();
      });

      it("creates weekly report settings", async () => {
        const res = await fetch(`${API_BASE_URL}/api/v1/reports/settings`, {
          method: "POST",
          headers: ctx.headers,
          body: JSON.stringify({
            name: "Weekly Report",
            reportType: "sla",
            frequency: "weekly",
            dayOfWeek: 1, // Monday
            includeAllMonitors: true,
            recipients: { emails: ["weekly@example.com"] },
          }),
        });

        expect(res.status).toBe(201);
        const body = await res.json();
        expect(body.data.frequency).toBe("weekly");
        expect(body.data.dayOfWeek).toBe(1);
      });

      it("creates quarterly report settings", async () => {
        const res = await fetch(`${API_BASE_URL}/api/v1/reports/settings`, {
          method: "POST",
          headers: ctx.headers,
          body: JSON.stringify({
            name: "Quarterly Report",
            reportType: "sla",
            frequency: "quarterly",
            dayOfMonth: 1,
            includeAllMonitors: true,
            recipients: { emails: ["quarterly@example.com"] },
          }),
        });

        expect(res.status).toBe(201);
        const body = await res.json();
        expect(body.data.frequency).toBe("quarterly");
      });

      it("creates annual report settings", async () => {
        const res = await fetch(`${API_BASE_URL}/api/v1/reports/settings`, {
          method: "POST",
          headers: ctx.headers,
          body: JSON.stringify({
            name: "Annual Report",
            reportType: "sla",
            frequency: "annually",
            dayOfMonth: 1,
            includeAllMonitors: true,
            recipients: { emails: ["annual@example.com"] },
          }),
        });

        expect(res.status).toBe(201);
        const body = await res.json();
        expect(body.data.frequency).toBe("annually");
      });

      it("creates on-demand report settings", async () => {
        const res = await fetch(`${API_BASE_URL}/api/v1/reports/settings`, {
          method: "POST",
          headers: ctx.headers,
          body: JSON.stringify({
            name: "On-Demand Report",
            reportType: "sla",
            frequency: "on_demand",
            includeAllMonitors: true,
          }),
        });

        expect(res.status).toBe(201);
        const body = await res.json();
        expect(body.data.frequency).toBe("on_demand");
        expect(body.data.nextScheduledAt).toBeNull();
      });

      it("creates inactive report settings", async () => {
        const res = await fetch(`${API_BASE_URL}/api/v1/reports/settings`, {
          method: "POST",
          headers: ctx.headers,
          body: JSON.stringify({
            name: "Inactive Report",
            reportType: "sla",
            frequency: "monthly",
            active: false,
            includeAllMonitors: true,
          }),
        });

        expect(res.status).toBe(201);
        const body = await res.json();
        expect(body.data.active).toBe(false);
      });

      it("creates report settings with status pages", async () => {
        const res = await fetch(`${API_BASE_URL}/api/v1/reports/settings`, {
          method: "POST",
          headers: ctx.headers,
          body: JSON.stringify({
            name: "Status Page Report",
            reportType: "sla",
            frequency: "monthly",
            statusPageIds: [statusPageId],
            includeAllMonitors: false,
          }),
        });

        expect(res.status).toBe(201);
        const body = await res.json();
        expect(body.data.statusPageIds).toContain(statusPageId);
      });

      it("creates report settings with custom branding", async () => {
        const res = await fetch(`${API_BASE_URL}/api/v1/reports/settings`, {
          method: "POST",
          headers: ctx.headers,
          body: JSON.stringify({
            name: "Branded Report",
            reportType: "sla",
            frequency: "monthly",
            includeAllMonitors: true,
            customBranding: {
              logoUrl: "https://example.com/logo.png",
              companyName: "Test Company",
              primaryColor: "#007bff",
            },
          }),
        });

        expect(res.status).toBe(201);
        const body = await res.json();
        expect(body.data.customBranding.companyName).toBe("Test Company");
      });

      it("rejects invalid monitor IDs", async () => {
        const res = await fetch(`${API_BASE_URL}/api/v1/reports/settings`, {
          method: "POST",
          headers: ctx.headers,
          body: JSON.stringify({
            name: "Invalid Monitor Report",
            reportType: "sla",
            frequency: "monthly",
            monitorIds: ["nonexistent-monitor-id"],
          }),
        });

        expect(res.status).toBe(400);
        const body = await res.json();
        expect(body.success).toBe(false);
      });

      it("rejects invalid status page IDs", async () => {
        const res = await fetch(`${API_BASE_URL}/api/v1/reports/settings`, {
          method: "POST",
          headers: ctx.headers,
          body: JSON.stringify({
            name: "Invalid Status Page Report",
            reportType: "sla",
            frequency: "monthly",
            statusPageIds: ["nonexistent-status-page-id"],
          }),
        });

        expect(res.status).toBe(400);
        const body = await res.json();
        expect(body.success).toBe(false);
      });
    });

    describe("GET /reports/settings", () => {
      it("lists all report settings", async () => {
        const res = await fetch(`${API_BASE_URL}/api/v1/reports/settings`, {
          headers: ctx.headers,
        });

        expect(res.status).toBe(200);
        const body = await res.json();
        expect(body.success).toBe(true);
        expect(Array.isArray(body.data)).toBe(true);
        expect(body.data.length).toBeGreaterThan(0);
      });
    });

    describe("GET /reports/settings/:id", () => {
      let settingsId: string;

      beforeAll(async () => {
        const createRes = await fetch(`${API_BASE_URL}/api/v1/reports/settings`, {
          method: "POST",
          headers: ctx.headers,
          body: JSON.stringify({
            name: "Get Test Settings",
            reportType: "sla",
            frequency: "monthly",
            includeAllMonitors: true,
          }),
        });
        const createBody = await createRes.json();
        settingsId = createBody.data.id;
      });

      it("gets specific report settings", async () => {
        const res = await fetch(
          `${API_BASE_URL}/api/v1/reports/settings/${settingsId}`,
          { headers: ctx.headers }
        );

        expect(res.status).toBe(200);
        const body = await res.json();
        expect(body.data.id).toBe(settingsId);
        expect(body.data.name).toBe("Get Test Settings");
      });

      it("returns 404 for non-existent settings", async () => {
        const res = await fetch(
          `${API_BASE_URL}/api/v1/reports/settings/nonexistent-id`,
          { headers: ctx.headers }
        );

        expect(res.status).toBe(404);
      });
    });

    describe("PATCH /reports/settings/:id", () => {
      let settingsId: string;

      beforeAll(async () => {
        const createRes = await fetch(`${API_BASE_URL}/api/v1/reports/settings`, {
          method: "POST",
          headers: ctx.headers,
          body: JSON.stringify({
            name: "Update Test Settings",
            reportType: "sla",
            frequency: "monthly",
            includeAllMonitors: true,
          }),
        });
        const createBody = await createRes.json();
        settingsId = createBody.data.id;
      });

      it("updates settings name", async () => {
        const res = await fetch(
          `${API_BASE_URL}/api/v1/reports/settings/${settingsId}`,
          {
            method: "PATCH",
            headers: ctx.headers,
            body: JSON.stringify({ name: "Updated Settings Name" }),
          }
        );

        expect(res.status).toBe(200);
        const body = await res.json();
        expect(body.data.name).toBe("Updated Settings Name");
      });

      it("updates frequency and recalculates next scheduled", async () => {
        const res = await fetch(
          `${API_BASE_URL}/api/v1/reports/settings/${settingsId}`,
          {
            method: "PATCH",
            headers: ctx.headers,
            body: JSON.stringify({ frequency: "weekly", dayOfWeek: 5 }),
          }
        );

        expect(res.status).toBe(200);
        const body = await res.json();
        expect(body.data.frequency).toBe("weekly");
        expect(body.data.nextScheduledAt).toBeDefined();
      });

      it("updates include options", async () => {
        const res = await fetch(
          `${API_BASE_URL}/api/v1/reports/settings/${settingsId}`,
          {
            method: "PATCH",
            headers: ctx.headers,
            body: JSON.stringify({
              includeCharts: false,
              includeIncidents: false,
            }),
          }
        );

        expect(res.status).toBe(200);
        const body = await res.json();
        expect(body.data.includeCharts).toBe(false);
        expect(body.data.includeIncidents).toBe(false);
      });

      it("enables and disables settings", async () => {
        // Disable
        let res = await fetch(
          `${API_BASE_URL}/api/v1/reports/settings/${settingsId}`,
          {
            method: "PATCH",
            headers: ctx.headers,
            body: JSON.stringify({ active: false }),
          }
        );
        expect(res.status).toBe(200);
        let body = await res.json();
        expect(body.data.active).toBe(false);

        // Enable
        res = await fetch(
          `${API_BASE_URL}/api/v1/reports/settings/${settingsId}`,
          {
            method: "PATCH",
            headers: ctx.headers,
            body: JSON.stringify({ active: true }),
          }
        );
        expect(res.status).toBe(200);
        body = await res.json();
        expect(body.data.active).toBe(true);
      });
    });

    describe("DELETE /reports/settings/:id", () => {
      it("deletes report settings", async () => {
        // Create temp settings
        const createRes = await fetch(`${API_BASE_URL}/api/v1/reports/settings`, {
          method: "POST",
          headers: ctx.headers,
          body: JSON.stringify({
            name: "Delete Test Settings",
            reportType: "sla",
            frequency: "monthly",
            includeAllMonitors: true,
          }),
        });
        const createBody = await createRes.json();
        const settingsId = createBody.data.id;

        // Delete
        const res = await fetch(
          `${API_BASE_URL}/api/v1/reports/settings/${settingsId}`,
          {
            method: "DELETE",
            headers: ctx.headers,
          }
        );

        expect(res.status).toBe(200);
        const body = await res.json();
        expect(body.data.deleted).toBe(true);

        // Verify deletion
        const getRes = await fetch(
          `${API_BASE_URL}/api/v1/reports/settings/${settingsId}`,
          { headers: ctx.headers }
        );
        expect(getRes.status).toBe(404);
      });
    });
  });

  // ==========================================
  // REPORT TEMPLATES
  // ==========================================
  describe("Report Templates", () => {
    describe("POST /reports/templates", () => {
      it("creates a report template", async () => {
        const res = await fetch(`${API_BASE_URL}/api/v1/reports/templates`, {
          method: "POST",
          headers: ctx.headers,
          body: JSON.stringify({
            name: "Custom Template",
            description: "A custom report template",
            reportType: "sla",
            headerHtml: "<h1>Custom Header</h1>",
            footerHtml: "<p>Custom Footer</p>",
            cssStyles: ".custom { color: blue; }",
            branding: { logoUrl: "https://example.com/logo.png" },
            isDefault: false,
          }),
        });

        expect(res.status).toBe(201);
        const body = await res.json();
        expect(body.success).toBe(true);
        expect(body.data.name).toBe("Custom Template");
        expect(body.data.reportType).toBe("sla");
      });

      it("creates a default template", async () => {
        const res = await fetch(`${API_BASE_URL}/api/v1/reports/templates`, {
          method: "POST",
          headers: ctx.headers,
          body: JSON.stringify({
            name: "Default SLA Template",
            reportType: "sla",
            isDefault: true,
          }),
        });

        expect(res.status).toBe(201);
        const body = await res.json();
        expect(body.data.isDefault).toBe(true);
      });
    });

    describe("GET /reports/templates", () => {
      it("lists all templates", async () => {
        const res = await fetch(`${API_BASE_URL}/api/v1/reports/templates`, {
          headers: ctx.headers,
        });

        expect(res.status).toBe(200);
        const body = await res.json();
        expect(body.success).toBe(true);
        expect(Array.isArray(body.data)).toBe(true);
      });
    });

    describe("GET /reports/templates/:id", () => {
      let templateId: string;

      beforeAll(async () => {
        const createRes = await fetch(`${API_BASE_URL}/api/v1/reports/templates`, {
          method: "POST",
          headers: ctx.headers,
          body: JSON.stringify({
            name: "Get Test Template",
            reportType: "sla",
          }),
        });
        const createBody = await createRes.json();
        templateId = createBody.data.id;
      });

      it("gets specific template", async () => {
        const res = await fetch(
          `${API_BASE_URL}/api/v1/reports/templates/${templateId}`,
          { headers: ctx.headers }
        );

        expect(res.status).toBe(200);
        const body = await res.json();
        expect(body.data.id).toBe(templateId);
      });

      it("returns 404 for non-existent template", async () => {
        const res = await fetch(
          `${API_BASE_URL}/api/v1/reports/templates/nonexistent-id`,
          { headers: ctx.headers }
        );

        expect(res.status).toBe(404);
      });
    });

    describe("PATCH /reports/templates/:id", () => {
      let templateId: string;

      beforeAll(async () => {
        const createRes = await fetch(`${API_BASE_URL}/api/v1/reports/templates`, {
          method: "POST",
          headers: ctx.headers,
          body: JSON.stringify({
            name: "Update Test Template",
            reportType: "sla",
          }),
        });
        const createBody = await createRes.json();
        templateId = createBody.data.id;
      });

      it("updates template name", async () => {
        const res = await fetch(
          `${API_BASE_URL}/api/v1/reports/templates/${templateId}`,
          {
            method: "PATCH",
            headers: ctx.headers,
            body: JSON.stringify({ name: "Updated Template Name" }),
          }
        );

        expect(res.status).toBe(200);
        const body = await res.json();
        expect(body.data.name).toBe("Updated Template Name");
      });

      it("updates template HTML content", async () => {
        const res = await fetch(
          `${API_BASE_URL}/api/v1/reports/templates/${templateId}`,
          {
            method: "PATCH",
            headers: ctx.headers,
            body: JSON.stringify({
              headerHtml: "<h1>Updated Header</h1>",
              footerHtml: "<p>Updated Footer</p>",
            }),
          }
        );

        expect(res.status).toBe(200);
        const body = await res.json();
        expect(body.data.headerHtml).toBe("<h1>Updated Header</h1>");
      });
    });

    describe("DELETE /reports/templates/:id", () => {
      it("deletes a template", async () => {
        // Create temp template
        const createRes = await fetch(`${API_BASE_URL}/api/v1/reports/templates`, {
          method: "POST",
          headers: ctx.headers,
          body: JSON.stringify({
            name: "Delete Test Template",
            reportType: "sla",
          }),
        });
        const createBody = await createRes.json();
        const templateId = createBody.data.id;

        // Delete
        const res = await fetch(
          `${API_BASE_URL}/api/v1/reports/templates/${templateId}`,
          {
            method: "DELETE",
            headers: ctx.headers,
          }
        );

        expect(res.status).toBe(200);
        const body = await res.json();
        expect(body.data.deleted).toBe(true);
      });
    });
  });

  // ==========================================
  // REPORT GENERATION
  // ==========================================
  describe("Report Generation", () => {
    describe("POST /reports/generate", () => {
      it("generates an SLA report", async () => {
        const now = new Date();
        const periodEnd = now.toISOString();
        const periodStart = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString();

        const res = await fetch(`${API_BASE_URL}/api/v1/reports/generate`, {
          method: "POST",
          headers: ctx.headers,
          body: JSON.stringify({
            reportType: "sla",
            periodStart,
            periodEnd,
            monitorIds: [monitorId1, monitorId2],
          }),
        });

        expect(res.status).toBe(202); // Accepted for async processing
        const body = await res.json();
        expect(body.success).toBe(true);
        expect(body.data.status).toBe("pending");
        expect(body.data.reportType).toBe("sla");
      });

      it("generates report with includeAllMonitors", async () => {
        const now = new Date();
        const periodEnd = now.toISOString();
        const periodStart = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();

        const res = await fetch(`${API_BASE_URL}/api/v1/reports/generate`, {
          method: "POST",
          headers: ctx.headers,
          body: JSON.stringify({
            reportType: "sla",
            periodStart,
            periodEnd,
            includeAllMonitors: true,
          }),
        });

        expect(res.status).toBe(202);
        const body = await res.json();
        expect(body.data.includedMonitors.length).toBeGreaterThan(0);
      });

      it("generates report with status pages", async () => {
        const now = new Date();
        const periodEnd = now.toISOString();
        const periodStart = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();

        const res = await fetch(`${API_BASE_URL}/api/v1/reports/generate`, {
          method: "POST",
          headers: ctx.headers,
          body: JSON.stringify({
            reportType: "sla",
            periodStart,
            periodEnd,
            statusPageIds: [statusPageId],
          }),
        });

        expect(res.status).toBe(202);
        const body = await res.json();
        expect(body.data.includedStatusPages).toContain(statusPageId);
      });

      it("rejects invalid monitor IDs", async () => {
        const now = new Date();
        const periodEnd = now.toISOString();
        const periodStart = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();

        const res = await fetch(`${API_BASE_URL}/api/v1/reports/generate`, {
          method: "POST",
          headers: ctx.headers,
          body: JSON.stringify({
            reportType: "sla",
            periodStart,
            periodEnd,
            monitorIds: ["nonexistent-monitor-id"],
          }),
        });

        expect(res.status).toBe(400);
      });
    });

    describe("GET /reports", () => {
      it("lists generated reports", async () => {
        const res = await fetch(`${API_BASE_URL}/api/v1/reports`, {
          headers: ctx.headers,
        });

        expect(res.status).toBe(200);
        const body = await res.json();
        expect(body.success).toBe(true);
        expect(Array.isArray(body.data)).toBe(true);
      });

      it("paginates reports", async () => {
        const res = await fetch(
          `${API_BASE_URL}/api/v1/reports?limit=5&offset=0`,
          { headers: ctx.headers }
        );

        expect(res.status).toBe(200);
        const body = await res.json();
        expect(body.meta.limit).toBe(5);
        expect(body.meta.offset).toBe(0);
      });
    });

    describe("GET /reports/:id", () => {
      let reportId: string;

      beforeAll(async () => {
        const now = new Date();
        const periodEnd = now.toISOString();
        const periodStart = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();

        const genRes = await fetch(`${API_BASE_URL}/api/v1/reports/generate`, {
          method: "POST",
          headers: ctx.headers,
          body: JSON.stringify({
            reportType: "sla",
            periodStart,
            periodEnd,
            includeAllMonitors: true,
          }),
        });
        const genBody = await genRes.json();
        reportId = genBody.data.id;
      });

      it("gets specific report", async () => {
        const res = await fetch(`${API_BASE_URL}/api/v1/reports/${reportId}`, {
          headers: ctx.headers,
        });

        expect(res.status).toBe(200);
        const body = await res.json();
        expect(body.data.id).toBe(reportId);
      });

      it("returns 404 for non-existent report", async () => {
        const res = await fetch(
          `${API_BASE_URL}/api/v1/reports/nonexistent-id`,
          { headers: ctx.headers }
        );

        expect(res.status).toBe(404);
      });
    });

    describe("GET /reports/:id/download", () => {
      it("returns error for pending report", async () => {
        // Generate a report (will be pending)
        const now = new Date();
        const periodEnd = now.toISOString();
        const periodStart = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();

        const genRes = await fetch(`${API_BASE_URL}/api/v1/reports/generate`, {
          method: "POST",
          headers: ctx.headers,
          body: JSON.stringify({
            reportType: "sla",
            periodStart,
            periodEnd,
            includeAllMonitors: true,
          }),
        });
        const genBody = await genRes.json();
        const reportId = genBody.data.id;

        // Try to download immediately (should fail as not ready)
        const res = await fetch(
          `${API_BASE_URL}/api/v1/reports/${reportId}/download`,
          { headers: ctx.headers }
        );

        expect(res.status).toBe(400);
        const body = await res.json();
        expect(body.success).toBe(false);
        expect(body.error).toContain("not ready");
      });

      it("returns 404 for non-existent report", async () => {
        const res = await fetch(
          `${API_BASE_URL}/api/v1/reports/nonexistent-id/download`,
          { headers: ctx.headers }
        );

        expect(res.status).toBe(404);
      });
    });
  });

  // ==========================================
  // END-TO-END REPORT GENERATION AND DOWNLOAD
  // ==========================================
  describe("End-to-End Report Generation and Download", () => {
    // Helper to wait for report completion
    async function waitForReportCompletion(
      reportId: string,
      headers: Record<string, string>,
      maxWaitMs: number = 30000
    ): Promise<{ status: string; fileUrl?: string }> {
      const startTime = Date.now();
      while (Date.now() - startTime < maxWaitMs) {
        const res = await fetch(`${API_BASE_URL}/api/v1/reports/${reportId}`, {
          headers,
        });
        const body = await res.json();

        // Handle error responses gracefully
        if (!res.ok || !body.data) {
          console.warn(`[waitForReportCompletion] Error fetching report ${reportId}:`, body.error || res.status);
          // Wait and retry on error
          await new Promise((resolve) => setTimeout(resolve, 1000));
          continue;
        }

        if (body.data.status === "completed" || body.data.status === "failed") {
          return { status: body.data.status, fileUrl: body.data.fileUrl };
        }
        // Wait 1 second before checking again
        await new Promise((resolve) => setTimeout(resolve, 1000));
      }
      return { status: "timeout" };
    }

    it.skip("generates and downloads an SLA report end-to-end", async () => {
      const now = new Date();
      const periodEnd = now.toISOString();
      const periodStart = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();

      // Generate report
      const genRes = await fetch(`${API_BASE_URL}/api/v1/reports/generate`, {
        method: "POST",
        headers: ctx.headers,
        body: JSON.stringify({
          reportType: "sla",
          periodStart,
          periodEnd,
          includeAllMonitors: true,
        }),
      });

      expect(genRes.status).toBe(202);
      const genBody = await genRes.json();
      const reportId = genBody.data.id;
      expect(reportId).toBeDefined();

      // Wait for completion
      const result = await waitForReportCompletion(reportId, ctx.headers);
      expect(result.status).toBe("completed");
      expect(result.fileUrl).toBeDefined();

      // Download the report
      const downloadRes = await fetch(
        `${API_BASE_URL}/api/v1/reports/${reportId}/download`,
        { headers: ctx.headers }
      );

      expect(downloadRes.status).toBe(200);
      expect(downloadRes.headers.get("content-type")).toBe("application/pdf");
      expect(downloadRes.headers.get("content-disposition")).toContain("attachment");

      // Verify we got actual PDF content
      const pdfBuffer = await downloadRes.arrayBuffer();
      expect(pdfBuffer.byteLength).toBeGreaterThan(1000); // PDF should be at least 1KB
    }, 60000); // 60 second timeout for this test

    it.skip("generates report with specific monitors", async () => {
      const now = new Date();
      const periodEnd = now.toISOString();
      const periodStart = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();

      // Generate report with specific monitors
      const genRes = await fetch(`${API_BASE_URL}/api/v1/reports/generate`, {
        method: "POST",
        headers: ctx.headers,
        body: JSON.stringify({
          reportType: "sla",
          periodStart,
          periodEnd,
          monitorIds: [monitorId1],
        }),
      });

      expect(genRes.status).toBe(202);
      const genBody = await genRes.json();
      const reportId = genBody.data.id;

      // Wait for completion
      const result = await waitForReportCompletion(reportId, ctx.headers);
      expect(result.status).toBe("completed");

      // Verify the report
      const reportRes = await fetch(`${API_BASE_URL}/api/v1/reports/${reportId}`, {
        headers: ctx.headers,
      });
      const reportBody = await reportRes.json();
      expect(reportBody.data.includedMonitors).toContain(monitorId1);
    }, 60000);

    it.skip("generates report for status page", async () => {
      const now = new Date();
      const periodEnd = now.toISOString();
      const periodStart = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();

      // Generate report for status page
      const genRes = await fetch(`${API_BASE_URL}/api/v1/reports/generate`, {
        method: "POST",
        headers: ctx.headers,
        body: JSON.stringify({
          reportType: "sla",
          periodStart,
          periodEnd,
          statusPageIds: [statusPageId],
        }),
      });

      expect(genRes.status).toBe(202);
      const genBody = await genRes.json();
      const reportId = genBody.data.id;

      // Wait for completion
      const result = await waitForReportCompletion(reportId, ctx.headers);
      expect(result.status).toBe("completed");

      // Verify the report
      const reportRes = await fetch(`${API_BASE_URL}/api/v1/reports/${reportId}`, {
        headers: ctx.headers,
      });
      const reportBody = await reportRes.json();
      expect(reportBody.data.includedStatusPages).toContain(statusPageId);
    }, 60000);

    it.skip("report file persists and can be downloaded multiple times", async () => {
      const now = new Date();
      const periodEnd = now.toISOString();
      const periodStart = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();

      // Generate report
      const genRes = await fetch(`${API_BASE_URL}/api/v1/reports/generate`, {
        method: "POST",
        headers: ctx.headers,
        body: JSON.stringify({
          reportType: "sla",
          periodStart,
          periodEnd,
          includeAllMonitors: true,
        }),
      });
      const genBody = await genRes.json();
      const reportId = genBody.data.id;

      // Wait for completion
      await waitForReportCompletion(reportId, ctx.headers);

      // Download first time
      const download1 = await fetch(
        `${API_BASE_URL}/api/v1/reports/${reportId}/download`,
        { headers: ctx.headers }
      );
      expect(download1.status).toBe(200);
      const size1 = (await download1.arrayBuffer()).byteLength;

      // Download second time
      const download2 = await fetch(
        `${API_BASE_URL}/api/v1/reports/${reportId}/download`,
        { headers: ctx.headers }
      );
      expect(download2.status).toBe(200);
      const size2 = (await download2.arrayBuffer()).byteLength;

      // Both downloads should return same size
      expect(size1).toBe(size2);
    }, 60000);

    it("cannot download other organization report", async () => {
      const otherCtx = await bootstrapTestContext();

      const now = new Date();
      const periodEnd = now.toISOString();
      const periodStart = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();

      // Generate report in other org
      const genRes = await fetch(`${API_BASE_URL}/api/v1/reports/generate`, {
        method: "POST",
        headers: otherCtx.headers,
        body: JSON.stringify({
          reportType: "sla",
          periodStart,
          periodEnd,
          includeAllMonitors: true,
        }),
      });
      const genBody = await genRes.json();
      const reportId = genBody.data.id;

      // Wait for completion
      await waitForReportCompletion(reportId, otherCtx.headers);

      // Try to download from first org - should fail
      const downloadRes = await fetch(
        `${API_BASE_URL}/api/v1/reports/${reportId}/download`,
        { headers: ctx.headers }
      );

      expect([403, 404].includes(downloadRes.status)).toBe(true);
    }, 60000);

    it.skip("report contains expected summary data", async () => {
      const now = new Date();
      const periodEnd = now.toISOString();
      const periodStart = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();

      // Generate report
      const genRes = await fetch(`${API_BASE_URL}/api/v1/reports/generate`, {
        method: "POST",
        headers: ctx.headers,
        body: JSON.stringify({
          reportType: "sla",
          periodStart,
          periodEnd,
          includeAllMonitors: true,
        }),
      });
      const genBody = await genRes.json();
      const reportId = genBody.data.id;

      // Wait for completion
      await waitForReportCompletion(reportId, ctx.headers);

      // Get report details
      const reportRes = await fetch(`${API_BASE_URL}/api/v1/reports/${reportId}`, {
        headers: ctx.headers,
      });
      const reportBody = await reportRes.json();

      // Verify summary data
      expect(reportBody.data.summary).toBeDefined();
      expect(reportBody.data.summary.monitorCount).toBeGreaterThanOrEqual(0);
      expect(reportBody.data.fileSize).toBeGreaterThan(0);
      expect(reportBody.data.generationDurationMs).toBeGreaterThan(0);
    }, 60000);

    // ==========================================
    // ALL REPORT TYPES - E2E GENERATION AND DOWNLOAD
    // ==========================================
    describe("All Report Types", () => {
      const reportTypes = ["sla", "uptime", "incident", "performance", "executive"] as const;

      for (const reportType of reportTypes) {
        it.skip(`generates and downloads ${reportType.toUpperCase()} report end-to-end`, async () => {
          const now = new Date();
          const periodEnd = now.toISOString();
          const periodStart = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();

          // Generate report
          const genRes = await fetch(`${API_BASE_URL}/api/v1/reports/generate`, {
            method: "POST",
            headers: ctx.headers,
            body: JSON.stringify({
              reportType,
              periodStart,
              periodEnd,
              includeAllMonitors: true,
            }),
          });

          expect(genRes.status).toBe(202);
          const genBody = await genRes.json();
          const reportId = genBody.data.id;
          expect(reportId).toBeDefined();
          expect(genBody.data.reportType).toBe(reportType);

          // Wait for completion
          const result = await waitForReportCompletion(reportId, ctx.headers);
          expect(result.status).toBe("completed");
          expect(result.fileUrl).toBeDefined();

          // Download the report
          const downloadRes = await fetch(
            `${API_BASE_URL}/api/v1/reports/${reportId}/download`,
            { headers: ctx.headers }
          );

          expect(downloadRes.status).toBe(200);
          expect(downloadRes.headers.get("content-type")).toBe("application/pdf");
          expect(downloadRes.headers.get("content-disposition")).toContain("attachment");

          // Verify we got actual PDF content (should start with %PDF)
          const pdfBuffer = await downloadRes.arrayBuffer();
          expect(pdfBuffer.byteLength).toBeGreaterThan(1000);
          const pdfStart = new Uint8Array(pdfBuffer.slice(0, 4));
          const pdfMagic = String.fromCharCode(...pdfStart);
          expect(pdfMagic).toBe("%PDF");
        }, 90000); // 90 second timeout for report generation

        it(`creates ${reportType.toUpperCase()} report settings`, async () => {
          const res = await fetch(`${API_BASE_URL}/api/v1/reports/settings`, {
            method: "POST",
            headers: ctx.headers,
            body: JSON.stringify({
              name: `${reportType} Report Settings`,
              reportType,
              frequency: "monthly",
              includeAllMonitors: true,
              recipients: { emails: [`${reportType}@example.com`] },
              dayOfMonth: 1,
            }),
          });

          expect(res.status).toBe(201);
          const body = await res.json();
          expect(body.success).toBe(true);
          expect(body.data.reportType).toBe(reportType);
          expect(body.data.name).toBe(`${reportType} Report Settings`);
        });

        it(`creates ${reportType.toUpperCase()} report template`, async () => {
          const res = await fetch(`${API_BASE_URL}/api/v1/reports/templates`, {
            method: "POST",
            headers: ctx.headers,
            body: JSON.stringify({
              name: `${reportType} Template`,
              reportType,
              description: `Template for ${reportType} reports`,
            }),
          });

          expect(res.status).toBe(201);
          const body = await res.json();
          expect(body.success).toBe(true);
          expect(body.data.reportType).toBe(reportType);
        });
      }
    });
  });

  // ==========================================
  // CROSS-ORG ISOLATION
  // ==========================================
  describe("Cross-Organization Isolation", () => {
    let otherCtx: TestContext;
    let otherSettingsId: string;
    let otherTemplateId: string;

    beforeAll(async () => {
      otherCtx = await bootstrapTestContext();

      // Create settings in other org
      const settingsRes = await fetch(`${API_BASE_URL}/api/v1/reports/settings`, {
        method: "POST",
        headers: otherCtx.headers,
        body: JSON.stringify({
          name: "Other Org Settings",
          reportType: "sla",
          frequency: "monthly",
          includeAllMonitors: true,
        }),
      });
      const settingsBody = await settingsRes.json();
      otherSettingsId = settingsBody.data.id;

      // Create template in other org
      const templateRes = await fetch(`${API_BASE_URL}/api/v1/reports/templates`, {
        method: "POST",
        headers: otherCtx.headers,
        body: JSON.stringify({
          name: "Other Org Template",
          reportType: "sla",
        }),
      });
      const templateBody = await templateRes.json();
      otherTemplateId = templateBody.data.id;
    });

    it("cannot access other org report settings", async () => {
      const res = await fetch(
        `${API_BASE_URL}/api/v1/reports/settings/${otherSettingsId}`,
        { headers: ctx.headers }
      );

      expect(res.status).toBe(404);
    });

    it("cannot access other org templates", async () => {
      const res = await fetch(
        `${API_BASE_URL}/api/v1/reports/templates/${otherTemplateId}`,
        { headers: ctx.headers }
      );

      expect(res.status).toBe(404);
    });

    it("cannot update other org settings", async () => {
      const res = await fetch(
        `${API_BASE_URL}/api/v1/reports/settings/${otherSettingsId}`,
        {
          method: "PATCH",
          headers: ctx.headers,
          body: JSON.stringify({ name: "Hacked!" }),
        }
      );

      expect(res.status).toBe(404);
    });

    it("cannot delete other org template", async () => {
      const res = await fetch(
        `${API_BASE_URL}/api/v1/reports/templates/${otherTemplateId}`,
        {
          method: "DELETE",
          headers: ctx.headers,
        }
      );

      expect(res.status).toBe(404);
    });

    it("cannot use other org monitors in report generation", async () => {
      // Create monitor in other org
      const otherMonitor = await insertMonitor(otherCtx.organizationId, {
        name: "Other Org Monitor",
        url: "https://other-org.example.com",
      });

      const now = new Date();
      const periodEnd = now.toISOString();
      const periodStart = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();

      const res = await fetch(`${API_BASE_URL}/api/v1/reports/generate`, {
        method: "POST",
        headers: ctx.headers,
        body: JSON.stringify({
          reportType: "sla",
          periodStart,
          periodEnd,
          monitorIds: [otherMonitor.id],
        }),
      });

      expect(res.status).toBe(400);
    });
  });
});
