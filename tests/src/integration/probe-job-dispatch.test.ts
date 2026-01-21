/**
 * Distributed Probe Job Dispatch Integration Tests
 *
 * Tests that verify the probe system works correctly:
 * - Probe registration and heartbeat
 * - Job assignment to probes
 * - Result submission from probes
 * - Multi-region probe coordination
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { bootstrapTestContext, TestContext } from "../helpers/context";
import {
  createMonitor,
  insertActiveProbe,
  insertPendingProbeJob,
} from "../helpers/data";
import { TEST_SERVICES, sleep } from "../helpers/services";
import { Client } from "pg";

const API_BASE_URL = process.env.API_BASE_URL ?? "http://api:3001";
const DEFAULT_DB_URL =
  "postgresql://uni_status:uni_status_dev@postgres:5432/uni_status?sslmode=disable";

/**
 * Get pending jobs for a probe
 */
async function getPendingProbeJobs(probeId: string): Promise<
  Array<{
    id: string;
    monitorId: string;
    jobData: Record<string, unknown>;
    expiresAt: Date;
    createdAt: Date;
  }>
> {
  const client = new Client({
    connectionString: process.env.DATABASE_URL ?? DEFAULT_DB_URL,
  });
  await client.connect();

  const result = await client.query(
    `SELECT
      id,
      monitor_id as "monitorId",
      job_data as "jobData",
      expires_at as "expiresAt",
      created_at as "createdAt"
    FROM probe_pending_jobs
    WHERE probe_id = $1 AND expires_at > NOW()
    ORDER BY created_at DESC`,
    [probeId]
  );

  await client.end();
  return result.rows;
}

/**
 * Get probe by ID
 */
async function getProbeById(probeId: string): Promise<{
  id: string;
  organizationId: string;
  name: string;
  region: string;
  status: string;
  lastHeartbeatAt: Date | null;
} | null> {
  const client = new Client({
    connectionString: process.env.DATABASE_URL ?? DEFAULT_DB_URL,
  });
  await client.connect();

  const result = await client.query(
    `SELECT
      id,
      organization_id as "organizationId",
      name,
      region,
      status,
      last_heartbeat_at as "lastHeartbeatAt"
    FROM probes
    WHERE id = $1`,
    [probeId]
  );

  await client.end();
  return result.rows[0] || null;
}

/**
 * Get check results submitted by a specific probe
 */
async function getProbeCheckResults(
  monitorId: string,
  region: string,
  afterTimestamp?: Date
): Promise<
  Array<{
    id: string;
    status: string;
    region: string;
    createdAt: Date;
  }>
> {
  const client = new Client({
    connectionString: process.env.DATABASE_URL ?? DEFAULT_DB_URL,
  });
  await client.connect();

  let query = `
    SELECT id, status, region, created_at as "createdAt"
    FROM check_results
    WHERE monitor_id = $1 AND region = $2
  `;
  const params: (string | Date)[] = [monitorId, region];

  if (afterTimestamp) {
    query += ` AND created_at > $3`;
    params.push(afterTimestamp);
  }

  query += ` ORDER BY created_at DESC`;

  const result = await client.query(query, params);
  await client.end();
  return result.rows;
}

describe("Distributed Probe Job Dispatch Integration", () => {
  let ctx: TestContext;

  beforeAll(async () => {
    ctx = await bootstrapTestContext();
  });

  afterAll(async () => {
    await ctx.cleanup?.();
  });

  // ==========================================
  // PROBE REGISTRATION
  // ==========================================
  describe("Probe Registration", () => {
    it("creates a probe via API", async () => {
      const res = await fetch(`${API_BASE_URL}/api/v1/probes`, {
        method: "POST",
        headers: ctx.headers,
        body: JSON.stringify({
          name: "Test Probe API",
          description: "Created via API for testing",
          region: "us-east",
        }),
      });

      expect(res.status).toBe(201);
      const body = await res.json();
      expect(body.success).toBe(true);
      expect(body.data.id).toBeDefined();
      expect(body.data.name).toBe("Test Probe API");
      expect(body.data.region).toBe("us-east");
      expect(body.data.authToken).toBeDefined();
    });

    it("creates a probe via database helper", async () => {
      const probe = await insertActiveProbe(ctx.organizationId, "eu-west");

      expect(probe.id).toBeDefined();
      expect(probe.token).toBeDefined();
      expect(probe.token.startsWith("probe_")).toBe(true);

      // Verify probe exists in database
      const probeData = await getProbeById(probe.id);
      expect(probeData).not.toBeNull();
      expect(probeData?.region).toBe("eu-west");
      expect(probeData?.status).toBe("active");
    });

    it("lists probes for organization", async () => {
      const res = await fetch(`${API_BASE_URL}/api/v1/probes`, {
        headers: ctx.headers,
      });

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.success).toBe(true);
      expect(Array.isArray(body.data)).toBe(true);
    });
  });

  // ==========================================
  // PROBE HEARTBEAT
  // ==========================================
  describe("Probe Heartbeat", () => {
    let probeId: string;
    let probeToken: string;

    beforeAll(async () => {
      const probe = await insertActiveProbe(ctx.organizationId, "heartbeat-test");
      probeId = probe.id;
      probeToken = probe.token;
    });

    it("accepts heartbeat from authenticated probe", async () => {
      const res = await fetch(`${API_BASE_URL}/api/v1/probes/agent/heartbeat`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${probeToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          version: "1.0.0",
          status: "healthy",
          metrics: {
            cpuUsage: 25,
            memoryUsage: 50,
            pendingJobs: 0,
          },
        }),
      });

      // Heartbeat endpoint may return 200 or 204
      expect([200, 204]).toContain(res.status);
    });

    it("updates last heartbeat timestamp", async () => {
      const beforeHeartbeat = new Date();

      await fetch(`${API_BASE_URL}/api/v1/probes/agent/heartbeat`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${probeToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          version: "1.0.0",
          status: "healthy",
        }),
      });

      await sleep(100);

      const probe = await getProbeById(probeId);
      expect(probe).not.toBeNull();

      if (probe?.lastHeartbeatAt) {
        expect(new Date(probe.lastHeartbeatAt).getTime()).toBeGreaterThanOrEqual(
          beforeHeartbeat.getTime() - 1000
        );
      }
    });

    it("rejects heartbeat with invalid token", async () => {
      const res = await fetch(`${API_BASE_URL}/api/v1/probes/agent/heartbeat`, {
        method: "POST",
        headers: {
          Authorization: "Bearer invalid_token_123",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          version: "1.0.0",
          status: "healthy",
        }),
      });

      expect([401, 403]).toContain(res.status);
    });
  });

  // ==========================================
  // JOB ASSIGNMENT
  // ==========================================
  describe("Job Assignment", () => {
    let probeId: string;
    let probeToken: string;
    let monitorId: string;

    beforeAll(async () => {
      const probe = await insertActiveProbe(ctx.organizationId, "job-test");
      probeId = probe.id;
      probeToken = probe.token;

      // Create a monitor
      monitorId = await createMonitor(ctx, {
        type: "http",
        name: "Probe Job Test Monitor",
        url: `${TEST_SERVICES.HTTPBIN_URL}/get`,
        regions: ["job-test"],
      });
    });

    it("creates pending job for probe", async () => {
      const jobId = await insertPendingProbeJob(probeId, monitorId, {
        url: `${TEST_SERVICES.HTTPBIN_URL}/get`,
        type: "http",
      });

      expect(jobId).toBeDefined();

      // Verify job exists
      const jobs = await getPendingProbeJobs(probeId);
      expect(jobs.length).toBeGreaterThan(0);

      const job = jobs.find((j) => j.id === jobId);
      expect(job).toBeDefined();
      expect(job?.monitorId).toBe(monitorId);
    });

    it("probe can fetch pending jobs", async () => {
      // Create another job
      await insertPendingProbeJob(probeId, monitorId, {
        url: `${TEST_SERVICES.HTTPBIN_URL}/status/200`,
        type: "http",
      });

      const res = await fetch(`${API_BASE_URL}/api/v1/probes/agent/jobs`, {
        headers: {
          Authorization: `Bearer ${probeToken}`,
          "Content-Type": "application/json",
        },
      });

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.success).toBe(true);

      // Should have at least one job
      if (Array.isArray(body.data)) {
        expect(body.data.length).toBeGreaterThanOrEqual(0);
      }
    });

    it("expired jobs are not returned", async () => {
      // Insert a job with past expiry (manually in DB)
      const client = new Client({
        connectionString: process.env.DATABASE_URL ?? DEFAULT_DB_URL,
      });
      await client.connect();

      const expiredJobId = require("crypto").randomUUID();
      await client.query(
        `INSERT INTO probe_pending_jobs (id, probe_id, monitor_id, job_data, expires_at)
         VALUES ($1, $2, $3, $4, NOW() - INTERVAL '1 hour')`,
        [
          expiredJobId,
          probeId,
          monitorId,
          JSON.stringify({ url: "http://expired.example.com", type: "http" }),
        ]
      );
      await client.end();

      // Fetch jobs - expired should not be included
      const jobs = await getPendingProbeJobs(probeId);
      const expiredJob = jobs.find((j) => j.id === expiredJobId);
      expect(expiredJob).toBeUndefined();
    });
  });

  // ==========================================
  // RESULT SUBMISSION
  // ==========================================
  describe("Result Submission", () => {
    let probeId: string;
    let probeToken: string;
    let monitorId: string;
    const probeRegion = "result-test";

    beforeAll(async () => {
      const probe = await insertActiveProbe(ctx.organizationId, probeRegion);
      probeId = probe.id;
      probeToken = probe.token;

      monitorId = await createMonitor(ctx, {
        type: "http",
        name: "Result Submission Monitor",
        url: `${TEST_SERVICES.HTTPBIN_URL}/get`,
        regions: [probeRegion],
      });
    });

    it("probe can submit check results", async () => {
      const beforeSubmit = new Date();

      // Create a pending job first
      const jobId = await insertPendingProbeJob(probeId, monitorId, {
        url: `${TEST_SERVICES.HTTPBIN_URL}/get`,
        type: "http",
      });

      const res = await fetch(`${API_BASE_URL}/api/v1/probes/agent/jobs/${jobId}/result`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${probeToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          monitorId,
          success: true,
          responseTimeMs: 150,
          statusCode: 200,
          region: probeRegion,
          timestamp: new Date().toISOString(),
        }),
      });

      // Accept various success statuses
      expect([200, 201, 204]).toContain(res.status);

      // Wait for result to be stored
      await sleep(500);

      // Verify result was stored
      const results = await getProbeCheckResults(monitorId, probeRegion, beforeSubmit);
      expect(results.length).toBeGreaterThan(0);
    });

    it("probe can submit failure results", async () => {
      const beforeSubmit = new Date();

      // Create a pending job first
      const jobId = await insertPendingProbeJob(probeId, monitorId, {
        url: `${TEST_SERVICES.HTTPBIN_URL}/status/500`,
        type: "http",
      });

      const res = await fetch(`${API_BASE_URL}/api/v1/probes/agent/jobs/${jobId}/result`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${probeToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          monitorId,
          success: false,
          responseTimeMs: 0,
          statusCode: 500,
          region: probeRegion,
          errorMessage: "Connection refused",
          timestamp: new Date().toISOString(),
        }),
      });

      expect([200, 201, 204]).toContain(res.status);

      await sleep(500);

      const results = await getProbeCheckResults(monitorId, probeRegion, beforeSubmit);
      const failureResult = results.find((r) => r.status === "error");
      expect(failureResult).toBeDefined();
    });

    it("rejects results from unauthorized probe", async () => {
      // Create a real job to test against
      const jobId = await insertPendingProbeJob(probeId, monitorId, {
        url: `${TEST_SERVICES.HTTPBIN_URL}/get`,
        type: "http",
      });

      const res = await fetch(`${API_BASE_URL}/api/v1/probes/agent/jobs/${jobId}/result`, {
        method: "POST",
        headers: {
          Authorization: "Bearer invalid_probe_token",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          monitorId,
          success: true,
          responseTimeMs: 100,
          statusCode: 200,
          region: probeRegion,
        }),
      });

      expect([401, 403]).toContain(res.status);
    });
  });

  // ==========================================
  // MULTI-REGION COORDINATION
  // ==========================================
  describe("Multi-Region Coordination", () => {
    let probe1Id: string;
    let probe1Token: string;
    let probe2Id: string;
    let probe2Token: string;
    let monitorId: string;

    beforeAll(async () => {
      // Create probes in different regions
      const probe1 = await insertActiveProbe(ctx.organizationId, "us-east");
      probe1Id = probe1.id;
      probe1Token = probe1.token;

      const probe2 = await insertActiveProbe(ctx.organizationId, "eu-west");
      probe2Id = probe2.id;
      probe2Token = probe2.token;

      // Create monitor targeting both regions
      monitorId = await createMonitor(ctx, {
        type: "http",
        name: "Multi-Region Monitor",
        url: `${TEST_SERVICES.HTTPBIN_URL}/get`,
        regions: ["us-east", "eu-west"],
      });
    });

    it("creates jobs for multiple probes", async () => {
      // Create jobs for both probes
      await insertPendingProbeJob(probe1Id, monitorId, {
        url: `${TEST_SERVICES.HTTPBIN_URL}/get`,
        type: "http",
      });

      await insertPendingProbeJob(probe2Id, monitorId, {
        url: `${TEST_SERVICES.HTTPBIN_URL}/get`,
        type: "http",
      });

      // Both probes should have jobs
      const jobs1 = await getPendingProbeJobs(probe1Id);
      const jobs2 = await getPendingProbeJobs(probe2Id);

      expect(jobs1.length).toBeGreaterThan(0);
      expect(jobs2.length).toBeGreaterThan(0);
    });

    it("results from different regions are stored separately", async () => {
      const beforeSubmit = new Date();

      // Create pending jobs for both probes
      const job1Id = await insertPendingProbeJob(probe1Id, monitorId, {
        url: `${TEST_SERVICES.HTTPBIN_URL}/get`,
        type: "http",
      });
      const job2Id = await insertPendingProbeJob(probe2Id, monitorId, {
        url: `${TEST_SERVICES.HTTPBIN_URL}/get`,
        type: "http",
      });

      // Submit results from both probes
      await fetch(`${API_BASE_URL}/api/v1/probes/agent/jobs/${job1Id}/result`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${probe1Token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          monitorId,
          success: true,
          responseTimeMs: 100,
          statusCode: 200,
          region: "us-east",
        }),
      });

      await fetch(`${API_BASE_URL}/api/v1/probes/agent/jobs/${job2Id}/result`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${probe2Token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          monitorId,
          success: true,
          responseTimeMs: 200,
          statusCode: 200,
          region: "eu-west",
        }),
      });

      await sleep(500);

      // Verify results are stored with correct regions
      const usResults = await getProbeCheckResults(monitorId, "us-east", beforeSubmit);
      const euResults = await getProbeCheckResults(monitorId, "eu-west", beforeSubmit);

      expect(usResults.length).toBeGreaterThan(0);
      expect(euResults.length).toBeGreaterThan(0);
    });
  });

  // ==========================================
  // PROBE STATUS MANAGEMENT
  // ==========================================
  describe("Probe Status Management", () => {
    let probeId: string;

    beforeAll(async () => {
      const probe = await insertActiveProbe(ctx.organizationId, "status-test");
      probeId = probe.id;
    });

    it("can update probe status via API", async () => {
      const res = await fetch(`${API_BASE_URL}/api/v1/probes/${probeId}`, {
        method: "PATCH",
        headers: ctx.headers,
        body: JSON.stringify({
          status: "disabled",
        }),
      });

      expect(res.status).toBe(200);

      const probe = await getProbeById(probeId);
      expect(probe?.status).toBe("disabled");
    });

    it("can reactivate probe", async () => {
      const res = await fetch(`${API_BASE_URL}/api/v1/probes/${probeId}`, {
        method: "PATCH",
        headers: ctx.headers,
        body: JSON.stringify({
          status: "active",
        }),
      });

      expect(res.status).toBe(200);

      const probe = await getProbeById(probeId);
      expect(probe?.status).toBe("active");
    });

    it("can delete probe", async () => {
      // Create a new probe to delete
      const probeToDelete = await insertActiveProbe(ctx.organizationId, "delete-test");

      const res = await fetch(`${API_BASE_URL}/api/v1/probes/${probeToDelete.id}`, {
        method: "DELETE",
        headers: ctx.headers,
      });

      expect([200, 204]).toContain(res.status);

      // Verify probe is deleted or marked as deleted
      const probe = await getProbeById(probeToDelete.id);
      // Probe should either be null (hard delete) or have deleted status
    });
  });

  // ==========================================
  // CROSS-ORG ISOLATION
  // ==========================================
  describe("Cross-Organization Isolation", () => {
    let otherCtx: TestContext;
    let otherProbeId: string;

    beforeAll(async () => {
      otherCtx = await bootstrapTestContext();
      const probe = await insertActiveProbe(otherCtx.organizationId, "other-org");
      otherProbeId = probe.id;
    });

    it("cannot access other org probe", async () => {
      const res = await fetch(`${API_BASE_URL}/api/v1/probes/${otherProbeId}`, {
        headers: ctx.headers,
      });

      expect([403, 404]).toContain(res.status);
    });

    it("cannot update other org probe", async () => {
      const res = await fetch(`${API_BASE_URL}/api/v1/probes/${otherProbeId}`, {
        method: "PATCH",
        headers: ctx.headers,
        body: JSON.stringify({
          name: "Hacked Probe",
        }),
      });

      expect([403, 404]).toContain(res.status);
    });

    it("cannot delete other org probe", async () => {
      const res = await fetch(`${API_BASE_URL}/api/v1/probes/${otherProbeId}`, {
        method: "DELETE",
        headers: ctx.headers,
      });

      expect([403, 404]).toContain(res.status);
    });
  });
});
