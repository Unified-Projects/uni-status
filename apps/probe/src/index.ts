import os from "node:os";
import net from "node:net";
import fs from "node:fs";
import process from "node:process";
import { performance } from "node:perf_hooks";
import ping from "ping";
import pkg from "../package.json" assert { type: "json" };
import { createLogger } from "@uni-status/shared";

const log = createLogger({ module: "probe-index" });


/**
 * Reads a secret value from a file if the _FILE variant is set,
 * otherwise returns the direct environment variable value.
 */
function readFileSecret(envKey: string): string | undefined {
  const fileEnvKey = `${envKey}_FILE`;
  const filePath = process.env[fileEnvKey];

  if (filePath) {
    if (!fs.existsSync(filePath)) {
      throw new Error(`Secret file not found: ${filePath} (from ${fileEnvKey})`);
    }
    return fs.readFileSync(filePath, "utf-8").trim();
  }

  return process.env[envKey];
}

type MonitorType =
  | "http"
  | "https"
  | "ping"
  | "tcp";

type JobData = {
  monitorId: string;
  url: string;
  type: MonitorType;
  method?: string;
  headers?: Record<string, string>;
  body?: string;
  timeoutMs?: number;
  assertions?: {
    statusCode?: number[];
    responseTime?: number;
    body?: {
      contains?: string;
      notContains?: string;
      regex?: string;
    };
  };
};

type PendingJob = {
  id: string;
  monitorId: string;
  jobData: JobData;
};

type JobResult = {
  success: boolean;
  responseTimeMs: number;
  statusCode?: number;
  errorMessage?: string;
  metadata?: Record<string, unknown>;
};

const VERSION = pkg.version ?? "0.0.0";

const parseNumberEnv = (value: string | undefined, fallback: number) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

const rawApiUrl = (process.env.UNI_STATUS_API_URL || "http://localhost:3001/api").replace(/\/$/, "");
const apiBase = rawApiUrl.endsWith("/v1") ? rawApiUrl : `${rawApiUrl}/v1`;
const probeToken = readFileSecret("UNI_STATUS_PROBE_TOKEN");
const probeId = process.env.UNI_STATUS_PROBE_ID;
const pollIntervalMs = parseNumberEnv(process.env.UNI_STATUS_PROBE_POLL_INTERVAL_MS, 5000);
const heartbeatIntervalMs = parseNumberEnv(process.env.UNI_STATUS_PROBE_HEARTBEAT_MS, 30000);
const jobBatchSize = parseNumberEnv(process.env.UNI_STATUS_PROBE_JOB_BATCH_SIZE, 5);

if (!probeToken) {
  log.error("[probe] UNI_STATUS_PROBE_TOKEN is required.");
  process.exit(1);
}

let activeJobs = 0;
let completedJobs = 0;
let failedJobs = 0;
let totalResponseTime = 0;
let pollInFlight = false;

const authHeaders = {
  Authorization: `Bearer ${probeToken}`,
};

function getHostnameFromUrl(target: string): string | null {
  try {
    const url = target.includes("://") ? new URL(target) : new URL(`http://${target}`);
    return url.hostname || target;
  } catch {
    return null;
  }
}

function buildHeartbeatPayload() {
  const memoryUsage = Math.round((process.memoryUsage().rss / os.totalmem()) * 100);
  const load = os.loadavg()[0] ?? 0;
  const cpuUsage = Math.max(0, Math.min(100, Math.round((load / os.cpus().length) * 100)));

  return {
    version: VERSION,
    metrics: {
      cpuUsage,
      memoryUsage,
      activeJobs,
      completedJobs,
      failedJobs,
      avgResponseTime: completedJobs > 0 ? Math.round(totalResponseTime / completedJobs) : 0,
    },
    metadata: {
      os: `${os.platform()} ${os.release()}`,
      arch: os.arch(),
      hostname: os.hostname(),
      cpu: os.cpus()[0]?.model,
      memory: `${Math.round(os.totalmem() / 1024 / 1024)}MB`,
      uptime: Math.round(process.uptime()),
      probeId,
    },
  };
}

async function sendHeartbeat() {
  try {
    const payload = buildHeartbeatPayload();
    const res = await fetch(`${apiBase}/probes/agent/heartbeat`, {
      method: "POST",
      headers: {
        ...authHeaders,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const errorText = await res.text();
      log.error(`[probe] Heartbeat failed: ${res.status} ${errorText}`);
    }
  } catch (error) {
    log.error("[probe] Heartbeat error:", error instanceof Error ? error.message : error);
  }
}

async function runHttpJob(job: JobData): Promise<JobResult> {
  const start = performance.now();
  const timeoutMs = job.timeoutMs || 10000;
  const controller = new AbortController();
  const timeoutHandle = setTimeout(() => controller.abort(), timeoutMs);

  let success = false;
  let statusCode: number | undefined;
  let errorMessage: string | undefined;
  let bodyText: string | undefined;

  try {
    const response = await fetch(job.url, {
      method: job.method || "GET",
      headers: job.headers,
      body: job.body,
      signal: controller.signal,
    });
    clearTimeout(timeoutHandle);

    statusCode = response.status;
    const responseTimeMs = Math.round(performance.now() - start);
    bodyText = await response.text();

    success = response.ok;

    if (job.assertions?.statusCode && !job.assertions.statusCode.includes(statusCode)) {
      success = false;
      errorMessage = `Status ${statusCode} did not match expected: ${job.assertions.statusCode.join(",")}`;
    }

    if (job.assertions?.responseTime && responseTimeMs > job.assertions.responseTime) {
      success = false;
      errorMessage = `Response time ${responseTimeMs}ms exceeded ${job.assertions.responseTime}ms`;
    }

    if (job.assertions?.body?.contains && !bodyText.includes(job.assertions.body.contains)) {
      success = false;
      errorMessage = `Body missing required text: ${job.assertions.body.contains}`;
    }

    if (job.assertions?.body?.notContains && bodyText.includes(job.assertions.body.notContains)) {
      success = false;
      errorMessage = `Body contained forbidden text: ${job.assertions.body.notContains}`;
    }

    if (job.assertions?.body?.regex) {
      const regex = new RegExp(job.assertions.body.regex);
      if (!regex.test(bodyText)) {
        success = false;
        errorMessage = `Body did not match regex: ${job.assertions.body.regex}`;
      }
    }

    return {
      success,
      statusCode,
      responseTimeMs,
      errorMessage,
      metadata: {
        url: job.url,
        responseBytes: bodyText.length,
      },
    };
  } catch (error) {
    clearTimeout(timeoutHandle);
    const responseTimeMs = Math.round(performance.now() - start);
    const message = error instanceof Error ? error.message : "HTTP request failed";
    const isAbort =
      (error instanceof Error && error.name === "AbortError") ||
      message.toLowerCase().includes("abort");

    return {
      success: false,
      statusCode,
      responseTimeMs,
      errorMessage: isAbort ? `Request timed out after ${timeoutMs}ms` : message,
    };
  }
}

async function runPingJob(job: JobData): Promise<JobResult> {
  const start = performance.now();
  const hostname = getHostnameFromUrl(job.url);
  if (!hostname) {
    return {
      success: false,
      responseTimeMs: 0,
      errorMessage: "Invalid hostname",
    };
  }

  try {
    const result = await ping.promise.probe(hostname, {
      timeout: Math.ceil((job.timeoutMs || 5000) / 1000),
      min_reply: 3,
    });

    const responseTimeMs =
      typeof result.time === "number" && result.time > 0
        ? Math.round(result.time)
        : Math.round(performance.now() - start);

    if (!result.alive) {
      return {
        success: false,
        responseTimeMs,
        errorMessage: "Host is not responding to ping",
      };
    }

    return {
      success: true,
      responseTimeMs,
      metadata: {
        packetLoss: result.packetLoss,
      },
    };
  } catch (error) {
    return {
      success: false,
      responseTimeMs: Math.round(performance.now() - start),
      errorMessage: error instanceof Error ? error.message : "Ping failed",
    };
  }
}

async function runTcpJob(job: JobData): Promise<JobResult> {
  const start = performance.now();
  const timeoutMs = job.timeoutMs || 5000;
  let hostname = "";
  let port = 0;

  try {
    if (job.url.startsWith("tcp://")) {
      const parsed = new URL(job.url);
      hostname = parsed.hostname;
      port = Number(parsed.port);
    } else if (job.url.includes(":")) {
      const [host, portStr] = job.url.split(":");
      if (host) {
        hostname = host;
      }
      if (portStr) {
        port = Number(portStr);
      }
    } else {
      hostname = job.url;
    }
  } catch {
    // ignore parsing errors
  }

  if (!hostname || !port) {
    return {
      success: false,
      responseTimeMs: 0,
      errorMessage: "Invalid TCP target, expected host:port",
    };
  }

  return new Promise<JobResult>((resolve) => {
    const socket = new net.Socket();
    let resolved = false;

    const finalize = (result: JobResult) => {
      if (resolved) return;
      resolved = true;
      socket.destroy();
      resolve(result);
    };

    socket.setTimeout(timeoutMs);

    socket.connect(port, hostname, () => {
      finalize({
        success: true,
        responseTimeMs: Math.round(performance.now() - start),
      });
    });

    socket.on("error", (err) => {
      finalize({
        success: false,
        responseTimeMs: Math.round(performance.now() - start),
        errorMessage: err.message,
      });
    });

    socket.on("timeout", () => {
      finalize({
        success: false,
        responseTimeMs: Math.round(performance.now() - start),
        errorMessage: `Connection timed out after ${timeoutMs}ms`,
      });
    });
  });
}

async function executeJob(job: PendingJob): Promise<JobResult> {
  if (!job.jobData || !job.jobData.type) {
    return {
      success: false,
      responseTimeMs: 0,
      errorMessage: "Job missing monitor payload",
    };
  }

  switch (job.jobData.type) {
    case "http":
    case "https":
      return runHttpJob(job.jobData);
    case "ping":
      return runPingJob(job.jobData);
    case "tcp":
      return runTcpJob(job.jobData);
    default:
      return {
        success: false,
        responseTimeMs: 0,
        errorMessage: `Unsupported monitor type: ${job.jobData.type}`,
      };
  }
}

async function submitJobResult(job: PendingJob, result: JobResult) {
  try {
    const payload = {
      jobId: job.id,
      monitorId: job.monitorId,
      success: result.success,
      responseTimeMs: result.responseTimeMs,
      statusCode: result.statusCode,
      errorMessage: result.errorMessage,
      metadata: {
        ...result.metadata,
        probeVersion: VERSION,
      },
    };

    const res = await fetch(`${apiBase}/probes/agent/jobs/${job.id}/result`, {
      method: "POST",
      headers: {
        ...authHeaders,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const text = await res.text();
      log.error(`[probe] Failed to submit result for job ${job.id}: ${res.status} ${text}`);
    }
  } catch (error) {
    log.error(`[probe] Error submitting result for job ${job.id}:`, error instanceof Error ? error.message : error);
  }
}

async function handleJob(job: PendingJob) {
  activeJobs += 1;
  const result = await executeJob(job);
  completedJobs += 1;
  totalResponseTime += result.responseTimeMs;
  if (!result.success) {
    failedJobs += 1;
  }

  await submitJobResult(job, result);
  activeJobs -= 1;
}

async function pollJobs() {
  if (pollInFlight) return;
  pollInFlight = true;

  try {
    const res = await fetch(`${apiBase}/probes/agent/jobs?limit=${jobBatchSize}`, {
      headers: authHeaders,
    });

    if (!res.ok) {
      const text = await res.text();
      log.error(`[probe] Failed to poll jobs: ${res.status} ${text}`);
      return;
    }

    const body = (await res.json()) as { data?: PendingJob[] };
    const jobs: PendingJob[] = body.data || [];

    for (const job of jobs) {
      await handleJob(job);
    }
  } catch (error) {
    log.error("[probe] Error polling jobs:", error instanceof Error ? error.message : error);
  } finally {
    pollInFlight = false;
  }
}

function start() {
  log.info(`[probe] Starting Uni-Status probe v${VERSION}`);
  log.info(`[probe] API: ${apiBase}`);
  log.info(`[probe] Probe ID: ${probeId || "not set"} | Region provided via dashboard`);
  log.info(`[probe] Poll interval: ${pollIntervalMs}ms | Heartbeat interval: ${heartbeatIntervalMs}ms`);

  // Kick off immediately, then on interval
  sendHeartbeat();
  pollJobs();

  setInterval(sendHeartbeat, heartbeatIntervalMs);
  setInterval(pollJobs, pollIntervalMs);
}

process.on("SIGINT", () => {
  log.info("[probe] Received SIGINT, exiting.");
  process.exit(0);
});

process.on("SIGTERM", () => {
  log.info("[probe] Received SIGTERM, exiting.");
  process.exit(0);
});

start();
