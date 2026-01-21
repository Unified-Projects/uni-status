import { randomUUID } from "crypto";
import { bootstrapTestContext, TestContext } from "../helpers/context";
import { insertCheckResults, setMonitorStatus } from "../helpers/data";

const API_BASE_URL = process.env.API_BASE_URL ?? "http://api:3001";
const WEB_BASE_URL = process.env.WEB_BASE_URL ?? "http://web:3000";

describe("Embed pages", () => {
  let ctx: TestContext;
  let monitorId: string;
  let statusPageId: string;
  let slug: string;

  beforeAll(async () => {
    ctx = await bootstrapTestContext();
    const monitorName = `Embed Monitor ${randomUUID().slice(0, 6)}`;
    slug = `embed-${Date.now()}`;

    // Create monitor via API
    const monitorRes = await fetch(`${API_BASE_URL}/api/v1/monitors`, {
      method: "POST",
      headers: ctx.headers,
      body: JSON.stringify({
        name: monitorName,
        url: "https://embed-test.example.com",
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
      { status: "success", responseTimeMs: 100 },
    ]);

    // Create published status page via API
    const pageRes = await fetch(`${API_BASE_URL}/api/v1/status-pages`, {
      method: "POST",
      headers: ctx.headers,
      body: JSON.stringify({
        name: "Embed Test Page",
        slug,
        published: true,
        settings: { showUptimePercentage: true, showResponseTime: true },
      }),
    });
    const pageBody = await pageRes.json();
    statusPageId = pageBody.data.id;

    // Link monitor to status page
    await fetch(`${API_BASE_URL}/api/v1/status-pages/${statusPageId}/monitors`, {
      method: "POST",
      headers: ctx.headers,
      body: JSON.stringify({
        monitorId,
        displayName: monitorName,
        order: 1,
      }),
    });
  });

  describe("Monitor embeds", () => {
    it("renders the monitor badge embed page", async () => {
      const response = await fetch(
        `${WEB_BASE_URL}/embed/monitors/${monitorId}/badge`,
        {
          redirect: "manual",
        }
      );

      expect(response.status).toBeLessThan(500);
      const html = await response.text();
      expect(html.toLowerCase()).toContain("<!doctype html");
    });

    it("renders the monitor card embed page", async () => {
      const response = await fetch(
        `${WEB_BASE_URL}/embed/monitors/${monitorId}/card`,
        {
          redirect: "manual",
        }
      );

      expect(response.status).toBeLessThan(500);
      const html = await response.text();
      expect(html.toLowerCase()).toContain("<!doctype html");
    });
  });

  describe("Status page embeds", () => {
    it("renders the status page badge embed", async () => {
      const response = await fetch(
        `${WEB_BASE_URL}/embed/status/${slug}/badge`,
        {
          redirect: "manual",
        }
      );

      expect(response.status).toBeLessThan(500);
      const html = await response.text();
      expect(html.toLowerCase()).toContain("<!doctype html");
    });

    it("renders the status page card embed", async () => {
      const response = await fetch(
        `${WEB_BASE_URL}/embed/status/${slug}/card`,
        {
          redirect: "manual",
        }
      );

      expect(response.status).toBeLessThan(500);
      const html = await response.text();
      expect(html.toLowerCase()).toContain("<!doctype html");
    });

    it("renders the status page mini embed", async () => {
      const response = await fetch(
        `${WEB_BASE_URL}/embed/status/${slug}/mini`,
        {
          redirect: "manual",
        }
      );

      expect(response.status).toBeLessThan(500);
      const html = await response.text();
      expect(html.toLowerCase()).toContain("<!doctype html");
    });
  });
});
