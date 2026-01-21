import { bootstrapTestContext, TestContext } from "../helpers/context";

const API_BASE_URL = process.env.API_BASE_URL ?? "http://api:3001";

describe("Incidents API", () => {
  let ctx: TestContext;
  let monitorId: string;
  let incidentId: string;

  beforeAll(async () => {
    ctx = await bootstrapTestContext();

    // Seed a monitor to link to incidents
    const monitorRes = await fetch(`${API_BASE_URL}/api/v1/monitors`, {
      method: "POST",
      headers: ctx.headers,
      body: JSON.stringify({
        name: "Incident Monitor",
        url: "https://status.example.com/health",
        type: "https",
        method: "GET",
        intervalSeconds: 60,
      }),
    });
    const monitorBody = await monitorRes.json();
    monitorId = monitorBody.data.id;
  });

  it("creates an incident with affected monitors", async () => {
    const response = await fetch(`${API_BASE_URL}/api/v1/incidents`, {
      method: "POST",
      headers: ctx.headers,
      body: JSON.stringify({
        title: "API outage",
        severity: "major",
        status: "investigating",
        message: "Investigating connectivity",
        affectedMonitors: [monitorId],
      }),
    });

    expect(response.status).toBe(201);
    const body = await response.json();
    expect(body.success).toBe(true);
    incidentId = body.data.id;
    expect(body.data.title).toContain("API outage");
  });

  it("lists incidents for the organization", async () => {
    const response = await fetch(`${API_BASE_URL}/api/v1/incidents`, {
      headers: ctx.headers,
    });

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.success).toBe(true);
    const ids = body.data.map((i: any) => i.id);
    expect(ids).toContain(incidentId);
  });
});
