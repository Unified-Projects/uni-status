/**
 * Enterprise Redis Proxy
 * Delegates to the main API's redis utilities when configured.
 */

import { logger } from "@uni-status/shared";

const log = logger.child({ module: "enterprise-redis" });

type PublishEventFn = (channel: string, data: any) => Promise<void>;

let _publishEvent: PublishEventFn | null = null;

export function configureRedis(fns: { publishEvent: PublishEventFn }) {
  _publishEvent = fns.publishEvent;
}

export async function publishEvent(channel: string, data: any): Promise<void> {
  if (!_publishEvent) {
    log.warn("Enterprise redis not configured, skipping publishEvent");
    return;
  }
  return _publishEvent(channel, data);
}
