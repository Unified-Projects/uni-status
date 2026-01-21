import { Queue } from "bullmq";
import { redis, queuePrefix } from "./redis";
import { QUEUE_NAMES } from "@uni-status/shared/constants";

interface PageSpeedScores {
  performance?: number;
  accessibility?: number;
  bestPractices?: number;
  seo?: number;
}

interface PageSpeedViolation {
  category: string;
  score: number;
  threshold: number;
}

interface EvaluateAlertsInput {
  monitor: {
    id: string;
    name?: string;
    [key: string]: unknown;
  };
  checkResult: {
    id: string;
    status: string;
    responseTimeMs?: number | null;
    statusCode?: number | null;
    errorMessage?: string | null;
    pagespeedScores?: PageSpeedScores | null;
    pagespeedViolations?: PageSpeedViolation[] | null;
    [key: string]: unknown;
  };
  organizationId: string;
}

// Lazy init queue
let alertQueue: Queue | null = null;

function getAlertQueue(): Queue {
  if (!alertQueue) {
    alertQueue = new Queue(QUEUE_NAMES.ALERT_EVALUATE, { connection: redis, prefix: queuePrefix });
  }
  return alertQueue;
}

/**
 * Queue alert evaluation to be processed by workers
 */
export async function evaluateAlerts(input: EvaluateAlertsInput): Promise<void> {
  const { monitor, checkResult, organizationId } = input;

  try {
    const queue = getAlertQueue();

    await queue.add(
      `alert-eval-${checkResult.id}`,
      {
        monitorId: monitor.id,
        organizationId,
        checkResultId: checkResult.id,
        checkStatus: checkResult.status,
        errorMessage: checkResult.errorMessage,
        responseTimeMs: checkResult.responseTimeMs,
        statusCode: checkResult.statusCode,
        pagespeedScores: checkResult.pagespeedScores ?? null,
        pagespeedViolations: checkResult.pagespeedViolations ?? null,
      },
      {
        removeOnComplete: 100,
        removeOnFail: 100,
      }
    );
  } catch (error) {
    console.error(`[Alert] Failed to queue alert evaluation for ${monitor.id}:`, error);
  }
}
