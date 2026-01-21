import { Client } from "pg";
import { randomUUID, randomBytes, createHash } from "crypto";

const DEFAULT_DB_URL =
  "postgresql://uni_status:uni_status_dev@postgres:5432/uni_status?sslmode=disable";

// Self-hosted mode types
export type SignupMode = "invite_only" | "domain_auto_join" | "open_with_approval";
export type PendingApprovalStatus = "pending" | "approved" | "rejected";

type CheckResultInput = {
  status: "success" | "degraded" | "failure" | "timeout" | "error";
  responseTimeMs?: number;
  statusCode?: number;
  region?: string;
  createdAt?: Date;
  metadata?: Record<string, unknown>;
  certificateInfo?: {
    issuer?: string;
    subject?: string;
    validFrom?: string;
    validTo?: string;
    daysUntilExpiry?: number;
  };
  headers?: Record<string, string>;
  incidentId?: string;
};

/**
 * Insert check results for a monitor
 * Supports two call signatures:
 * - insertCheckResults(monitorId, entries)
 * - insertCheckResults(ctx, monitorId, entries)
 */
export async function insertCheckResults(
  ctxOrMonitorId: { organizationId: string } | string,
  monitorIdOrEntries: string | CheckResultInput[],
  entriesArg?: CheckResultInput[]
) {
  let monitorId: string;
  let entries: CheckResultInput[];

  if (typeof ctxOrMonitorId === "object") {
    // New signature: (ctx, monitorId, entries)
    monitorId = monitorIdOrEntries as string;
    entries = entriesArg!;
  } else {
    // Old signature: (monitorId, entries)
    monitorId = ctxOrMonitorId;
    entries = monitorIdOrEntries as CheckResultInput[];
  }

  const client = new Client({
    connectionString: process.env.DATABASE_URL ?? DEFAULT_DB_URL,
  });
  await client.connect();
  const now = new Date();

  for (const entry of entries) {
    await client.query(
      `INSERT INTO check_results
        (id, monitor_id, region, status, response_time_ms, status_code, headers, certificate_info, metadata, incident_id, created_at)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
      [
        randomUUID(),
        monitorId,
        entry.region ?? "uk",
        entry.status,
        entry.responseTimeMs ?? 200,
        entry.statusCode ?? 200,
        entry.headers ?? null,
        entry.certificateInfo ?? null,
        entry.metadata ?? null,
        entry.incidentId ?? null,
        entry.createdAt ?? now,
      ]
    );
  }

  await client.end();
}

export async function getSubscriberByEmail(slug: string, email: string) {
  const client = new Client({
    connectionString: process.env.DATABASE_URL ?? DEFAULT_DB_URL,
  });
  await client.connect();

  const result = await client.query<{
    id: string;
    verification_token: string | null;
    unsubscribe_token: string | null;
    verified: boolean;
  }>(
    `SELECT s.id, s.verification_token, s.unsubscribe_token, s.verified
     FROM subscribers s
     JOIN status_pages sp ON sp.id = s.status_page_id
     WHERE sp.slug = $1 AND s.email = $2`,
    [slug, email.toLowerCase()]
  );

  await client.end();
  return result.rows[0] || null;
}

export async function insertActiveProbe(
  organizationId: string,
  region = "uk"
): Promise<{ id: string; token: string }> {
  const client = new Client({
    connectionString: process.env.DATABASE_URL ?? DEFAULT_DB_URL,
  });
  await client.connect();

  const id = randomUUID();
  const token = `probe_${randomBytes(12).toString("hex")}`;
  const prefix = token.slice(0, 8);
  // Hash the token for storage (API expects SHA256 hash)
  const tokenHash = createHash("sha256").update(token).digest("hex");
  const now = new Date().toISOString();

  await client.query(
    `INSERT INTO probes
      (id, organization_id, name, description, region, auth_token, auth_token_prefix, status, version, last_heartbeat_at, created_at, updated_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7, 'active', '1.0.0', $8, $9, $9)`,
    [
      id,
      organizationId,
      "Test Probe",
      "Seeded probe",
      region,
      tokenHash,
      prefix,
      now,
      now,
    ]
  );

  await client.end();
  return { id, token };
}

export async function insertPendingProbeJob(
  probeId: string,
  monitorId: string,
  options?: { url?: string; type?: string }
): Promise<string> {
  const client = new Client({
    connectionString: process.env.DATABASE_URL ?? DEFAULT_DB_URL,
  });
  await client.connect();

  const jobId = randomUUID();
  const expiresAt = new Date(Date.now() + 30 * 60 * 1000).toISOString();

  await client.query(
    `INSERT INTO probe_pending_jobs (id, probe_id, monitor_id, job_data, expires_at)
     VALUES ($1, $2, $3, $4, $5)`,
    [
      jobId,
      probeId,
      monitorId,
      JSON.stringify({
        monitorId,
        url: options?.url ?? "https://example.com",
        type: options?.type ?? "https",
        timeoutMs: 5000,
      }),
      expiresAt,
    ]
  );

  await client.end();
  return jobId;
}

/**
 * Set a monitor's status
 * Supports two call signatures:
 * - setMonitorStatus(monitorId, status)
 * - setMonitorStatus(ctx, monitorId, status)
 */
export async function setMonitorStatus(
  ctxOrMonitorId: { organizationId: string } | string,
  monitorIdOrStatus: string,
  statusArg?: "active" | "degraded" | "down" | "paused" | "pending"
) {
  let monitorId: string;
  let status: "active" | "degraded" | "down" | "paused" | "pending";

  if (typeof ctxOrMonitorId === "object") {
    // New signature: (ctx, monitorId, status)
    monitorId = monitorIdOrStatus;
    status = statusArg!;
  } else {
    // Old signature: (monitorId, status)
    monitorId = ctxOrMonitorId;
    status = monitorIdOrStatus as "active" | "degraded" | "down" | "paused" | "pending";
  }

  const client = new Client({
    connectionString: process.env.DATABASE_URL ?? DEFAULT_DB_URL,
  });
  await client.connect();
  await client.query(
    `UPDATE monitors SET status = $2, updated_at = NOW() WHERE id = $1`,
    [monitorId, status]
  );
  await client.end();
}

type DailyAggregateParams = {
  monitorId: string;
  date: Date;
  successCount: number;
  degradedCount: number;
  failureCount: number;
  totalCount: number;
  uptimePercentage: number | null;
};

/**
 * Insert a daily aggregate
 * Supports two call signatures:
 * - insertDailyAggregate(params)
 * - insertDailyAggregate(ctx, params)
 */
export async function insertDailyAggregate(
  ctxOrParams: { organizationId: string } | DailyAggregateParams,
  paramsArg?: DailyAggregateParams
) {
  let params: DailyAggregateParams;

  if (paramsArg !== undefined) {
    // New signature: (ctx, params)
    params = paramsArg;
  } else {
    // Old signature: (params)
    params = ctxOrParams as DailyAggregateParams;
  }

  const client = new Client({
    connectionString: process.env.DATABASE_URL ?? DEFAULT_DB_URL,
  });
  await client.connect();
  await client.query(
    `INSERT INTO check_results_daily
      (id, monitor_id, region, date, success_count, degraded_count, failure_count, total_count, uptime_percentage, created_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW())`,
    [
      randomUUID(),
      params.monitorId,
      "uk",
      params.date,
      params.successCount,
      params.degradedCount,
      params.failureCount,
      params.totalCount,
      params.uptimePercentage,
    ]
  );
  await client.end();
}

/**
 * Insert a heartbeat ping for a monitor
 */
export async function insertHeartbeatPing(
  monitorId: string,
  params: {
    status: "start" | "complete" | "fail";
    durationMs?: number;
    exitCode?: number;
    metadata?: Record<string, unknown>;
    createdAt?: Date;
  }
): Promise<string> {
  const client = new Client({
    connectionString: process.env.DATABASE_URL ?? DEFAULT_DB_URL,
  });
  await client.connect();

  const id = randomUUID();
  const now = new Date();

  await client.query(
    `INSERT INTO heartbeat_pings
      (id, monitor_id, status, duration_ms, exit_code, metadata, created_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [
      id,
      monitorId,
      params.status,
      params.durationMs ?? null,
      params.exitCode ?? null,
      params.metadata ? JSON.stringify(params.metadata) : null,
      params.createdAt ?? now,
    ]
  );

  await client.end();
  return id;
}

/**
 * Insert a check result with all timing fields
 */
export type FullCheckResultInput = {
  status: "success" | "degraded" | "failure" | "timeout" | "error";
  region?: string;
  responseTimeMs?: number;
  statusCode?: number;
  dnsMs?: number;
  tcpMs?: number;
  tlsMs?: number;
  ttfbMs?: number;
  transferMs?: number;
  responseSize?: number;
  errorMessage?: string;
  errorCode?: string;
  headers?: Record<string, string>;
  certificateInfo?: {
    issuer?: string;
    subject?: string;
    validFrom?: string;
    validTo?: string;
    daysUntilExpiry?: number;
    serialNumber?: string;
    fingerprint?: string;
  };
  pagespeedScores?: {
    performance?: number;
    accessibility?: number;
    bestPractices?: number;
    seo?: number;
  };
  webVitals?: {
    lcp?: number;
    fid?: number;
    inp?: number;
    cls?: number;
    fcp?: number;
    ttfb?: number;
    si?: number;
    tbt?: number;
  };
  emailAuthDetails?: {
    domain?: string;
    spf?: { valid: boolean; record?: string };
    dkim?: { valid: boolean; selectors?: string[] };
    dmarc?: { valid: boolean; policy?: string };
    overallScore?: number;
  };
  securityHeaders?: {
    overallScore?: number;
    grade?: string;
    headers?: Record<string, { present: boolean; value?: string }>;
  };
  metadata?: Record<string, unknown>;
  incidentId?: string;
  createdAt?: Date;
};

/**
 * Insert a check result with all timing fields
 * Supports two call signatures:
 * - insertCheckResultFull(monitorId, params)
 * - insertCheckResultFull(ctx, monitorId, params)
 */
export async function insertCheckResultFull(
  ctxOrMonitorId: { organizationId: string } | string,
  monitorIdOrParams: string | FullCheckResultInput,
  paramsArg?: FullCheckResultInput
): Promise<string> {
  let monitorId: string;
  let params: FullCheckResultInput;

  if (typeof ctxOrMonitorId === "object") {
    // New signature: (ctx, monitorId, params)
    monitorId = monitorIdOrParams as string;
    params = paramsArg!;
  } else {
    // Old signature: (monitorId, params)
    monitorId = ctxOrMonitorId;
    params = monitorIdOrParams as FullCheckResultInput;
  }

  const client = new Client({
    connectionString: process.env.DATABASE_URL ?? DEFAULT_DB_URL,
  });
  await client.connect();

  const id = randomUUID();
  const now = new Date();

  await client.query(
    `INSERT INTO check_results
      (id, monitor_id, region, status, response_time_ms, status_code,
       dns_ms, tcp_ms, tls_ms, ttfb_ms, transfer_ms, response_size,
       error_message, error_code, headers, certificate_info,
       pagespeed_scores, web_vitals, email_auth_details, security_headers,
       metadata, incident_id, created_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23)`,
    [
      id,
      monitorId,
      params.region ?? "uk",
      params.status,
      params.responseTimeMs ?? null,
      params.statusCode ?? null,
      params.dnsMs ?? null,
      params.tcpMs ?? null,
      params.tlsMs ?? null,
      params.ttfbMs ?? null,
      params.transferMs ?? null,
      params.responseSize ?? null,
      params.errorMessage ?? null,
      params.errorCode ?? null,
      params.headers ? JSON.stringify(params.headers) : null,
      params.certificateInfo ? JSON.stringify(params.certificateInfo) : null,
      params.pagespeedScores ? JSON.stringify(params.pagespeedScores) : null,
      params.webVitals ? JSON.stringify(params.webVitals) : null,
      params.emailAuthDetails ? JSON.stringify(params.emailAuthDetails) : null,
      params.securityHeaders ? JSON.stringify(params.securityHeaders) : null,
      params.metadata ? JSON.stringify(params.metadata) : null,
      params.incidentId ?? null,
      params.createdAt ?? now,
    ]
  );

  await client.end();
  return id;
}

/**
 * Insert an hourly aggregate record
 */
export async function insertHourlyAggregate(params: {
  monitorId: string;
  hour: Date;
  region?: string;
  successCount: number;
  degradedCount: number;
  failureCount: number;
  totalCount: number;
  avgResponseTimeMs?: number;
  minResponseTimeMs?: number;
  maxResponseTimeMs?: number;
  p50ResponseTimeMs?: number;
  p75ResponseTimeMs?: number;
  p90ResponseTimeMs?: number;
  p95ResponseTimeMs?: number;
  p99ResponseTimeMs?: number;
  uptimePercentage: number | null;
}) {
  const client = new Client({
    connectionString: process.env.DATABASE_URL ?? DEFAULT_DB_URL,
  });
  await client.connect();

  await client.query(
    `INSERT INTO check_results_hourly
      (id, monitor_id, region, hour, success_count, degraded_count, failure_count, total_count,
       avg_response_time_ms, min_response_time_ms, max_response_time_ms,
       p50_response_time_ms, p75_response_time_ms, p90_response_time_ms, p95_response_time_ms, p99_response_time_ms,
       uptime_percentage, created_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, NOW())`,
    [
      randomUUID(),
      params.monitorId,
      params.region ?? "uk",
      params.hour,
      params.successCount,
      params.degradedCount,
      params.failureCount,
      params.totalCount,
      params.avgResponseTimeMs ?? null,
      params.minResponseTimeMs ?? null,
      params.maxResponseTimeMs ?? null,
      params.p50ResponseTimeMs ?? null,
      params.p75ResponseTimeMs ?? null,
      params.p90ResponseTimeMs ?? null,
      params.p95ResponseTimeMs ?? null,
      params.p99ResponseTimeMs ?? null,
      params.uptimePercentage,
    ]
  );
  await client.end();
}

/**
 * Create an incident
 * Supports two call signatures:
 * - insertIncident(organizationId, userId, params)
 * - insertIncident(organizationId, { userId, ...params })
 */
export async function insertIncident(
  organizationId: string,
  userIdOrParams: string | {
    userId?: string;
    title: string;
    description?: string;
    severity?: "minor" | "major" | "critical";
    status?: "investigating" | "identified" | "monitoring" | "resolved";
    affectedMonitorIds?: string[];
    createdAt?: Date;
    resolvedAt?: Date;
  },
  paramsArg?: {
    title: string;
    description?: string;
    severity?: "minor" | "major" | "critical";
    status?: "investigating" | "identified" | "monitoring" | "resolved";
    affectedMonitorIds?: string[];
    createdAt?: Date;
    resolvedAt?: Date;
  }
): Promise<{ id: string }> {
  let userId: string | undefined;
  let params: {
    title: string;
    description?: string;
    severity?: "minor" | "major" | "critical";
    status?: "investigating" | "identified" | "monitoring" | "resolved";
    affectedMonitorIds?: string[];
    createdAt?: Date;
    resolvedAt?: Date;
  };

  if (typeof userIdOrParams === "string") {
    // Old signature: (organizationId, userId, params)
    userId = userIdOrParams;
    params = paramsArg!;
  } else {
    // New signature: (organizationId, { userId, ...params })
    userId = userIdOrParams.userId;
    params = userIdOrParams;
  }

  const client = new Client({
    connectionString: process.env.DATABASE_URL ?? DEFAULT_DB_URL,
  });
  await client.connect();

  const id = randomUUID();
  const now = new Date();

  try {
    await client.query("BEGIN");

    // If no userId provided, create a temporary user to satisfy foreign key constraint
    if (!userId) {
      userId = randomUUID();
      await client.query(
        `INSERT INTO "user" (id, email, name, "emailVerified", "createdAt", "updatedAt")
         VALUES ($1, $2, $3, true, $4, $5)`,
        [userId, `incident-creator-${userId.slice(0, 8)}@test.example.com`, `Incident Creator ${userId.slice(0, 8)}`, now, now]
      );
    }

    await client.query(
      `INSERT INTO incidents
        (id, organization_id, title, message, severity, status, created_by, started_at, created_at, updated_at, resolved_at, affected_monitors)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
      [
        id,
        organizationId,
        params.title,
        params.description ?? "",
        params.severity ?? "minor",
        params.status ?? "investigating",
        userId,
        params.createdAt ?? now,
        params.createdAt ?? now,
        now,
        params.resolvedAt ?? null,
        JSON.stringify(params.affectedMonitorIds ?? []),
      ]
    );

    // Link affected monitors
    if (params.affectedMonitorIds && params.affectedMonitorIds.length > 0) {
      for (const monitorId of params.affectedMonitorIds) {
        await client.query(
          `INSERT INTO incident_monitors (id, incident_id, monitor_id, linked_at)
           VALUES ($1, $2, $3, $4)`,
          [randomUUID(), id, monitorId, now]
        );
      }
    }

    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    await client.end();
  }

  return { id };
}

/**
 * Create an incident update
 */
export async function insertIncidentUpdate(
  incidentId: string,
  params: {
    status: "investigating" | "identified" | "monitoring" | "resolved";
    message: string;
    createdBy?: string;
    createdAt?: Date;
  }
): Promise<string> {
  const client = new Client({
    connectionString: process.env.DATABASE_URL ?? DEFAULT_DB_URL,
  });
  await client.connect();

  const id = randomUUID();
  const now = new Date();

  // If no createdBy provided, create a temporary user
  let createdBy = params.createdBy;
  if (!createdBy) {
    createdBy = randomUUID();
    await client.query(
      `INSERT INTO "user" (id, email, name, "emailVerified", "createdAt", "updatedAt")
       VALUES ($1, $2, $3, true, $4, $5)`,
      [createdBy, `temp-${createdBy.slice(0, 8)}@example.com`, `Temp User ${createdBy.slice(0, 8)}`, now, now]
    );
  }

  await client.query(
    `INSERT INTO incident_updates
      (id, incident_id, status, message, created_by, created_at)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [id, incidentId, params.status, params.message, createdBy, params.createdAt ?? now]
  );

  await client.end();
  return id;
}

/**
 * Create a status page
 */
export async function insertStatusPage(
  organizationId: string,
  params: {
    name: string;
    slug: string;
    description?: string;
    published?: boolean;
    password?: string;
  }
): Promise<string> {
  const client = new Client({
    connectionString: process.env.DATABASE_URL ?? DEFAULT_DB_URL,
  });
  await client.connect();

  const id = randomUUID();
  const now = new Date();

  await client.query(
    `INSERT INTO status_pages
      (id, organization_id, name, slug, published, password_hash, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [
      id,
      organizationId,
      params.name,
      params.slug,
      params.published ?? true,
      params.password ?? null,
      now,
      now,
    ]
  );

  await client.end();
  return id;
}

/**
 * Link a monitor to a status page
 * Supports two call signatures:
 * - linkMonitorToStatusPage(statusPageId, monitorId, params?)
 * - linkMonitorToStatusPage(ctx, statusPageId, monitorId, params?)
 */
export async function linkMonitorToStatusPage(
  ctxOrStatusPageId: { organizationId: string } | string,
  statusPageIdOrMonitorId: string,
  monitorIdOrParams?: string | {
    displayName?: string;
    displayOrder?: number;
    order?: number;
    group?: string;
    showResponseTime?: boolean;
    showUptime?: boolean;
  },
  paramsArg?: {
    displayName?: string;
    displayOrder?: number;
    order?: number;
    group?: string;
    showResponseTime?: boolean;
    showUptime?: boolean;
  }
): Promise<void> {
  // Determine which signature was used
  let statusPageId: string;
  let monitorId: string;
  let params: typeof paramsArg | undefined;

  if (typeof ctxOrStatusPageId === "object") {
    // New signature: (ctx, statusPageId, monitorId, params?)
    statusPageId = statusPageIdOrMonitorId;
    monitorId = monitorIdOrParams as string;
    params = paramsArg;
  } else {
    // Old signature: (statusPageId, monitorId, params?)
    statusPageId = ctxOrStatusPageId;
    monitorId = statusPageIdOrMonitorId;
    params = monitorIdOrParams as typeof paramsArg;
  }

  const client = new Client({
    connectionString: process.env.DATABASE_URL ?? DEFAULT_DB_URL,
  });
  await client.connect();

  const now = new Date();

  await client.query(
    `INSERT INTO status_page_monitors
      (id, status_page_id, monitor_id, display_name, "order", show_response_time, created_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [
      randomUUID(),
      statusPageId,
      monitorId,
      params?.displayName ?? params?.group ?? null,
      params?.displayOrder ?? params?.order ?? 0,
      params?.showResponseTime ?? true,
      now,
    ]
  );

  await client.end();
}

/**
 * Get a monitor by ID
 */
export async function getMonitorById(monitorId: string): Promise<{
  id: string;
  organizationId: string;
  name: string;
  url: string;
  type: string;
  status: string;
  heartbeatToken: string | null;
  config: Record<string, unknown>;
} | null> {
  const client = new Client({
    connectionString: process.env.DATABASE_URL ?? DEFAULT_DB_URL,
  });
  await client.connect();

  const result = await client.query<{
    id: string;
    organization_id: string;
    name: string;
    url: string;
    type: string;
    status: string;
    heartbeat_token: string | null;
    config: Record<string, unknown>;
  }>(
    `SELECT id, organization_id, name, url, type, status, heartbeat_token, config
     FROM monitors WHERE id = $1`,
    [monitorId]
  );

  await client.end();

  if (result.rows.length === 0) return null;

  const row = result.rows[0];
  return {
    id: row.id,
    organizationId: row.organization_id,
    name: row.name,
    url: row.url,
    type: row.type,
    status: row.status,
    heartbeatToken: row.heartbeat_token,
    config: row.config,
  };
}

/**
 * Create a subscriber for a status page
 */
export async function insertSubscriber(
  statusPageId: string,
  params: {
    email: string;
    verified?: boolean;
    verificationToken?: string;
    unsubscribeToken?: string;
  }
): Promise<string> {
  const client = new Client({
    connectionString: process.env.DATABASE_URL ?? DEFAULT_DB_URL,
  });
  await client.connect();

  const id = randomUUID();
  const now = new Date();

  await client.query(
    `INSERT INTO subscribers
      (id, status_page_id, email, verified, verification_token, unsubscribe_token, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [
      id,
      statusPageId,
      params.email.toLowerCase(),
      params.verified ?? false,
      params.verificationToken ?? randomBytes(16).toString("hex"),
      params.unsubscribeToken ?? randomBytes(16).toString("hex"),
      now,
      now,
    ]
  );

  await client.end();
  return id;
}

/**
 * Create an API key for testing
 * Supports two signatures:
 * - insertApiKey(organizationId, userId, params)
 * - insertApiKey(organizationId, { userId, ...params })
 */
export async function insertApiKey(
  organizationId: string,
  userIdOrParams: string | { userId: string; name?: string; scopes?: string[]; scope?: string; expiresAt?: Date },
  paramsArg?: {
    name?: string;
    scopes?: string[];
    expiresAt?: Date;
  }
): Promise<{ id: string; key: string }> {
  const client = new Client({
    connectionString: process.env.DATABASE_URL ?? DEFAULT_DB_URL,
  });
  await client.connect();

  let userId: string;
  let params: { name?: string; scopes?: string[]; expiresAt?: Date } | undefined;

  if (typeof userIdOrParams === "string") {
    // New signature: (organizationId, userId, params)
    userId = userIdOrParams;
    params = paramsArg;
  } else {
    // Old signature: (organizationId, { userId, ...params })
    userId = userIdOrParams.userId;
    params = {
      name: userIdOrParams.name,
      scopes: userIdOrParams.scopes || (userIdOrParams.scope ? [userIdOrParams.scope] : undefined),
      expiresAt: userIdOrParams.expiresAt,
    };
  }

  const id = randomUUID();
  const token = `us_${randomBytes(16).toString("hex")}`;
  const keyPrefix = token.slice(0, 8);
  const now = new Date();

  await client.query(
    `INSERT INTO api_keys
      (id, organization_id, name, key_hash, key_prefix, scopes, created_by, expires_at, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
    [
      id,
      organizationId,
      params?.name ?? "test-key",
      token,
      keyPrefix,
      JSON.stringify(params?.scopes ?? ["read", "write"]),
      userId,
      params?.expiresAt ?? null,
      now,
      now,
    ]
  );

  await client.end();
  return { id, key: token, token };
}

/**
 * Create a monitor via API or direct DB insertion
 */
export async function createMonitor(
  ctx: { organizationId: string; headers: Record<string, string>; apiUrl?: string },
  params?: {
    type?: string;
    name?: string;
    url?: string;
    intervalSeconds?: number;
    timeoutMs?: number;
    regions?: string[];
    config?: Record<string, unknown>;
  }
): Promise<string> {
  const API_BASE_URL = process.env.API_BASE_URL ?? "http://api:3001";
  const apiUrl = ctx.apiUrl ?? `${API_BASE_URL}/api/v1`;
  const type = params?.type ?? "http";
  const name = params?.name ?? `Test Monitor ${randomUUID().slice(0, 8)}`;

  // Determine URL based on type
  let url = params?.url;
  if (!url) {
    switch (type) {
      case "heartbeat":
        url = "heartbeat://test";
        break;
      case "tcp":
        url = "tcp://example.com:80";
        break;
      case "ping":
        url = "ping://example.com";
        break;
      case "dns":
        url = "example.com";
        break;
      default:
        url = "https://example.com";
    }
  }

  const response = await fetch(`${apiUrl}/monitors`, {
    method: "POST",
    headers: ctx.headers,
    body: JSON.stringify({
      name,
      url,
      type,
      intervalSeconds: params?.intervalSeconds ?? 60,
      timeoutMs: params?.timeoutMs ?? 30000,
      regions: params?.regions,
      config: params?.config,
    }),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Failed to create monitor: ${response.status} ${body}`);
  }

  const body = await response.json();
  return body.data.id;
}

/**
 * Create a status page via API
 */
export async function createStatusPage(
  ctx: { organizationId: string; headers: Record<string, string>; apiUrl?: string },
  params?: {
    name?: string;
    slug?: string;
    published?: boolean;
    password?: string;
    description?: string;
  }
): Promise<string> {
  const API_BASE_URL = process.env.API_BASE_URL ?? "http://api:3001";
  const apiUrl = ctx.apiUrl ?? `${API_BASE_URL}/api/v1`;
  const slug = params?.slug ?? `status-page-${randomUUID().slice(0, 8).toLowerCase()}`;

  const response = await fetch(`${apiUrl}/status-pages`, {
    method: "POST",
    headers: ctx.headers,
    body: JSON.stringify({
      name: params?.name ?? "Test Status Page",
      slug,
      published: params?.published ?? true,
      password: params?.password,
      description: params?.description,
    }),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Failed to create status page: ${response.status} ${body}`);
  }

  const body = await response.json();
  return body.data.id;
}

/**
 * Create a custom role for testing
 */
export async function insertCustomRole(
  organizationId: string,
  params: {
    name: string;
    permissions: string[];
    description?: string;
    color?: string;
    isSystem?: boolean;
  }
): Promise<{ id: string }> {
  const client = new Client({
    connectionString: process.env.DATABASE_URL ?? DEFAULT_DB_URL,
  });
  await client.connect();

  const id = randomUUID();
  const now = new Date();

  await client.query(
    `INSERT INTO roles
      (id, organization_id, name, description, permissions, is_system, color, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
    [
      id,
      organizationId,
      params.name,
      params.description ?? null,
      JSON.stringify(params.permissions),
      params.isSystem ?? false,
      params.color ?? "#6366f1",
      now,
      now,
    ]
  );

  await client.end();
  return { id };
}

/**
 * Create an organization member with a specific role
 */
export async function insertOrganizationMember(
  organizationId: string,
  params: {
    userId?: string;
    email?: string;
    role: "owner" | "admin" | "member" | "viewer";
    customRoleId?: string;
  }
): Promise<{ id: string; userId: string; token: string }> {
  const client = new Client({
    connectionString: process.env.DATABASE_URL ?? DEFAULT_DB_URL,
  });
  await client.connect();

  let userId = params.userId;

  // Create a new user if userId not provided
  if (!userId) {
    userId = randomUUID();
    const email = params.email ?? `test-${userId.slice(0, 8)}@example.com`;
    const now = new Date();

    await client.query(
      `INSERT INTO "user" (id, email, name, "emailVerified", "createdAt", "updatedAt")
       VALUES ($1, $2, $3, true, $4, $5)`,
      [userId, email, `Test User ${userId.slice(0, 8)}`, now, now]
    );
  }

  // Create the membership
  const memberId = randomUUID();
  const now = new Date();

  await client.query(
    `INSERT INTO organization_members
      (id, organization_id, user_id, role, custom_role_id, joined_at, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [
      memberId,
      organizationId,
      userId,
      params.role,
      params.customRoleId ?? null,
      now,
      now,
      now,
    ]
  );

  // Create an API key for this user
  const token = `us_${randomBytes(16).toString("hex")}`;
  const keyPrefix = token.slice(0, 8);
  const apiKeyId = randomUUID();

  await client.query(
    `INSERT INTO api_keys
      (id, organization_id, name, key_hash, key_prefix, scopes, created_by, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
    [
      apiKeyId,
      organizationId,
      `Test Key for ${params.role}`,
      token,
      keyPrefix,
      JSON.stringify(["read", "write"]),
      userId,
      now,
      now,
    ]
  );

  await client.end();
  return { id: memberId, userId, token };
}

/**
 * Create an SLO target
 */
export async function insertSloTarget(
  organizationId: string,
  monitorId: string,
  params?: {
    name?: string;
    targetPercentage?: number;
    window?: "daily" | "weekly" | "monthly" | "quarterly" | "annually";
    active?: boolean;
  }
): Promise<{ id: string }> {
  const client = new Client({
    connectionString: process.env.DATABASE_URL ?? DEFAULT_DB_URL,
  });
  await client.connect();

  const id = randomUUID();
  const now = new Date();
  const targetPercentage = params?.targetPercentage ?? 99.9;
  const window = params?.window ?? "monthly";

  await client.query(
    `INSERT INTO slo_targets
      (id, organization_id, monitor_id, name, target_percentage, "window", grace_period_minutes, active, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
    [
      id,
      organizationId,
      monitorId,
      params?.name ?? `SLO Target ${id.slice(0, 8)}`,
      targetPercentage.toString(),
      window,
      5,
      params?.active ?? true,
      now,
      now,
    ]
  );

  await client.end();
  return { id };
}


/**
 * Create a deployment webhook
 */
export async function insertDeploymentWebhook(
  organizationId: string,
  params?: {
    name?: string;
    active?: boolean;
  }
): Promise<{ id: string; secret: string }> {
  const client = new Client({
    connectionString: process.env.DATABASE_URL ?? DEFAULT_DB_URL,
  });
  await client.connect();

  const id = randomUUID();
  const secret = randomBytes(16).toString("hex");
  const now = new Date();

  await client.query(
    `INSERT INTO deployment_webhooks
      (id, organization_id, name, secret, active, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [
      id,
      organizationId,
      params?.name ?? `Webhook ${id.slice(0, 8)}`,
      secret,
      params?.active ?? true,
      now,
      now,
    ]
  );

  await client.end();
  return { id, secret };
}

/**
 * Create a deployment event
 */
export async function insertDeploymentEvent(
  organizationId: string,
  params: {
    service: string;
    version?: string;
    status?: string;
    environment?: string;
    webhookId?: string;
    deployedAt?: Date;
  }
): Promise<{ id: string }> {
  const client = new Client({
    connectionString: process.env.DATABASE_URL ?? DEFAULT_DB_URL,
  });
  await client.connect();

  const id = randomUUID();
  const now = new Date();

  await client.query(
    `INSERT INTO deployment_events
      (id, organization_id, webhook_id, service, version, status, environment, deployed_at, created_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
    [
      id,
      organizationId,
      params.webhookId ?? null,
      params.service,
      params.version ?? "1.0.0",
      params.status ?? "completed",
      params.environment ?? "production",
      params.deployedAt ?? now,
      now,
    ]
  );

  await client.end();
  return { id };
}

/**
 * Create an on-call rotation
 */
export async function insertOncallRotation(
  organizationId: string,
  params: {
    name: string;
    participants: string[];
    shiftDurationMinutes?: number;
    timezone?: string;
  }
): Promise<{ id: string }> {
  const client = new Client({
    connectionString: process.env.DATABASE_URL ?? DEFAULT_DB_URL,
  });
  await client.connect();

  const id = randomUUID();
  const now = new Date();

  await client.query(
    `INSERT INTO oncall_rotations
      (id, organization_id, name, timezone, rotation_start, shift_duration_minutes, participants, active, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
    [
      id,
      organizationId,
      params.name,
      params.timezone ?? "UTC",
      now,
      params.shiftDurationMinutes ?? 480,
      JSON.stringify(params.participants),
      true,
      now,
      now,
    ]
  );

  await client.end();
  return { id };
}

/**
 * Create an on-call override
 */
export async function insertOncallOverride(
  rotationId: string,
  params: {
    userId: string;
    startAt: Date;
    endAt: Date;
    reason?: string;
  }
): Promise<{ id: string }> {
  const client = new Client({
    connectionString: process.env.DATABASE_URL ?? DEFAULT_DB_URL,
  });
  await client.connect();

  const id = randomUUID();
  const now = new Date();

  await client.query(
    `INSERT INTO oncall_overrides
      (id, rotation_id, user_id, start_at, end_at, reason, created_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [
      id,
      rotationId,
      params.userId,
      params.startAt,
      params.endAt,
      params.reason ?? null,
      now,
    ]
  );

  await client.end();
  return { id };
}

/**
 * Create an escalation policy
 */
export async function insertEscalationPolicy(
  organizationId: string,
  params: {
    name: string;
    steps?: Array<{
      stepNumber: number;
      channels: string[];
      delayMinutes?: number;
    }>;
  }
): Promise<{ id: string }> {
  const client = new Client({
    connectionString: process.env.DATABASE_URL ?? DEFAULT_DB_URL,
  });
  await client.connect();

  const id = randomUUID();
  const now = new Date();

  await client.query(
    `INSERT INTO escalation_policies
      (id, organization_id, name, ack_timeout_minutes, active, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [
      id,
      organizationId,
      params.name,
      30,
      true,
      now,
      now,
    ]
  );

  // Insert steps if provided
  if (params.steps && params.steps.length > 0) {
    for (const step of params.steps) {
      const stepId = randomUUID();
      await client.query(
        `INSERT INTO escalation_steps
          (id, policy_id, step_number, delay_minutes, channels, notify_on_ack_timeout, skip_if_acknowledged, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [
          stepId,
          id,
          step.stepNumber,
          step.delayMinutes ?? 0,
          JSON.stringify(step.channels),
          true,
          true,
          now,
        ]
      );
    }
  }

  await client.end();
  return { id };
}

/**
 * Create a maintenance window
 */
export async function insertMaintenanceWindow(
  organizationId: string,
  userId: string,
  params: {
    name: string;
    startsAt: Date;
    endsAt: Date;
    affectedMonitors?: string[];
    description?: string;
  }
): Promise<{ id: string }> {
  const client = new Client({
    connectionString: process.env.DATABASE_URL ?? DEFAULT_DB_URL,
  });
  await client.connect();

  const id = randomUUID();
  const now = new Date();

  await client.query(
    `INSERT INTO maintenance_windows
      (id, organization_id, name, description, affected_monitors, starts_at, ends_at, created_by, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
    [
      id,
      organizationId,
      params.name,
      params.description ?? null,
      JSON.stringify(params.affectedMonitors ?? []),
      params.startsAt,
      params.endsAt,
      userId,
      now,
      now,
    ]
  );

  await client.end();
  return { id };
}

/**
 * Create a monitor dependency
 */
export async function insertMonitorDependency(
  monitorId: string,
  upstreamMonitorId: string,
  params?: {
    description?: string;
  }
): Promise<{ id: string }> {
  const client = new Client({
    connectionString: process.env.DATABASE_URL ?? DEFAULT_DB_URL,
  });
  await client.connect();

  const id = randomUUID();
  const now = new Date();

  await client.query(
    `INSERT INTO monitor_dependencies
      (id, downstream_monitor_id, upstream_monitor_id, description, created_at)
     VALUES ($1, $2, $3, $4, $5)`,
    [
      id,
      monitorId,
      upstreamMonitorId,
      params?.description ?? null,
      now,
    ]
  );

  await client.end();
  return { id };
}

/**
 * Create an alert channel
 */
export async function insertAlertChannel(
  organizationId: string,
  params: {
    name: string;
    type: string;
    config?: Record<string, unknown>;
  }
): Promise<{ id: string }> {
  const client = new Client({
    connectionString: process.env.DATABASE_URL ?? DEFAULT_DB_URL,
  });
  await client.connect();

  const id = randomUUID();
  const now = new Date();

  await client.query(
    `INSERT INTO alert_channels
      (id, organization_id, name, type, config, enabled, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [
      id,
      organizationId,
      params.name,
      params.type,
      params.config ? JSON.stringify(params.config) : "{}",
      true,
      now,
      now,
    ]
  );

  await client.end();
  return { id };
}

/**
 * Create an invitation
 */
export async function insertInvitation(
  organizationId: string,
  params: {
    email: string;
    role: "admin" | "member" | "viewer";
    invitedBy: string;
    expiresAt?: Date;
  }
): Promise<{ id: string; token: string }> {
  const client = new Client({
    connectionString: process.env.DATABASE_URL ?? DEFAULT_DB_URL,
  });
  await client.connect();

  const id = randomUUID();
  const token = randomBytes(16).toString("hex");
  const now = new Date();
  const expiresAt = params.expiresAt ?? new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

  await client.query(
    `INSERT INTO organization_invitations
      (id, organization_id, email, role, token, invited_by, expires_at, created_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [
      id,
      organizationId,
      params.email.toLowerCase(),
      params.role,
      token,
      params.invitedBy,
      expiresAt,
      now,
    ]
  );

  await client.end();
  return { id, token };
}

/**
 * Create an organization
 */
export async function insertOrganization(params: {
  name: string;
  slug?: string;
}): Promise<{ id: string }> {
  const client = new Client({
    connectionString: process.env.DATABASE_URL ?? DEFAULT_DB_URL,
  });
  await client.connect();

  const id = randomUUID();
  const slug = params.slug ?? `${params.name.toLowerCase().replace(/\s+/g, "-")}-${id.slice(0, 8)}`;
  const now = new Date();

  await client.query(
    `INSERT INTO organizations (id, name, slug, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5)`,
    [id, params.name, slug, now, now]
  );

   // Seed a generous license so audit/log-gated endpoints are available in integration flows
   const licenseId = randomUUID();
   await client.query(
     `INSERT INTO licenses (
        id, organization_id, keygen_license_id, plan, status, entitlements, valid_from, created_at, updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7, $8, $9)
      ON CONFLICT (organization_id) DO NOTHING`,
     [
       licenseId,
       id,
       `test-license-${licenseId.slice(0, 8)}`,
       "enterprise",
       "active",
       JSON.stringify({
         monitors: -1,
         statusPages: -1,
         teamMembers: -1,
         regions: -1,
         auditLogs: true,
         sso: true,
         customRoles: true,
         slo: true,
         reports: true,
         multiRegion: true,
         oncall: true,
       }),
       now,
       now,
       now,
     ]
   );

  await client.end();
  return { id };
}

/**
 * Create a user
 */
export async function insertUser(params: {
  email: string;
  name: string;
  emailVerified?: boolean;
}): Promise<{ id: string }> {
  const client = new Client({
    connectionString: process.env.DATABASE_URL ?? DEFAULT_DB_URL,
  });
  await client.connect();

  const id = randomUUID();
  const now = new Date();

  // Add random suffix to email to ensure uniqueness
  const uniqueEmail = params.email.includes('+')
    ? params.email
    : params.email.replace('@', `+${id.slice(0, 8)}@`);

  await client.query(
    `INSERT INTO "user" (id, email, name, "emailVerified", "createdAt", "updatedAt")
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [id, uniqueEmail, params.name, params.emailVerified ?? true, now, now]
  );

  await client.end();
  return { id };
}

/**
 * Create an alert policy
 */
export async function insertAlertPolicy(
  organizationId: string,
  params: {
    name: string;
    channelIds: string[];
    conditions: Record<string, unknown>;
    cooldownMinutes?: number;
    enabled?: boolean;
    monitors?: string[];
    description?: string;
  }
): Promise<{ id: string }> {
  const client = new Client({
    connectionString: process.env.DATABASE_URL ?? DEFAULT_DB_URL,
  });
  await client.connect();

  const id = randomUUID();
  const now = new Date();

  // alert_policies table has 'channels' as JSONB array, not separate junction table
  await client.query(
    `INSERT INTO alert_policies
      (id, organization_id, name, description, enabled, conditions, channels, cooldown_minutes, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
    [
      id,
      organizationId,
      params.name,
      params.description ?? null,
      params.enabled ?? true,
      JSON.stringify(params.conditions),
      JSON.stringify(params.channelIds),
      params.cooldownMinutes ?? 15,
      now,
      now,
    ]
  );

  // Link monitors to policy using junction table
  if (params.monitors && params.monitors.length > 0) {
    for (const monitorId of params.monitors) {
      await client.query(
        `INSERT INTO monitor_alert_policies (id, monitor_id, policy_id, created_at)
         VALUES ($1, $2, $3, $4)`,
        [randomUUID(), monitorId, id, now]
      );
    }
  }

  await client.end();
  return { id };
}

/**
 * Create a monitor directly via database
 */
export async function insertMonitor(
  organizationId: string,
  params?: {
    name?: string;
    url?: string;
    method?: string;
    interval?: number;
    active?: boolean;
    createdBy?: string;
  }
): Promise<{ id: string }> {
  const client = new Client({
    connectionString: process.env.DATABASE_URL ?? DEFAULT_DB_URL,
  });
  await client.connect();

  const id = randomUUID();
  const now = new Date();
  const createdBy = params?.createdBy ?? randomUUID();

  await client.query(
    `INSERT INTO monitors
      (id, organization_id, name, url, method, interval_seconds, paused, created_by, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
    [
      id,
      organizationId,
      params?.name ?? "Test Monitor",
      params?.url ?? "https://example.com",
      params?.method ?? "GET",
      params?.interval ?? 60,
      !(params?.active ?? true), // paused is the inverse of active
      createdBy,
      now,
      now,
    ]
  );

  await client.end();
  return { id };
}

/**
 * Self-hosted mode helpers
 */

/**
 * Initialize system settings for self-hosted mode
 */
export async function initializeSystemSettings(params?: {
  setupCompleted?: boolean;
  signupMode?: SignupMode;
  primaryOrganizationId?: string;
}): Promise<void> {
  const client = new Client({
    connectionString: process.env.DATABASE_URL ?? DEFAULT_DB_URL,
  });
  await client.connect();

  const now = new Date();

  // Delete existing settings first (singleton)
  await client.query(`DELETE FROM system_settings WHERE id = 'singleton'`);

  await client.query(
    `INSERT INTO system_settings
      (id, setup_completed, setup_completed_at, primary_organization_id, signup_mode, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [
      "singleton",
      params?.setupCompleted ?? false,
      params?.setupCompleted ? now : null,
      params?.primaryOrganizationId ?? null,
      params?.signupMode ?? "invite_only",
      now,
      now,
    ]
  );

  await client.end();
}

/**
 * Get system settings
 */
export async function getSystemSettings(): Promise<{
  id: string;
  setupCompleted: boolean;
  setupCompletedAt: Date | null;
  primaryOrganizationId: string | null;
  signupMode: SignupMode;
} | null> {
  const client = new Client({
    connectionString: process.env.DATABASE_URL ?? DEFAULT_DB_URL,
  });
  await client.connect();

  const result = await client.query<{
    id: string;
    setup_completed: boolean;
    setup_completed_at: Date | null;
    primary_organization_id: string | null;
    signup_mode: SignupMode;
  }>(
    `SELECT id, setup_completed, setup_completed_at, primary_organization_id, signup_mode
     FROM system_settings WHERE id = 'singleton'`
  );

  await client.end();

  if (result.rows.length === 0) return null;

  const row = result.rows[0];
  return {
    id: row.id,
    setupCompleted: row.setup_completed,
    setupCompletedAt: row.setup_completed_at,
    primaryOrganizationId: row.primary_organization_id,
    signupMode: row.signup_mode,
  };
}

/**
 * Update system settings
 */
export async function updateSystemSettings(params: {
  setupCompleted?: boolean;
  signupMode?: SignupMode;
  primaryOrganizationId?: string;
}): Promise<void> {
  const client = new Client({
    connectionString: process.env.DATABASE_URL ?? DEFAULT_DB_URL,
  });
  await client.connect();

  const updates: string[] = [];
  const values: unknown[] = [];
  let paramIndex = 1;

  if (params.setupCompleted !== undefined) {
    updates.push(`setup_completed = $${paramIndex++}`);
    values.push(params.setupCompleted);
    if (params.setupCompleted) {
      updates.push(`setup_completed_at = $${paramIndex++}`);
      values.push(new Date());
    }
  }

  if (params.signupMode !== undefined) {
    updates.push(`signup_mode = $${paramIndex++}`);
    values.push(params.signupMode);
  }

  if (params.primaryOrganizationId !== undefined) {
    updates.push(`primary_organization_id = $${paramIndex++}`);
    values.push(params.primaryOrganizationId);
  }

  updates.push(`updated_at = $${paramIndex++}`);
  values.push(new Date());

  if (updates.length > 0) {
    await client.query(
      `UPDATE system_settings SET ${updates.join(", ")} WHERE id = 'singleton'`,
      values
    );
  }

  await client.end();
}

/**
 * Create a super admin user
 */
export async function insertSuperAdmin(params: {
  email: string;
  name: string;
}): Promise<{ id: string }> {
  const client = new Client({
    connectionString: process.env.DATABASE_URL ?? DEFAULT_DB_URL,
  });
  await client.connect();

  const id = randomUUID();
  const now = new Date();

  await client.query(
    `INSERT INTO "user" (id, email, name, "emailVerified", "systemRole", "createdAt", "updatedAt")
     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [id, params.email, params.name, true, "super_admin", now, now]
  );

  await client.end();
  return { id };
}

/**
 * Set user's system role
 */
export async function setUserSystemRole(
  userId: string,
  systemRole: "super_admin" | null
): Promise<void> {
  const client = new Client({
    connectionString: process.env.DATABASE_URL ?? DEFAULT_DB_URL,
  });
  await client.connect();

  await client.query(
    `UPDATE "user" SET "systemRole" = $2, "updatedAt" = NOW() WHERE id = $1`,
    [userId, systemRole]
  );

  await client.end();
}

/**
 * Get user's system role
 */
export async function getUserSystemRole(userId: string): Promise<string | null> {
  const client = new Client({
    connectionString: process.env.DATABASE_URL ?? DEFAULT_DB_URL,
  });
  await client.connect();

  const result = await client.query<{ systemRole: string | null }>(
    `SELECT "systemRole" FROM "user" WHERE id = $1`,
    [userId]
  );

  await client.end();

  if (result.rows.length === 0) return null;
  return result.rows[0].systemRole;
}

/**
 * Create a pending approval request
 */
export async function insertPendingApproval(params: {
  userId: string;
  organizationId: string;
  status?: PendingApprovalStatus;
  notes?: string;
}): Promise<{ id: string }> {
  const client = new Client({
    connectionString: process.env.DATABASE_URL ?? DEFAULT_DB_URL,
  });
  await client.connect();

  const id = randomUUID();
  const now = new Date();

  await client.query(
    `INSERT INTO pending_approvals
      (id, user_id, organization_id, status, requested_at, notes)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [
      id,
      params.userId,
      params.organizationId,
      params.status ?? "pending",
      now,
      params.notes ?? null,
    ]
  );

  await client.end();
  return { id };
}

/**
 * Get pending approval by ID
 */
export async function getPendingApproval(approvalId: string): Promise<{
  id: string;
  userId: string;
  organizationId: string;
  status: PendingApprovalStatus;
  requestedAt: Date;
  reviewedBy: string | null;
  reviewedAt: Date | null;
  notes: string | null;
} | null> {
  const client = new Client({
    connectionString: process.env.DATABASE_URL ?? DEFAULT_DB_URL,
  });
  await client.connect();

  const result = await client.query<{
    id: string;
    user_id: string;
    organization_id: string;
    status: PendingApprovalStatus;
    requested_at: Date;
    reviewed_by: string | null;
    reviewed_at: Date | null;
    notes: string | null;
  }>(
    `SELECT id, user_id, organization_id, status, requested_at, reviewed_by, reviewed_at, notes
     FROM pending_approvals WHERE id = $1`,
    [approvalId]
  );

  await client.end();

  if (result.rows.length === 0) return null;

  const row = result.rows[0];
  return {
    id: row.id,
    userId: row.user_id,
    organizationId: row.organization_id,
    status: row.status,
    requestedAt: row.requested_at,
    reviewedBy: row.reviewed_by,
    reviewedAt: row.reviewed_at,
    notes: row.notes,
  };
}

/**
 * Get pending approvals for an organization
 */
export async function getPendingApprovals(organizationId: string): Promise<Array<{
  id: string;
  userId: string;
  status: PendingApprovalStatus;
  requestedAt: Date;
}>> {
  const client = new Client({
    connectionString: process.env.DATABASE_URL ?? DEFAULT_DB_URL,
  });
  await client.connect();

  const result = await client.query<{
    id: string;
    user_id: string;
    status: PendingApprovalStatus;
    requested_at: Date;
  }>(
    `SELECT id, user_id, status, requested_at
     FROM pending_approvals WHERE organization_id = $1`,
    [organizationId]
  );

  await client.end();

  return result.rows.map((row) => ({
    id: row.id,
    userId: row.user_id,
    status: row.status,
    requestedAt: row.requested_at,
  }));
}

/**
 * Update pending approval status
 */
export async function updatePendingApproval(
  approvalId: string,
  params: {
    status: PendingApprovalStatus;
    reviewedBy?: string;
    notes?: string;
  }
): Promise<void> {
  const client = new Client({
    connectionString: process.env.DATABASE_URL ?? DEFAULT_DB_URL,
  });
  await client.connect();

  await client.query(
    `UPDATE pending_approvals
     SET status = $2, reviewed_by = $3, reviewed_at = NOW(), notes = $4
     WHERE id = $1`,
    [approvalId, params.status, params.reviewedBy ?? null, params.notes ?? null]
  );

  await client.end();
}

/**
 * Delete all system settings (for test cleanup)
 */
export async function clearSystemSettings(): Promise<void> {
  const client = new Client({
    connectionString: process.env.DATABASE_URL ?? DEFAULT_DB_URL,
  });
  await client.connect();

  await client.query(`DELETE FROM system_settings`);
  await client.query(`DELETE FROM pending_approvals`);

  await client.end();
}
