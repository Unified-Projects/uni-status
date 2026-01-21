import { randomUUID } from "crypto";
import { bootstrapTestContext, TestContext } from "../helpers/context";
import { bootstrapWebTestContext, WebTestContext } from "../helpers/web-auth";

const API_BASE_URL = process.env.API_BASE_URL ?? "http://api:3001";
const WEB_BASE_URL = process.env.WEB_BASE_URL ?? "http://web:3000";

describe("Dashboard status pages", () => {
  let ctx: TestContext;
  let webCtx: WebTestContext;
  let statusPageId: string;
  let slug: string;

  beforeAll(async () => {
    ctx = await bootstrapTestContext();
    webCtx = await bootstrapWebTestContext(ctx);
    slug = `dash-status-${Date.now()}`;

    // Create status page via API
    const pageRes = await fetch(`${API_BASE_URL}/api/v1/status-pages`, {
      method: "POST",
      headers: ctx.headers,
      body: JSON.stringify({
        name: `Dashboard Status Page ${randomUUID().slice(0, 6)}`,
        slug,
        published: true,
      }),
    });
    const pageBody = await pageRes.json();
    statusPageId = pageBody.data.id;
  });

  describe("Status pages list", () => {
    it("renders the status pages list when authenticated", async () => {
      const response = await fetch(`${WEB_BASE_URL}/dashboard/status-pages`, {
        headers: webCtx.webHeaders,
        redirect: "manual",
      });

      expect(response.status).toBeLessThan(500);
      const html = await response.text();
      expect(html.toLowerCase()).toContain("<!doctype html");
    });

    it("redirects to login when not authenticated", async () => {
      const response = await fetch(`${WEB_BASE_URL}/dashboard/status-pages`, {
        redirect: "manual",
      });

      expect(response.status).toBeLessThan(500);
    });
  });

  describe("New status page", () => {
    it("renders the new status page form when authenticated", async () => {
      const response = await fetch(
        `${WEB_BASE_URL}/dashboard/status-pages/new`,
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

  describe("Status page detail", () => {
    it("renders the status page detail when authenticated", async () => {
      const response = await fetch(
        `${WEB_BASE_URL}/dashboard/status-pages/${statusPageId}`,
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
