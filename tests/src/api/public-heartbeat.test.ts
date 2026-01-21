import { bootstrapTestContext, TestContext } from "../helpers/context";

const API_BASE_URL = process.env.API_BASE_URL ?? "http://api:3001";

describe("Public heartbeat token endpoint", () => {
  let ctx: TestContext;
  let monitorId: string;
  let heartbeatToken: string;

  beforeAll(async () => {
    ctx = await bootstrapTestContext();

    const monitorRes = await fetch(`${API_BASE_URL}/api/v1/monitors`, {
      method: "POST",
      headers: ctx.headers,
      body: JSON.stringify({
        name: "Public Heartbeat Monitor",
        url: "heartbeat://service",
        type: "heartbeat",
        method: "GET",
        intervalSeconds: 120,
        config: { heartbeat: { expectedInterval: 120, gracePeriod: 30 } },
      }),
    });
    expect(monitorRes.status).toBe(201);
    const monitorBody = await monitorRes.json();
    monitorId = monitorBody.data.id;
    heartbeatToken = monitorBody.data.heartbeatToken;
    expect(heartbeatToken).toBeDefined();
  });

  it("accepts heartbeat pings via token and updates status/history", async () => {
    const pingRes = await fetch(
      `${API_BASE_URL}/api/public/heartbeat/${encodeURIComponent(heartbeatToken)}?status=complete&duration=222`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ job: "backup" }),
      }
    );
    if (pingRes.status !== 200) {
      const errBody = await pingRes.json().catch(() => ({}));
      throw new Error(`Public heartbeat ping failed: ${pingRes.status} ${JSON.stringify(errBody)}`);
    }
    const pingBody = await pingRes.json();
    expect(pingBody.success).toBe(true);

    // Monitor should now be active
    const monitorRes = await fetch(`${API_BASE_URL}/api/v1/monitors/${monitorId}`, {
      headers: ctx.headers,
    });
    expect(monitorRes.status).toBe(200);
    const monitorBody = await monitorRes.json();
    expect(monitorBody.data.status).toBe("active");
    expect(monitorBody.data.lastCheckedAt).toBeTruthy();

    // Heartbeat history should include the ping
    const historyRes = await fetch(`${API_BASE_URL}/api/v1/monitors/${monitorId}/heartbeat`, {
      headers: ctx.headers,
    });
    expect(historyRes.status).toBe(200);
    const historyBody = await historyRes.json();
    expect(historyBody.success).toBe(true);
    expect(historyBody.data.length).toBeGreaterThanOrEqual(1);
  });
});
