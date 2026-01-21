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

interface PrometheusPromqlJob {
  monitorId: string;
  organizationId: string;
  url: string; // Used as a label/identifier; PromQL comes from config
  timeoutMs: number;
  regions: string[];
  config?: Record<string, unknown> | null;
}

type PrometheusValue = number | null;

function parsePrometheusValue(result: any): PrometheusValue {
  if (!result?.data?.result || result.data.result.length === 0) {
    return null;
  }

  const first = result.data.result[0];
  if (first.value && Array.isArray(first.value) && first.value.length >= 2) {
    const value = Number(first.value[1]);
    return Number.isFinite(value) ? value : null;
  }

  if (first.values && Array.isArray(first.values) && first.values.length > 0) {
    const last = first.values[first.values.length - 1];
    const value = Array.isArray(last) ? Number(last[1]) : null;
    return Number.isFinite(value) ? value : null;
  }

  return null;
}

export async function processPrometheusPromqlCheck(job: Job<PrometheusPromqlJob>) {
  const {
    monitorId,
    organizationId,
    timeoutMs,
    regions,
    config,
  } = job.data;

  const defaultRegion = process.env.MONITOR_DEFAULT_REGION || "uk";
  const region = regions[0] || defaultRegion;
  const startTime = performance.now();

  // Resolve org-level integration defaults
  const org = await db.query.organizations.findFirst({
    where: eq(organizations.id, organizationId),
  });
  type PrometheusIntegration = {
    defaultUrl?: string;
    bearerToken?: string;
  };
  const promIntegration = (org?.settings as { integrations?: { prometheus?: PrometheusIntegration } } | null)
    ?.integrations?.prometheus;

  const promConfig = (config as { prometheus?: Record<string, unknown> } | null)?.prometheus || {};
  const promql = promConfig.promql as
    | {
        query?: string;
        lookbackSeconds?: number;
        stepSeconds?: number;
        authToken?: string;
        prometheusUrl?: string;
      }
    | undefined;

  const rawPrometheusUrl =
    promql?.prometheusUrl ||
    promConfig.prometheusUrl ||
    promIntegration?.defaultUrl;
  const prometheusUrl = typeof rawPrometheusUrl === "string" ? rawPrometheusUrl : undefined;

  const queryString = promql?.query;
  if (!queryString || !prometheusUrl) {
    const now = new Date();
    const resultId = nanoid();
    await db.insert(checkResults).values({
      id: resultId,
      monitorId,
      region,
      status: "error",
      responseTimeMs: null,
      errorMessage: "Prometheus URL or PromQL query not configured",
      metadata: { promql: promql || null },
      createdAt: now,
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

  const authToken = promql?.authToken || promIntegration?.bearerToken;

  // Build request (instant or range)
  const lookbackSeconds = promql?.lookbackSeconds;
  const stepSeconds = promql?.stepSeconds || 60;
  const nowTs = Math.floor(Date.now() / 1000);

  const isRange = !!lookbackSeconds;
  const searchParams = new URLSearchParams();
  searchParams.set("query", queryString);
  let endpoint = "/api/v1/query";

  if (isRange) {
    endpoint = "/api/v1/query_range";
    const start = nowTs - lookbackSeconds!;
    searchParams.set("start", start.toString());
    searchParams.set("end", nowTs.toString());
    searchParams.set("step", stepSeconds.toString());
  }

  const url = `${prometheusUrl.replace(/\/$/, "")}${endpoint}?${searchParams.toString()}`;

  let status: CheckStatus = "success";
  let value: number | null = null;
  let errorMessage: string | undefined;
  let fetchDurationMs = 0;

  try {
    const controller = new AbortController();
    const timeoutHandle = setTimeout(() => controller.abort(), timeoutMs);
    const response = await fetch(url, {
      headers: authToken ? { Authorization: `Bearer ${authToken}` } : undefined,
      signal: controller.signal,
    });
    fetchDurationMs = Math.round(performance.now() - startTime);
    clearTimeout(timeoutHandle);

    if (!response.ok) {
      status = "error";
      errorMessage = `Prometheus query failed (${response.status})`;
    } else {
      const data = await response.json();
      value = parsePrometheusValue(data);
      if (value === null) {
        status = "error";
        errorMessage = "PromQL returned no data";
      }
    }
  } catch (error) {
    fetchDurationMs = Math.round(performance.now() - startTime);
    status = "error";
    errorMessage = error instanceof Error ? error.message : "Unknown PromQL error";
  }

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

  const thresholds = promConfig.thresholds as
    | {
        degraded?: number;
        down?: number;
        comparison?: "gte" | "lte";
        normalizePercent?: boolean;
      }
    | undefined;

  if (status === "success") {
    const sliStatus = evaluateSliStatus(
      value,
      thresholds,
      sloTargetPercent
    );
    status = sliStatus;
  }

  const now = new Date();
  const resultId = nanoid();

  await db.insert(checkResults).values({
    id: resultId,
    monitorId,
    region,
    status,
    responseTimeMs: fetchDurationMs,
    errorMessage,
    metadata: {
      promql: {
        query: queryString,
        lookbackSeconds,
        stepSeconds,
      },
      value,
    },
    createdAt: now,
  });

  await linkCheckToActiveIncident(resultId, monitorId, status);

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
      responseTimeMs: fetchDurationMs,
      value,
      timestamp: now.toISOString(),
    },
  });

  await evaluateAlerts({
    monitorId,
    organizationId,
    checkResultId: resultId,
    checkStatus: status,
    errorMessage,
    responseTimeMs: fetchDurationMs,
  });

  return {
    status,
    responseTimeMs: fetchDurationMs,
  };
}
