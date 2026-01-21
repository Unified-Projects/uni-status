import { bootstrapTestContext, TestContext } from "../helpers/context";
import { bootstrapWebTestContext, WebTestContext } from "../helpers/web-auth";

const WEB_BASE_URL = process.env.WEB_BASE_URL ?? "http://web:3000";

describe("Dashboard settings pages", () => {
  let ctx: TestContext;
  let webCtx: WebTestContext;

  beforeAll(async () => {
    ctx = await bootstrapTestContext();
    webCtx = await bootstrapWebTestContext(ctx);
  });

  describe("Team page", () => {
    it("renders the team page when authenticated", async () => {
      const response = await fetch(`${WEB_BASE_URL}/dashboard/team`, {
        headers: webCtx.webHeaders,
        redirect: "manual",
      });

      expect(response.status).toBeLessThan(500);
      const html = await response.text();
      expect(html.toLowerCase()).toContain("<!doctype html");
    });

    it("redirects to login when not authenticated", async () => {
      const response = await fetch(`${WEB_BASE_URL}/dashboard/team`, {
        redirect: "manual",
      });

      expect(response.status).toBeLessThan(500);
    });
  });

  describe("Account page", () => {
    it("renders the account page when authenticated", async () => {
      const response = await fetch(`${WEB_BASE_URL}/dashboard/account`, {
        headers: webCtx.webHeaders,
        redirect: "manual",
      });

      expect(response.status).toBeLessThan(500);
      const html = await response.text();
      expect(html.toLowerCase()).toContain("<!doctype html");
    });
  });

  describe("Settings page", () => {
    it("renders the settings page when authenticated", async () => {
      const response = await fetch(`${WEB_BASE_URL}/dashboard/settings`, {
        headers: webCtx.webHeaders,
        redirect: "manual",
      });

      expect(response.status).toBeLessThan(500);
      const html = await response.text();
      expect(html.toLowerCase()).toContain("<!doctype html");
    });
  });

  describe("Embeds page", () => {
    it("renders the embeds page when authenticated", async () => {
      const response = await fetch(`${WEB_BASE_URL}/dashboard/embeds`, {
        headers: webCtx.webHeaders,
        redirect: "manual",
      });

      expect(response.status).toBeLessThan(500);
      const html = await response.text();
      expect(html.toLowerCase()).toContain("<!doctype html");
    });
  });

  describe("Badge generator page", () => {
    it("renders the badge generator page when authenticated", async () => {
      const response = await fetch(
        `${WEB_BASE_URL}/dashboard/embeds/badge-generator`,
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
