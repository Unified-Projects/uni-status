import { Job } from "bullmq";
import { nanoid } from "nanoid";
import { db } from "@uni-status/database";
import {
  probes,
  probeAssignments,
  probePendingJobs,
  probeHeartbeats,
  monitors,
} from "@uni-status/database/schema";
import { eq, and, lt, desc, inArray, sql } from "drizzle-orm";
import { createLogger } from "@uni-status/shared";

const log = createLogger({ module: "probe-dispatcher" });


interface ProbeJobDispatchData {
  monitorId: string;
  organizationId: string;
}

interface ProbeHealthCheckData {
  organizationId?: string;
}

// Default job expiration time (5 minutes)
const JOB_EXPIRATION_MS = 5 * 60 * 1000;

// Probe offline threshold (2 minutes without heartbeat)
const OFFLINE_THRESHOLD_MS = 2 * 60 * 1000;

// Dispatch a job to assigned probes for a monitor
export async function processProbeJobDispatch(
  job: Job<ProbeJobDispatchData>
): Promise<void> {
  const { monitorId, organizationId } = job.data;

  log.info(`Dispatching probe job for monitor ${monitorId}`);

  // Get the monitor details
  const monitor = await db.query.monitors.findFirst({
    where: and(
      eq(monitors.id, monitorId),
      eq(monitors.organizationId, organizationId)
    ),
  });

  if (!monitor) {
    log.info(`Monitor ${monitorId} not found`);
    return;
  }

  if (monitor.paused) {
    log.info(`Monitor ${monitorId} is paused, skipping`);
    return;
  }

  // Get probe assignments for this monitor
  const assignments = await db.query.probeAssignments.findMany({
    where: eq(probeAssignments.monitorId, monitorId),
    with: {
      probe: true,
    },
    orderBy: [probeAssignments.priority],
  });

  if (assignments.length === 0) {
    log.info(`No probe assignments for monitor ${monitorId}`);
    return;
  }

  // Filter to only active probes
  const activeAssignments = assignments.filter(
    (a) => a.probe.status === "active"
  );

  if (activeAssignments.length === 0) {
    log.info(`No active probes assigned to monitor ${monitorId}`);
    return;
  }

  // Determine which probes should run this check
  let targetProbes: typeof probes.$inferSelect[] = [];

  // Check if any assignment is exclusive
  const exclusiveAssignment = activeAssignments.find((a) => a.exclusive);
  if (exclusiveAssignment) {
    // Only the exclusive probe runs the check
    targetProbes = [exclusiveAssignment.probe];
  } else {
    // All assigned active probes run the check (for redundancy)
    targetProbes = activeAssignments.map((a) => a.probe);
  }

  // Build job data
  const jobData = {
    monitorId: monitor.id,
    url: monitor.url,
    type: monitor.type,
    method: monitor.method ?? undefined,
    headers: (monitor.headers as Record<string, string> | null) ?? undefined,
    body: monitor.body ?? undefined,
    timeoutMs: monitor.timeoutMs,
    assertions: (monitor.assertions as Record<string, unknown>) || undefined,
    config: (monitor.config as Record<string, unknown>) || undefined,
  };

  const now = new Date();
  const expiresAt = new Date(now.getTime() + JOB_EXPIRATION_MS);

  // Create pending jobs for each target probe
  for (const probe of targetProbes) {
    const jobId = nanoid();

    await db.insert(probePendingJobs).values({
      id: jobId,
      probeId: probe.id,
      monitorId: monitor.id,
      jobData,
      status: "pending",
      expiresAt,
      createdAt: now,
    });

    log.info(`Created pending job ${jobId} for probe ${probe.name}`);
  }

  log.info(`Dispatched jobs to ${targetProbes.length} probes for monitor ${monitorId}`);
}

// Check probe health and update status
export async function processProbeHealthCheck(
  job: Job<ProbeHealthCheckData>
): Promise<void> {
  const { organizationId } = job.data;

  log.info(`Running probe health check${organizationId ? ` for org ${organizationId}` : ""}`);

  const now = new Date();
  const offlineThreshold = new Date(now.getTime() - OFFLINE_THRESHOLD_MS);

  // Find probes that should be marked offline
  let probesQuery = db.query.probes.findMany({
    where: and(
      eq(probes.status, "active"),
      lt(probes.lastHeartbeatAt, offlineThreshold)
    ),
  });

  let offlineProbes = await probesQuery;

  // Filter by organization if specified
  if (organizationId) {
    offlineProbes = offlineProbes.filter((p) => p.organizationId === organizationId);
  }

  if (offlineProbes.length > 0) {
    log.info(`Marking ${offlineProbes.length} probes as offline`);

    await db
      .update(probes)
      .set({
        status: "offline",
        updatedAt: now,
      })
      .where(inArray(probes.id, offlineProbes.map((p) => p.id)));

    for (const probe of offlineProbes) {
      log.info(`Probe ${probe.name} (${probe.id}) marked offline - last heartbeat: ${probe.lastHeartbeatAt?.toISOString()}`);
    }
  }

  // Clean up expired pending jobs
  const expiredJobs = await db
    .delete(probePendingJobs)
    .where(
      and(
        lt(probePendingJobs.expiresAt, now),
        inArray(probePendingJobs.status, ["pending", "claimed"])
      )
    )
    .returning({ id: probePendingJobs.id });

  if (expiredJobs.length > 0) {
    log.info(`Cleaned up ${expiredJobs.length} expired probe jobs`);
  }

  // Clean up old heartbeat records (keep last 7 days)
  const heartbeatRetention = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const deletedHeartbeats = await db
    .delete(probeHeartbeats)
    .where(lt(probeHeartbeats.createdAt, heartbeatRetention))
    .returning({ id: probeHeartbeats.id });

  if (deletedHeartbeats.length > 0) {
    log.info(`Cleaned up ${deletedHeartbeats.length} old heartbeat records`);
  }

  log.info(`Probe health check complete`);
}

// Process results submitted by probes (if using queue-based approach instead of API)
export async function processProbeResult(
  job: Job<{
    jobId: string;
    probeId: string;
    monitorId: string;
    success: boolean;
    responseTimeMs: number;
    statusCode?: number;
    errorMessage?: string;
    metadata?: Record<string, unknown>;
  }>
): Promise<void> {
  const { jobId, probeId, monitorId, success, responseTimeMs, statusCode, errorMessage, metadata } = job.data;

  log.info(`Processing probe result for job ${jobId}`);

  // This is similar to the API endpoint handler
  // Mark job as completed
  await db
    .update(probePendingJobs)
    .set({ status: "completed" })
    .where(eq(probePendingJobs.id, jobId));

  // The actual check result creation and alert evaluation
  // is handled by the API endpoint in probes.ts
  // This processor is for queue-based result submission

  log.info(`Probe result processed for job ${jobId}: ${success ? "success" : "failure"}`);
}

// Get probe statistics for monitoring
export async function getProbeStats(organizationId?: string): Promise<{
  total: number;
  active: number;
  offline: number;
  disabled: number;
  pending: number;
  pendingJobCount: number;
}> {
  let probesQuery = db.query.probes.findMany({});
  let allProbes = await probesQuery;

  if (organizationId) {
    allProbes = allProbes.filter((p) => p.organizationId === organizationId);
  }

  const statusCounts = {
    total: allProbes.length,
    active: allProbes.filter((p) => p.status === "active").length,
    offline: allProbes.filter((p) => p.status === "offline").length,
    disabled: allProbes.filter((p) => p.status === "disabled").length,
    pending: allProbes.filter((p) => p.status === "pending").length,
    pendingJobCount: 0,
  };

  // Count pending jobs
  const probeIds = allProbes.map((p) => p.id);
  if (probeIds.length > 0) {
    const jobCount = await db
      .select({ count: sql<number>`COUNT(*)` })
      .from(probePendingJobs)
      .where(
        and(
          inArray(probePendingJobs.probeId, probeIds),
          eq(probePendingJobs.status, "pending")
        )
      );
    statusCounts.pendingJobCount = jobCount[0]?.count || 0;
  }

  return statusCounts;
}

// Scheduler integration - create jobs for monitors with probe assignments
export async function scheduleProbeJobs(organizationId?: string): Promise<void> {
  log.info(`Scheduling probe jobs${organizationId ? ` for org ${organizationId}` : ""}`);

  // Get all monitors with probe assignments that need checking
  const now = new Date();

  let monitorsToCheck = await db.query.monitors.findMany({
    where: and(
      eq(monitors.paused, false),
      lt(monitors.nextCheckAt, now)
    ),
  });

  if (organizationId) {
    monitorsToCheck = monitorsToCheck.filter((m) => m.organizationId === organizationId);
  }

  // Filter to only monitors with probe assignments
  const monitorIds = monitorsToCheck.map((m) => m.id);
  const assignmentsMap = new Map<string, boolean>();

  if (monitorIds.length > 0) {
    const assignments = await db.query.probeAssignments.findMany({
      where: inArray(probeAssignments.monitorId, monitorIds),
      columns: {
        monitorId: true,
      },
    });

    for (const a of assignments) {
      assignmentsMap.set(a.monitorId, true);
    }
  }

  // Only process monitors with probe assignments
  const monitorsWithProbes = monitorsToCheck.filter((m) => assignmentsMap.has(m.id));

  log.info(`Found ${monitorsWithProbes.length} monitors with probe assignments needing checks`);

  // Dispatch jobs for each monitor
  for (const monitor of monitorsWithProbes) {
    await processProbeJobDispatch({
      data: {
        monitorId: monitor.id,
        organizationId: monitor.organizationId,
      },
    } as Job<ProbeJobDispatchData>);

    // Update next check time
    const nextCheckAt = new Date(now.getTime() + monitor.intervalSeconds * 1000);
    await db
      .update(monitors)
      .set({ nextCheckAt })
      .where(eq(monitors.id, monitor.id));
  }

  log.info(`Scheduled ${monitorsWithProbes.length} probe jobs`);
}
