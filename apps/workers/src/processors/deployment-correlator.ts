import { Job } from "bullmq";
import { nanoid } from "nanoid";
import { db } from "@uni-status/database";
import {
  deploymentEvents,
  deploymentIncidents,
  incidents,
} from "@uni-status/database/schema";
import { eq, and, gte, lte, sql, inArray } from "drizzle-orm";

interface DeploymentCorrelateJobData {
  deploymentId: string;
  organizationId: string;
  service: string;
  deployedAt: Date | string;
  affectedMonitors: string[];
}

// Configuration for correlation
const CORRELATION_CONFIG = {
  // Time window after deployment to look for incidents (in minutes)
  timeWindowMinutes: 30,
  // Minimum confidence score to create an auto-correlation
  minConfidence: 0.7,
  // Weight factors for different correlation signals
  weights: {
    timeProximity: 0.4,        // How close in time the incident is to the deployment
    monitorOverlap: 0.35,      // Whether deployment affects the same monitors as the incident
    incidentSeverity: 0.15,    // Higher severity incidents are more likely deployment-related
    deploymentStatus: 0.1,     // Failed deployments are more likely to cause incidents
  },
};

// Calculate time proximity score (1.0 = immediate, 0.0 = at edge of window)
function calculateTimeProximityScore(deployedAt: Date, incidentStartedAt: Date): number {
  const diffMinutes = (incidentStartedAt.getTime() - deployedAt.getTime()) / (1000 * 60);

  // Incident before deployment gets 0 score
  if (diffMinutes < 0) {
    return 0;
  }

  // Incident after window gets 0 score
  if (diffMinutes > CORRELATION_CONFIG.timeWindowMinutes) {
    return 0;
  }

  // Linear decay from 1.0 to 0.0 over the window
  // Incidents immediately after deployment score highest
  return 1 - (diffMinutes / CORRELATION_CONFIG.timeWindowMinutes);
}

// Calculate monitor overlap score (1.0 = all monitors overlap, 0.0 = no overlap)
function calculateMonitorOverlapScore(
  deploymentMonitors: string[],
  incidentMonitors: string[]
): number {
  if (deploymentMonitors.length === 0 || incidentMonitors.length === 0) {
    // If no monitors specified, use a neutral score
    return 0.5;
  }

  const deploymentSet = new Set(deploymentMonitors);
  const overlapCount = incidentMonitors.filter((m) => deploymentSet.has(m)).length;

  // Score based on percentage of incident monitors that are in deployment
  return overlapCount / incidentMonitors.length;
}

// Calculate severity score (critical = 1.0, major = 0.7, minor = 0.4)
function calculateSeverityScore(severity: string): number {
  switch (severity) {
    case "critical":
      return 1.0;
    case "major":
      return 0.7;
    case "minor":
      return 0.4;
    default:
      return 0.5;
  }
}

// Calculate deployment status score (failed = 1.0, rolled_back = 0.9, completed = 0.6)
function calculateDeploymentStatusScore(status: string): number {
  switch (status) {
    case "failed":
      return 1.0;
    case "rolled_back":
      return 0.9;
    case "completed":
      return 0.6;
    case "started":
      return 0.4;
    default:
      return 0.5;
  }
}

// Calculate overall correlation confidence score
function calculateCorrelationConfidence(
  timeProximityScore: number,
  monitorOverlapScore: number,
  severityScore: number,
  deploymentStatusScore: number
): number {
  const weights = CORRELATION_CONFIG.weights;

  const confidence =
    timeProximityScore * weights.timeProximity +
    monitorOverlapScore * weights.monitorOverlap +
    severityScore * weights.incidentSeverity +
    deploymentStatusScore * weights.deploymentStatus;

  return Math.min(1, Math.max(0, confidence));
}

// Main processor for deployment correlation
export async function processDeploymentCorrelation(
  job: Job<DeploymentCorrelateJobData>
): Promise<void> {
  const { deploymentId, organizationId, service, deployedAt, affectedMonitors } = job.data;

  console.log(`Processing deployment correlation for ${deploymentId}`);

  // Get the deployment details
  const deployment = await db.query.deploymentEvents.findFirst({
    where: eq(deploymentEvents.id, deploymentId),
  });

  if (!deployment) {
    console.log(`Deployment ${deploymentId} not found`);
    return;
  }

  const deploymentTime = new Date(deployedAt);
  const windowEnd = new Date(deploymentTime.getTime() + CORRELATION_CONFIG.timeWindowMinutes * 60 * 1000);

  // Find incidents that started within the correlation window
  const potentialIncidents = await db.query.incidents.findMany({
    where: and(
      eq(incidents.organizationId, organizationId),
      gte(incidents.startedAt, deploymentTime),
      lte(incidents.startedAt, windowEnd)
    ),
  });

  console.log(`Found ${potentialIncidents.length} potential incidents to correlate`);

  for (const incident of potentialIncidents) {
    // Check if link already exists
    const existingLink = await db.query.deploymentIncidents.findFirst({
      where: and(
        eq(deploymentIncidents.deploymentId, deploymentId),
        eq(deploymentIncidents.incidentId, incident.id)
      ),
    });

    if (existingLink) {
      console.log(`Link already exists for incident ${incident.id}`);
      continue;
    }

    // Get incident's affected monitors
    const incidentMonitors = incident.affectedMonitors ?? [];

    // Calculate correlation scores
    const timeProximityScore = calculateTimeProximityScore(deploymentTime, incident.startedAt);
    const monitorOverlapScore = calculateMonitorOverlapScore(
      affectedMonitors || [],
      incidentMonitors
    );
    const severityScore = calculateSeverityScore(incident.severity);
    const deploymentStatusScore = calculateDeploymentStatusScore(deployment.status);

    const confidence = calculateCorrelationConfidence(
      timeProximityScore,
      monitorOverlapScore,
      severityScore,
      deploymentStatusScore
    );

    console.log(`Incident ${incident.id} correlation scores:`, {
      timeProximity: timeProximityScore.toFixed(2),
      monitorOverlap: monitorOverlapScore.toFixed(2),
      severity: severityScore.toFixed(2),
      deploymentStatus: deploymentStatusScore.toFixed(2),
      confidence: confidence.toFixed(2),
    });

    // Create auto-correlation if confidence meets threshold
    if (confidence >= CORRELATION_CONFIG.minConfidence) {
      const linkId = nanoid();
      const now = new Date();

      await db.insert(deploymentIncidents).values({
        id: linkId,
        deploymentId,
        incidentId: incident.id,
        correlationType: "auto",
        confidence: confidence.toFixed(2),
        notes: `Auto-correlated with ${(confidence * 100).toFixed(0)}% confidence. ` +
          `Time proximity: ${(timeProximityScore * 100).toFixed(0)}%, ` +
          `Monitor overlap: ${(monitorOverlapScore * 100).toFixed(0)}%`,
        linkedAt: now,
      });

      console.log(`Created auto-correlation: deployment ${deploymentId} -> incident ${incident.id} (${(confidence * 100).toFixed(0)}%)`);
    } else {
      console.log(`Confidence ${(confidence * 100).toFixed(0)}% below threshold ${(CORRELATION_CONFIG.minConfidence * 100).toFixed(0)}%, skipping`);
    }
  }

  console.log(`Deployment correlation complete for ${deploymentId}`);
}

// Batch processor to find correlations for recent deployments that may have been missed
export async function processDeploymentCorrelationBatch(
  job: Job<{ organizationId?: string; hours?: number }>
): Promise<void> {
  const { organizationId, hours = 24 } = job.data;

  const since = new Date(Date.now() - hours * 60 * 60 * 1000);

  console.log(`Processing batch deployment correlation since ${since.toISOString()}`);

  // Get recent deployments
  let deploymentsQuery = db.query.deploymentEvents.findMany({
    where: and(
      gte(deploymentEvents.deployedAt, since),
      inArray(deploymentEvents.status, ["completed", "failed", "rolled_back"])
    ),
  });

  const recentDeployments = await deploymentsQuery;

  // Filter by organization if specified
  const deployments = organizationId
    ? recentDeployments.filter((d) => d.organizationId === organizationId)
    : recentDeployments;

  console.log(`Processing ${deployments.length} deployments`);

  for (const deployment of deployments) {
    try {
      await processDeploymentCorrelation({
        data: {
          deploymentId: deployment.id,
          organizationId: deployment.organizationId,
          service: deployment.service,
          deployedAt: deployment.deployedAt,
          affectedMonitors: (deployment.affectedMonitors as string[]) || [],
        },
      } as Job<DeploymentCorrelateJobData>);
    } catch (error) {
      console.error(`Error processing deployment ${deployment.id}:`, error);
    }
  }

  console.log(`Batch deployment correlation complete`);
}
