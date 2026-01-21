import { bootstrapTestContext, TestContext } from "../helpers/context";
import { insertCheckResults, setMonitorStatus } from "../helpers/data";

const API_BASE_URL = process.env.API_BASE_URL ?? "http://api:3001";

describe("Monitor results with incidents", () => {
  let ctx: TestContext;
  let monitorId: string;
  let incidentId: string;

  beforeAll(async () => {
    ctx = await bootstrapTestContext();

    const monitorRes = await fetch(`${API_BASE_URL}/api/v1/monitors`, {
      method: "POST",
      headers: ctx.headers,
      body: JSON.stringify({
        name: "Incident Monitor",
        url: "https://incident.example.com",
        type: "https",
        method: "GET",
        intervalSeconds: 60,
      }),
    });
    const monitorBody = await monitorRes.json();
    monitorId = monitorBody.data.id;
    await setMonitorStatus(monitorId, "active");

    // Create an incident affecting this monitor
    const incidentRes = await fetch(`${API_BASE_URL}/api/v1/incidents`, {
      method: "POST",
      headers: ctx.headers,
      body: JSON.stringify({
        title: "API outage",
        severity: "major",
        status: "investigating",
        affectedMonitors: [monitorId],
      }),
    });
    const incidentBody = await incidentRes.json();
    incidentId = incidentBody.data.id;

    // Seed a check result linked to the incident
    await insertCheckResults(monitorId, [
      {
        status: "failure",
        responseTimeMs: 1000,
        incidentId,
        metadata: { checkType: "https" },
      },
    ]);
  });

  it("includes incident data when requested", async () => {
    const response = await fetch(
      `${API_BASE_URL}/api/v1/monitors/${monitorId}/results?includeIncident=true&limit=5`,
      { headers: ctx.headers }
    );
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.success).toBe(true);
    const withIncident = body.data.find((r: any) => r.incident?.id === incidentId);
    expect(withIncident).toBeDefined();
    expect(withIncident.incident.title).toBe("API outage");
  });

  it("omits incident data when includeIncident=false", async () => {
    const response = await fetch(
      `${API_BASE_URL}/api/v1/monitors/${monitorId}/results?includeIncident=false&limit=5`,
      { headers: ctx.headers }
    );
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.success).toBe(true);
    const withIncident = body.data.find((r: any) => r.incident?.id === incidentId);
    expect(withIncident).toBeUndefined();
  });
});
