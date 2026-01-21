import { bootstrapTestContext, TestContext } from "../helpers/context";
import { insertPendingProbeJob } from "../helpers/data";

const API_BASE_URL = process.env.API_BASE_URL ?? "http://api:3001";

describe("Probes API & Agent endpoints", () => {
  let ctx: TestContext;
  let monitorId: string;
  let probeId: string;
  let probeToken: string;

  beforeAll(async () => {
    ctx = await bootstrapTestContext();

    // Seed a monitor
    const monitorRes = await fetch(`${API_BASE_URL}/api/v1/monitors`, {
      method: "POST",
      headers: ctx.headers,
      body: JSON.stringify({
        name: "Probe Monitor",
        url: "https://probe.example.com",
        type: "https",
        method: "GET",
        intervalSeconds: 60,
      }),
    });
    const monitorBody = await monitorRes.json();
    monitorId = monitorBody.data.id;
  });

  it("creates a probe and lists it", async () => {
    const response = await fetch(`${API_BASE_URL}/api/v1/probes`, {
      method: "POST",
      headers: ctx.headers,
      body: JSON.stringify({
        name: "Edge Probe",
        description: "Test probe",
        region: "uk",
      }),
    });

    expect(response.status).toBe(201);
    const body = await response.json();
    expect(body.success).toBe(true);
    probeId = body.data.id;
    probeToken = body.data.authToken;

    const listRes = await fetch(`${API_BASE_URL}/api/v1/probes`, {
      headers: ctx.headers,
    });
    expect(listRes.status).toBe(200);
    const listBody = await listRes.json();
    expect(listBody.success).toBe(true);
    const ids = listBody.data.map((p: any) => p.id);
    expect(ids).toContain(probeId);
  });

  it("assigns the probe to a monitor", async () => {
    const response = await fetch(`${API_BASE_URL}/api/v1/probes/${probeId}/assign`, {
      method: "POST",
      headers: ctx.headers,
      body: JSON.stringify({
        monitorId,
        priority: 1,
        exclusive: false,
      }),
    });

    expect(response.status).toBe(201);
    const body = await response.json();
    expect(body.success).toBe(true);
  });

  it("accepts agent heartbeat and marks active", async () => {
    const response = await fetch(`${API_BASE_URL}/api/v1/probes/agent/heartbeat`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${probeToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        version: "1.0.0",
        metrics: { cpuUsage: 12, memoryUsage: 34 },
        metadata: { os: "linux" },
      }),
    });

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.success).toBe(true);
  });

  it("claims a pending job and submits a result", async () => {
    const jobId = await insertPendingProbeJob(probeId, monitorId, {
      url: "https://probe-job.example.com",
      type: "https",
    });

    const jobsRes = await fetch(`${API_BASE_URL}/api/v1/probes/agent/jobs?limit=5`, {
      headers: {
        Authorization: `Bearer ${probeToken}`,
      },
    });
    expect(jobsRes.status).toBe(200);
    const jobsBody = await jobsRes.json();
    expect(jobsBody.success).toBe(true);
    const claimedIds = jobsBody.data.map((j: any) => j.id);
    expect(claimedIds).toContain(jobId);

    const resultRes = await fetch(
      `${API_BASE_URL}/api/v1/probes/agent/jobs/${jobId}/result`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${probeToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          monitorId,
          success: true,
          responseTimeMs: 250,
          statusCode: 200,
          metadata: { note: "ok" },
        }),
      }
    );

    expect(resultRes.status).toBe(200);
    const resultBody = await resultRes.json();
    expect(resultBody.success).toBe(true);
    expect(resultBody.data.resultId).toBeDefined();
  });

  it("returns probe stats with heartbeat count", async () => {
    const statsRes = await fetch(`${API_BASE_URL}/api/v1/probes/${probeId}/stats?hours=24`, {
      headers: ctx.headers,
    });
    expect(statsRes.status).toBe(200);
    const statsBody = await statsRes.json();
    expect(statsBody.success).toBe(true);
    expect(Number(statsBody.data.heartbeats)).toBeGreaterThanOrEqual(1);
  });
});
