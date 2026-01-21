import { bootstrapTestContext, TestContext } from "../helpers/context";

const API_BASE_URL = process.env.API_BASE_URL ?? "http://api:3001";

describe("Alerts API", () => {
  let ctx: TestContext;
  let channelId: string;
  let policyId: string;

  beforeAll(async () => {
    ctx = await bootstrapTestContext();
  });

  it("creates an alert channel", async () => {
    const response = await fetch(`${API_BASE_URL}/api/v1/alerts/channels`, {
      method: "POST",
      headers: ctx.headers,
      body: JSON.stringify({
        name: "Email Channel",
        type: "email",
        config: {
          email: "alerts@example.com",
        },
        enabled: true,
      }),
    });

    expect(response.status).toBe(201);
    const body = await response.json();
    expect(body.success).toBe(true);
    channelId = body.data.id;
  });

  it("creates an alert policy using the channel", async () => {
    const response = await fetch(`${API_BASE_URL}/api/v1/alerts/policies`, {
      method: "POST",
      headers: ctx.headers,
      body: JSON.stringify({
        name: "Default Policy",
        description: "Notify on first failure",
        enabled: true,
        channels: [channelId],
        conditions: {
          consecutiveFailures: 1,
        },
        cooldownMinutes: 5,
      }),
    });

    expect(response.status).toBe(201);
    const body = await response.json();
    expect(body.success).toBe(true);
    policyId = body.data.id;
  });

  it("lists policies with monitor counts", async () => {
    const response = await fetch(`${API_BASE_URL}/api/v1/alerts/policies/monitor-counts`, {
      headers: ctx.headers,
    });

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.success).toBe(true);
    expect(body.data).toBeTruthy();
  });
});
