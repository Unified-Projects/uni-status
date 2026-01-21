import { bootstrapTestContext, TestContext } from "../helpers/context";

const API_BASE_URL = process.env.API_BASE_URL ?? "http://api:3001";

describe("Maintenance Windows API", () => {
  let ctx: TestContext;
  let monitorId: string;
  let maintenanceId: string;

  beforeAll(async () => {
    ctx = await bootstrapTestContext();

    // Seed a monitor for maintenance association
    const monitorRes = await fetch(`${API_BASE_URL}/api/v1/monitors`, {
      method: "POST",
      headers: ctx.headers,
      body: JSON.stringify({
        name: "Maintenance Monitor",
        url: "https://maintenance.example.com",
        type: "https",
        method: "GET",
        intervalSeconds: 60,
      }),
    });
    const monitorBody = await monitorRes.json();
    monitorId = monitorBody.data.id;
  });

  it("creates a maintenance window (active)", async () => {
    const startsAt = new Date(Date.now() - 5 * 60 * 1000).toISOString(); // started 5m ago
    const endsAt = new Date(Date.now() + 20 * 60 * 1000).toISOString(); // ends in 20m

    const response = await fetch(`${API_BASE_URL}/api/v1/maintenance-windows`, {
      method: "POST",
      headers: ctx.headers,
      body: JSON.stringify({
        name: "Planned upgrade",
        description: "Routine maintenance",
        affectedMonitors: [monitorId],
        startsAt,
        endsAt,
        timezone: "UTC",
      }),
    });

    expect(response.status).toBe(201);
    const body = await response.json();
    expect(body.success).toBe(true);
    maintenanceId = body.data.id;
    expect(body.data.computedStatus).toBe("active");
  });

  it("lists maintenance windows and shows active status", async () => {
    const response = await fetch(`${API_BASE_URL}/api/v1/maintenance-windows?status=active`, {
      headers: ctx.headers,
    });

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.success).toBe(true);
    const ids = body.data.map((m: any) => m.id);
    expect(ids).toContain(maintenanceId);
  });

  it("ends a maintenance window early and reports completed", async () => {
    const response = await fetch(
      `${API_BASE_URL}/api/v1/maintenance-windows/${maintenanceId}/end-early`,
      {
        method: "POST",
        headers: ctx.headers,
      }
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.success).toBe(true);
    expect(body.data.computedStatus).toBe("completed");
  });
});
