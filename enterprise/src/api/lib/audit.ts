/**
 * Enterprise Audit Proxy
 * Delegates to the main API's audit utilities when configured.
 */

type AuditLogParams = {
  organizationId: string;
  userId: string | null;
  action: string;
  resourceType: string;
  resourceId?: string;
  resourceName?: string;
  metadata?: Record<string, unknown>;
};

type AuditLogWithChangesParams = AuditLogParams & {
  before: Record<string, unknown>;
  after: Record<string, unknown>;
};

type AuditFns = {
  createAuditLog: (c: any, params: AuditLogParams) => Promise<string | null | void>;
  createAuditLogWithChanges: (c: any, params: AuditLogWithChangesParams) => Promise<string | null | void>;
  getAuditUserId: (c: any) => string | null;
};

let _auditFns: AuditFns | null = null;

export function configureAudit(fns: AuditFns) {
  _auditFns = fns;
}

export async function createAuditLog(c: any, params: AuditLogParams): Promise<void> {
  if (!_auditFns) {
    console.warn("Enterprise audit not configured, skipping createAuditLog");
    return;
  }
  await _auditFns.createAuditLog(c, params);
}

export async function createAuditLogWithChanges(c: any, params: AuditLogWithChangesParams): Promise<void> {
  if (!_auditFns) {
    console.warn("Enterprise audit not configured, skipping createAuditLogWithChanges");
    return;
  }
  await _auditFns.createAuditLogWithChanges(c, params);
}

export function getAuditUserId(c: any): string | null {
  if (!_auditFns) {
    console.warn("Enterprise audit not configured, returning null for getAuditUserId");
    return null;
  }
  return _auditFns.getAuditUserId(c);
}
