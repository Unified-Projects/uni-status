import { OpenAPIHono } from "@hono/zod-openapi";
import { nanoid } from "nanoid";
import { monitors, statusPages } from "@uni-status/database";
import { enterpriseDb as db } from "../../database";
import {
  reportSettings,
  slaReports,
  reportDeliveries,
  reportTemplates,
} from "../../database/schema/reports";
import {
  createReportSettingsSchema,
  updateReportSettingsSchema,
  generateReportSchema,
  createReportTemplateSchema,
  updateReportTemplateSchema,
} from "@uni-status/shared/validators";
import { SSE_CHANNELS, QUEUE_NAMES } from "@uni-status/shared/constants";
import { requireAuth, requireOrganization, requireScope } from "../middleware/auth";
import { publishEvent } from "../lib/redis";
import { createAuditLog, getAuditUserId } from "../lib/audit";
import { getQueue } from "../lib/queues";
import { eq, and, desc, gte, lte, sql, inArray } from "drizzle-orm";
import fs from "fs/promises";
import path from "path";
import { GetObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getAwsConfig, getS3Config, getStorageConfig } from "@uni-status/shared/config";
import { createLogger } from "@uni-status/shared";
import { createHash } from "node:crypto";

const log = createLogger({ module: "enterprise-api-routes-reports" });


export const reportsRoutes = new OpenAPIHono();

function isInlineReportMode() {
  // Use indirect access to prevent Bun bundler from inlining env vars at build time
  const env = process.env;
  return (
    env["RUN_REPORTS_INLINE"] === "1" ||
    env["CI"] === "true" ||
    env["NODE_ENV"] === "test" ||
    env["VITEST_WORKER_ID"] !== undefined
  );
}

function isInlineFallbackEnabled() {
  const env = process.env;
  const explicitDisable =
    env["UNI_STATUS_REPORT_INLINE_FALLBACK"] === "0" ||
    env["REPORT_INLINE_FALLBACK"] === "0";
  if (explicitDisable) {
    return false;
  }

  // Default to enabled so queue handoff or worker startup issues don't leave reports stuck.
  const noExplicitOverride =
    env["UNI_STATUS_REPORT_INLINE_FALLBACK"] === undefined &&
    env["REPORT_INLINE_FALLBACK"] === undefined;

  return (
    isInlineReportMode() ||
    noExplicitOverride ||
    env["UNI_STATUS_REPORT_INLINE_FALLBACK"] === "1" ||
    env["REPORT_INLINE_FALLBACK"] === "1"
  );
}

const REPORT_QUEUE_HANDOFF_DELAY_MS = (() => {
  const raw = Number.parseInt(process.env.REPORT_QUEUE_HANDOFF_DELAY_MS || "15000", 10);
  if (!Number.isFinite(raw) || raw < 1000) return 15000;
  return Math.min(raw, 5 * 60 * 1000);
})();

const REPORT_VERIFY_EXTERNAL_FETCH_TIMEOUT_MS = (() => {
  const raw = Number.parseInt(process.env.REPORT_VERIFY_EXTERNAL_FETCH_TIMEOUT_MS || "15000", 10);
  if (!Number.isFinite(raw) || raw < 1000) return 15000;
  return Math.min(raw, 120000);
})();

const s3Config = getS3Config();
const awsConfig = getAwsConfig();
const reportsS3Bucket = s3Config.bucket || awsConfig.s3Bucket || null;
const reportsS3Client = (() => {
  if (s3Config.accessKey && s3Config.secretKey && s3Config.bucket) {
    return new S3Client({
      region: s3Config.region,
      endpoint: s3Config.endpoint,
      forcePathStyle: s3Config.forcePathStyle,
      credentials: {
        accessKeyId: s3Config.accessKey,
        secretAccessKey: s3Config.secretKey,
      },
    });
  }

  if (awsConfig.accessKeyId && awsConfig.secretAccessKey && awsConfig.s3Bucket) {
    return new S3Client({
      region: awsConfig.region,
      credentials: {
        accessKeyId: awsConfig.accessKeyId,
        secretAccessKey: awsConfig.secretAccessKey,
      },
    });
  }

  return null;
})();

function getReportSha256FromSummary(summary: unknown): string | null {
  if (!summary || typeof summary !== "object") return null;
  const value = (summary as Record<string, unknown>).fileChecksumSha256;
  return typeof value === "string" && value.length > 0 ? value : null;
}

async function bodyToBuffer(body: unknown): Promise<Buffer> {
  if (!body) {
    throw new Error("S3 object has no body");
  }

  if (typeof (body as { transformToByteArray?: unknown }).transformToByteArray === "function") {
    const byteArray = await (body as { transformToByteArray: () => Promise<Uint8Array> }).transformToByteArray();
    return Buffer.from(byteArray);
  }

  const chunks: Buffer[] = [];
  for await (const chunk of body as AsyncIterable<Uint8Array | string>) {
    chunks.push(typeof chunk === "string" ? Buffer.from(chunk) : Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}

async function readReportFileBytes(report: {
  fileUrl: string;
  id?: string;
  organizationId?: string;
  fileName?: string | null;
}): Promise<Buffer> {
  if (report.fileUrl.startsWith("/reports/")) {
    const reportsBaseDir = getStorageConfig().reportsDir;
    const relativePath = report.fileUrl.replace(/^\/reports\//, "");
    const filePath = path.join(reportsBaseDir, relativePath);
    const fileBuffer = await fs.readFile(filePath);
    return Buffer.from(fileBuffer);
  }

  // For private S3/object storage, fetch via SDK credentials instead of public URL fetch.
  if (reportsS3Client && reportsS3Bucket && report.id && report.organizationId) {
    const extension =
      (report.fileName ? path.extname(report.fileName) : "") ||
      (() => {
        try {
          return path.extname(new URL(report.fileUrl).pathname);
        } catch {
          return "";
        }
      })() ||
      ".pdf";
    const s3Key = `reports/${report.organizationId}/${report.id}${extension}`;

    try {
      const response = await reportsS3Client.send(
        new GetObjectCommand({
          Bucket: reportsS3Bucket,
          Key: s3Key,
        })
      );

      return bodyToBuffer(response.Body);
    } catch (error) {
      log.warn({ err: error, reportId: report.id, s3Key }, "Failed to fetch report via S3 SDK, falling back to URL fetch");
    }
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REPORT_VERIFY_EXTERNAL_FETCH_TIMEOUT_MS);
  try {
    const response = await fetch(report.fileUrl, { signal: controller.signal });
    if (!response.ok) {
      throw new Error(`Failed to fetch report from storage: HTTP ${response.status}`);
    }
    const arrayBuffer = await response.arrayBuffer();
    return Buffer.from(arrayBuffer);
  } finally {
    clearTimeout(timeout);
  }
}

const STALE_REPORT_TIMEOUT_MINUTES = (() => {
  const raw = Number.parseInt(process.env.REPORT_STALE_TIMEOUT_MINUTES || "10", 10);
  if (!Number.isFinite(raw) || raw < 1) return 10;
  return Math.min(raw, 24 * 60);
})();

function isReportStale(createdAt: Date): boolean {
  const ageMs = Date.now() - createdAt.getTime();
  return ageMs >= STALE_REPORT_TIMEOUT_MINUTES * 60 * 1000;
}

function getStaleReportErrorMessage() {
  return `Report generation timed out and stale state was repaired automatically after ${STALE_REPORT_TIMEOUT_MINUTES} minutes.`;
}

async function repairStaleReportsForOrganization(organizationId: string): Promise<number> {
  const cutoff = new Date(Date.now() - STALE_REPORT_TIMEOUT_MINUTES * 60 * 1000);

  const staleReports = await db.query.slaReports.findMany({
    where: and(
      eq(slaReports.organizationId, organizationId),
      inArray(slaReports.status, ["pending", "generating"] as ("pending" | "generating")[]),
      lte(slaReports.createdAt, cutoff)
    ),
    columns: { id: true },
  });

  if (staleReports.length === 0) {
    return 0;
  }

  const staleIds = staleReports.map((report) => report.id);
  const repaired = await db
    .update(slaReports)
    .set({
      status: "failed",
      errorMessage: getStaleReportErrorMessage(),
    })
    .where(
      and(
        eq(slaReports.organizationId, organizationId),
        inArray(slaReports.id, staleIds),
        inArray(slaReports.status, ["pending", "generating"] as ("pending" | "generating")[])
      )
    )
    .returning({ id: slaReports.id });

  if (repaired.length > 0) {
    log.warn({ organizationId, repairedCount: repaired.length }, "[reports] Repaired stale report states");
  }

  return repaired.length;
}

async function repairStaleReportIfNeeded(reportId: string, organizationId?: string): Promise<void> {
  const whereClause = organizationId
    ? and(eq(slaReports.id, reportId), eq(slaReports.organizationId, organizationId))
    : eq(slaReports.id, reportId);

  const report = await db.query.slaReports.findFirst({
    where: whereClause,
    columns: {
      id: true,
      status: true,
      createdAt: true,
    },
  });

  if (!report) return;
  if (!(report.status === "pending" || report.status === "generating")) return;
  if (!isReportStale(report.createdAt)) return;

  const repaired = await db
    .update(slaReports)
    .set({
      status: "failed",
      errorMessage: getStaleReportErrorMessage(),
    })
    .where(and(whereClause, inArray(slaReports.status, ["pending", "generating"] as ("pending" | "generating")[])))
    .returning({ id: slaReports.id });

  if (repaired.length > 0) {
    log.warn({ reportId }, "[reports] Repaired stale report state");
  }
}


// ==========================================
// Report Settings (Automated Reports)
// ==========================================

// List report settings
reportsRoutes.get("/settings", async (c) => {
  const organizationId = await requireOrganization(c);

  // Parse pagination parameters
  const limit = Math.min(Math.max(parseInt(c.req.query("limit") || "100"), 1), 100);
  const offset = Math.max(parseInt(c.req.query("offset") || "0"), 0);

  // Get total count
  const countResult = await db
    .select({ count: sql<number>`count(*)` })
    .from(reportSettings)
    .where(eq(reportSettings.organizationId, organizationId));

  const total = Number(countResult[0]?.count ?? 0);

  const settings = await db.query.reportSettings.findMany({
    where: eq(reportSettings.organizationId, organizationId),
    orderBy: [desc(reportSettings.createdAt)],
    limit,
    offset,
  });

  return c.json({
    success: true,
    data: settings,
    meta: {
      total,
      limit,
      offset,
      hasMore: offset + settings.length < total,
    },
  });
});

// Create report settings
reportsRoutes.post("/settings", async (c) => {
  const auth = requireAuth(c);
  const organizationId = await requireOrganization(c);
  requireScope(c, "write");

  let body;
  try {
    body = await c.req.json();
  } catch (error) {
    return c.json({
      success: false,
      error: {
        code: "INVALID_JSON",
        message: "Invalid JSON in request body",
      },
    }, 400);
  }

  const result = createReportSettingsSchema.safeParse(body);
  if (!result.success) {
    return c.json({
      success: false,
      error: {
        code: "VALIDATION_ERROR",
        message: "Invalid request data",
        details: result.error?.issues?.map((e: any) => ({
          path: e.path.join("."),
          message: e.message,
        })) || [],
      },
    }, 400);
  }

  const validated = result.data;

  // Validate monitor IDs if provided
  if (validated.monitorIds && validated.monitorIds.length > 0) {
    const validMonitors = await db.query.monitors.findMany({
      where: and(
        eq(monitors.organizationId, organizationId),
        inArray(monitors.id, validated.monitorIds)
      ),
      columns: { id: true },
    });

    if (validMonitors.length !== validated.monitorIds.length) {
      return c.json(
        {
          success: false,
          error: "Some monitor IDs are invalid",
        },
        400
      );
    }
  }

  // Validate status page IDs if provided
  if (validated.statusPageIds && validated.statusPageIds.length > 0) {
    const validPages = await db.query.statusPages.findMany({
      where: and(
        eq(statusPages.organizationId, organizationId),
        inArray(statusPages.id, validated.statusPageIds)
      ),
      columns: { id: true },
    });

    if (validPages.length !== validated.statusPageIds.length) {
      return c.json(
        {
          success: false,
          error: "Some status page IDs are invalid",
        },
        400
      );
    }
  }

  const id = nanoid();
  const now = new Date();

  // Calculate next scheduled time based on frequency
  let nextScheduledAt: Date | null = null;
  if (validated.active !== false) {
    nextScheduledAt = calculateNextScheduledTime(
      validated.frequency || "monthly",
      validated.dayOfWeek,
      validated.dayOfMonth,
      validated.timezone || "Europe/London"
    );
  }

  const [settings] = await db
    .insert(reportSettings)
    .values({
      id,
      organizationId,
      name: validated.name,
      reportType: validated.reportType || "sla",
      frequency: validated.frequency || "monthly",
      monitorIds: validated.monitorIds || [],
      statusPageIds: validated.statusPageIds || [],
      includeAllMonitors: validated.includeAllMonitors ?? false,
      includeCharts: validated.includeCharts ?? true,
      includeIncidents: validated.includeIncidents ?? true,
      includeMaintenanceWindows: validated.includeMaintenanceWindows ?? true,
      includeResponseTimes: validated.includeResponseTimes ?? true,
      includeSloStatus: validated.includeSloStatus ?? true,
      customBranding: validated.customBranding || {},
      recipients: validated.recipients || { emails: [] },
      dayOfWeek: validated.dayOfWeek,
      dayOfMonth: validated.dayOfMonth,
      timezone: validated.timezone || "Europe/London",
      active: validated.active ?? true,
      nextScheduledAt,
      createdAt: now,
      updatedAt: now,
    })
    .returning();

  if (!settings) {
    return c.json({ success: false, error: "Failed to create report settings" }, 500);
  }

  // Audit log
  await createAuditLog(c, {
    organizationId,
    userId: getAuditUserId(c),
    action: "report_settings.create",
    resourceType: "report_settings",
    resourceId: settings.id,
    resourceName: settings.name,
  });

  return c.json(
    {
      success: true,
      data: settings,
    },
    201
  );
});

// Get report settings by ID
reportsRoutes.get("/settings/:id", async (c) => {
  const organizationId = await requireOrganization(c);
  const { id } = c.req.param();

  const settings = await db.query.reportSettings.findFirst({
    where: and(
      eq(reportSettings.id, id),
      eq(reportSettings.organizationId, organizationId)
    ),
  });

  if (!settings) {
    return c.json(
      {
        success: false,
        error: "Report settings not found",
      },
      404
    );
  }

  // Get recent reports generated from these settings
  const recentReports = await db.query.slaReports.findMany({
    where: eq(slaReports.settingsId, id),
    orderBy: [desc(slaReports.createdAt)],
    limit: 10,
  });

  return c.json({
    success: true,
    data: {
      ...settings,
      recentReports,
    },
  });
});

// Update report settings
reportsRoutes.patch("/settings/:id", async (c) => {
  const organizationId = await requireOrganization(c);
  requireScope(c, "write");
  const { id } = c.req.param();

  let body;
  try {
    body = await c.req.json();
  } catch (error) {
    return c.json({
      success: false,
      error: {
        code: "INVALID_JSON",
        message: "Invalid JSON in request body",
      },
    }, 400);
  }

  const result = updateReportSettingsSchema.safeParse(body);
  if (!result.success) {
    return c.json({
      success: false,
      error: {
        code: "VALIDATION_ERROR",
        message: "Invalid request data",
        details: result.error?.issues?.map((e: any) => ({
          path: e.path.join("."),
          message: e.message,
        })) || [],
      },
    }, 400);
  }

  const validated = result.data;
  const now = new Date();

  const existing = await db.query.reportSettings.findFirst({
    where: and(
      eq(reportSettings.id, id),
      eq(reportSettings.organizationId, organizationId)
    ),
  });

  if (!existing) {
    return c.json(
      {
        success: false,
        error: "Report settings not found",
      },
      404
    );
  }

  // Validate monitor IDs if provided
  if (validated.monitorIds && validated.monitorIds.length > 0) {
    const validMonitors = await db.query.monitors.findMany({
      where: and(
        eq(monitors.organizationId, organizationId),
        inArray(monitors.id, validated.monitorIds)
      ),
      columns: { id: true },
    });

    if (validMonitors.length !== validated.monitorIds.length) {
      return c.json({ success: false, error: "Some monitor IDs are invalid" }, 400);
    }
  }

  const updateData: Record<string, unknown> = { updatedAt: now };

  // Copy all valid fields
  const fields = [
    "name", "reportType", "frequency", "monitorIds", "statusPageIds",
    "includeAllMonitors", "includeCharts", "includeIncidents",
    "includeMaintenanceWindows", "includeResponseTimes", "includeSloStatus",
    "customBranding", "recipients", "dayOfWeek", "dayOfMonth", "timezone", "active"
  ];

  for (const field of fields) {
    if ((validated as Record<string, unknown>)[field] !== undefined) {
      updateData[field] = (validated as Record<string, unknown>)[field];
    }
  }

  // Recalculate next scheduled time if frequency/schedule changed
  if (validated.frequency || validated.dayOfWeek !== undefined || validated.dayOfMonth !== undefined) {
    updateData.nextScheduledAt = calculateNextScheduledTime(
      (validated.frequency || existing.frequency) as "weekly" | "monthly" | "quarterly" | "annually" | "on_demand",
      validated.dayOfWeek ?? existing.dayOfWeek,
      validated.dayOfMonth ?? existing.dayOfMonth,
      validated.timezone || existing.timezone || "Europe/London"
    );
  }

  const [settings] = await db
    .update(reportSettings)
    .set(updateData)
    .where(
      and(
        eq(reportSettings.id, id),
        eq(reportSettings.organizationId, organizationId)
      )
    )
    .returning();

  if (!settings) {
    return c.json({ success: false, error: "Report settings not found" }, 404);
  }

  // Audit log
  await createAuditLog(c, {
    organizationId,
    userId: getAuditUserId(c),
    action: "report_settings.update",
    resourceType: "report_settings",
    resourceId: settings.id,
    resourceName: settings.name,
  });

  return c.json({
    success: true,
    data: settings,
  });
});

// Delete report settings
reportsRoutes.delete("/settings/:id", async (c) => {
  const organizationId = await requireOrganization(c);
  requireScope(c, "write");
  const { id } = c.req.param();

  const existing = await db.query.reportSettings.findFirst({
    where: and(
      eq(reportSettings.id, id),
      eq(reportSettings.organizationId, organizationId)
    ),
  });

  if (!existing) {
    return c.json({ success: false, error: "Report settings not found" }, 404);
  }

  await db
    .delete(reportSettings)
    .where(
      and(
        eq(reportSettings.id, id),
        eq(reportSettings.organizationId, organizationId)
      )
    );

  // Audit log
  await createAuditLog(c, {
    organizationId,
    userId: getAuditUserId(c),
    action: "report_settings.delete",
    resourceType: "report_settings",
    resourceId: id,
    resourceName: existing.name,
  });

  return c.json({
    success: true,
    data: { deleted: true },
  });
});

// ==========================================
// Report Generation
// ==========================================

// Generate report on-demand
reportsRoutes.post("/generate", async (c) => {
  const auth = requireAuth(c);
  const organizationId = await requireOrganization(c);
  requireScope(c, "write");

  let body;
  try {
    body = await c.req.json();
  } catch (error) {
    return c.json({
      success: false,
      error: {
        code: "INVALID_JSON",
        message: "Invalid JSON in request body",
      },
    }, 400);
  }

  const result = generateReportSchema.safeParse(body);
  if (!result.success) {
    return c.json({
      success: false,
      error: {
        code: "VALIDATION_ERROR",
        message: "Invalid request data",
        details: result.error?.issues?.map((e: any) => ({
          path: e.path.join("."),
          message: e.message,
        })) || [],
      },
    }, 400);
  }

  const validated = result.data;

  // Validate monitor IDs if provided
  if (validated.monitorIds && validated.monitorIds.length > 0) {
    const validMonitors = await db.query.monitors.findMany({
      where: and(
        eq(monitors.organizationId, organizationId),
        inArray(monitors.id, validated.monitorIds)
      ),
      columns: { id: true },
    });

    if (validMonitors.length !== validated.monitorIds.length) {
      return c.json({ success: false, error: "Some monitor IDs are invalid" }, 400);
    }
  }

  const id = nanoid();
  const now = new Date();

  // Get settings if provided
  let settings = null;
  if (validated.settingsId) {
    settings = await db.query.reportSettings.findFirst({
      where: and(
        eq(reportSettings.id, validated.settingsId),
        eq(reportSettings.organizationId, organizationId)
      ),
    });
  }

  // Determine included monitors
  let includedMonitors: string[] = [];
  if (validated.includeAllMonitors) {
    const allMonitors = await db.query.monitors.findMany({
      where: eq(monitors.organizationId, organizationId),
      columns: { id: true },
    });
    includedMonitors = allMonitors.map((m) => m.id);
  } else if (validated.monitorIds) {
    includedMonitors = validated.monitorIds;
  } else if (settings?.monitorIds) {
    includedMonitors = settings.monitorIds as string[];
  }

  // Create report record
  const [report] = await db
    .insert(slaReports)
    .values({
      id,
      organizationId,
      settingsId: validated.settingsId,
      reportType: validated.reportType,
      status: "pending",
      periodStart: new Date(validated.periodStart),
      periodEnd: new Date(validated.periodEnd),
      generatedBy: getAuditUserId(c),
      includedMonitors,
      includedStatusPages: validated.statusPageIds || [],
      expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days
      createdAt: now,
    })
    .returning();

  const jobData = {
    reportId: id,
    organizationId,
    reportType: validated.reportType,
    periodStart: validated.periodStart,
    periodEnd: validated.periodEnd,
    includedMonitors,
    includedStatusPages: validated.statusPageIds || [],
    settings: settings
      ? {
          includeCharts: settings.includeCharts,
          includeIncidents: settings.includeIncidents,
          includeMaintenanceWindows: settings.includeMaintenanceWindows,
          includeResponseTimes: settings.includeResponseTimes,
          includeSloStatus: settings.includeSloStatus,
          customBranding: settings.customBranding,
        }
      : {
          includeCharts: true,
          includeIncidents: true,
          includeMaintenanceWindows: true,
          includeResponseTimes: true,
          includeSloStatus: true,
          customBranding: {},
        },
  };

  // Queue report generation job
  let queueAccepted = false;
  try {
    const queue = getQueue(QUEUE_NAMES.REPORT_GENERATE);
    await queue.add(
      "generate",
      jobData,
      {
        jobId: `report-generate-${id}`,
        attempts: 3,
        backoff: {
          type: "exponential",
          delay: 10000,
        },
      }
    );
    queueAccepted = true;
  } catch (error) {
    log.warn("[reports] Queueing report generation failed, continuing inline:", error);
  }

  const inlineFallbackEnabled = isInlineFallbackEnabled();

  // If queueing fails and inline fallback is disabled, fail fast to avoid stale pending reports.
  if (!queueAccepted && !inlineFallbackEnabled) {
    const queueUnavailableMessage = "Report queue unavailable and inline fallback is disabled";
    await db
      .update(slaReports)
      .set({
        status: "failed",
        errorMessage: queueUnavailableMessage,
      })
      .where(eq(slaReports.id, id));

    log.error({ reportId: id }, `[reports] ${queueUnavailableMessage}`);

    return c.json(
      {
        success: false,
        error: {
          code: "REPORT_QUEUE_UNAVAILABLE",
          message: queueUnavailableMessage,
        },
      },
      503
    );
  }

  // In test/CI environments we always process inline.
  // In other environments, inline fallback is optional and explicitly controlled.
  const shouldProcessInline = isInlineReportMode() || (!queueAccepted && inlineFallbackEnabled);
  if (shouldProcessInline) {
    setTimeout(() => {
      (async () => {
        try {
          const { processReportGeneration } = await import("../../workers/processors/report-generator");
          await processReportGeneration({ data: jobData } as any);
        } catch (error) {
          log.error("[reports] Inline report generation failed:", error);
          // Mark report as failed in database
          await db
            .update(slaReports)
            .set({
              status: "failed",
              errorMessage: error instanceof Error ? error.message : "Unknown error during report generation",
            })
            .where(eq(slaReports.id, id));
        }
      })().catch((err) => log.error("[reports] Inline processing error:", err));
    }, 100);
  } else if (inlineFallbackEnabled) {
    // Self-heal queue handoff issues: if no worker has claimed the report after a short delay,
    // process it inline to avoid leaving reports indefinitely pending.
    setTimeout(() => {
      (async () => {
        try {
          const current = await db.query.slaReports.findFirst({
            where: eq(slaReports.id, id),
            columns: { status: true },
          });

          if (!current || current.status !== "pending") {
            return;
          }

          log.warn({ reportId: id }, "[reports] Report still pending after queue handoff delay, running inline fallback");
          const { processReportGeneration } = await import("../../workers/processors/report-generator");
          await processReportGeneration({ data: jobData } as any);
        } catch (error) {
          log.error("[reports] Delayed inline fallback failed:", error);
          await db
            .update(slaReports)
            .set({
              status: "failed",
              errorMessage: error instanceof Error ? error.message : "Unknown error during report generation",
            })
            .where(and(eq(slaReports.id, id), eq(slaReports.status, "pending")));
        }
      })().catch((err) => log.error("[reports] Delayed inline fallback processing error:", err));
    }, REPORT_QUEUE_HANDOFF_DELAY_MS);
  } else {
    log.debug({ reportId: id }, "[reports] Inline fallback disabled; waiting for worker queue processing");
  }

  // Publish event
  await publishEvent(`${SSE_CHANNELS.ORGANIZATION}${organizationId}`, {
    type: "report:generating",
    data: {
      id,
      reportType: validated.reportType,
      status: "pending",
    },
    timestamp: now.toISOString(),
  });

  // Audit log
  await createAuditLog(c, {
    organizationId,
    userId: getAuditUserId(c),
    action: "report.generate",
    resourceType: "sla_report",
    resourceId: id,
    metadata: {
      reportType: validated.reportType,
      periodStart: validated.periodStart,
      periodEnd: validated.periodEnd,
      monitorCount: includedMonitors.length,
    },
  });

  return c.json(
    {
      success: true,
      data: report, // keep initial pending response; completion happens inline/async
    },
    202
  );
});

// List generated reports
reportsRoutes.get("/", async (c) => {
  const organizationId = await requireOrganization(c);
  await repairStaleReportsForOrganization(organizationId);

  const limit = Math.min(Math.max(parseInt(c.req.query("limit") || "20"), 1), 100);
  const offset = Math.max(parseInt(c.req.query("offset") || "0"), 0);
  const reportType = c.req.query("type");
  const status = c.req.query("status");

  // Build where conditions for count
  const conditions = [eq(slaReports.organizationId, organizationId)];
  if (reportType) {
    conditions.push(eq(slaReports.reportType, reportType as any));
  }
  if (status) {
    conditions.push(eq(slaReports.status, status as any));
  }

  // Get total count
  const countResult = await db
    .select({ count: sql<number>`count(*)` })
    .from(slaReports)
    .where(and(...conditions));

  const total = Number(countResult[0]?.count ?? 0);

  const reports = await db.query.slaReports.findMany({
    where: and(...conditions),
    orderBy: [desc(slaReports.createdAt)],
    limit,
    offset,
  });

  return c.json({
    success: true,
    data: reports,
    meta: {
      total,
      limit,
      offset,
      hasMore: offset + reports.length < total,
    },
  });
});

// ==========================================
// Report Templates (defined before /:id to avoid route shadowing)
// ==========================================

// List templates
reportsRoutes.get("/templates", async (c) => {
  const organizationId = await requireOrganization(c);

  const templates = await db.query.reportTemplates.findMany({
    where: eq(reportTemplates.organizationId, organizationId),
    orderBy: [desc(reportTemplates.createdAt)],
  });

  return c.json({
    success: true,
    data: templates,
  });
});

// Create template
reportsRoutes.post("/templates", async (c) => {
  const auth = requireAuth(c);
  const organizationId = await requireOrganization(c);
  requireScope(c, "write");

  let body;
  try {
    body = await c.req.json();
  } catch (error) {
    return c.json({
      success: false,
      error: {
        code: "INVALID_JSON",
        message: "Invalid JSON in request body",
      },
    }, 400);
  }

  const result = createReportTemplateSchema.safeParse(body);
  if (!result.success) {
    return c.json({
      success: false,
      error: {
        code: "VALIDATION_ERROR",
        message: "Invalid request data",
        details: result.error?.issues?.map((e: any) => ({
          path: e.path.join("."),
          message: e.message,
        })) || [],
      },
    }, 400);
  }

  const validated = result.data;

  const id = nanoid();
  const now = new Date();

  // If this is set as default, unset other defaults for this type
  if (validated.isDefault) {
    await db
      .update(reportTemplates)
      .set({ isDefault: false })
      .where(
        and(
          eq(reportTemplates.organizationId, organizationId),
          eq(reportTemplates.reportType, validated.reportType)
        )
      );
  }

  const [template] = await db
    .insert(reportTemplates)
    .values({
      id,
      organizationId,
      name: validated.name,
      description: validated.description,
      reportType: validated.reportType,
      headerHtml: validated.headerHtml,
      footerHtml: validated.footerHtml,
      cssStyles: validated.cssStyles,
      branding: validated.branding || {},
      isDefault: validated.isDefault ?? false,
      createdAt: now,
      updatedAt: now,
    })
    .returning();

  if (!template) {
    return c.json({ success: false, error: "Failed to create report template" }, 500);
  }

  // Audit log
  await createAuditLog(c, {
    organizationId,
    userId: getAuditUserId(c),
    action: "report_template.create",
    resourceType: "report_template",
    resourceId: template.id,
    resourceName: template.name,
  });

  return c.json(
    {
      success: true,
      data: template,
    },
    201
  );
});

// Get template by ID
reportsRoutes.get("/templates/:id", async (c) => {
  const organizationId = await requireOrganization(c);
  const { id } = c.req.param();

  const template = await db.query.reportTemplates.findFirst({
    where: and(
      eq(reportTemplates.id, id),
      eq(reportTemplates.organizationId, organizationId)
    ),
  });

  if (!template) {
    return c.json({ success: false, error: "Template not found" }, 404);
  }

  return c.json({
    success: true,
    data: template,
  });
});

// Update template
reportsRoutes.patch("/templates/:id", async (c) => {
  const organizationId = await requireOrganization(c);
  requireScope(c, "write");
  const { id } = c.req.param();

  let body;
  try {
    body = await c.req.json();
  } catch (error) {
    return c.json({
      success: false,
      error: {
        code: "INVALID_JSON",
        message: "Invalid JSON in request body",
      },
    }, 400);
  }

  const result = updateReportTemplateSchema.safeParse(body);
  if (!result.success) {
    return c.json({
      success: false,
      error: {
        code: "VALIDATION_ERROR",
        message: "Invalid request data",
        details: result.error?.issues?.map((e: any) => ({
          path: e.path.join("."),
          message: e.message,
        })) || [],
      },
    }, 400);
  }

  const validated = result.data;
  const now = new Date();

  const existing = await db.query.reportTemplates.findFirst({
    where: and(
      eq(reportTemplates.id, id),
      eq(reportTemplates.organizationId, organizationId)
    ),
  });

  if (!existing) {
    return c.json({ success: false, error: "Template not found" }, 404);
  }

  // If this is set as default, unset other defaults for this type
  if (validated.isDefault) {
    const reportType = validated.reportType || existing.reportType;
    await db
      .update(reportTemplates)
      .set({ isDefault: false })
      .where(
        and(
          eq(reportTemplates.organizationId, organizationId),
          eq(reportTemplates.reportType, reportType)
        )
      );
  }

  const updateData: Record<string, unknown> = { updatedAt: now };
  const fields = [
    "name", "description", "reportType", "headerHtml", "footerHtml",
    "cssStyles", "branding", "isDefault"
  ];

  for (const field of fields) {
    if ((validated as Record<string, unknown>)[field] !== undefined) {
      updateData[field] = (validated as Record<string, unknown>)[field];
    }
  }

  const [template] = await db
    .update(reportTemplates)
    .set(updateData)
    .where(
      and(
        eq(reportTemplates.id, id),
        eq(reportTemplates.organizationId, organizationId)
      )
    )
    .returning();

  if (!template) {
    return c.json({ success: false, error: "Report template not found" }, 404);
  }
  // Audit log
  await createAuditLog(c, {
    organizationId,
    userId: getAuditUserId(c),
    action: "report_template.update",
    resourceType: "report_template",
    resourceId: template.id,
    resourceName: template.name,
  });

  return c.json({
    success: true,
    data: template,
  });
});

// Delete template
reportsRoutes.delete("/templates/:id", async (c) => {
  const organizationId = await requireOrganization(c);
  requireScope(c, "write");
  const { id } = c.req.param();

  const existing = await db.query.reportTemplates.findFirst({
    where: and(
      eq(reportTemplates.id, id),
      eq(reportTemplates.organizationId, organizationId)
    ),
  });

  if (!existing) {
    return c.json({ success: false, error: "Template not found" }, 404);
  }

  await db
    .delete(reportTemplates)
    .where(
      and(
        eq(reportTemplates.id, id),
        eq(reportTemplates.organizationId, organizationId)
      )
    );

  // Audit log
  await createAuditLog(c, {
    organizationId,
    userId: getAuditUserId(c),
    action: "report_template.delete",
    resourceType: "report_template",
    resourceId: id,
    resourceName: existing.name,
  });

  return c.json({
    success: true,
    data: { deleted: true },
  });
});

// Get report by ID
reportsRoutes.get("/:id/verify", async (c) => {
  const auth = requireAuth(c);
  const { id } = c.req.param();
  await repairStaleReportIfNeeded(id, auth.organizationId || undefined);

  const report = await db.query.slaReports.findFirst({
    where: eq(slaReports.id, id),
  });

  if (!report) {
    return c.json({ success: false, error: "Report not found" }, 404);
  }

  if (auth.organizationId && auth.organizationId !== report.organizationId) {
    return c.json({ success: false, error: "Forbidden" }, 403);
  }

  if (report.status !== "completed" || !report.fileUrl) {
    return c.json(
      {
        success: false,
        error: "Report not ready for verification",
        status: report.status,
      },
      400
    );
  }

  const expectedSha256 = getReportSha256FromSummary(report.summary);
  if (!expectedSha256) {
    return c.json(
      {
        success: false,
        error: "Report checksum metadata is missing",
      },
      422
    );
  }

  try {
    const fileBytes = await readReportFileBytes({
      fileUrl: report.fileUrl,
      id: report.id,
      organizationId: report.organizationId,
      fileName: report.fileName,
    });
    const actualSha256 = createHash("sha256").update(fileBytes).digest("hex");
    const verified = actualSha256 === expectedSha256;

    await createAuditLog(c, {
      organizationId: report.organizationId,
      userId: getAuditUserId(c),
      action: "report.verify_integrity",
      resourceType: "sla_report",
      resourceId: report.id,
      metadata: {
        verified,
        expectedSha256,
        actualSha256,
      },
    });

    return c.json({
      success: true,
      data: {
        reportId: report.id,
        verified,
        expectedSha256,
        actualSha256,
        checkedAt: new Date().toISOString(),
      },
    });
  } catch (error) {
    log.error({ reportId: report.id, err: error }, "[reports] Report verification failed");
    return c.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Report verification failed",
      },
      500
    );
  }
});

// Get report by ID
reportsRoutes.get("/:id", async (c) => {
  try {
    const organizationId = await requireOrganization(c);
    const { id } = c.req.param();
    await repairStaleReportIfNeeded(id, organizationId);

    // Query report without relations first to avoid potential relation resolution issues
    const report = await db.query.slaReports.findFirst({
      where: and(
        eq(slaReports.id, id),
        eq(slaReports.organizationId, organizationId)
      ),
    });

    if (!report) {
      return c.json({ success: false, error: "Report not found" }, 404);
    }

    // Fetch related data separately
    let settings = null;
    let deliveries: typeof reportDeliveries.$inferSelect[] = [];

    if (report.settingsId) {
      settings = await db.query.reportSettings.findFirst({
        where: eq(reportSettings.id, report.settingsId),
      });
    }

    deliveries = await db.query.reportDeliveries.findMany({
      where: eq(reportDeliveries.reportId, report.id),
    });

    return c.json({
      success: true,
      data: { ...report, settings, deliveries },
    });
  } catch (error) {
    log.error("[reports] GET /:id error:", error);
    return c.json({ success: false, error: "Internal server error" }, 500);
  }
});

// Download report (always proxied through API)
reportsRoutes.get("/:id/download", async (c) => {
  const auth = requireAuth(c);
  const { id } = c.req.param();
  await repairStaleReportIfNeeded(id, auth.organizationId || undefined);

  const report = await db.query.slaReports.findFirst({
    where: eq(slaReports.id, id),
  });

  if (!report) {
    return c.json({ success: false, error: "Report not found" }, 404);
  }

  // Enforce organization access if the auth context has one
  if (auth.organizationId && auth.organizationId !== report.organizationId) {
    return c.json({ success: false, error: "Forbidden" }, 403);
  }

  if (report.status !== "completed" || !report.fileUrl) {
    return c.json(
      {
        success: false,
        error: "Report not ready for download",
        status: report.status,
      },
      400
    );
  }

  try {
    const fileBuffer = await readReportFileBytes({
      fileUrl: report.fileUrl,
      id: report.id,
      organizationId: report.organizationId,
      fileName: report.fileName,
    });
    const checksum = getReportSha256FromSummary(report.summary);

    let fallbackName = `${report.id}.pdf`;
    if (report.fileUrl.startsWith("/reports/")) {
      const relativePath = report.fileUrl.replace(/^\/reports\//, "");
      fallbackName = path.basename(relativePath);
    } else {
      try {
        fallbackName = path.basename(new URL(report.fileUrl).pathname) || fallbackName;
      } catch {
        // Ignore malformed URLs and keep the safe fallback filename
      }
    }

    const fileName = report.fileName || fallbackName;
    const pdfBody = new Uint8Array(fileBuffer);

    return new Response(pdfBody, {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${fileName}"`,
        ...(checksum ? { "X-Report-SHA256": checksum } : {}),
      },
    });
  } catch (error) {
    log.error({ err: error, reportId: report.id }, "Report download error");
    return c.json({ success: false, error: "Report file not found" }, 404);
  }
});

// ==========================================
// Helpers
// ==========================================

function calculateNextScheduledTime(
  frequency: "weekly" | "monthly" | "quarterly" | "annually" | "on_demand",
  dayOfWeek?: number | null,
  dayOfMonth?: number | null,
  timezone: string = "Europe/London"
): Date | null {
  if (frequency === "on_demand") {
    return null;
  }

  const now = new Date();
  let next = new Date(now);

  switch (frequency) {
    case "weekly":
      // Next occurrence of the specified day of week
      const targetDay = dayOfWeek ?? 1; // Default to Monday
      const currentDay = next.getDay();
      const daysUntilTarget = (targetDay - currentDay + 7) % 7 || 7;
      next.setDate(next.getDate() + daysUntilTarget);
      next.setHours(9, 0, 0, 0); // 9 AM
      break;

    case "monthly":
      // Next occurrence of the specified day of month
      const targetDate = dayOfMonth ?? 1; // Default to 1st
      next.setMonth(next.getMonth() + 1);
      next.setDate(Math.min(targetDate, getDaysInMonth(next.getFullYear(), next.getMonth())));
      next.setHours(9, 0, 0, 0);
      break;

    case "quarterly":
      // First day of next quarter
      const quarter = Math.floor(next.getMonth() / 3);
      const nextQuarter = (quarter + 1) % 4;
      const nextYear = nextQuarter === 0 ? next.getFullYear() + 1 : next.getFullYear();
      next = new Date(nextYear, nextQuarter * 3, dayOfMonth ?? 1, 9, 0, 0, 0);
      break;

    case "annually":
      // First day of next year
      next = new Date(next.getFullYear() + 1, 0, dayOfMonth ?? 1, 9, 0, 0, 0);
      break;
  }

  return next;
}

function getDaysInMonth(year: number, month: number): number {
  return new Date(year, month + 1, 0).getDate();
}
