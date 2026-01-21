import { defineConfig } from "drizzle-kit";
import { existsSync, readFileSync } from "fs";

/**
 * Reads a secret value from a file if the _FILE variant is set,
 * otherwise returns the direct environment variable value.
 * This duplicates the logic from @uni-status/shared/config because
 * drizzle-kit runs independently and may not have access to the shared package.
 */
function getDatabaseUrl(): string {
  // Check for _FILE variants first (Docker secrets)
  const fileEnvKeys = ["UNI_STATUS_DB_URL_FILE", "DATABASE_URL_FILE"];
  for (const fileKey of fileEnvKeys) {
    const filePath = process.env[fileKey];
    if (filePath) {
      if (!existsSync(filePath)) {
        throw new Error(`Secret file not found: ${filePath} (from ${fileKey})`);
      }
      return readFileSync(filePath, "utf-8").trim();
    }
  }

  // Fall back to direct environment variables
  const url = process.env.UNI_STATUS_DB_URL || process.env.DATABASE_URL;
  if (!url) {
    throw new Error(
      "DATABASE_URL or UNI_STATUS_DB_URL environment variable is not set. " +
      "You can also use UNI_STATUS_DB_URL_FILE or DATABASE_URL_FILE to read from a Docker secret file."
    );
  }
  return url;
}


export default defineConfig({
  // Include both core and enterprise schemas
  // Enterprise tables live in the same database, just under a different license
  schema: [
    "./src/schema/index.ts",
    "../../enterprise/src/database/schema/index.ts",
  ],
  out: "./src/migrations",
  dialect: "postgresql",
  dbCredentials: {
    url: getDatabaseUrl(),
  },
  // Only manage tables in the public schema
  schemaFilter: ["public"],
  // Exclude PostGIS and pg_stat_statements extension tables/views
  extensionsFilters: ["postgis"],
  // Exclude pg_stat_statements views explicitly
  tablesFilter: ["!pg_stat_statements*"],
  verbose: true,
  strict: false, // Don't fail on unmanaged tables
});
