/**
 * Enterprise Redis Proxy
 * Delegates to the main workers' redis utilities when configured.
 */

import type IORedis from "ioredis";

let _connection: IORedis | null = null;
let _prefix: string = "bull";

export function configureRedis(fns: { connection: IORedis; prefix?: string }) {
  _connection = fns.connection;
  if (fns.prefix) {
    _prefix = fns.prefix;
  }
}

export function getConnection(): IORedis {
  if (!_connection) {
    throw new Error("Enterprise redis not configured. Call configureRedis first.");
  }
  return _connection;
}

export function getPrefix(): string {
  return _prefix;
}

export { _connection as connection };
