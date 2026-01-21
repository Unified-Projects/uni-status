import { randomUUID } from "crypto";
import { bootstrapTestContext, TestContext } from "../helpers/context";
import {
  insertCheckResults,
  setMonitorStatus,
  insertIncident,
  insertMaintenanceWindow,
  linkMonitorToStatusPage,
} from "../helpers/data";

const API_BASE_URL = process.env.API_BASE_URL ?? "http://api:3001";
const WEB_BASE_URL = process.env.WEB_BASE_URL ?? "http://web:3000";

describe("Status page subpages", () => {
  let ctx: TestContext;
  let monitorId: string;
  let statusPageId: string;
  let slug: string;
  let incidentId: string;
  let maintenanceId: string;
  let monitorName: string;

  beforeAll(async () => {
    ctx = await bootstrapTestContext();
    monitorName = `Subpage Monitor ${randomUUID().slice(0, 6)}`;
    slug = `subpage-${Date.now()}`;

    // Create monitor via API
    const monitorRes = await fetch(`${API_BASE_URL}/api/v1/monitors`, {
      method: "POST",
      headers: ctx.headers,
      body: JSON.stringify({
        name: monitorName,
        url: "https://subpage-test.example.com",
        type: "https",
        method: "GET",
        intervalSeconds: 60,
      }),
    });
    const monitorBody = await monitorRes.json();
    monitorId = monitorBody.data.id;

    // Set monitor as active with check results
    await setMonitorStatus(monitorId, "active");
    await insertCheckResults(monitorId, [
      { status: "success", responseTimeMs: 150 },
    ]);

    // Create published status page via API
    const pageRes = await fetch(`${API_BASE_URL}/api/v1/status-pages`, {
      method: "POST",
      headers: ctx.headers,
      body: JSON.stringify({
        name: "Subpage Test Page",
        slug,
        published: true,
        settings: { showUptimePercentage: true, showResponseTime: true },
      }),
    });
    const pageBody = await pageRes.json();
    statusPageId = pageBody.data.id;

    // Link monitor to status page
    await linkMonitorToStatusPage(statusPageId, monitorId, {
      displayName: monitorName,
      order: 1,
    });

    // Create an incident for the events page
    incidentId = await insertIncident(ctx.organizationId, ctx.userId, {
      title: `Test Incident ${randomUUID().slice(0, 6)}`,
      description: "Test incident for status page events",
      severity: "minor",
      status: "investigating",
      affectedMonitorIds: [monitorId],
    });

    // Create a maintenance window
    const startsAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // Tomorrow
    const endsAt = new Date(Date.now() + 25 * 60 * 60 * 1000); // Tomorrow + 1 hour
    const mwResult = await insertMaintenanceWindow(
      ctx.organizationId,
      ctx.userId,
      {
        name: `Test Maintenance ${randomUUID().slice(0, 6)}`,
        startsAt,
        endsAt,
        affectedMonitors: [monitorId],
        description: "Test maintenance window",
      }
    );
    maintenanceId = mwResult.id;

    // Link status page to incident (via API)
    await fetch(
      `${API_BASE_URL}/api/v1/status-pages/${statusPageId}/monitors`,
      {
        method: "POST",
        headers: ctx.headers,
        body: JSON.stringify({
          monitorId,
          displayName: monitorName,
          order: 1,
        }),
      }
    );
  });

  describe("Events page", () => {
    it("renders the events list page", async () => {
      const response = await fetch(`${WEB_BASE_URL}/status/${slug}/events`, {
        redirect: "manual",
      });

      expect(response.status).toBeLessThan(500);
      const html = await response.text();
      expect(html.toLowerCase()).toContain("<!doctype html");
    });
  });

  describe("Event detail pages", () => {
    it("renders an incident detail page", async () => {
      const response = await fetch(
        `${WEB_BASE_URL}/status/${slug}/events/incident/${incidentId}`,
        {
          redirect: "manual",
        }
      );

      expect(response.status).toBeLessThan(500);
      const html = await response.text();
      expect(html.toLowerCase()).toContain("<!doctype html");
    });

    it("renders a maintenance detail page", async () => {
      const response = await fetch(
        `${WEB_BASE_URL}/status/${slug}/events/maintenance/${maintenanceId}`,
        {
          redirect: "manual",
        }
      );

      expect(response.status).toBeLessThan(500);
      const html = await response.text();
      expect(html.toLowerCase()).toContain("<!doctype html");
    });
  });

  describe("Services page", () => {
    it("renders the services list page", async () => {
      const response = await fetch(`${WEB_BASE_URL}/status/${slug}/services`, {
        redirect: "manual",
      });

      expect(response.status).toBeLessThan(500);
      const html = await response.text();
      expect(html.toLowerCase()).toContain("<!doctype html");
    });
  });

  describe("Geo page", () => {
    it("renders the geo status page", async () => {
      const response = await fetch(`${WEB_BASE_URL}/status/${slug}/geo`, {
        redirect: "manual",
      });

      expect(response.status).toBeLessThan(500);
      const html = await response.text();
      expect(html.toLowerCase()).toContain("<!doctype html");
    });

    it("displays regions overview section", async () => {
      const response = await fetch(`${WEB_BASE_URL}/status/${slug}/geo`, {
        redirect: "manual",
      });

      expect(response.status).toBeLessThan(500);
      const html = await response.text();
      // The page should have the Regions Overview section
      expect(html).toContain("Regions Overview");
    });

    it("displays operational stat card", async () => {
      const response = await fetch(`${WEB_BASE_URL}/status/${slug}/geo`, {
        redirect: "manual",
      });

      expect(response.status).toBeLessThan(500);
      const html = await response.text();
      // The page should have the Operational label for monitor counts
      expect(html).toContain("Operational");
    });
  });
});
