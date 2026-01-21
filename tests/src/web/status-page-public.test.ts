import { randomUUID } from "crypto";
import { bootstrapTestContext, TestContext } from "../helpers/context";
import { insertCheckResults, setMonitorStatus } from "../helpers/data";

const API_BASE_URL = process.env.API_BASE_URL ?? "http://api:3001";
const WEB_BASE_URL = process.env.WEB_BASE_URL ?? "http://web:3000";

describe("Public status page rendering", () => {
  let ctx: TestContext;
  let monitorId: string;
  let slug: string;
  let monitorName: string;

  beforeAll(async () => {
    ctx = await bootstrapTestContext();
    monitorName = `Public Monitor ${randomUUID().slice(0, 6)}`;
    slug = `public-${Date.now()}`;

    // Create monitor
    const monitorRes = await fetch(`${API_BASE_URL}/api/v1/monitors`, {
      method: "POST",
      headers: ctx.headers,
      body: JSON.stringify({
        name: monitorName,
        url: "https://status-public.example.com",
        type: "https",
        method: "GET",
        intervalSeconds: 60,
      }),
    });
    const monitorBody = await monitorRes.json();
    monitorId = monitorBody.data.id;

    // Mark as active and seed a check result so the page has data to show
    await setMonitorStatus(monitorId, "active");
    await insertCheckResults(monitorId, [{ status: "success", responseTimeMs: 150 }]);

    // Create published status page
    const pageRes = await fetch(`${API_BASE_URL}/api/v1/status-pages`, {
      method: "POST",
      headers: ctx.headers,
      body: JSON.stringify({
        name: "Public Page",
        slug,
        published: true,
        settings: { showUptimePercentage: true, showResponseTime: true },
      }),
    });
    const pageBody = await pageRes.json();
    const statusPageId = pageBody.data.id;

    // Link monitor to page
    const linkRes = await fetch(`${API_BASE_URL}/api/v1/status-pages/${statusPageId}/monitors`, {
      method: "POST",
      headers: ctx.headers,
      body: JSON.stringify({
        monitorId,
        displayName: monitorName,
        order: 1,
      }),
    });
    expect(linkRes.status).toBe(201);
  });

  it("renders the public status page with the linked monitor", async () => {
    const response = await fetch(`${WEB_BASE_URL}/status/${slug}`, { redirect: "manual" });
    expect(response.status).toBe(200);
    const html = await response.text();
    expect(html).toContain(monitorName);
    // Should surface some status indicator text
    expect(html.toLowerCase()).toMatch(/status|uptime|operational/);
  });
});
