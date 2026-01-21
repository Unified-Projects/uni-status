import { Client } from "pg";
import { randomUUID, randomBytes } from "crypto";
import { TestContext } from "./context";

const DEFAULT_DB_URL =
  "postgresql://uni_status:uni_status_dev@postgres:5432/uni_status?sslmode=disable";

/**
 * Create a Better Auth session in the database for web page testing.
 * Returns the session token that can be used as a cookie.
 */
export async function createWebSession(ctx: TestContext): Promise<string> {
  const client = new Client({
    connectionString: process.env.DATABASE_URL ?? DEFAULT_DB_URL,
  });
  await client.connect();

  const sessionId = randomUUID();
  const sessionToken = randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days
  const now = new Date();

  await client.query(
    `INSERT INTO session (id, "userId", token, "expiresAt", "createdAt", "updatedAt")
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [sessionId, ctx.userId, sessionToken, expiresAt, now, now]
  );

  await client.end();
  return sessionToken;
}

/**
 * Get the cookie header string for authenticated web requests.
 */
export function getAuthCookies(sessionToken: string): string {
  return `better-auth.session_token=${sessionToken}`;
}

/**
 * Create authenticated headers for web page fetch requests.
 */
export function getAuthHeaders(sessionToken: string): Record<string, string> {
  return {
    Cookie: getAuthCookies(sessionToken),
  };
}

/**
 * Helper type for authenticated web test context.
 */
export interface WebTestContext extends TestContext {
  sessionToken: string;
  webHeaders: Record<string, string>;
}

/**
 * Bootstrap a web test context with both API and web authentication.
 * Use this for dashboard page tests that need session-based auth.
 */
export async function bootstrapWebTestContext(
  ctx: TestContext
): Promise<WebTestContext> {
  const sessionToken = await createWebSession(ctx);
  return {
    ...ctx,
    sessionToken,
    webHeaders: getAuthHeaders(sessionToken),
  };
}
