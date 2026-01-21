import IORedis from "ioredis";
import { getRedisUrl, getQueuePrefix } from "@uni-status/shared/config";

const REDIS_URL = getRedisUrl();
export const queuePrefix = getQueuePrefix();

export const connection = new IORedis(REDIS_URL, {
  maxRetriesPerRequest: null,
});

// For pub/sub
export const publisher = new IORedis(REDIS_URL);
export const subscriber = new IORedis(REDIS_URL);

export async function publishEvent(channel: string, event: unknown) {
  await publisher.publish(channel, JSON.stringify(event));
}
