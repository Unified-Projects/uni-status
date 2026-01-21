/**
 * Worker Integration Helpers
 *
 * Utilities for testing end-to-end worker check execution,
 * including triggering checks and waiting for results.
 */

import { Client } from "pg";
import { TestContext } from "./context";
import { sleep } from "./services";

const API_BASE_URL = process.env.API_BASE_URL ?? "http://api:3001";
const DEFAULT_DB_URL =
  "postgresql://uni_status:uni_status_dev@postgres:5432/uni_status?sslmode=disable";

export type CheckResult = {
  id: string;
  monitorId: string;
  region: string;
  status: "success" | "degraded" | "failure" | "timeout" | "error";
  responseTimeMs: number | null;
  statusCode: number | null;
  dnsMs: number | null;
  tcpMs: number | null;
  tlsMs: number | null;
  ttfbMs: number | null;
  transferMs: number | null;
  responseSize: number | null;
  errorMessage: string | null;
  errorCode: string | null;
  headers: Record<string, string> | null;
  certificateInfo: CertificateInfo | null;
  pagespeedScores: PagespeedScores | null;
  webVitals: WebVitals | null;
  emailAuthDetails: EmailAuthDetails | null;
  securityHeaders: SecurityHeaders | null;
  metadata: Record<string, unknown> | null;
  incidentId: string | null;
  createdAt: Date;
};

export type CertificateInfo = {
  issuer?: string;
  subject?: string;
  validFrom?: string;
  validTo?: string;
  daysUntilExpiry?: number;
  serialNumber?: string;
  fingerprint?: string;
};

export type PagespeedScores = {
  performance?: number;
  accessibility?: number;
  bestPractices?: number;
  seo?: number;
};

export type WebVitals = {
  lcp?: number;
  fid?: number;
  inp?: number;
  cls?: number;
  fcp?: number;
  ttfb?: number;
  si?: number;
  tbt?: number;
};

export type EmailAuthDetails = {
  domain?: string;
  spf?: { valid: boolean; record?: string };
  dkim?: { valid: boolean; selectors?: string[] };
  dmarc?: { valid: boolean; policy?: string };
  overallScore?: number;
};

export type SecurityHeaders = {
  overallScore?: number;
  grade?: string;
  headers?: Record<string, { present: boolean; value?: string }>;
};

export type HeartbeatPing = {
  id: string;
  monitorId: string;
  status: "start" | "complete" | "fail";
  durationMs: number | null;
  exitCode: number | null;
  metadata: Record<string, unknown> | null;
  createdAt: Date;
};

export type MonitorStatus = "active" | "degraded" | "down" | "paused" | "pending";

/**
 * Get the latest check result for a monitor
 */
export async function getLatestCheckResult(
  monitorId: string
): Promise<CheckResult | null> {
  const client = new Client({
    connectionString: process.env.DATABASE_URL ?? DEFAULT_DB_URL,
  });
  await client.connect();

  const result = await client.query<CheckResult>(
    `SELECT
      id,
      monitor_id as "monitorId",
      region,
      status,
      response_time_ms as "responseTimeMs",
      status_code as "statusCode",
      dns_ms as "dnsMs",
      tcp_ms as "tcpMs",
      tls_ms as "tlsMs",
      ttfb_ms as "ttfbMs",
      transfer_ms as "transferMs",
      response_size as "responseSize",
      error_message as "errorMessage",
      error_code as "errorCode",
      headers,
      certificate_info as "certificateInfo",
      pagespeed_scores as "pagespeedScores",
      web_vitals as "webVitals",
      email_auth_details as "emailAuthDetails",
      security_headers as "securityHeaders",
      metadata,
      incident_id as "incidentId",
      created_at as "createdAt"
    FROM check_results
    WHERE monitor_id = $1
    ORDER BY created_at DESC
    LIMIT 1`,
    [monitorId]
  );

  await client.end();
  return result.rows[0] || null;
}

/**
 * Get all check results for a monitor after a specific timestamp
 */
export async function getCheckResultsAfter(
  monitorId: string,
  afterTimestamp: Date
): Promise<CheckResult[]> {
  const client = new Client({
    connectionString: process.env.DATABASE_URL ?? DEFAULT_DB_URL,
  });
  await client.connect();

  const result = await client.query<CheckResult>(
    `SELECT
      id,
      monitor_id as "monitorId",
      region,
      status,
      response_time_ms as "responseTimeMs",
      status_code as "statusCode",
      dns_ms as "dnsMs",
      tcp_ms as "tcpMs",
      tls_ms as "tlsMs",
      ttfb_ms as "ttfbMs",
      transfer_ms as "transferMs",
      response_size as "responseSize",
      error_message as "errorMessage",
      error_code as "errorCode",
      headers,
      certificate_info as "certificateInfo",
      pagespeed_scores as "pagespeedScores",
      web_vitals as "webVitals",
      email_auth_details as "emailAuthDetails",
      security_headers as "securityHeaders",
      metadata,
      incident_id as "incidentId",
      created_at as "createdAt"
    FROM check_results
    WHERE monitor_id = $1 AND created_at > $2
    ORDER BY created_at DESC`,
    [monitorId, afterTimestamp.toISOString()]
  );

  await client.end();
  return result.rows;
}

/**
 * Wait for a check result to appear after a specific timestamp
 * Uses exponential backoff for polling
 */
export async function waitForCheckResult(
  monitorId: string,
  options?: {
    timeoutMs?: number;
    afterTimestamp?: Date;
    expectedStatus?: CheckResult["status"];
  }
): Promise<CheckResult> {
  const { timeoutMs = 30000, afterTimestamp, expectedStatus } = options ?? {};
  const deadline = Date.now() + timeoutMs;
  let delay = 100;
  const maxDelay = 2000;

  while (Date.now() < deadline) {
    const result = afterTimestamp
      ? (await getCheckResultsAfter(monitorId, afterTimestamp))[0]
      : await getLatestCheckResult(monitorId);

    if (result) {
      if (!expectedStatus || result.status === expectedStatus) {
        return result;
      }
    }

    await sleep(delay);
    delay = Math.min(delay * 2, maxDelay);
  }

  throw new Error(
    `Timeout waiting for check result for monitor ${monitorId} after ${timeoutMs}ms`
  );
}

/**
 * Trigger an immediate check via API
 */
export async function triggerImmediateCheck(
  ctx: TestContext,
  monitorId: string
): Promise<{ success: boolean; message?: string }> {
  const response = await fetch(
    `${API_BASE_URL}/api/v1/monitors/${monitorId}/check`,
    {
      method: "POST",
      headers: ctx.headers,
    }
  );

  const body = await response.json();
  return {
    success: response.ok && body.success,
    message: body.error?.message,
  };
}

/**
 * Trigger an immediate check and wait for the result
 */
export async function triggerAndWaitForCheck(
  ctx: TestContext,
  monitorId: string,
  options?: {
    timeoutMs?: number;
    expectedStatus?: CheckResult["status"];
  }
): Promise<CheckResult> {
  const beforeTrigger = new Date();

  const triggerResult = await triggerImmediateCheck(ctx, monitorId);
  if (!triggerResult.success) {
    throw new Error(`Failed to trigger check: ${triggerResult.message}`);
  }

  return waitForCheckResult(monitorId, {
    timeoutMs: options?.timeoutMs ?? 30000,
    afterTimestamp: beforeTrigger,
    expectedStatus: options?.expectedStatus,
  });
}

/**
 * Get the current status of a monitor
 */
export async function getMonitorStatus(
  monitorId: string
): Promise<MonitorStatus | null> {
  const client = new Client({
    connectionString: process.env.DATABASE_URL ?? DEFAULT_DB_URL,
  });
  await client.connect();

  const result = await client.query<{ status: MonitorStatus }>(
    `SELECT status FROM monitors WHERE id = $1`,
    [monitorId]
  );

  await client.end();
  return result.rows[0]?.status ?? null;
}

/**
 * Wait for a monitor's status to change to the expected value
 */
export async function waitForMonitorStatus(
  monitorId: string,
  expectedStatus: MonitorStatus,
  options?: { timeoutMs?: number }
): Promise<void> {
  const { timeoutMs = 30000 } = options ?? {};
  const deadline = Date.now() + timeoutMs;
  let delay = 100;
  const maxDelay = 2000;

  while (Date.now() < deadline) {
    const status = await getMonitorStatus(monitorId);
    if (status === expectedStatus) {
      return;
    }

    await sleep(delay);
    delay = Math.min(delay * 2, maxDelay);
  }

  throw new Error(
    `Timeout waiting for monitor ${monitorId} to reach status ${expectedStatus} after ${timeoutMs}ms`
  );
}

/**
 * Get heartbeat pings for a monitor
 */
export async function getHeartbeatPings(
  monitorId: string,
  options?: { limit?: number; afterTimestamp?: Date }
): Promise<HeartbeatPing[]> {
  const { limit = 10, afterTimestamp } = options ?? {};
  const client = new Client({
    connectionString: process.env.DATABASE_URL ?? DEFAULT_DB_URL,
  });
  await client.connect();

  let query = `
    SELECT
      id,
      monitor_id as "monitorId",
      status,
      duration_ms as "durationMs",
      exit_code as "exitCode",
      metadata,
      created_at as "createdAt"
    FROM heartbeat_pings
    WHERE monitor_id = $1
  `;
  const params: (string | number)[] = [monitorId];

  if (afterTimestamp) {
    query += ` AND created_at > $2`;
    params.push(afterTimestamp.toISOString());
  }

  query += ` ORDER BY created_at DESC LIMIT $${params.length + 1}`;
  params.push(limit);

  const result = await client.query<HeartbeatPing>(query, params);
  await client.end();
  return result.rows;
}

/**
 * Get the latest heartbeat ping for a monitor
 */
export async function getLatestHeartbeatPing(
  monitorId: string
): Promise<HeartbeatPing | null> {
  const pings = await getHeartbeatPings(monitorId, { limit: 1 });
  return pings[0] || null;
}

/**
 * Wait for a heartbeat ping to appear
 */
export async function waitForHeartbeatPing(
  monitorId: string,
  options?: {
    timeoutMs?: number;
    afterTimestamp?: Date;
    expectedStatus?: HeartbeatPing["status"];
  }
): Promise<HeartbeatPing> {
  const { timeoutMs = 15000, afterTimestamp, expectedStatus } = options ?? {};
  const deadline = Date.now() + timeoutMs;
  let delay = 100;
  const maxDelay = 1000;

  while (Date.now() < deadline) {
    const pings = await getHeartbeatPings(monitorId, {
      limit: 1,
      afterTimestamp,
    });

    if (pings.length > 0) {
      const ping = pings[0];
      if (!expectedStatus || ping.status === expectedStatus) {
        return ping;
      }
    }

    await sleep(delay);
    delay = Math.min(delay * 2, maxDelay);
  }

  throw new Error(
    `Timeout waiting for heartbeat ping for monitor ${monitorId} after ${timeoutMs}ms`
  );
}

/**
 * Force the scheduler to mark a monitor as due for checking
 * by setting nextCheckAt to the past
 */
export async function forceMonitorDue(monitorId: string): Promise<void> {
  const client = new Client({
    connectionString: process.env.DATABASE_URL ?? DEFAULT_DB_URL,
  });
  await client.connect();

  await client.query(
    `UPDATE monitors
     SET next_check_at = NOW() - INTERVAL '1 minute',
         paused = false
     WHERE id = $1`,
    [monitorId]
  );

  await client.end();
}

/**
 * Get check result count for a monitor
 */
export async function getCheckResultCount(
  monitorId: string,
  options?: { afterTimestamp?: Date; status?: CheckResult["status"] }
): Promise<number> {
  const { afterTimestamp, status } = options ?? {};
  const client = new Client({
    connectionString: process.env.DATABASE_URL ?? DEFAULT_DB_URL,
  });
  await client.connect();

  let query = `SELECT COUNT(*) as count FROM check_results WHERE monitor_id = $1`;
  const params: (string | Date)[] = [monitorId];

  if (afterTimestamp) {
    query += ` AND created_at > $${params.length + 1}`;
    params.push(afterTimestamp);
  }

  if (status) {
    query += ` AND status = $${params.length + 1}`;
    params.push(status);
  }

  const result = await client.query<{ count: string }>(query, params);
  await client.end();
  return parseInt(result.rows[0].count, 10);
}

/**
 * Clear all check results for a monitor
 * Useful for test isolation
 */
export async function clearCheckResults(monitorId: string): Promise<void> {
  const client = new Client({
    connectionString: process.env.DATABASE_URL ?? DEFAULT_DB_URL,
  });
  await client.connect();

  await client.query(`DELETE FROM check_results WHERE monitor_id = $1`, [
    monitorId,
  ]);

  await client.end();
}

/**
 * Clear all heartbeat pings for a monitor
 */
export async function clearHeartbeatPings(monitorId: string): Promise<void> {
  const client = new Client({
    connectionString: process.env.DATABASE_URL ?? DEFAULT_DB_URL,
  });
  await client.connect();

  await client.query(`DELETE FROM heartbeat_pings WHERE monitor_id = $1`, [
    monitorId,
  ]);

  await client.end();
}
