import { Job } from "bullmq";
import { nanoid } from "nanoid";
import { db } from "@uni-status/database";
import { monitors, checkResults, organizations } from "@uni-status/database/schema";
import { eq } from "drizzle-orm";
import { publishEvent } from "../lib/redis";
import { evaluateAlerts } from "../lib/alert-evaluator";
import { linkCheckToActiveIncident } from "../lib/incident-linker";
import type { CheckStatus } from "@uni-status/shared/types";
import { evaluateSliStatus } from "@uni-status/shared";

interface PrometheusBlackboxJob {
  monitorId: string;
  organizationId: string;
  url: string;
  timeoutMs: number;
  regions: string[];
  config?: Record<string, unknown> | null;
}

type TargetResult = {
  target: string;
  success: boolean;
  durationMs: number | null;
  statusCode?: number | null;
  errorMessage?: string;
};

function parseBlackboxMetrics(body: string): {
  success: boolean;
  durationMs: number | null;
  statusCode?: number | null;
} {
  let success = false;
  let durationMs: number | null = null;
  let statusCode: number | null = null;

  for (const rawLine of body.split("\n")) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const [name, value] = line.split(/\s+/);
    if (!value) continue;
    const numericValue = Number(value);
    if (name === "probe_success") {
      success = numericValue === 1;
    } else if (name === "probe_duration_seconds") {
      durationMs = Math.round(numericValue * 1000);
    } else if (name === "probe_http_status_code") {
      statusCode = Number.isNaN(numericValue) ? null : Math.round(numericValue);
    }
  }

  return { success, durationMs, statusCode };
}

export async function processPrometheusBlackboxCheck(job: Job<PrometheusBlackboxJob>) {
  const {
    monitorId,
    organizationId,
    url,
    timeoutMs,
    regions,
    config,
  } = job.data;

  const defaultRegion = process.env.MONITOR_DEFAULT_REGION || "uk";
  const region = regions[0] || defaultRegion;

  // Resolve organization-level defaults
  const org = await db.query.organizations.findFirst({
    where: eq(organizations.id, organizationId),
  });
  type PrometheusIntegration = {
    blackboxUrl?: string;
    alloyEmbedUrl?: string;
    bearerToken?: string;
    defaultModule?: string;
  };
  const promIntegration = (org?.settings as { integrations?: { prometheus?: PrometheusIntegration } } | null)
    ?.integrations?.prometheus;

  const promConfig = (config as { prometheus?: Record<string, unknown> } | null)?.prometheus || {};
  const exporterUrl =
    (promConfig.exporterUrl as string | undefined) ||
    (promConfig.preferOrgEmbedded ? promIntegration?.blackboxUrl || promIntegration?.alloyEmbedUrl : undefined) ||
    promIntegration?.blackboxUrl ||
    promIntegration?.alloyEmbedUrl;

  const module =
    (promConfig.module as string | undefined) ||
    promIntegration?.defaultModule ||
    "http_2xx";
  const probePath = (promConfig.probePath as string | undefined) || "/probe";
  const targets = (promConfig.targets as string[] | undefined)?.length
    ? (promConfig.targets as string[])
    : [url];
  const multiTargetStrategy = (promConfig.multiTargetStrategy as "any" | "quorum" | "all" | undefined) || "quorum";
  const configuredTimeoutMs =
    typeof promConfig.timeoutSeconds === "number" && promConfig.timeoutSeconds > 0
      ? promConfig.timeoutSeconds * 1000
      : timeoutMs;
  const probeTimeoutMs = Math.max(1000, Math.min(timeoutMs, configuredTimeoutMs));

  if (!exporterUrl) {
    const now = new Date();
    const resultId = nanoid();
    await db.insert(checkResults).values({
      id: resultId,
      monitorId,
      region,
      status: "error",
      responseTimeMs: null,
      errorMessage: "No blackbox exporter URL configured (set org Prometheus integration or monitor-level exporterUrl)",
      createdAt: now,
      metadata: { targets },
    });
    await db
      .update(monitors)
      .set({ status: "down", updatedAt: now })
      .where(eq(monitors.id, monitorId));
    await publishEvent(`monitor:${monitorId}`, {
      type: "monitor:check",
      data: { monitorId, status: "error", responseTimeMs: null, timestamp: now.toISOString() },
    });
    return { status: "error" as CheckStatus, responseTimeMs: null };
  }

  const authToken = promIntegration?.bearerToken;
  const targetResults: TargetResult[] = [];

  for (const target of targets) {
    const probeUrl = new URL(probePath.startsWith("http") ? probePath : `${exporterUrl.replace(/\/$/, "")}${probePath}`);
    probeUrl.searchParams.set("module", module);
    probeUrl.searchParams.set("target", target);

    try {
      const controller = new AbortController();
      const timeoutHandle = setTimeout(() => controller.abort(), probeTimeoutMs);
      const response = await fetch(probeUrl.toString(), {
        headers: authToken ? { Authorization: `Bearer ${authToken}` } : undefined,
        signal: controller.signal,
      });
      const body = await response.text();
      clearTimeout(timeoutHandle);

      const parsed = parseBlackboxMetrics(body);
      targetResults.push({
        target,
        success: parsed.success,
        durationMs: parsed.durationMs,
        statusCode: parsed.statusCode,
        errorMessage: parsed.success ? undefined : `Probe failed (status ${parsed.statusCode ?? "unknown"})`,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown probe error";
      targetResults.push({
        target,
        success: false,
        durationMs: null,
        statusCode: null,
        errorMessage: message,
      });
    }
  }

  const successCount = targetResults.filter((r) => r.success).length;
  const successRatio = targets.length > 0 ? successCount / targets.length : 0;
  const avgDuration =
    targetResults.filter((r) => typeof r.durationMs === "number").reduce((sum, r) => sum + (r.durationMs || 0), 0) /
    (targetResults.filter((r) => typeof r.durationMs === "number").length || 1);

  // Pull SLO target (if configured) to drive degraded vs down
  let sloTargetPercent: number | undefined;
  try {
    const { enterpriseDb } = await import("@uni-status/enterprise/database");
    const { sloTargets } = await import("@uni-status/enterprise/database/schema");
    const sloTarget = await enterpriseDb.query.sloTargets.findFirst({
      where: eq(sloTargets.monitorId, monitorId),
    });
    sloTargetPercent = sloTarget ? Number(sloTarget.targetPercentage) : undefined;
  } catch {
    // Enterprise package not available, skip SLO-aware status
  }

  let status: CheckStatus =
    successCount === targets.length
      ? "success"
      : successCount === 0
        ? "failure"
        : multiTargetStrategy === "all"
          ? "failure"
          : "degraded";

  const sliStatus = evaluateSliStatus(
    successRatio * 100,
    {
      ...(promConfig.thresholds as Record<string, unknown> | undefined),
      normalizePercent: true,
    } as any,
    sloTargetPercent
  );

  // Prefer SLI-based status when thresholds/SLO present
  if (promConfig.thresholds || sloTargetPercent !== undefined) {
    status = sliStatus;
  }

  const now = new Date();
  const resultId = nanoid();
  const errorTargets = targetResults.filter((r) => !r.success).map((r) => r.target);
  const errorMessage = errorTargets.length > 0 ? `Failed targets: ${errorTargets.join(", ")}` : undefined;

  await db.insert(checkResults).values({
    id: resultId,
    monitorId,
    region,
    status,
    responseTimeMs: Number.isFinite(avgDuration) ? Math.round(avgDuration) : null,
    errorMessage,
    metadata: {
      exporterUrl,
      module,
      multiTargetStrategy,
      successRatio,
      targets: targetResults,
    },
    createdAt: now,
  });

  // Link to incident if necessary
  await linkCheckToActiveIncident(resultId, monitorId, status);

  // Update monitor status
  const monitorStatus = status === "success" ? "active" : status === "degraded" ? "degraded" : "down";
  await db
    .update(monitors)
    .set({
      status: monitorStatus,
      updatedAt: now,
      lastCheckedAt: now,
    })
    .where(eq(monitors.id, monitorId));

  await publishEvent(`monitor:${monitorId}`, {
    type: "monitor:check",
    data: {
      monitorId,
      status,
      responseTimeMs: Number.isFinite(avgDuration) ? Math.round(avgDuration) : null,
      timestamp: now.toISOString(),
    },
  });

  await evaluateAlerts({
    monitorId,
    organizationId,
    checkResultId: resultId,
    checkStatus: status,
    errorMessage,
    responseTimeMs: Number.isFinite(avgDuration) ? Math.round(avgDuration) : undefined,
  });

  return {
    status,
    responseTimeMs: avgDuration,
  };
}
