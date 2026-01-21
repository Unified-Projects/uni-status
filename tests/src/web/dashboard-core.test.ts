import { bootstrapTestContext, TestContext } from "../helpers/context";
import { bootstrapWebTestContext, WebTestContext } from "../helpers/web-auth";

const WEB_BASE_URL = process.env.WEB_BASE_URL ?? "http://web:3000";

describe("Dashboard core pages", () => {
  let ctx: TestContext;
  let webCtx: WebTestContext;

  beforeAll(async () => {
    ctx = await bootstrapTestContext();
    webCtx = await bootstrapWebTestContext(ctx);
  });

  describe("Main dashboard", () => {
    it("renders the main dashboard when authenticated", async () => {
      const response = await fetch(`${WEB_BASE_URL}/dashboard`, {
        headers: webCtx.webHeaders,
        redirect: "manual",
      });

      expect(response.status).toBeLessThan(500);
      const html = await response.text();
      expect(html.toLowerCase()).toContain("<!doctype html");
    });

    it("redirects to login when not authenticated", async () => {
      const response = await fetch(`${WEB_BASE_URL}/dashboard`, {
        redirect: "manual",
      });

      expect(response.status).toBeLessThan(500);
    });
  });

  describe("Events page", () => {
    it("renders the events page when authenticated", async () => {
      const response = await fetch(`${WEB_BASE_URL}/dashboard/events`, {
        headers: webCtx.webHeaders,
        redirect: "manual",
      });

      expect(response.status).toBeLessThan(500);
      const html = await response.text();
      expect(html.toLowerCase()).toContain("<!doctype html");
    });
  });

  describe("Alerts page", () => {
    it("renders the alerts page when authenticated", async () => {
      const response = await fetch(`${WEB_BASE_URL}/dashboard/alerts`, {
        headers: webCtx.webHeaders,
        redirect: "manual",
      });

      expect(response.status).toBeLessThan(500);
      const html = await response.text();
      expect(html.toLowerCase()).toContain("<!doctype html");
    });
  });

  describe("Certificates page", () => {
    it("renders the certificates page when authenticated", async () => {
      const response = await fetch(`${WEB_BASE_URL}/dashboard/certificates`, {
        headers: webCtx.webHeaders,
        redirect: "manual",
      });

      expect(response.status).toBeLessThan(500);
      const html = await response.text();
      expect(html.toLowerCase()).toContain("<!doctype html");
    });
  });

  describe("Probes page", () => {
    it("renders the probes page when authenticated", async () => {
      const response = await fetch(`${WEB_BASE_URL}/dashboard/probes`, {
        headers: webCtx.webHeaders,
        redirect: "manual",
      });

      expect(response.status).toBeLessThan(500);
      const html = await response.text();
      expect(html.toLowerCase()).toContain("<!doctype html");
    });
  });

  describe("Deployments page", () => {
    it("renders the deployments page when authenticated", async () => {
      const response = await fetch(`${WEB_BASE_URL}/dashboard/deployments`, {
        headers: webCtx.webHeaders,
        redirect: "manual",
      });

      expect(response.status).toBeLessThan(500);
      const html = await response.text();
      expect(html.toLowerCase()).toContain("<!doctype html");
    });
  });

  describe("On-call page", () => {
    it("renders the oncall page when authenticated", async () => {
      const response = await fetch(`${WEB_BASE_URL}/dashboard/oncall`, {
        headers: webCtx.webHeaders,
        redirect: "manual",
      });

      expect(response.status).toBeLessThan(500);
      const html = await response.text();
      expect(html.toLowerCase()).toContain("<!doctype html");
    });
  });

  describe("SLO page", () => {
    it("renders the SLO page when authenticated", async () => {
      const response = await fetch(`${WEB_BASE_URL}/dashboard/slo`, {
        headers: webCtx.webHeaders,
        redirect: "manual",
      });

      expect(response.status).toBeLessThan(500);
      const html = await response.text();
      expect(html.toLowerCase()).toContain("<!doctype html");
    });
  });

  describe("Reports page", () => {
    it("renders the reports page when authenticated", async () => {
      const response = await fetch(`${WEB_BASE_URL}/dashboard/reports`, {
        headers: webCtx.webHeaders,
        redirect: "manual",
      });

      expect(response.status).toBeLessThan(500);
      const html = await response.text();
      expect(html.toLowerCase()).toContain("<!doctype html");
    });
  });

  describe("Audit logs page", () => {
    it("renders the audit logs page when authenticated", async () => {
      const response = await fetch(`${WEB_BASE_URL}/dashboard/audit-logs`, {
        headers: webCtx.webHeaders,
        redirect: "manual",
      });

      expect(response.status).toBeLessThan(500);
      const html = await response.text();
      expect(html.toLowerCase()).toContain("<!doctype html");
    });
  });
});
