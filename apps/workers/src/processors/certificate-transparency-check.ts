import { Job } from "bullmq";
import { nanoid } from "nanoid";
import { db } from "@uni-status/database";
import { monitors, checkResults } from "@uni-status/database/schema";
import { evaluateAlerts } from "../lib/alert-evaluator";
import { publishEvent } from "../lib/redis";
import { and, desc, eq, sql } from "drizzle-orm";
import type { CheckStatus } from "@uni-status/shared/types";
import { createLogger } from "@uni-status/shared";

const log = createLogger({ module: "certificate-transparency-check" });


interface CertificateTransparencyJob {
  monitorId: string;
  organizationId: string;
  url: string;
  config?: {
    certificateTransparency?: {
      enabled?: boolean;
      expectedIssuers?: string[];
      alertOnNewCertificates?: boolean;
      alertOnUnexpectedIssuers?: boolean;
    };
  };
}

export interface CtLogEntry {
  id: string;
  loggedAt?: string;
  notBefore?: string;
  notAfter?: string;
  issuer?: string;
  commonName?: string;
  dnsNames?: string[];
  serialNumber?: string;
  caId?: number;
  source?: string;
}

function extractDomain(url: string): string {
  try {
    const parsed = url.startsWith("http") ? new URL(url) : new URL(`https://${url}`);
    return parsed.hostname || url;
  } catch {
    return url.split("/")[0]?.split(":")[0] || url;
  }
}

async function fetchCtEntries(domain: string): Promise<CtLogEntry[]> {
  const response = await fetch(`https://crt.sh/?q=${encodeURIComponent(domain)}&output=json`);

  if (!response.ok) {
    throw new Error(`CT log query failed (${response.status})`);
  }

  const raw = (await response.json()) as Array<Record<string, unknown>>;

  const entries = raw
    .map((row) => {
      const id = String(row.min_cert_id ?? row.id ?? row.serial_number ?? "").trim();
      const nameValue = (row.name_value as string | undefined)?.split(/\s+|,|\n/).filter(Boolean) ?? [];

      const entry: CtLogEntry = {
        id: id || `${domain}-${row.entry_timestamp ?? Date.now()}`,
        issuer: (row.issuer_name as string | undefined)?.trim(),
        commonName: (row.common_name as string | undefined)?.trim() || nameValue[0],
        dnsNames: nameValue.length ? Array.from(new Set(nameValue)) : undefined,
        serialNumber: (row.serial_number as string | undefined)?.trim(),
        caId: row.issuer_ca_id as number | undefined,
        loggedAt: row.entry_timestamp ? new Date(String(row.entry_timestamp)).toISOString() : undefined,
        notBefore: row.not_before ? new Date(String(row.not_before)).toISOString() : undefined,
        notAfter: row.not_after ? new Date(String(row.not_after)).toISOString() : undefined,
        source: "crt.sh",
      };

      return entry;
    })
    .filter((entry) => entry.id);

  // Deduplicate and sort newest first
  const deduped = Array.from(new Map(entries.map((entry) => [entry.id, entry])).values());
  return deduped.sort((a, b) => {
    const aTime = a.loggedAt ? new Date(a.loggedAt).getTime() : 0;
    const bTime = b.loggedAt ? new Date(b.loggedAt).getTime() : 0;
    return bTime - aTime;
  });
}

export async function processCertificateTransparencyCheck(
  job: Job<CertificateTransparencyJob>
) {
  const { monitorId, organizationId, url, config } = job.data;
  const ctConfig = config?.certificateTransparency || {};

  if (ctConfig.enabled === false) {
    log.info(`[CT] Skipping CT check for ${monitorId} (disabled)`);
    return { skipped: true };
  }

  const domain = extractDomain(url);
  const startTime = Date.now();

  try {
    const monitor = await db.query.monitors.findFirst({
      where: and(eq(monitors.id, monitorId), eq(monitors.organizationId, organizationId)),
    });

    if (!monitor) {
      log.warn(`[CT] Monitor ${monitorId} not found`);
      return { skipped: true };
    }

    // Fetch previous CT check to detect newly issued certs
    const previousCtCheck = await db.query.checkResults.findFirst({
      where: and(
        eq(checkResults.monitorId, monitorId),
        sql`${checkResults.metadata} ->> 'checkType' = 'certificate_transparency'`
      ),
      orderBy: [desc(checkResults.createdAt)],
    });

    const previousLogIds = Array.isArray((previousCtCheck?.metadata as { ctLogIds?: string[] } | undefined)?.ctLogIds)
      ? ((previousCtCheck!.metadata as { ctLogIds?: string[] }).ctLogIds ?? [])
      : [];

    let status: CheckStatus = "success";
    let errorMessage: string | undefined;
    let errorCode: string | undefined;

    let entries: CtLogEntry[] = [];
    let newEntries: CtLogEntry[] = [];
    let unexpectedEntries: CtLogEntry[] = [];

    try {
      entries = await fetchCtEntries(domain);
      newEntries = entries.filter((entry) => !previousLogIds.includes(entry.id));

      const issuerAllowList = (ctConfig.expectedIssuers || []).map((issuer) => issuer.toLowerCase());
      const shouldCheckIssuers = issuerAllowList.length > 0 && ctConfig.alertOnUnexpectedIssuers !== false;

      if (shouldCheckIssuers) {
        unexpectedEntries = newEntries.filter((entry) => {
          if (!entry.issuer) return false;
          return !issuerAllowList.includes(entry.issuer.toLowerCase());
        });
      }

      if (unexpectedEntries.length > 0) {
        const firstUnexpected = unexpectedEntries[0];
        status = "failure";
        errorMessage = `Unexpected certificate issuer detected (${firstUnexpected?.issuer ?? "unknown"})`;
        errorCode = "CT_UNEXPECTED_ISSUER";
      } else if (ctConfig.alertOnNewCertificates !== false && newEntries.length > 0) {
        status = "degraded";
        errorMessage = `${newEntries.length} new certificate${newEntries.length > 1 ? "s" : ""} in CT logs`;
        errorCode = "CT_NEW_CERTIFICATE";
      }
    } catch (error) {
      status = "error";
      errorMessage = error instanceof Error ? error.message : "CT log fetch failed";
      errorCode = "CT_FETCH_FAILED";
    }

    const responseTimeMs = Date.now() - startTime;
    const now = new Date();

    const metadata = {
      checkType: "certificate_transparency" as const,
      domain,
      source: "crt.sh",
      fetchedAt: now.toISOString(),
      totalEntries: entries.length,
      ctLogIds: entries.map((entry) => entry.id),
      entries: entries.slice(0, 25),
      newCertificates: newEntries.slice(0, 10),
      unexpectedCertificates: unexpectedEntries.slice(0, 10),
    };

    const resultId = nanoid();

    await db.insert(checkResults).values({
      id: resultId,
      monitorId,
      region: "ct",
      status,
      responseTimeMs,
      errorMessage,
      errorCode,
      metadata,
      createdAt: now,
    });

    // Trigger alerts for new/unexpected certificates
    if (status === "failure" || status === "degraded") {
      await evaluateAlerts({
        monitorId,
        organizationId,
        checkResultId: resultId,
        checkStatus: status,
        errorMessage,
        responseTimeMs,
      });
    }

    await publishEvent(`monitor:${monitorId}`, {
      type: "monitor:certificate_transparency",
      data: {
        monitorId,
        domain,
        status,
        newCertificates: metadata.newCertificates,
        unexpectedCertificates: metadata.unexpectedCertificates,
        source: metadata.source,
        timestamp: now.toISOString(),
        errorMessage,
      },
    });

    log.info(
      `[CT] Checked ${domain} (${monitorId}) - ${status} - new:${newEntries.length} unexpected:${unexpectedEntries.length}`
    );

    return {
      status,
      responseTimeMs,
      newCertificates: newEntries.length,
      unexpectedCertificates: unexpectedEntries.length,
    };
  } catch (error) {
    log.error(`[CT] Error processing CT check for ${monitorId}:`, error);
    return { status: "error", error: (error as Error).message };
  }
}
