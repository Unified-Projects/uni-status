import { randomUUID } from "crypto";
import { bootstrapTestContext, TestContext } from "../helpers/context";
import { bootstrapWebTestContext, WebTestContext } from "../helpers/web-auth";
import { insertIncident } from "../helpers/data";

const WEB_BASE_URL = process.env.WEB_BASE_URL ?? "http://web:3000";

describe("Dashboard incidents pages", () => {
  let ctx: TestContext;
  let webCtx: WebTestContext;
  let incidentId: string;

  beforeAll(async () => {
    ctx = await bootstrapTestContext();
    webCtx = await bootstrapWebTestContext(ctx);

    // Create an incident for testing
    incidentId = await insertIncident(ctx.organizationId, ctx.userId, {
      title: `Dashboard Incident ${randomUUID().slice(0, 6)}`,
      description: "Test incident for dashboard testing",
      severity: "minor",
      status: "investigating",
    });
  });

  describe("Incidents list page", () => {
    it("renders the incidents list when authenticated", async () => {
      const response = await fetch(`${WEB_BASE_URL}/dashboard/incidents`, {
        headers: webCtx.webHeaders,
        redirect: "manual",
      });

      expect(response.status).toBeLessThan(500);
      const html = await response.text();
      expect(html.toLowerCase()).toContain("<!doctype html");
    });

    it("redirects to login when not authenticated", async () => {
      const response = await fetch(`${WEB_BASE_URL}/dashboard/incidents`, {
        redirect: "manual",
      });

      expect(response.status).toBeLessThan(500);
    });
  });

  describe("New incident page", () => {
    it("renders the new incident form when authenticated", async () => {
      const response = await fetch(`${WEB_BASE_URL}/dashboard/incidents/new`, {
        headers: webCtx.webHeaders,
        redirect: "manual",
      });

      expect(response.status).toBeLessThan(500);
      const html = await response.text();
      expect(html.toLowerCase()).toContain("<!doctype html");
    });
  });

  describe("Incident detail page", () => {
    it("renders the incident detail when authenticated", async () => {
      const response = await fetch(
        `${WEB_BASE_URL}/dashboard/incidents/${incidentId}`,
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
