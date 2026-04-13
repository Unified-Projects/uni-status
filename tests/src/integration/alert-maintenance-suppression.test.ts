import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { Client } from "pg";
import { bootstrapTestContext, type TestContext } from "../helpers/context";
import {
  createMonitor,
  insertAlertChannel,
  insertAlertPolicy,
  insertMaintenanceWindow,
} from "../helpers/data";
import { sleep, getTestConfigForMonitorType } from "../helpers/services";
import { triggerAndWaitForCheck } from "../helpers/worker-integration";

const DEFAULT_DB_URL =
  "postgresql://uni_status:uni_status_dev@postgres:5432/uni_status?sslmode=disable";

async function getTriggeredAlertCount(
  organizationId: string,
  monitorId: string,
  policyId: string
): Promise<number> {
  const client = new Client({
    connectionString: process.env.DATABASE_URL ?? DEFAULT_DB_URL,
  });
  await client.connect();
  const result = await client.query<{ count: string }>(
    `SELECT COUNT(*)::text AS count
     FROM alert_history
     WHERE organization_id = $1
       AND monitor_id = $2
       AND policy_id = $3
       AND status = 'triggered'`,
    [organizationId, monitorId, policyId]
  );
  await client.end();
  return Number(result.rows[0]?.count ?? 0);
}

async function waitForTriggeredAlertCount(
  organizationId: string,
  monitorId: string,
  policyId: string,
  expectedCount: number,
  timeoutMs = 15000
): Promise<number> {
  const deadline = Date.now() + timeoutMs;
  let lastCount = 0;

  while (Date.now() < deadline) {
    lastCount = await getTriggeredAlertCount(organizationId, monitorId, policyId);
    if (lastCount === expectedCount) {
      return lastCount;
    }
    await sleep(250);
  }

  throw new Error(
    `Timeout waiting for ${expectedCount} triggered alerts, last observed ${lastCount}`
  );
}

describe("Alert Maintenance Suppression", () => {
  let ctx: TestContext;

  beforeAll(async () => {
    ctx = await bootstrapTestContext();
  });

  afterAll(async () => {
    await ctx?.cleanup?.();
  });

  it("suppresses alert trigger for monitors under active maintenance", async () => {
    const monitorId = await createMonitor(ctx, {
      type: "http",
      name: "Maintenance Suppressed Monitor",
      url: "http://localhost:59999/maintenance-suppressed",
      timeoutMs: 5000,
      config: getTestConfigForMonitorType("http"),
    });

    const channel = await insertAlertChannel(ctx.organizationId, {
      name: "Maintenance Test Channel",
      type: "email",
      config: { email: "maintenance-test@example.com" },
    });

    const policy = await insertAlertPolicy(ctx.organizationId, {
      name: "Maintenance Suppression Policy",
      channelIds: [channel.id],
      conditions: { consecutiveFailures: 1 },
      cooldownMinutes: 1,
      monitors: [monitorId],
    });

    await insertMaintenanceWindow(ctx.organizationId, ctx.userId, {
      name: "Active Maintenance",
      startsAt: new Date(Date.now() - 5 * 60 * 1000),
      endsAt: new Date(Date.now() + 30 * 60 * 1000),
      affectedMonitors: [monitorId],
      description: "Testing alert suppression during maintenance",
    });

    const result = await triggerAndWaitForCheck(ctx, monitorId, {
      timeoutMs: 30000,
    });

    expect(["failure", "error", "timeout"]).toContain(result.status);

    await sleep(2000);
    const triggeredCount = await getTriggeredAlertCount(
      ctx.organizationId,
      monitorId,
      policy.id
    );
    expect(triggeredCount).toBe(0);
  });

  it("still triggers alerts outside maintenance windows", async () => {
    const monitorId = await createMonitor(ctx, {
      type: "http",
      name: "Maintenance Control Monitor",
      url: "http://localhost:59999/maintenance-control",
      timeoutMs: 5000,
      config: getTestConfigForMonitorType("http"),
    });

    const channel = await insertAlertChannel(ctx.organizationId, {
      name: "Maintenance Control Channel",
      type: "email",
      config: { email: "maintenance-control@example.com" },
    });

    const policy = await insertAlertPolicy(ctx.organizationId, {
      name: "Maintenance Control Policy",
      channelIds: [channel.id],
      conditions: { consecutiveFailures: 1 },
      cooldownMinutes: 1,
      monitors: [monitorId],
    });

    await insertMaintenanceWindow(ctx.organizationId, ctx.userId, {
      name: "Past Maintenance",
      startsAt: new Date(Date.now() - 60 * 60 * 1000),
      endsAt: new Date(Date.now() - 30 * 60 * 1000),
      affectedMonitors: [monitorId],
      description: "Past maintenance should not suppress new alerts",
    });

    const result = await triggerAndWaitForCheck(ctx, monitorId, {
      timeoutMs: 30000,
    });

    expect(["failure", "error", "timeout"]).toContain(result.status);

    const triggeredCount = await waitForTriggeredAlertCount(
      ctx.organizationId,
      monitorId,
      policy.id,
      1
    );
    expect(triggeredCount).toBe(1);
  });
});
