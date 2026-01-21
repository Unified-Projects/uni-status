import { bootstrapTestContext, TestContext } from "../helpers/context";

const API_BASE_URL = process.env.API_BASE_URL ?? "http://api:3001";

describe("Status Pages API", () => {
  let ctx: TestContext;
  let monitorId: string;
  let statusPageId: string;

  beforeAll(async () => {
    ctx = await bootstrapTestContext();

    const monitorRes = await fetch(`${API_BASE_URL}/api/v1/monitors`, {
      method: "POST",
      headers: ctx.headers,
      body: JSON.stringify({
        name: "Status Monitor",
        url: "https://status.example.com",
        type: "https",
        method: "GET",
        intervalSeconds: 60,
      }),
    });
    const monitorBody = await monitorRes.json();
    monitorId = monitorBody.data.id;
  });

  it("creates a status page", async () => {
    const response = await fetch(`${API_BASE_URL}/api/v1/status-pages`, {
      method: "POST",
      headers: ctx.headers,
      body: JSON.stringify({
        name: "Public Status",
        slug: `public-status-${Date.now()}`,
        published: true,
      }),
    });

    expect(response.status).toBe(201);
    const body = await response.json();
    expect(body.success).toBe(true);
    statusPageId = body.data.id;
    expect(body.data.slug).toContain("public-status");
  });

  it("links a monitor to the status page", async () => {
    const response = await fetch(`${API_BASE_URL}/api/v1/status-pages/${statusPageId}/monitors`, {
      method: "POST",
      headers: ctx.headers,
      body: JSON.stringify({
        monitorId,
        displayName: "API",
        description: "API availability",
        order: 1,
      }),
    });

    expect(response.status).toBe(201);
    const body = await response.json();
    expect(body.success).toBe(true);
  });

  it("fetches the status page with monitors", async () => {
    const response = await fetch(`${API_BASE_URL}/api/v1/status-pages/${statusPageId}`, {
      headers: ctx.headers,
    });

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.success).toBe(true);
    expect(body.data.monitors.length).toBeGreaterThan(0);
  });
});
