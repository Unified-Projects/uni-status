import { randomBytes, randomUUID } from "crypto";
import { Client, Pool } from "pg";

const DEFAULT_DB_URL =
  "postgresql://uni_status:uni_status_dev@postgres:5432/uni_status?sslmode=disable";

const API_BASE_URL = process.env.API_BASE_URL ?? "http://api:3001";

// Shared pool for dbClient queries
let sharedPool: Pool | null = null;

function getPool(): Pool {
  if (!sharedPool) {
    sharedPool = new Pool({
      connectionString: process.env.DATABASE_URL ?? DEFAULT_DB_URL,
      max: 5,
      idleTimeoutMillis: 20000,
    });
  }
  return sharedPool;
}

// Simple tagged template wrapper for pg Pool
type SqlTagged = {
  (strings: TemplateStringsArray, ...values: unknown[]): Promise<any[]>;
  end: () => Promise<void>;
};

function createSqlClient(): SqlTagged {
  const pool = getPool();

  const sql = async (strings: TemplateStringsArray, ...values: unknown[]) => {
    const text = strings.reduce((acc, str, i) => {
      return acc + str + (i < values.length ? `$${i + 1}` : '');
    }, '');
    const result = await pool.query(text, values);
    return result.rows;
  };

  sql.end = async () => {
    // Pool is shared, don't actually close it
  };

  return sql as SqlTagged;
}

export type TestContext = {
  token: string;
  apiKeyId: string;
  organizationId: string;
  userId: string;
  headers: Record<string, string>;
  // Extended API for comprehensive tests
  apiUrl: string;
  dbClient: SqlTagged;
  cleanup: () => Promise<void>;
};

export async function resetDatabase(client: Client) {
  if (process.env.SKIP_DB_RESET === "1") {
    console.log("[tests] SKIP_DB_RESET=1 set, skipping database reset");
    return;
  }

  // Truncate all application tables (skip migration bookkeeping) to ensure clean state per test file
  const tables = await client.query<{ tablename: string }>(
    `SELECT tablename
     FROM pg_tables
     WHERE schemaname = 'public'
       AND tablename NOT IN ('_drizzle_migrations', '_drizzle_migrations_lock')`
  );

  if (tables.rowCount && tables.rows.length > 0) {
    const tableList = tables.rows.map((row) => `"${row.tablename}"`).join(", ");
    const lockTimeoutMs = parseInt(process.env.DB_RESET_LOCK_TIMEOUT_MS ?? "5000", 10);
    const maxAttempts = parseInt(process.env.DB_RESET_MAX_ATTEMPTS ?? "3", 10);

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        await client.query("BEGIN");
        await client.query(`SET LOCAL lock_timeout = '${lockTimeoutMs}ms'`);
        await client.query(`TRUNCATE TABLE ${tableList} CASCADE`);
        await client.query("COMMIT");
        console.log(`[tests] Database reset succeeded (attempt ${attempt})`);
        break;
      } catch (error: any) {
        await client.query("ROLLBACK");
        const code = error?.code;
        const retriable = code === "40P01" || code === "55P03"; // deadlock detected or lock not available
        if (!retriable || attempt === maxAttempts) {
          console.error(`[tests] Database reset failed on attempt ${attempt}:`, error);
          throw error;
        }
        const delayMs = 250 * attempt;
        console.warn(`[tests] Retry database reset after ${code} (attempt ${attempt}/${maxAttempts}), sleeping ${delayMs}ms...`);
        await new Promise((resolve) => setTimeout(resolve, delayMs));
      }
    }
  }
}

export async function bootstrapTestContext(): Promise<TestContext> {
  const client = new Client({
    connectionString: process.env.DATABASE_URL ?? DEFAULT_DB_URL,
  });

  await client.connect();

  const now = new Date().toISOString();
  const userId = randomUUID();
  const organizationId = randomUUID();
  const apiKeyId = randomUUID();
  const token = `us_${randomBytes(16).toString("hex")}`;
  const keyPrefix = token.slice(0, 8);

  await client.query("BEGIN");
  await client.query(
    `INSERT INTO "user" (id, name, email, "emailVerified", "createdAt", "updatedAt")
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [userId, "Test User", `${userId}@example.com`, true, now, now]
  );

  await client.query(
    `INSERT INTO organizations (id, name, slug, plan, subscription_tier, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [
      organizationId,
      "Test Org",
      `test-org-${userId.slice(0, 8).toLowerCase()}`,
      "free",
      "free",
      now,
      now,
    ]
  );

  // Seed a lightweight license so feature-gated endpoints (e.g., audit logs) are available in tests
  const licenseId = randomUUID();
  await client.query(
    `INSERT INTO licenses (
      id, organization_id, keygen_license_id, plan, status, entitlements, valid_from, created_at, updated_at
    ) VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7, $8, $9)
    ON CONFLICT (organization_id) DO NOTHING`,
    [
      licenseId,
      organizationId,
      `test-license-${licenseId.slice(0, 8)}`,
      "enterprise", // Give tests ample headroom while keeping feature flags explicit
      "active",
      JSON.stringify({
        monitors: -1,
        statusPages: -1,
        teamMembers: -1,
        regions: -1,
        auditLogs: true,
        sso: true,
        customRoles: true,
        slo: true,
        reports: true,
        multiRegion: true,
        oncall: false,
      }),
      now,
      now,
      now,
    ]
  );

  await client.query(
    `INSERT INTO organization_members (id, organization_id, user_id, role, joined_at, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [randomUUID(), organizationId, userId, "owner", now, now, now]
  );

  await client.query(
    `INSERT INTO api_keys (id, organization_id, name, key_hash, key_prefix, scopes, created_by, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
    [
      apiKeyId,
      organizationId,
      "test-key",
      token, // hash is not validated in middleware yet
      keyPrefix,
      JSON.stringify(["read", "write", "admin"]),
      userId,
      now,
      now,
    ]
  );
  await client.query("COMMIT");
  await client.end();

  // Create a tagged template SQL client for direct DB access in tests
  const dbClient = createSqlClient();

  const cleanup = async () => {
    await dbClient.end();
  };

  return {
    token,
    apiKeyId,
    organizationId,
    userId,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      "X-Organization-Id": organizationId,
    },
    apiUrl: `${API_BASE_URL}/api/v1`,
    dbClient,
    cleanup,
  };
}
