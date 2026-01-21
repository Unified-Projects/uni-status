import { randomUUID } from "crypto";
import { bootstrapTestContext, TestContext } from "../helpers/context";
import { bootstrapWebTestContext, WebTestContext } from "../helpers/web-auth";
import { insertMaintenanceWindow } from "../helpers/data";

const WEB_BASE_URL = process.env.WEB_BASE_URL ?? "http://web:3000";

describe("Dashboard maintenance windows pages", () => {
  let ctx: TestContext;
  let webCtx: WebTestContext;
  let maintenanceId: string;

  beforeAll(async () => {
    ctx = await bootstrapTestContext();
    webCtx = await bootstrapWebTestContext(ctx);

    // Create a maintenance window for testing
    const startsAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // Tomorrow
    const endsAt = new Date(Date.now() + 25 * 60 * 60 * 1000); // Tomorrow + 1 hour
    const result = await insertMaintenanceWindow(
      ctx.organizationId,
      ctx.userId,
      {
        name: `Dashboard Maintenance ${randomUUID().slice(0, 6)}`,
        startsAt,
        endsAt,
        description: "Test maintenance window for dashboard testing",
      }
    );
    maintenanceId = result.id;
  });

  describe("Maintenance windows list page", () => {
    it("renders the maintenance windows list when authenticated", async () => {
      const response = await fetch(
        `${WEB_BASE_URL}/dashboard/maintenance-windows`,
        {
          headers: webCtx.webHeaders,
          redirect: "manual",
        }
      );

      expect(response.status).toBeLessThan(500);
      const html = await response.text();
      expect(html.toLowerCase()).toContain("<!doctype html");
    });

    it("redirects to login when not authenticated", async () => {
      const response = await fetch(
        `${WEB_BASE_URL}/dashboard/maintenance-windows`,
        {
          redirect: "manual",
        }
      );

      expect(response.status).toBeLessThan(500);
    });
  });

  describe("New maintenance window page", () => {
    it("renders the new maintenance window form when authenticated", async () => {
      const response = await fetch(
        `${WEB_BASE_URL}/dashboard/maintenance-windows/new`,
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

  describe("Maintenance window detail page", () => {
    it("renders the maintenance window detail when authenticated", async () => {
      const response = await fetch(
        `${WEB_BASE_URL}/dashboard/maintenance-windows/${maintenanceId}`,
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

  describe("Maintenance window edit page", () => {
    it("renders the maintenance window edit form when authenticated", async () => {
      const response = await fetch(
        `${WEB_BASE_URL}/dashboard/maintenance-windows/${maintenanceId}/edit`,
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
