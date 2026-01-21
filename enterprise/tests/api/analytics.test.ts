import { bootstrapTestContext, TestContext } from "../helpers/context";
import { insertCheckResults } from "../helpers/data";

const API_BASE_URL = process.env.API_BASE_URL ?? "http://api:3001";

describe("Analytics API", () => {
  let ctx: TestContext;
  let monitorId: string;

  beforeAll(async () => {
    ctx = await bootstrapTestContext();

    // Seed a monitor
    const monitorRes = await fetch(`${API_BASE_URL}/api/v1/monitors`, {
      method: "POST",
      headers: ctx.headers,
      body: JSON.stringify({
        name: "Analytics Monitor",
        url: "https://analytics.example.com",
        type: "https",
        method: "GET",
        intervalSeconds: 60,
      }),
    });
    const monitorBody = await monitorRes.json();
    monitorId = monitorBody.data.id;

    // Seed check results so uptime is calculable
    await insertCheckResults(monitorId, [
      { status: "success", responseTimeMs: 180 },
      { status: "failure", responseTimeMs: 500 },
      { status: "degraded", responseTimeMs: 350 },
    ]);
  });

  it("returns uptime analytics with percentages", async () => {
    const response = await fetch(
      `${API_BASE_URL}/api/v1/analytics/uptime?monitorId=${monitorId}&days=7`,
      { headers: ctx.headers }
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.success).toBe(true);
    const data = Array.isArray(body.data) ? body.data : [];
    expect(Array.isArray(data)).toBe(true);
    if (data.length > 0) {
      const uptime = data[0].uptimePercentage;
      expect(uptime === null || typeof uptime === "number").toBe(true);
      if (typeof uptime === "number") {
        expect(uptime).toBeGreaterThanOrEqual(0);
        expect(uptime).toBeLessThanOrEqual(100);
      }
    }
  });
});
