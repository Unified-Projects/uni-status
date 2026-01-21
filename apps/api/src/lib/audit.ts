import { Context } from "hono";
import { nanoid } from "nanoid";
import type { ResourceType } from "@uni-status/database/schema";

interface AuditMetadata {
  before?: Record<string, unknown>;
  after?: Record<string, unknown>;
  changes?: Array<{ field: string; from: unknown; to: unknown }>;
  reason?: string;
  [key: string]: unknown;
}

type AuditAction = string;

export interface CreateAuditLogInput {
  organizationId: string;
  userId?: string | null;
  action: AuditAction;
  resourceType: ResourceType;
  resourceId?: string;
  resourceName?: string;
  metadata?: AuditMetadata;
}

/**
 * Extract client info from Hono context
 */
function getClientInfo(c: Context): {
  ipAddress: string | null;
  userAgent: string | null;
  requestId: string | null;
} {
  const ipAddress =
    c.req.header("x-forwarded-for")?.split(",")[0]?.trim() ||
    c.req.header("x-real-ip") ||
    null;
  const userAgent = c.req.header("user-agent") || null;
  const requestId = c.req.header("x-request-id") || null;

  return { ipAddress, userAgent, requestId };
}

/**
 * Compute changes between two objects
 */
export function computeChanges(
  before: Record<string, unknown>,
  after: Record<string, unknown>
): Array<{ field: string; from: unknown; to: unknown }> {
  const changes: Array<{ field: string; from: unknown; to: unknown }> = [];
  const allKeys = new Set([...Object.keys(before), ...Object.keys(after)]);

  for (const key of allKeys) {
    const fromVal = before[key];
    const toVal = after[key];

    // Skip internal/meta fields
    if (["updatedAt", "createdAt", "id"].includes(key)) {
      continue;
    }

    // Deep comparison for objects
    const fromStr = JSON.stringify(fromVal);
    const toStr = JSON.stringify(toVal);

    if (fromStr !== toStr) {
      changes.push({ field: key, from: fromVal, to: toVal });
    }
  }

  return changes;
}

/**
 * Create an audit log entry
 * Returns the audit log ID on success, null on failure
 * Failures are logged but don't throw - audit logging should not break main operations
 */
export async function createAuditLog(
  c: Context,
  input: CreateAuditLogInput
): Promise<string | null> {
  const { ipAddress, userAgent, requestId } = getClientInfo(c);
  const id = nanoid();

  try {
    const { auditLogs } = await import("@uni-status/enterprise/database/schema");
    const { enterpriseDb } = await import("@uni-status/enterprise/database");

    await enterpriseDb.insert(auditLogs).values({
      id,
      organizationId: input.organizationId,
      userId: input.userId || null,
      action: input.action as typeof auditLogs.$inferInsert.action,
      resourceType: input.resourceType,
      resourceId: input.resourceId,
      resourceName: input.resourceName,
      metadata: input.metadata || {},
      ipAddress,
      userAgent,
      requestId,
      createdAt: new Date(),
    });

    console.log(
      `[Audit] ${input.action} on ${input.resourceType}${input.resourceId ? `:${input.resourceId}` : ""} by user:${input.userId || "system"}`
    );

    return id;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ERR_MODULE_NOT_FOUND") {
      // Enterprise package not installed, skip audit logging
      return null;
    }
    console.error(
      `[Audit] Failed to create audit log for ${input.action} on ${input.resourceType}:`,
      error instanceof Error ? error.message : error
    );
    return null;
  }
}

/**
 * Helper to create audit log with automatic change detection
 */
export async function createAuditLogWithChanges(
  c: Context,
  input: Omit<CreateAuditLogInput, "metadata"> & {
    before: Record<string, unknown>;
    after: Record<string, unknown>;
    reason?: string;
  }
): Promise<string | null> {
  const changes = computeChanges(input.before, input.after);

  return createAuditLog(c, {
    organizationId: input.organizationId,
    userId: input.userId,
    action: input.action,
    resourceType: input.resourceType,
    resourceId: input.resourceId,
    resourceName: input.resourceName,
    metadata: {
      before: input.before,
      after: input.after,
      changes,
      reason: input.reason,
    },
  });
}

/**
 * Extract user ID from authenticated context
 */
export function getAuditUserId(c: Context): string | null {
  const auth = c.get("auth") as
    | { user?: { id: string }; apiKey?: { id: string } }
    | undefined;
  return auth?.user?.id || auth?.apiKey?.id || null;
}
