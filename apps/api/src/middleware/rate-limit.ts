import { Context, Next } from "hono";
import { redis } from "../lib/redis";
import { isRateLimitDisabled } from "@uni-status/shared/config";
import { createLogger } from "@uni-status/shared";

const log = createLogger({ module: "rate-limiter" });

const WINDOW_MS = 60 * 1000; // 1 minute
const MAX_REQUESTS = 100;
const RATELIMIT_PREFIX = "ratelimit:";

export async function rateLimiter(c: Context, next: Next) {
  // Skip rate limiting when explicitly disabled
  if (isRateLimitDisabled()) {
    return next();
  }

  const identifier = getIdentifier(c);
  const now = Date.now();
  const windowStart = now - WINDOW_MS;
  const key = `${RATELIMIT_PREFIX}${identifier}`;

  try {
    // Use a Redis transaction for atomic operations
    const pipeline = redis.pipeline();

    // Remove old entries outside the window
    pipeline.zremrangebyscore(key, "-inf", windowStart.toString());

    // Count current requests in window
    pipeline.zcard(key);

    const results = await pipeline.exec();

    // Get the count from the zcard result
    const currentCount = results?.[1]?.[1] as number ?? 0;

    if (currentCount >= MAX_REQUESTS) {
      // Get the oldest entry to calculate Retry-After
      const oldestEntries = await redis.zrange(key, 0, 0, "WITHSCORES");
      const oldestTimestamp = oldestEntries.length >= 2 ? parseInt(oldestEntries[1]!, 10) : now;
      const retryAfter = Math.ceil((oldestTimestamp + WINDOW_MS - now) / 1000);

      c.header("X-RateLimit-Limit", MAX_REQUESTS.toString());
      c.header("X-RateLimit-Remaining", "0");
      c.header("X-RateLimit-Reset", Math.ceil((now + WINDOW_MS) / 1000).toString());
      c.header("Retry-After", retryAfter.toString());

      return c.json(
        {
          success: false,
          error: {
            code: "RATE_LIMIT_EXCEEDED",
            message: "Too many requests, please try again later",
          },
        },
        429
      );
    }

    // Add current request with timestamp as score
    await redis.zadd(key, now.toString(), `${now}:${Math.random()}`);

    // Set expiry on the key to auto-cleanup
    await redis.expire(key, Math.ceil(WINDOW_MS / 1000) + 1);

    const remaining = Math.max(0, MAX_REQUESTS - currentCount - 1);

    // Set rate limit headers
    c.header("X-RateLimit-Limit", MAX_REQUESTS.toString());
    c.header("X-RateLimit-Remaining", remaining.toString());
    c.header("X-RateLimit-Reset", Math.ceil((now + WINDOW_MS) / 1000).toString());
  } catch (error) {
    log.error({ err: error, identifier }, "Rate limiter Redis error, failing open");
  }

  await next();
}

function getIdentifier(c: Context): string {
  // Use API key if present
  const auth = c.get("auth");
  if (auth?.apiKey) {
    return `api_key:${auth.apiKey.id}`;
  }

  // Use user ID if authenticated
  if (auth?.user) {
    return `user:${auth.user.id}`;
  }

  // Fall back to IP
  const ip =
    c.req.header("x-forwarded-for")?.split(",")[0] ||
    c.req.header("x-real-ip") ||
    "unknown";

  return `ip:${ip}`;
}
