import IORedis from "ioredis";
import { getRedisUrl, getQueuePrefix } from "@uni-status/shared/config";

const REDIS_URL = getRedisUrl();
export const queuePrefix = getQueuePrefix();

// Main Redis connection for general use
export const redis = new IORedis(REDIS_URL, {
  maxRetriesPerRequest: null,
});

// Publisher for sending events
export const publisher = new IORedis(REDIS_URL);

// Subscriber for receiving events (dedicated connection for pub/sub)
export const subscriber = new IORedis(REDIS_URL);

/**
 * Publish an event to a Redis channel
 */
export async function publishEvent(channel: string, event: unknown) {
  await publisher.publish(channel, JSON.stringify(event));
}

/**
 * Subscribe to a Redis channel pattern
 */
export function subscribeToPattern(
  pattern: string,
  callback: (channel: string, message: string) => void
) {
  subscriber.psubscribe(pattern);
  subscriber.on("pmessage", (pat, channel, message) => {
    if (pat === pattern) {
      callback(channel, message);
    }
  });
}

/**
 * Subscribe to a specific Redis channel
 */
export function subscribeToChannel(
  channel: string,
  callback: (message: string) => void
) {
  subscriber.subscribe(channel);
  subscriber.on("message", (ch, message) => {
    if (ch === channel) {
      callback(message);
    }
  });
}
