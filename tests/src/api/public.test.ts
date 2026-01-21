import { bootstrapTestContext, TestContext } from "../helpers/context";
import { insertActiveProbe } from "../helpers/data";

const API_BASE_URL = process.env.API_BASE_URL ?? "http://api:3001";

describe("Public endpoints", () => {
  let ctx: TestContext;
  let statusPageSlug: string;

  beforeAll(async () => {
    ctx = await bootstrapTestContext();
    await insertActiveProbe(ctx.organizationId, "uk");
  });

  it("lists regions from active probes", async () => {
    const response = await fetch(`${API_BASE_URL}/api/public/regions`);
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.success).toBe(true);
    expect(body.data.regions).toContain("uk");
  });

  it("serves a published status page with monitors", async () => {
    // Create monitor
    const monitorRes = await fetch(`${API_BASE_URL}/api/v1/monitors`, {
      method: "POST",
      headers: ctx.headers,
      body: JSON.stringify({
        name: "Public Monitor",
        url: "https://public.example.com",
        type: "https",
        method: "GET",
        intervalSeconds: 60,
      }),
    });
    const monitorBody = await monitorRes.json();
    const monitorId = monitorBody.data.id;

    // Create status page
    statusPageSlug = `public-${Date.now()}`;
    const pageRes = await fetch(`${API_BASE_URL}/api/v1/status-pages`, {
      method: "POST",
      headers: ctx.headers,
      body: JSON.stringify({
        name: "Public Page",
        slug: statusPageSlug,
        published: true,
      }),
    });
    const pageBody = await pageRes.json();
    const statusPageId = pageBody.data.id;

    // Link monitor
    await fetch(`${API_BASE_URL}/api/v1/status-pages/${statusPageId}/monitors`, {
      method: "POST",
      headers: ctx.headers,
      body: JSON.stringify({
        monitorId,
        displayName: "Public Monitor",
        order: 1,
      }),
    });

    const response = await fetch(`${API_BASE_URL}/api/public/status-pages/${statusPageSlug}`);
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.success).toBe(true);
    expect(body.data.monitors.length).toBeGreaterThan(0);
  });

  it("returns services for the published status page", async () => {
    const response = await fetch(`${API_BASE_URL}/api/public/status-pages/${statusPageSlug}/services`);
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.success).toBe(true);
  });
});
