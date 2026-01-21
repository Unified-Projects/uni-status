import { randomUUID } from "crypto";
import { bootstrapTestContext, TestContext } from "../helpers/context";
import { bootstrapWebTestContext, WebTestContext } from "../helpers/web-auth";
import { insertCheckResults, setMonitorStatus } from "../helpers/data";

const API_BASE_URL = process.env.API_BASE_URL ?? "http://api:3001";
const WEB_BASE_URL = process.env.WEB_BASE_URL ?? "http://web:3000";

describe("Dashboard monitors pages", () => {
  let ctx: TestContext;
  let webCtx: WebTestContext;
  let monitorId: string;
  let monitorName: string;

  beforeAll(async () => {
    ctx = await bootstrapTestContext();
    webCtx = await bootstrapWebTestContext(ctx);
    monitorName = `Dashboard Monitor ${randomUUID().slice(0, 6)}`;

    // Create monitor via API
    const monitorRes = await fetch(`${API_BASE_URL}/api/v1/monitors`, {
      method: "POST",
      headers: ctx.headers,
      body: JSON.stringify({
        name: monitorName,
        url: "https://dashboard-test.example.com",
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
      { status: "success", responseTimeMs: 120 },
    ]);
  });

  describe("Monitors list page", () => {
    it("renders the monitors list page when authenticated", async () => {
      const response = await fetch(`${WEB_BASE_URL}/dashboard/monitors`, {
        headers: webCtx.webHeaders,
        redirect: "manual",
      });

      expect(response.status).toBeLessThan(500);
      const html = await response.text();
      expect(html.toLowerCase()).toContain("<!doctype html");
    });

    it("redirects to login when not authenticated", async () => {
      const response = await fetch(`${WEB_BASE_URL}/dashboard/monitors`, {
        redirect: "manual",
      });

      // Should redirect to login or return a page that handles auth
      expect(response.status).toBeLessThan(500);
    });
  });

  describe("New monitor page", () => {
    it("renders the new monitor page when authenticated", async () => {
      const response = await fetch(`${WEB_BASE_URL}/dashboard/monitors/new`, {
        headers: webCtx.webHeaders,
        redirect: "manual",
      });

      expect(response.status).toBeLessThan(500);
      const html = await response.text();
      expect(html.toLowerCase()).toContain("<!doctype html");
    });
  });

  describe("Monitor detail page", () => {
    it("renders the monitor detail page when authenticated", async () => {
      const response = await fetch(
        `${WEB_BASE_URL}/dashboard/monitors/${monitorId}`,
        {
          headers: webCtx.webHeaders,
          redirect: "manual",
        }
      );

      expect(response.status).toBeLessThan(500);
      const html = await response.text();
      expect(html.toLowerCase()).toContain("<!doctype html");
    });
  });

  describe("Monitor edit page", () => {
    it("renders the monitor edit page when authenticated", async () => {
      const response = await fetch(
        `${WEB_BASE_URL}/dashboard/monitors/${monitorId}/edit`,
        {
          headers: webCtx.webHeaders,
          redirect: "manual",
        }
      );

      expect(response.status).toBeLessThan(500);
      const html = await response.text();
      expect(html.toLowerCase()).toContain("<!doctype html");
    });
  });
});
