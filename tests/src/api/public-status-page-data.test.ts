import { randomUUID } from "crypto";
import { bootstrapTestContext, TestContext } from "../helpers/context";
import { insertCheckResults, insertDailyAggregate, setMonitorStatus } from "../helpers/data";

const API_BASE_URL = process.env.API_BASE_URL ?? "http://api:3001";

describe("Public status page data", () => {
  let ctx: TestContext;
  let monitorId: string;
  let incidentId: string;
  let slug: string;

  beforeAll(async () => {
    ctx = await bootstrapTestContext();
    slug = `public-data-${Date.now()}`;

    // Create SSL monitor so certificate info and uptime are available
    const monitorRes = await fetch(`${API_BASE_URL}/api/v1/monitors`, {
      method: "POST",
      headers: ctx.headers,
      body: JSON.stringify({
        name: `Public Data Monitor ${randomUUID().slice(0, 6)}`,
        url: "https://public-data.example.com",
        type: "https",
        method: "GET",
        intervalSeconds: 60,
      }),
    });
    expect(monitorRes.status).toBe(201);
    const monitorBody = await monitorRes.json();
    monitorId = monitorBody.data.id;
    await setMonitorStatus(monitorId, "active");

    // Seed certificate and check results
    await insertCheckResults(monitorId, [
      {
        status: "success",
        responseTimeMs: 120,
        certificateInfo: {
          issuer: "Example CA",
          subject: "CN=public-data.example.com",
          daysUntilExpiry: 20,
          validFrom: new Date().toISOString(),
          validTo: new Date(Date.now() + 20 * 86400000).toISOString(),
        },
        headers: { fingerprint: "cert-1" },
      },
    ]);

    // Seed daily aggregates to ensure uptime trend
    const today = new Date();
    const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000);
    await insertDailyAggregate({
      monitorId,
      date: today,
      successCount: 2,
      degradedCount: 1,
      failureCount: 1,
      totalCount: 4,
      uptimePercentage: 75,
    });
    await insertDailyAggregate({
      monitorId,
      date: yesterday,
      successCount: 1,
      degradedCount: 0,
      failureCount: 1,
      totalCount: 2,
      uptimePercentage: 50,
    });

    // Create incident affecting this monitor
    const incidentRes = await fetch(`${API_BASE_URL}/api/v1/incidents`, {
      method: "POST",
      headers: ctx.headers,
      body: JSON.stringify({
        title: "API partial outage",
        severity: "major",
        status: "investigating",
        affectedMonitors: [monitorId],
      }),
    });
    const incidentBody = await incidentRes.json();
    incidentId = incidentBody.data.id;

    // Create published status page and link monitor
    const pageRes = await fetch(`${API_BASE_URL}/api/v1/status-pages`, {
      method: "POST",
      headers: ctx.headers,
      body: JSON.stringify({
        name: "Public Data Page",
        slug,
        published: true,
        settings: { showUptimePercentage: true, showResponseTime: true },
      }),
    });
    expect(pageRes.status).toBe(201);
    const pageBody = await pageRes.json();
    const statusPageId = pageBody.data.id;

    // Sanity check page exists and is published
    const pageGet = await fetch(`${API_BASE_URL}/api/v1/status-pages/${statusPageId}`, {
      headers: ctx.headers,
    });
    expect(pageGet.status).toBe(200);
    const pageData = await pageGet.json();
    expect(pageData.data.slug).toBe(slug);
    expect(pageData.data.published).toBe(true);

    const linkRes = await fetch(`${API_BASE_URL}/api/v1/status-pages/${statusPageId}/monitors`, {
      method: "POST",
      headers: ctx.headers,
      body: JSON.stringify({
        monitorId,
        displayName: "Public Monitor",
        order: 1,
      }),
    });
    expect(linkRes.status).toBe(201);
  });

  it("builds public status payload with monitors, uptime, and incidents", async () => {
    const response = await fetch(`${API_BASE_URL}/api/public/status-pages/${slug}`);
    expect([200, 404]).toContain(response.status);
    const body = await response.json();
    if (response.status === 404) {
      throw new Error(`Status page not found for slug ${slug}: ${JSON.stringify(body)}`);
    }
    expect(body.success).toBe(true);

    const monitor = body.data.monitors.find((m: any) => m.id === monitorId);
    expect(monitor).toBeDefined();
    expect(monitor.status).toBeDefined();
    expect(monitor.uptimePercentage).not.toBeNull();
    expect(monitor.uptimeData?.length).toBeGreaterThanOrEqual(1);
    expect(monitor.certificateInfo?.daysUntilExpiry).toBe(20);

    const activeIncident = body.data.activeIncidents.find((i: any) => i.id === incidentId);
    expect(activeIncident).toBeDefined();
    expect(activeIncident.affectedMonitors).toContain(monitorId);
  });
});
