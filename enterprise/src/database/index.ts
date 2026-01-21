/**
 * Enterprise Database Client
 *
 * Extends the core database client with enterprise schemas
 * so that db.query.* works for enterprise tables
 */

import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { getDatabaseUrl } from "@uni-status/shared/config";
import * as coreSchema from "@uni-status/database/schema";
import * as enterpriseSchema from "./schema";

const connectionString = getDatabaseUrl();

if (!connectionString) {
  throw new Error(
    "DATABASE_URL or UNI_STATUS_DB_URL environment variable is not set. " +
    "You can also use UNI_STATUS_DB_URL_FILE to read the value from a Docker secret file."
  );
}

const client = postgres(connectionString, {
  max: 10,
  idle_timeout: 20,
  connect_timeout: 10,
});

// Combine core and enterprise schemas
const combinedSchema = {
  ...coreSchema,
  ...enterpriseSchema,
};

export const enterpriseDb = drizzle(client, { schema: combinedSchema });

export type EnterpriseDatabase = typeof enterpriseDb;
