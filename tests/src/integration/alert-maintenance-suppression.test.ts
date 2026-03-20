import { describe, it, expect, beforeAll } from "vitest";
import { Client } from "pg";
import { bootstrapTestContext, type TestContext } from "../helpers/context";
import {
  insertMonitor,
  insertAlertChannel,
  insertAlertPolicy,
  insertCheckResults,
  insertMaintenanceWindow,
} from "../helpers/data";
import { getLatestCheckResult } from "../helpers/worker-integration";
import { evaluateAlerts } from "../../../apps/workers/src/lib/alert-evaluator";

const DEFAULT_DB_URL =
  "postgresql://uni_status:uni_status_dev@postgres:5432/uni_status?sslmode=disable";

async function getTriggeredAlertCount(monitorId: string, policyId: string): Promise<number> {
  const client = new Client({
    connectionString: process.env.DATABASE_URL ?? DEFAULT_DB_URL,
  });
  await client.connect();
  const result = await client.query<{ count: string }>(
    `SELECT COUNT(*)::text AS count
     FROM alert_history
     WHERE monitor_id = $1
       AND policy_id = $2
       AND status = 'triggered'`,
    [monitorId, policyId]
  );
  await client.end();
  return Number(result.rows[0]?.count ?? 0);
}

describe("Alert Maintenance Suppression", () => {
  let ctx: TestContext;

  beforeAll(async () => {
    ctx = await bootstrapTestContext();
  });

  it("suppresses alert trigger for monitors under active maintenance", async () => {
    const monitor = await insertMonitor(ctx.organizationId, {
      name: "Maintenance Suppressed Monitor",
      url: "https://maintenance-suppressed.example.com",
      createdBy: ctx.user.id,
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
      monitors: [monitor.id],
    });

    await insertMaintenanceWindow(ctx.organizationId, ctx.user.id, {
      name: "Active Maintenance",
      startsAt: new Date(Date.now() - 5 * 60 * 1000),
      endsAt: new Date(Date.now() + 30 * 60 * 1000),
      affectedMonitors: [monitor.id],
      description: "Testing alert suppression during maintenance",
    });

    await insertCheckResults(monitor.id, [
      {
        status: "failure",
        responseTimeMs: 0,
        statusCode: 500,
        createdAt: new Date(),
      },
    ]);

    const latestCheck = await getLatestCheckResult(monitor.id);
    expect(latestCheck).not.toBeNull();

    await evaluateAlerts({
      monitorId: monitor.id,
      organizationId: ctx.organizationId,
      checkResultId: latestCheck!.id,
      checkStatus: "failure",
      errorMessage: "Synthetic failure during maintenance",
      responseTimeMs: latestCheck!.responseTimeMs ?? undefined,
      statusCode: latestCheck!.statusCode ?? undefined,
    });

    const triggeredCount = await getTriggeredAlertCount(monitor.id, policy.id);
    expect(triggeredCount).toBe(0);
  });

  it("still triggers alerts outside maintenance windows", async () => {
    const monitor = await insertMonitor(ctx.organizationId, {
      name: "Maintenance Control Monitor",
      url: "https://maintenance-control.example.com",
      createdBy: ctx.user.id,
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
      monitors: [monitor.id],
    });

    await insertMaintenanceWindow(ctx.organizationId, ctx.user.id, {
      name: "Past Maintenance",
      startsAt: new Date(Date.now() - 60 * 60 * 1000),
      endsAt: new Date(Date.now() - 30 * 60 * 1000),
      affectedMonitors: [monitor.id],
      description: "Past maintenance should not suppress new alerts",
    });

    await insertCheckResults(monitor.id, [
      {
        status: "failure",
        responseTimeMs: 0,
        statusCode: 500,
        createdAt: new Date(),
      },
    ]);

    const latestCheck = await getLatestCheckResult(monitor.id);
    expect(latestCheck).not.toBeNull();

    await evaluateAlerts({
      monitorId: monitor.id,
      organizationId: ctx.organizationId,
      checkResultId: latestCheck!.id,
      checkStatus: "failure",
      errorMessage: "Synthetic failure outside maintenance",
      responseTimeMs: latestCheck!.responseTimeMs ?? undefined,
      statusCode: latestCheck!.statusCode ?? undefined,
    });

    const triggeredCount = await getTriggeredAlertCount(monitor.id, policy.id);
    expect(triggeredCount).toBe(1);
  });
});
