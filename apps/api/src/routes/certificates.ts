import { OpenAPIHono } from "@hono/zod-openapi";
import { db } from "@uni-status/database";
import { monitors, checkResults } from "@uni-status/database/schema";
import { requireOrganization } from "../middleware/auth";
import { eq, and, desc, inArray, isNotNull, gte, sql } from "drizzle-orm";

type CertificateAdditionalDetails = {
  serialNumber?: string;
  fingerprint?: string;
  altNames?: string[] | string;
  protocol?: string;
  cipher?: string;
  chainValid?: boolean;
  hostnameValid?: boolean;
  chainComplete?: boolean;
  ocspStapled?: boolean;
  ocspUrl?: string;
  ocspResponder?: string;
  crlStatus?: string;
  caaStatus?: string;
  tlsVersionStatus?: string;
  cipherStatus?: string;
};

function normalizeAdditionalDetails(raw?: Record<string, unknown> | null): CertificateAdditionalDetails | null {
  if (!raw) return null;

  const parseString = (value: unknown) =>
    typeof value === "string" && value.trim() !== "" ? value.trim() : undefined;
  const parseBool = (value: unknown) => {
    if (typeof value === "boolean") return value;
    if (typeof value === "string") {
      if (value.toLowerCase() === "true") return true;
      if (value.toLowerCase() === "false") return false;
    }
    return undefined;
  };
  const parseAltNames = (value: unknown): string[] | undefined => {
    if (Array.isArray(value)) {
      const names = value
        .map((v) => (typeof v === "string" ? v : String(v)))
        .map((v) => v.trim())
        .filter(Boolean);
      return names.length ? names : undefined;
    }
    if (typeof value === "string") {
      const names = value.split(",").map((v) => v.trim()).filter(Boolean);
      return names.length ? names : undefined;
    }
    return undefined;
  };

  const details: CertificateAdditionalDetails = {
    serialNumber: parseString(raw["serialNumber"]),
    fingerprint: parseString(raw["fingerprint"]),
    altNames: parseAltNames(raw["altNames"]),
    protocol: parseString(raw["protocol"]),
    cipher: parseString(raw["cipher"]),
    chainValid: parseBool(raw["chainValid"]),
    hostnameValid: parseBool(raw["hostnameValid"]),
    chainComplete: parseBool(raw["chainComplete"]),
    ocspStapled: parseBool(raw["ocspStapled"]),
    ocspUrl: parseString(raw["ocspUrl"]),
    ocspResponder: parseString(raw["ocspResponder"]),
    crlStatus: parseString(raw["crlStatus"]),
    caaStatus: parseString(raw["caaStatus"]),
    tlsVersionStatus: parseString(raw["tlsVersionStatus"]),
    cipherStatus: parseString(raw["cipherStatus"]),
  };

  const hasValue = Object.values(details).some((value) =>
    Array.isArray(value) ? value.length > 0 : value !== undefined
  );

  return hasValue ? details : null;
}

function extractAdditionalDetails(result?: { metadata?: unknown; headers?: unknown } | null): CertificateAdditionalDetails | null {
  const metadataDetails = (result?.metadata as { certificateDetails?: Record<string, unknown> } | undefined)?.certificateDetails;
  return (
    normalizeAdditionalDetails(metadataDetails) ||
    normalizeAdditionalDetails(result?.headers as Record<string, unknown> | undefined)
  );
}

function extractFingerprint(result?: { metadata?: unknown; headers?: unknown }): string | undefined {
  const metadataDetails = (result?.metadata as { certificateDetails?: Record<string, unknown> } | undefined)?.certificateDetails;
  const metadataFingerprint = metadataDetails?.fingerprint;
  const headerFingerprint = (result?.headers as Record<string, unknown> | undefined)?.fingerprint;

  if (typeof metadataFingerprint === "string" && metadataFingerprint.trim()) return metadataFingerprint.trim();
  if (typeof headerFingerprint === "string" && headerFingerprint.trim()) return headerFingerprint.trim();
  return undefined;
}

export const certificatesRoutes = new OpenAPIHono();

// List all certificates sorted by expiry
// GET /api/v1/certificates
certificatesRoutes.get("/", async (c) => {
  const organizationId = await requireOrganization(c);

  // Parse pagination parameters
  const limit = Math.min(Math.max(parseInt(c.req.query("limit") || "100"), 1), 100);
  const offset = Math.max(parseInt(c.req.query("offset") || "0"), 0);

  // Get total count of SSL/HTTPS monitors
  const countResult = await db
    .select({ count: sql<number>`count(*)` })
    .from(monitors)
    .where(
      and(
        eq(monitors.organizationId, organizationId),
        inArray(monitors.type, ["ssl", "https"])
      )
    );

  const total = Number(countResult[0]?.count ?? 0);

  // Get all SSL/HTTPS monitors for this organization
  const sslMonitors = await db.query.monitors.findMany({
    where: and(
      eq(monitors.organizationId, organizationId),
      inArray(monitors.type, ["ssl", "https"])
    ),
    orderBy: [desc(monitors.createdAt)],
    limit,
    offset,
  });

  if (sslMonitors.length === 0) {
    return c.json({
      success: true,
      data: [],
      meta: {
        total,
        limit,
        offset,
        hasMore: false,
      },
    });
  }

  // Get latest check result with certificate info for each monitor
  const certificateData = await Promise.all(
    sslMonitors.map(async (monitor) => {
      const latestResult = await db.query.checkResults.findFirst({
        where: and(
          eq(checkResults.monitorId, monitor.id),
          isNotNull(checkResults.certificateInfo)
        ),
        orderBy: [desc(checkResults.createdAt)],
      });

      const latestCtCheck = await db.query.checkResults.findFirst({
        where: and(
          eq(checkResults.monitorId, monitor.id),
          sql`${checkResults.metadata} ->> 'checkType' = 'certificate_transparency'`
        ),
        orderBy: [desc(checkResults.createdAt)],
      });

      const ctMetadata = latestCtCheck?.metadata as
        | {
            newCertificates?: Array<Record<string, unknown>>;
            unexpectedCertificates?: Array<Record<string, unknown>>;
          }
        | undefined;

      const ctNewCount = Array.isArray(ctMetadata?.newCertificates)
        ? ctMetadata?.newCertificates.length
        : 0;
      const ctUnexpectedCount = Array.isArray(ctMetadata?.unexpectedCertificates)
        ? ctMetadata?.unexpectedCertificates.length
        : 0;

      const ctDisabled = monitor.config?.certificateTransparency?.enabled === false;
      const ctState = ctDisabled
        ? "disabled"
        : latestCtCheck
        ? latestCtCheck.status === "error"
          ? "error"
          : ctUnexpectedCount > 0
          ? "unexpected"
          : ctNewCount > 0
          ? "new"
          : "healthy"
        : "unknown";

      const additionalDetails = extractAdditionalDetails(latestResult);

      return {
        monitorId: monitor.id,
        monitorName: monitor.name,
        url: monitor.url,
        monitorType: monitor.type,
        monitorStatus: monitor.status,
        certificateInfo: latestResult?.certificateInfo ?? null,
        additionalCertDetails: additionalDetails,
        lastChecked: latestResult?.createdAt ?? null,
        sslConfig: monitor.config?.ssl ?? null,
        ctStatus: {
          state: ctState,
          newCount: ctNewCount,
          unexpectedCount: ctUnexpectedCount,
          lastChecked: latestCtCheck?.createdAt ?? null,
          checkedAt: latestCtCheck?.createdAt ?? null,
        },
      };
    })
  );

  // Sort by days until expiry (ascending - expiring soonest first)
  // Put certificates without expiry info at the end
  const sorted = certificateData.sort((a, b) => {
    const daysA = a.certificateInfo?.daysUntilExpiry;
    const daysB = b.certificateInfo?.daysUntilExpiry;

    if (daysA === undefined && daysB === undefined) return 0;
    if (daysA === undefined) return 1;
    if (daysB === undefined) return -1;

    return daysA - daysB;
  });

  // Calculate summary stats
  const now = new Date();
  const stats = {
    total: sorted.length,
    expired: sorted.filter(c => {
      const days = c.certificateInfo?.daysUntilExpiry;
      return days !== undefined && days <= 0;
    }).length,
    expiringSoon: sorted.filter(c => {
      const days = c.certificateInfo?.daysUntilExpiry;
      return days !== undefined && days > 0 && days <= 30;
    }).length,
    healthy: sorted.filter(c => {
      const days = c.certificateInfo?.daysUntilExpiry;
      return days !== undefined && days > 30;
    }).length,
    unknown: sorted.filter(c => c.certificateInfo?.daysUntilExpiry === undefined).length,
  };

  return c.json({
    success: true,
    data: sorted,
    stats,
    meta: {
      total,
      limit,
      offset,
      hasMore: offset + sslMonitors.length < total,
    },
  });
});

// Get detailed certificate info for a specific monitor
// GET /api/v1/certificates/:monitorId
certificatesRoutes.get("/:monitorId", async (c) => {
  const organizationId = await requireOrganization(c);
  const { monitorId } = c.req.param();

  // Verify monitor belongs to org and is SSL/HTTPS type
  const monitor = await db.query.monitors.findFirst({
    where: and(
      eq(monitors.id, monitorId),
      eq(monitors.organizationId, organizationId)
    ),
  });

  if (!monitor) {
    return c.json({
      success: false,
      error: "Monitor not found",
    }, 404);
  }

  if (monitor.type !== "ssl" && monitor.type !== "https") {
    return c.json({
      success: false,
      error: "Monitor is not an SSL or HTTPS type",
    }, 400);
  }

  // Get latest check result with certificate info
  const latestResult = await db.query.checkResults.findFirst({
    where: and(
      eq(checkResults.monitorId, monitorId),
      isNotNull(checkResults.certificateInfo)
    ),
    orderBy: [desc(checkResults.createdAt)],
  });

  const latestAdditionalDetails = extractAdditionalDetails(latestResult);

  // Get certificate history (last 30 days)
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  const history = await db.query.checkResults.findMany({
    where: and(
      eq(checkResults.monitorId, monitorId),
      isNotNull(checkResults.certificateInfo),
      gte(checkResults.createdAt, thirtyDaysAgo)
    ),
    orderBy: [desc(checkResults.createdAt)],
    limit: 100,
  });

  // Detect certificate changes (when fingerprint changes)
  const certificateChanges: {
    changedAt: Date;
    previousFingerprint?: string;
    newFingerprint?: string;
    daysUntilExpiry?: number;
  }[] = [];

  let previousFingerprint: string | undefined;
  for (let i = history.length - 1; i >= 0; i--) {
    const entry = history[i];
    if (!entry) continue;
    const currentFingerprint = extractFingerprint(entry);
    if (currentFingerprint && previousFingerprint && currentFingerprint !== previousFingerprint) {
      certificateChanges.push({
        changedAt: entry.createdAt,
        previousFingerprint,
        newFingerprint: currentFingerprint,
        daysUntilExpiry: entry.certificateInfo?.daysUntilExpiry,
      });
    }
    if (currentFingerprint) {
      previousFingerprint = currentFingerprint;
    }
  }

  // Certificate Transparency checks (last 10)
  const ctChecks = await db.query.checkResults.findMany({
    where: and(
      eq(checkResults.monitorId, monitorId),
      sql`${checkResults.metadata} ->> 'checkType' = 'certificate_transparency'`
    ),
    orderBy: [desc(checkResults.createdAt)],
    limit: 10,
  });

  const latestCtCheck = ctChecks[0];
  const ctMetadata = latestCtCheck?.metadata as
    | {
        entries?: Array<Record<string, unknown>>;
        newCertificates?: Array<Record<string, unknown>>;
        unexpectedCertificates?: Array<Record<string, unknown>>;
      }
    | undefined;

  const ctNewCount = Array.isArray(ctMetadata?.newCertificates)
    ? ctMetadata?.newCertificates.length
    : 0;
  const ctUnexpectedCount = Array.isArray(ctMetadata?.unexpectedCertificates)
    ? ctMetadata?.unexpectedCertificates.length
    : 0;

  const ctState: "healthy" | "new" | "unexpected" | "error" | "disabled" | "unknown" =
    monitor.config?.certificateTransparency?.enabled === false
      ? "disabled"
      : latestCtCheck
      ? latestCtCheck.status === "error"
        ? "error"
        : ctUnexpectedCount > 0
        ? "unexpected"
        : ctNewCount > 0
        ? "new"
        : "healthy"
      : "unknown";

  const ctHistory = ctChecks.map((check) => {
    const meta = check.metadata as {
      newCertificates?: Array<unknown>;
      unexpectedCertificates?: Array<unknown>;
    };
    const newCount = Array.isArray(meta?.newCertificates) ? meta.newCertificates.length : 0;
    const unexpectedCount = Array.isArray(meta?.unexpectedCertificates) ? meta.unexpectedCertificates.length : 0;

    const status = check.status === "error"
      ? "error"
      : unexpectedCount > 0
      ? "unexpected"
      : newCount > 0
      ? "new"
      : "healthy";

    return {
      checkedAt: check.createdAt,
      newCount,
      unexpectedCount,
      status,
    };
  });

  return c.json({
    success: true,
    data: {
      monitor: {
        id: monitor.id,
        name: monitor.name,
        url: monitor.url,
        type: monitor.type,
        status: monitor.status,
        sslConfig: monitor.config?.ssl ?? {
          expiryWarningDays: 30,
          expiryErrorDays: 7,
          checkChain: true,
          checkHostname: true,
        },
      },
      currentCertificate: latestResult?.certificateInfo ?? null,
      additionalDetails: latestAdditionalDetails,
      lastChecked: latestResult?.createdAt ?? null,
      checkStatus: latestResult?.status ?? null,
      errorMessage: latestResult?.errorMessage ?? null,
      errorCode: latestResult?.errorCode ?? null,
      history: history.map(h => ({
        checkedAt: h.createdAt,
        daysUntilExpiry: h.certificateInfo?.daysUntilExpiry,
        status: h.status,
        errorCode: h.errorCode,
      })),
      certificateChanges,
      ctStatus: {
        state: ctState,
        newCount: ctNewCount,
        unexpectedCount: ctUnexpectedCount,
        lastChecked: latestCtCheck?.createdAt ?? null,
        message: latestCtCheck?.errorMessage ?? undefined,
      },
      ctRecentCertificates: (ctMetadata?.entries as Array<Record<string, unknown>>) ?? [],
      ctNewCertificates: (ctMetadata?.newCertificates as Array<Record<string, unknown>>) ?? [],
      ctUnexpectedCertificates: (ctMetadata?.unexpectedCertificates as Array<Record<string, unknown>>) ?? [],
      ctHistory,
    },
  });
});
