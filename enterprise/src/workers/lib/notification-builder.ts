/**
 * Enterprise Notification Builder Proxy
 * Delegates to the main workers' notification utilities when configured.
 */

import { Queue } from "bullmq";
import type { AlertChannelType } from "@uni-status/shared/types";
import type { OrganizationCredentials } from "@uni-status/shared/types/credentials";

type BuildNotificationJobDataFn = (
  channel: {
    id: string;
    type: string;
    config: Record<string, unknown>;
  },
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

type GetQueueForChannelTypeFn = (
  type: AlertChannelType,
  queues: Record<string, Queue>
) => Queue;

let _buildNotificationJobData: BuildNotificationJobDataFn | null = null;
let _getQueueForChannelType: GetQueueForChannelTypeFn | null = null;

export function configureNotificationBuilder(fns: {
  buildNotificationJobData: BuildNotificationJobDataFn;
  getQueueForChannelType: GetQueueForChannelTypeFn;
}) {
  _buildNotificationJobData = fns.buildNotificationJobData;
  _getQueueForChannelType = fns.getQueueForChannelType;
}

export async function buildNotificationJobData(
  ...args: Parameters<BuildNotificationJobDataFn>
): Promise<Record<string, unknown>> {
  if (!_buildNotificationJobData) {
    throw new Error("Enterprise notification builder not configured.");
  }
  return _buildNotificationJobData(...args);
}

export function getQueueForChannelType(
  ...args: Parameters<GetQueueForChannelTypeFn>
): Queue {
  if (!_getQueueForChannelType) {
    throw new Error("Enterprise notification builder not configured.");
  }
  return _getQueueForChannelType(...args);
}
