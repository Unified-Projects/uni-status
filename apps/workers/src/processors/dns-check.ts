import { Job } from "bullmq";
import { nanoid } from "nanoid";
import { Resolver } from "dns/promises";
import tls from "tls";
import { db } from "@uni-status/database";
import { monitors, checkResults } from "@uni-status/database/schema";
import { eq } from "drizzle-orm";
import { publishEvent } from "../lib/redis";
import { evaluateAlerts } from "../lib/alert-evaluator";
import { linkCheckToActiveIncident } from "../lib/incident-linker";
import type { CheckStatus } from "@uni-status/shared/types";
import { createLogger } from "@uni-status/shared";

const log = createLogger({ module: "dns-check" });


type DnsRecordType = "A" | "AAAA" | "CNAME" | "TXT" | "MX" | "SRV" | "NS" | "SOA" | "PTR";
type ResolverType = "udp" | "doh" | "dot";

interface ResolverTarget {
  endpoint: string;
  type?: ResolverType;
  region?: string;
  name?: string;
}

interface DnsCheckJob {
  monitorId: string;
  url: string;
  timeoutMs: number;
  regions: string[];
  config?: {
    dns?: {
      recordType?: DnsRecordType;
      nameserver?: string;
      expectedValue?: string;
      resolvers?: ResolverTarget[];
      propagationCheck?: boolean;
      resolverStrategy?: "any" | "quorum" | "all";
      dnssecValidation?: boolean;
      dohEndpoint?: string;
      dotEndpoint?: string;
      anycastCheck?: boolean;
      regionTargets?: string[];
    };
  };
}

interface ResolverResult {
  resolver: string;
  type: ResolverType;
  region?: string;
  name?: string;
  recordType: DnsRecordType;
  records: string[];
  ttl?: number;
  responseTimeMs?: number;
  dnssecValidated?: boolean;
  status: "success" | "failure" | "timeout" | "error";
  errorMessage?: string;
  errorCode?: string;
}

async function resolveViaUdp(
  hostname: string,
  recordType: DnsRecordType,
  target: ResolverTarget,
  timeoutMs: number
): Promise<ResolverResult> {
  const resolver = new Resolver();
  const nameserver = target.endpoint === "system" ? undefined : target.endpoint;
  if (nameserver) {
    resolver.setServers([nameserver]);
  }

  const records: string[] = [];
  let ttl: number | undefined;
  const start = performance.now();

  const timeoutPromise = new Promise<never>((_, reject) => {
    setTimeout(() => reject(new Error("DNS query timeout")), timeoutMs);
  });

  const queryPromise = (async () => {
    switch (recordType) {
      case "A": {
        const result = await resolver.resolve4(hostname, { ttl: true });
        if (Array.isArray(result) && result.length > 0) {
          records.push(...result.map((r) => r.address));
          ttl = result[0]?.ttl;
        }
        break;
      }
      case "AAAA": {
        const result = await resolver.resolve6(hostname, { ttl: true });
        if (Array.isArray(result) && result.length > 0) {
          records.push(...result.map((r) => r.address));
          ttl = result[0]?.ttl;
        }
        break;
      }
      case "CNAME": {
        const result = await resolver.resolveCname(hostname);
        records.push(...result);
        break;
      }
      case "TXT": {
        const result = await resolver.resolveTxt(hostname);
        records.push(...result.map((r) => r.join("")));
        break;
      }
      case "MX": {
        const result = await resolver.resolveMx(hostname);
        records.push(...result.map((r) => `${r.priority} ${r.exchange}`));
        break;
      }
      case "SRV": {
        const result = await resolver.resolveSrv(hostname);
        records.push(...result.map((r) => `${r.priority} ${r.weight} ${r.port} ${r.name}`));
        break;
      }
      case "NS": {
        const result = await resolver.resolveNs(hostname);
        records.push(...result);
        break;
      }
      case "SOA": {
        const result = await resolver.resolveSoa(hostname);
        records.push(`${result.nsname} ${result.hostmaster} ${result.serial} ${result.refresh} ${result.retry} ${result.expire} ${result.minttl}`);
        break;
      }
      case "PTR": {
        const result = await resolver.resolvePtr(hostname);
        records.push(...result);
        break;
      }
      default:
        throw new Error(`Unsupported record type: ${recordType}`);
    }
  })();

  try {
    await Promise.race([queryPromise, timeoutPromise]);
    const responseTimeMs = Math.round(performance.now() - start);
    return {
      resolver: target.endpoint || "system",
      type: target.type ?? "udp",
      region: target.region,
      name: target.name,
      recordType,
      records,
      ttl,
      responseTimeMs,
      status: records.length > 0 ? "success" : "failure",
      errorMessage: records.length > 0 ? undefined : `No ${recordType} records found`,
      errorCode: records.length > 0 ? undefined : "NO_RECORDS",
    };
  } catch (error) {
    const responseTimeMs = Math.round(performance.now() - start);
    const message = error instanceof Error ? error.message : "DNS lookup failed";
    const isTimeout = message.toLowerCase().includes("timeout");

    return {
      resolver: target.endpoint || "system",
      type: target.type ?? "udp",
      region: target.region,
      name: target.name,
      recordType,
      records: [],
      responseTimeMs,
      status: isTimeout ? "timeout" : "error",
      errorMessage: isTimeout ? "DNS query timeout" : message,
      errorCode: isTimeout ? "TIMEOUT" : "DNS_ERROR",
    };
  }
}

async function resolveViaDoh(
  hostname: string,
  recordType: DnsRecordType,
  target: ResolverTarget,
  timeoutMs: number
): Promise<ResolverResult> {
  interface DohAnswer {
    data?: string;
    TTL?: number;
  }

  interface DohResponse {
    Answer?: DohAnswer[];
    AD?: boolean;
  }

  const start = performance.now();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const dohUrl = new URL(target.endpoint);
    dohUrl.searchParams.set("name", hostname);
    dohUrl.searchParams.set("type", recordType);
    // Request DNSSEC validation flag
    dohUrl.searchParams.set("do", "1");

    const response = await fetch(dohUrl.toString(), {
      headers: { accept: "application/dns-json" },
      signal: controller.signal,
    });

    const responseTimeMs = Math.round(performance.now() - start);

    if (!response.ok) {
      return {
        resolver: target.endpoint,
        type: "doh",
        region: target.region,
        name: target.name,
        recordType,
        records: [],
        responseTimeMs,
        status: "failure",
        errorMessage: `DoH returned HTTP ${response.status}`,
        errorCode: "DOH_HTTP_ERROR",
      };
    }

    const json = (await response.json()) as DohResponse;
    const answers = Array.isArray(json.Answer) ? json.Answer : [];
    const records = answers
      .map((answer: { data?: string }) => answer.data)
      .filter((val: unknown): val is string => typeof val === "string");
    const ttl = answers[0]?.TTL;
    const dnssecValidated = Boolean(json.AD);

    return {
      resolver: target.endpoint,
      type: "doh",
      region: target.region,
      name: target.name,
      recordType,
      records,
      ttl,
      responseTimeMs,
      dnssecValidated,
      status: records.length > 0 ? "success" : "failure",
      errorMessage: records.length > 0 ? undefined : `No ${recordType} records from DoH`,
      errorCode: records.length > 0 ? undefined : "NO_RECORDS",
    };
  } catch (error) {
    const responseTimeMs = Math.round(performance.now() - start);
    const message = error instanceof Error ? error.message : "DoH query failed";
    const isTimeout = message.toLowerCase().includes("abort");

    return {
      resolver: target.endpoint,
      type: "doh",
      region: target.region,
      name: target.name,
      recordType,
      records: [],
      responseTimeMs,
      status: isTimeout ? "timeout" : "error",
      errorMessage: isTimeout ? "DoH query timed out" : message,
      errorCode: isTimeout ? "TIMEOUT" : "DOH_ERROR",
    };
  } finally {
    clearTimeout(timeout);
  }
}

async function resolveViaDot(
  hostname: string,
  recordType: DnsRecordType,
  target: ResolverTarget,
  timeoutMs: number
): Promise<ResolverResult> {
  const [rawHost, portStr] = target.endpoint.split(":");
  const host = rawHost || target.endpoint;
  const port = Number(portStr) || 853;
  const start = performance.now();

  try {
    const socket = await new Promise<tls.TLSSocket>((resolve, reject) => {
      const activeSocket = tls.connect(
        {
          host,
          port,
          servername: host,
          rejectUnauthorized: false,
        },
        () => resolve(activeSocket)
      );

      activeSocket.setTimeout(timeoutMs);
      activeSocket.once("error", reject);
      activeSocket.once("timeout", () => reject(new Error("DoT connection timeout")));
    });

    const handshakeMs = Math.round(performance.now() - start);
    socket.end();

    // Re-use UDP resolution for record data to avoid implementing raw DNS wire format
    const udpResult = await resolveViaUdp(hostname, recordType, { ...target, endpoint: host }, timeoutMs);

    return {
      ...udpResult,
      resolver: target.endpoint,
      type: "dot",
      responseTimeMs: (udpResult.responseTimeMs ?? 0) + handshakeMs,
      errorMessage: udpResult.records.length > 0 ? undefined : udpResult.errorMessage,
      errorCode: udpResult.errorCode,
      status: udpResult.status,
    };
  } catch (error) {
    const responseTimeMs = Math.round(performance.now() - start);
    const message = error instanceof Error ? error.message : "DoT connection failed";
    const isTimeout = message.toLowerCase().includes("timeout");

    return {
      resolver: target.endpoint,
      type: "dot",
      region: target.region,
      name: target.name,
      recordType,
      records: [],
      responseTimeMs,
      status: isTimeout ? "timeout" : "error",
      errorMessage: message,
      errorCode: isTimeout ? "TIMEOUT" : "DOT_ERROR",
    };
  }
}

export async function processDnsCheck(job: Job<DnsCheckJob>) {
  const { monitorId, url, timeoutMs, regions, config } = job.data;
  const defaultRegion = process.env.MONITOR_DEFAULT_REGION || "uk";
  const preferredRegion = regions[0] || defaultRegion;
  const region = preferredRegion === "us-east" && defaultRegion !== "us-east"
    ? defaultRegion
    : preferredRegion;

  // Get DNS config options
  const dnsConfig = config?.dns;
  const recordType: DnsRecordType = dnsConfig?.recordType || "A";
  const nameserver = dnsConfig?.nameserver;
  const expectedValue = dnsConfig?.expectedValue;

  log.info(`Processing DNS check for ${monitorId}: ${url} (${recordType} record)`);

  let status: CheckStatus = "success";
  let responseTimeMs = 0;
  let errorMessage: string | undefined;
  let errorCode: string | undefined;

  // Extract hostname from URL
  let hostname: string;
  try {
    hostname = new URL(url).hostname;
  } catch {
    // If it's not a valid URL, treat it as a hostname directly
    hostname = url.replace(/^https?:\/\//, "").split("/")[0] ?? url;
  }

  // Build resolver targets (multi-region / DoH / DoT / system)
  const resolverTargets: ResolverTarget[] = [];
  if (dnsConfig?.resolvers?.length) {
    resolverTargets.push(...dnsConfig.resolvers);
  }
  if (dnsConfig?.dohEndpoint) {
    resolverTargets.push({ endpoint: dnsConfig.dohEndpoint, type: "doh", name: "DoH" });
  }
  if (dnsConfig?.dotEndpoint) {
    resolverTargets.push({ endpoint: dnsConfig.dotEndpoint, type: "dot", name: "DoT" });
  }
  if (nameserver) {
    resolverTargets.push({ endpoint: nameserver, type: "udp", name: "custom" });
  }
  resolverTargets.push({ endpoint: "system", type: "udp", name: "system" });

  // Deduplicate resolver list
  const dedupedTargets: ResolverTarget[] = [];
  const seen = new Set<string>();
  for (const target of resolverTargets) {
    const key = `${target.type ?? "udp"}|${target.endpoint}`;
    if (!seen.has(key)) {
      seen.add(key);
      dedupedTargets.push(target);
    }
  }

  const resolverResults: ResolverResult[] = await Promise.all(
    dedupedTargets.map((target) => {
      const type = target.type ?? "udp";
      if (type === "doh") return resolveViaDoh(hostname, recordType, target, timeoutMs);
      if (type === "dot") return resolveViaDot(hostname, recordType, target, timeoutMs);
      return resolveViaUdp(hostname, recordType, target, timeoutMs);
    })
  );

  const successResults = resolverResults.filter((r) => r.status === "success");
  const timeoutResults = resolverResults.filter((r) => r.status === "timeout");

  // Choose representative records (majority set wins)
  const canonical = (records: string[]) => records.slice().sort().join("|");
  const setCounts = new Map<string, { count: number; sample: ResolverResult }>();
  for (const result of successResults) {
    const key = canonical(result.records);
    if (!setCounts.has(key)) {
      setCounts.set(key, { count: 0, sample: result });
    }
    const entry = setCounts.get(key)!;
    entry.count += 1;
  }

  let aggregatedRecords: string[] = [];
  let aggregatedTtl: number | undefined;

  if (successResults.length > 0) {
    // Pick the most common answer set
    const majority = Array.from(setCounts.values()).sort((a, b) => b.count - a.count)[0];
    if (majority) {
      aggregatedRecords = majority.sample.records;
      aggregatedTtl = majority.sample.ttl;
    }
    const validTimes = successResults
      .map((r) => r.responseTimeMs)
      .filter((ms): ms is number => typeof ms === "number" && ms > 0);
    responseTimeMs = validTimes.length > 0 ? Math.min(...validTimes) : 1;
  } else {
    // No successful responses, use fastest response time for diagnostics
    const allTimes = resolverResults
      .map((r) => r.responseTimeMs)
      .filter((ms): ms is number => typeof ms === "number");
    responseTimeMs = allTimes.length > 0 ? Math.min(...allTimes) : timeoutMs;
  }

  // Evaluate outcomes
  const issues: string[] = [];
  const resolverStrategy = dnsConfig?.resolverStrategy || "any";

  if (successResults.length === 0) {
    status = timeoutResults.length === resolverResults.length ? "timeout" : "failure";
    errorMessage = timeoutResults.length === resolverResults.length
      ? "All resolvers timed out"
      : "All resolver lookups failed";
    errorCode = timeoutResults.length === resolverResults.length ? "TIMEOUT" : "DNS_ERROR";
  } else {
    // Expected value check
    if (expectedValue) {
      const hasExpected = aggregatedRecords.some((record) =>
        record.toLowerCase().includes(expectedValue.toLowerCase())
      );
      if (!hasExpected) {
        status = "failure";
        errorMessage = `Expected value "${expectedValue}" not found in ${recordType} records`;
        errorCode = "EXPECTED_VALUE_MISMATCH";
      }
    }

    // Resolver strategy / propagation enforcement
    const totalResolvers = resolverResults.length;
    const majorityEntry = successResults.length > 0
      ? Array.from(setCounts.values()).sort((a, b) => b.count - a.count)[0]
      : undefined;
    const majorityCount = majorityEntry?.count ?? 0;
    const hasMismatch = setCounts.size > 1;

    if (resolverStrategy === "all" && successResults.length !== totalResolvers) {
      status = "failure";
      errorMessage = "Not all resolvers returned records";
      errorCode = "PROPAGATION_INCOMPLETE";
    } else if (resolverStrategy === "quorum") {
      const quorum = Math.ceil(totalResolvers / 2);
      if (majorityCount < quorum) {
        status = "failure";
        errorMessage = "Failed to reach resolver quorum";
        errorCode = "PROPAGATION_INCOMPLETE";
      } else if (hasMismatch && status === "success") {
        status = "degraded";
        issues.push("Propagation mismatch across resolvers");
        errorCode = "PROPAGATION_MISMATCH";
      }
    } else if (dnsConfig?.propagationCheck && hasMismatch && status === "success") {
      status = dnsConfig.anycastCheck ? "failure" : "degraded";
      issues.push("Propagation mismatch across resolvers");
      errorCode = dnsConfig.anycastCheck ? "ANYCAST_MISMATCH" : "PROPAGATION_MISMATCH";
    }

    // Region-specific coverage
    if (dnsConfig?.regionTargets?.length) {
      const covered = new Set(
        successResults
          .map((r) => r.region)
          .filter((regionId): regionId is string => Boolean(regionId))
      );
      const missing = dnsConfig.regionTargets.filter((target) => !covered.has(target));
      if (missing.length > 0 && status === "success") {
        status = "degraded";
        issues.push(`Missing resolver coverage for regions: ${missing.join(", ")}`);
        errorCode = "REGION_COVERAGE_INCOMPLETE";
      }
    }

    // DNSSEC validation (requires a resolver that signals AD)
    if (dnsConfig?.dnssecValidation) {
      const validated = successResults.some((r) => r.dnssecValidated);
      if (!validated && status === "success") {
        status = "degraded";
        issues.push("DNSSEC validation not confirmed");
        errorCode = "DNSSEC_NOT_VALIDATED";
      }
    }

    // DoH / DoT reachability
    if (dnsConfig?.dohEndpoint) {
      const dohResult = resolverResults.find((r) => r.type === "doh" && r.resolver === dnsConfig.dohEndpoint);
      if (!dohResult || dohResult.status !== "success") {
        if (status === "success") status = "degraded";
        issues.push("DoH resolver unreachable");
        errorCode = errorCode || "DOH_UNREACHABLE";
      }
    }
    if (dnsConfig?.dotEndpoint) {
      const dotResult = resolverResults.find((r) => r.type === "dot" && r.resolver === dnsConfig.dotEndpoint);
      if (!dotResult || dotResult.status !== "success") {
        if (status === "success") status = "degraded";
        issues.push("DoT resolver unreachable");
        errorCode = errorCode || "DOT_UNREACHABLE";
      }
    }
  }

  if (issues.length > 0) {
    errorMessage = [errorMessage, ...issues].filter(Boolean).join("; ");
  }

  // Store result
  const resultId = nanoid();

  const headersMeta: Record<string, string> | undefined = successResults.length > 0 ? {
    recordType,
    records: aggregatedRecords.join(", "),
    ...(aggregatedTtl !== undefined ? { ttl: String(aggregatedTtl) } : {}),
    resolverStrategy,
    propagation: setCounts.size > 1 ? "mismatch" : "consistent",
    resolvers: String(resolverResults.length),
    ...(nameserver ? { nameserver } : {}),
    resolverResults: JSON.stringify(
      resolverResults.map((r) => ({
        resolver: r.resolver,
        type: r.type,
        region: r.region,
        status: r.status,
        records: r.records,
        dnssec: r.dnssecValidated,
        time: r.responseTimeMs,
        error: r.errorMessage,
      }))
    ),
  } : undefined;

  await db.insert(checkResults).values({
    id: resultId,
    monitorId,
    region,
    status,
    responseTimeMs,
    dnsMs: responseTimeMs,
    errorMessage,
    errorCode,
    // Store DNS result info in headers field (repurposing for metadata)
    headers: headersMeta,
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
      recordType,
      records: aggregatedRecords,
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

  log.info(`DNS check completed for ${monitorId}: ${status} (${responseTimeMs}ms) - ${recordType}: ${aggregatedRecords.join(", ") || "no records"}`);
  log.info(
    `DNS detail -> records: ${aggregatedRecords.join(", ") || "none"}; resolvers: ${
      resolverResults.length
    }; strategy: ${resolverStrategy}`
  );

  return { status, responseTimeMs, recordType, records: aggregatedRecords };
}
