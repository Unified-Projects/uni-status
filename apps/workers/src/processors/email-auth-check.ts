import { Job } from "bullmq";
import { nanoid } from "nanoid";
import { Resolver } from "dns/promises";
import { db } from "@uni-status/database";
import { monitors, checkResults } from "@uni-status/database/schema";
import { eq } from "drizzle-orm";
import { publishEvent } from "../lib/redis";
import { evaluateAlerts } from "../lib/alert-evaluator";
import { linkCheckToActiveIncident } from "../lib/incident-linker";
import type { CheckStatus } from "@uni-status/shared/types";

interface EmailAuthCheckJob {
  monitorId: string;
  url: string;
  timeoutMs: number;
  regions: string[];
  config?: {
    emailAuth?: {
      domain: string;
      dkimSelectors?: string[];
      nameserver?: string;
      validatePolicy?: boolean;
    };
  };
}

interface SpfResult {
  record: string | null;
  valid: boolean;
  status: "pass" | "fail" | "none" | "error";
  mechanisms?: string[];
  policy?: "fail" | "softfail" | "neutral" | "none";
}

interface DkimSelectorResult {
  selector: string;
  record: string | null;
  valid: boolean;
  keyBits?: number;
  algorithm?: string;
}

interface DkimResult {
  selectors: DkimSelectorResult[];
  status: "pass" | "partial" | "fail" | "none" | "error";
}

interface DmarcResult {
  record: string | null;
  valid: boolean;
  status: "pass" | "fail" | "none" | "error";
  policy?: "none" | "quarantine" | "reject";
  subdomainPolicy?: "none" | "quarantine" | "reject";
  percentage?: number;
  alignment?: { spf: "strict" | "relaxed"; dkim: "strict" | "relaxed" };
}

interface EmailAuthDetails {
  domain: string;
  spf: SpfResult;
  dkim: DkimResult;
  dmarc: DmarcResult;
  overallScore: number;
}

// Default DKIM selectors to check if none specified
const DEFAULT_DKIM_SELECTORS = ["default", "google", "selector1", "selector2", "k1", "s1", "s2"];

async function resolveTxtRecords(
  hostname: string,
  nameserver?: string,
  timeoutMs: number = 10000
): Promise<string[]> {
  const resolver = new Resolver();

  if (nameserver) {
    resolver.setServers([nameserver]);
  }

  const timeoutPromise = new Promise<never>((_, reject) => {
    setTimeout(() => reject(new Error("DNS query timeout")), timeoutMs);
  });

  try {
    const result = await Promise.race([
      resolver.resolveTxt(hostname),
      timeoutPromise,
    ]);
    // TXT records return arrays of strings, join them
    return result.map((r) => r.join(""));
  } catch (error) {
    if (error instanceof Error) {
      if (error.message.includes("ENOTFOUND") || error.message.includes("NXDOMAIN")) {
        return [];
      }
      if (error.message.includes("ENODATA") || error.message.includes("NODATA")) {
        return [];
      }
    }
    throw error;
  }
}

// Parse SPF record and extract policy
function parseSpfRecord(record: string): SpfResult {
  if (!record.toLowerCase().startsWith("v=spf1")) {
    return {
      record,
      valid: false,
      status: "fail",
    };
  }

  const mechanisms: string[] = [];
  let policy: SpfResult["policy"] = "none";

  const parts = record.split(/\s+/);
  for (const part of parts) {
    const lowerPart = part.toLowerCase();

    // Extract policy from all/redirect
    if (lowerPart === "-all") {
      policy = "fail";
    } else if (lowerPart === "~all") {
      policy = "softfail";
    } else if (lowerPart === "?all") {
      policy = "neutral";
    } else if (lowerPart === "+all" || lowerPart === "all") {
      policy = "none"; // +all is permissive, essentially no policy
    }

    // Collect mechanisms
    if (
      lowerPart.startsWith("include:") ||
      lowerPart.startsWith("a:") ||
      lowerPart.startsWith("mx:") ||
      lowerPart.startsWith("ip4:") ||
      lowerPart.startsWith("ip6:") ||
      lowerPart.startsWith("ptr:") ||
      lowerPart.startsWith("exists:") ||
      lowerPart.startsWith("redirect=")
    ) {
      mechanisms.push(part);
    } else if (lowerPart === "a" || lowerPart === "mx" || lowerPart === "ptr") {
      mechanisms.push(part);
    }
  }

  return {
    record,
    valid: true,
    status: "pass",
    mechanisms,
    policy,
  };
}

// Parse DKIM record and extract key info
function parseDkimRecord(record: string, selector: string): DkimSelectorResult {
  if (!record.toLowerCase().includes("v=dkim1")) {
    return {
      selector,
      record,
      valid: false,
    };
  }

  let algorithm: string | undefined;
  let keyBits: number | undefined;

  // Parse key algorithm
  const kMatch = record.match(/k=(\w+)/i);
  const algorithmMatch = kMatch?.[1];
  if (algorithmMatch) {
    algorithm = algorithmMatch.toLowerCase();
  }

  // Parse public key and estimate bits
  const pMatch = record.match(/p=([A-Za-z0-9+/=]+)/);
  const keyData = pMatch?.[1];
  if (keyData) {
    // Rough estimate: base64 length * 6 / 8 gives bytes, * 8 for bits
    // RSA keys are typically 1024, 2048, or 4096 bits
    const keyBytes = Math.floor((keyData.length * 6) / 8);
    if (keyBytes >= 500) {
      keyBits = 4096;
    } else if (keyBytes >= 250) {
      keyBits = 2048;
    } else if (keyBytes >= 125) {
      keyBits = 1024;
    } else {
      keyBits = 512;
    }
  }

  return {
    selector,
    record,
    valid: true,
    algorithm,
    keyBits,
  };
}

// Parse DMARC record and extract policy info
function parseDmarcRecord(record: string): DmarcResult {
  if (!record.toLowerCase().startsWith("v=dmarc1")) {
    return {
      record,
      valid: false,
      status: "fail",
    };
  }

  let policy: DmarcResult["policy"];
  let subdomainPolicy: DmarcResult["subdomainPolicy"];
  let percentage: number | undefined;
  let alignment: DmarcResult["alignment"];

  // Parse policy
  const pMatch = record.match(/;\s*p=(\w+)/i);
  const pValue = pMatch?.[1];
  if (pValue) {
    const p = pValue.toLowerCase();
    if (p === "reject" || p === "quarantine" || p === "none") {
      policy = p;
    }
  }

  // Parse subdomain policy
  const spMatch = record.match(/;\s*sp=(\w+)/i);
  const spValue = spMatch?.[1];
  if (spValue) {
    const sp = spValue.toLowerCase();
    if (sp === "reject" || sp === "quarantine" || sp === "none") {
      subdomainPolicy = sp;
    }
  }

  // Parse percentage
  const pctMatch = record.match(/;\s*pct=(\d+)/i);
  const pctValue = pctMatch?.[1];
  if (pctValue) {
    percentage = parseInt(pctValue, 10);
  }

  // Parse alignment settings
  const aspfMatch = record.match(/;\s*aspf=(\w)/i);
  const adkimMatch = record.match(/;\s*adkim=(\w)/i);
  if (aspfMatch || adkimMatch) {
    alignment = {
      spf: aspfMatch?.[1]?.toLowerCase() === "s" ? "strict" : "relaxed",
      dkim: adkimMatch?.[1]?.toLowerCase() === "s" ? "strict" : "relaxed",
    };
  }

  return {
    record,
    valid: true,
    status: "pass",
    policy,
    subdomainPolicy,
    percentage,
    alignment,
  };
}

// Calculate overall email authentication score (0-100)
function calculateOverallScore(spf: SpfResult, dkim: DkimResult, dmarc: DmarcResult): number {
  let score = 0;

  // SPF scoring (max 30 points)
  if (spf.valid) {
    score += 10; // Has valid SPF
    if (spf.policy === "fail") {
      score += 20; // Strict policy
    } else if (spf.policy === "softfail") {
      score += 15;
    } else if (spf.policy === "neutral") {
      score += 5;
    }
  }

  // DKIM scoring (max 30 points)
  if (dkim.status === "pass") {
    score += 20; // At least one valid DKIM
    // Bonus for strong keys
    const hasStrongKey = dkim.selectors.some((s) => s.keyBits && s.keyBits >= 2048);
    if (hasStrongKey) {
      score += 10;
    }
  } else if (dkim.status === "partial") {
    score += 10; // Some DKIM selectors valid
  }

  // DMARC scoring (max 40 points)
  if (dmarc.valid) {
    score += 10; // Has DMARC
    if (dmarc.policy === "reject") {
      score += 30; // Strictest policy
    } else if (dmarc.policy === "quarantine") {
      score += 20;
    } else if (dmarc.policy === "none") {
      score += 5; // Monitoring only
    }
  }

  return Math.min(100, score);
}

export async function processEmailAuthCheck(job: Job<EmailAuthCheckJob>) {
  const { monitorId, url, timeoutMs, regions, config } = job.data;
  const defaultRegion = process.env.MONITOR_DEFAULT_REGION || "uk";
  const preferredRegion = regions[0] || defaultRegion;
  const region = preferredRegion === "us-east" && defaultRegion !== "us-east"
    ? defaultRegion
    : preferredRegion;

  const emailAuthConfig = config?.emailAuth;

  // Extract domain from config or URL
  let domain: string;
  if (emailAuthConfig?.domain) {
    domain = emailAuthConfig.domain;
  } else {
    try {
      domain = new URL(url).hostname;
    } catch {
      domain = url.replace(/^https?:\/\//, "").split("/")[0] ?? url;
    }
  }

  const nameserver = emailAuthConfig?.nameserver;
  const dkimSelectors = emailAuthConfig?.dkimSelectors?.length
    ? emailAuthConfig.dkimSelectors
    : DEFAULT_DKIM_SELECTORS;
  const validatePolicy = emailAuthConfig?.validatePolicy ?? true;

  console.log(`Processing Email Auth check for ${monitorId}: ${domain}`);

  const startTime = performance.now();
  let status: CheckStatus = "success";
  let responseTimeMs = 0;
  let errorMessage: string | undefined;
  let errorCode: string | undefined;

  let spfResult: SpfResult = { record: null, valid: false, status: "none" };
  let dkimResult: DkimResult = { selectors: [], status: "none" };
  let dmarcResult: DmarcResult = { record: null, valid: false, status: "none" };

  try {
    // Check SPF record
    const spfRecords = await resolveTxtRecords(domain, nameserver, timeoutMs);
    const spfRecord = spfRecords.find((r) => r.toLowerCase().startsWith("v=spf1"));
    if (spfRecord) {
      spfResult = parseSpfRecord(spfRecord);
    }

    // Check DKIM records for each selector
    const dkimSelectors_results: DkimSelectorResult[] = [];
    for (const selector of dkimSelectors) {
      try {
        const dkimDomain = `${selector}._domainkey.${domain}`;
        const dkimRecords = await resolveTxtRecords(dkimDomain, nameserver, timeoutMs);
        const dkimRecord = dkimRecords.find((r) => r.toLowerCase().includes("v=dkim1"));
        if (dkimRecord) {
          dkimSelectors_results.push(parseDkimRecord(dkimRecord, selector));
        }
      } catch {
        // DKIM selector not found, continue to next
      }
    }

    const validDkimCount = dkimSelectors_results.filter((s) => s.valid).length;
    if (validDkimCount > 0) {
      dkimResult = {
        selectors: dkimSelectors_results,
        status: dkimSelectors_results.every((s) => s.valid) ? "pass" : "partial",
      };
    } else if (dkimSelectors_results.length > 0) {
      dkimResult = { selectors: dkimSelectors_results, status: "fail" };
    }

    // Check DMARC record
    const dmarcRecords = await resolveTxtRecords(`_dmarc.${domain}`, nameserver, timeoutMs);
    const dmarcRecord = dmarcRecords.find((r) => r.toLowerCase().startsWith("v=dmarc1"));
    if (dmarcRecord) {
      dmarcResult = parseDmarcRecord(dmarcRecord);
    }

    responseTimeMs = Math.round(performance.now() - startTime);

    // Determine overall status
    const overallScore = calculateOverallScore(spfResult, dkimResult, dmarcResult);

    if (validatePolicy) {
      // Strict validation: require all three with good policies
      if (!spfResult.valid || !dmarcResult.valid) {
        status = "failure";
        errorMessage = !spfResult.valid
          ? "SPF record not found or invalid"
          : "DMARC record not found or invalid";
        errorCode = "MISSING_RECORD";
      } else if (overallScore < 50) {
        status = "degraded";
        errorMessage = "Email authentication policies are weak";
        errorCode = "WEAK_POLICY";
      }
    } else {
      // Just check for presence
      if (!spfResult.valid && !dmarcResult.valid && dkimResult.status === "none") {
        status = "failure";
        errorMessage = "No email authentication records found";
        errorCode = "NO_RECORDS";
      }
    }
  } catch (error) {
    responseTimeMs = Math.round(performance.now() - startTime);
    status = "error";

    if (error instanceof Error) {
      errorMessage = error.message;
      if (error.message.includes("timeout")) {
        errorCode = "TIMEOUT";
        status = "timeout";
      } else {
        errorCode = "DNS_ERROR";
      }
    } else {
      errorMessage = "Email authentication check failed";
      errorCode = "CHECK_ERROR";
    }
  }

  const overallScore = calculateOverallScore(spfResult, dkimResult, dmarcResult);

  const emailAuthDetails: EmailAuthDetails = {
    domain,
    spf: spfResult,
    dkim: dkimResult,
    dmarc: dmarcResult,
    overallScore,
  };

  // Store result
  const resultId = nanoid();

  await db.insert(checkResults).values({
    id: resultId,
    monitorId,
    region,
    status,
    responseTimeMs,
    dnsMs: responseTimeMs,
    errorMessage,
    errorCode,
    emailAuthDetails,
    createdAt: new Date(),
  });

  // Link failed checks to active incidents
  await linkCheckToActiveIncident(resultId, monitorId, status);

  // Update monitor status
  const newStatus = status === "success" ? "active" : status === "degraded" ? "degraded" : "down";

  await db
    .update(monitors)
    .set({
      status: newStatus,
      lastCheckedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(monitors.id, monitorId));

  // Fetch monitor to get organizationId for alert evaluation
  const monitor = await db
    .select({ organizationId: monitors.organizationId })
    .from(monitors)
    .where(eq(monitors.id, monitorId))
    .limit(1);

  // Publish event
  await publishEvent(`monitor:${monitorId}`, {
    type: "monitor:check",
    data: {
      monitorId,
      status,
      responseTimeMs,
      emailAuthDetails,
      timestamp: new Date().toISOString(),
    },
  });

  // Evaluate alert policies for this monitor
  if (monitor[0]) {
    await evaluateAlerts({
      monitorId,
      organizationId: monitor[0].organizationId,
      checkResultId: resultId,
      checkStatus: status,
      errorMessage,
      responseTimeMs,
    });
  }

  console.log(
    `Email Auth check completed for ${monitorId}: ${status} (${responseTimeMs}ms) - ` +
    `SPF: ${spfResult.status}, DKIM: ${dkimResult.status}, DMARC: ${dmarcResult.status}, Score: ${overallScore}`
  );

  return { status, responseTimeMs, emailAuthDetails };
}
