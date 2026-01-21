import { bootstrapTestContext, TestContext } from "../helpers/context";

const API_BASE_URL = process.env.API_BASE_URL ?? "http://api:3001";

describe("Reports API", () => {
  let ctx: TestContext;
  let monitorId: string;
  let settingsId: string;

  beforeAll(async () => {
    ctx = await bootstrapTestContext();

    // Seed a monitor for report targeting
    const monitorRes = await fetch(`${API_BASE_URL}/api/v1/monitors`, {
      method: "POST",
      headers: ctx.headers,
      body: JSON.stringify({
        name: "Reports Monitor",
        url: "https://reports.example.com",
        type: "https",
        method: "GET",
        intervalSeconds: 60,
      }),
    });
    const monitorBody = await monitorRes.json();
    monitorId = monitorBody.data.id;
  });

  it("creates report settings for a monitor", async () => {
    const response = await fetch(`${API_BASE_URL}/api/v1/reports/settings`, {
      method: "POST",
      headers: ctx.headers,
      body: JSON.stringify({
        name: "Monthly SLA",
        reportType: "sla",
        frequency: "monthly",
        monitorIds: [monitorId],
        includeAllMonitors: false,
      }),
    });

    expect(response.status).toBe(201);
    const body = await response.json();
    expect(body.success).toBe(true);
    settingsId = body.data.id;
  });

  it("lists report settings", async () => {
    const response = await fetch(`${API_BASE_URL}/api/v1/reports/settings`, {
      headers: ctx.headers,
    });

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.success).toBe(true);
    const ids = body.data.map((s: any) => s.id);
    expect(ids).toContain(settingsId);
  });
});
