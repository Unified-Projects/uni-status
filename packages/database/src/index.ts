import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { getDatabaseUrl } from "@uni-status/shared/config";
import * as schema from "./schema";
export { eq, and, like } from "drizzle-orm";

// Lazy initialization to prevent build-time errors when DATABASE_URL is not set
let _db: PostgresJsDatabase<typeof schema> | null = null;
let _client: ReturnType<typeof postgres> | null = null;

function createDatabaseClient(): PostgresJsDatabase<typeof schema> {
  if (_db) {
    return _db;
  }

  const connectionString = getDatabaseUrl();

  if (!connectionString) {
    throw new Error(
      "DATABASE_URL or UNI_STATUS_DB_URL environment variable is not set. " +
      "You can also use UNI_STATUS_DB_URL_FILE to read the value from a Docker secret file."
    );
  }

  // Parse SSL mode from connection string
  const url = new URL(connectionString);
  const sslmode = url.searchParams.get("sslmode");

  // Configure SSL options based on sslmode parameter
  const sslConfig = sslmode === "disable"
    ? false
    : { rejectUnauthorized: false }; // Accept self-signed certs for require/no-verify/default

  _client = postgres(connectionString, {
    max: 10,
    idle_timeout: 20,
    connect_timeout: 10,
    ssl: sslConfig,
  });

  _db = drizzle(_client, { schema });
  return _db;
}

// Export a proxy that lazily initializes the database on first access
export const db = new Proxy({} as PostgresJsDatabase<typeof schema>, {
  get(_target, prop) {
    const instance = createDatabaseClient();
    return Reflect.get(instance, prop);
  },
});

export type Database = PostgresJsDatabase<typeof schema>;

export * from "./schema";
