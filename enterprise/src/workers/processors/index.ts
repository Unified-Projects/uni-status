/**
 * Enterprise Worker Processors
 *
 * These processors are part of the Uni-status Enterprise package
 * and require an enterprise license for production use.
 */

import type IORedis from "ioredis";
import type { Queue } from "bullmq";
import type { AlertChannelType } from "@uni-status/shared/types";
import type { OrganizationCredentials } from "@uni-status/shared/types/credentials";

import { configureRedis } from "../lib/redis";
import { configureNotificationBuilder } from "../lib/notification-builder";

export type EnterpriseWorkersConfig = {
  redis: {
    connection: IORedis;
    prefix?: string;
  };
  notifications: {
    buildNotificationJobData: (
      channel: { id: string; type: string; config: Record<string, unknown> },
      alertData: {
        alertHistoryId: string;
        monitorName: string;
        monitorUrl: string;
        status: "down" | "degraded" | "recovered";
        message?: string;
        responseTime?: number;
        statusCode?: number;
        dashboardUrl: string;
        timestamp: string;
        pagespeedScores?: Record<string, unknown> | null;
        pagespeedViolations?: Array<unknown> | null;
      },
      orgCredentials: OrganizationCredentials | null
    ) => Promise<Record<string, unknown>>;
    getQueueForChannelType: (type: AlertChannelType, queues: Record<string, Queue>) => Queue;
  };
};

export function configureEnterpriseWorkers(config: EnterpriseWorkersConfig) {
  configureRedis(config.redis);
  configureNotificationBuilder(config.notifications);
}

// Export processors
export { processAlertEscalation } from "./escalation";
export { processSloCalculation, processSloAlert } from "./slo-calculator";
export { processReportGeneration } from "./report-generator";
export { processLicenseValidation } from "./license-validation";
export { processGracePeriod } from "./grace-period";
