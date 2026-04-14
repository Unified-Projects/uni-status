import { Context, Next } from "hono";
import { HTTPException } from "hono/http-exception";
import { auth } from "@uni-status/auth/server";
import { db } from "@uni-status/database";
import { apiKeys, organizationMembers, organizations, users, systemSettings } from "@uni-status/database/schema";
import { eq, and, or } from "drizzle-orm";
import { isSelfHosted } from "@uni-status/shared/config/env";
import {
  verifyFederatedToken,
  FEDERATED_AUTH_HEADER,
  type FederatedSessionPayload,
} from "@uni-status/shared/lib/federation";
import { createLogger } from "@uni-status/shared";

const log = createLogger({ module: "auth-middleware" });
const API_KEY_PREFIX_LENGTH = 11;
const LEGACY_API_KEY_PREFIX_LENGTH = 8;

async function verifyApiKeyToken(token: string, keyHash: string): Promise<boolean> {
  if (keyHash === token) {
    return true;
  }

  try {
    return await Bun.password.verify(token, keyHash);
  } catch {
    return false;
  }
}

export interface AuthContext {
  user: {
    id: string;
    email: string;
    name: string;
  } | null;
  organizationId: string | null;
  organizationRole: "owner" | "admin" | "member" | "viewer" | null;
  apiKey: {
    id: string;
    scopes: string[];
  } | null;
}

declare module "hono" {
  interface ContextVariableMap {
    auth: AuthContext;
    federatedFrom?: string;
    federatedPayload?: FederatedSessionPayload;
  }
}

export async function authMiddleware(c: Context, next: Next) {
  const authHeader = c.req.header("Authorization");
  const orgHeader = c.req.header("X-Organization-Id");
  // Also check query param for organization ID (used for file downloads where headers can't be set)
  const orgQuery = c.req.query("organizationId");

  let authContext: AuthContext = {
    user: null,
    organizationId: orgHeader || orgQuery || null,
    organizationRole: null,
    apiKey: null,
  };

  // Check for API key authentication
  if (authHeader?.startsWith("Bearer us_")) {
    const token = authHeader.slice(7);
    const keyPrefix = token.slice(0, API_KEY_PREFIX_LENGTH);
    const legacyKeyPrefix = token.slice(0, LEGACY_API_KEY_PREFIX_LENGTH);

    try {
      const prefixFilters = [eq(apiKeys.keyPrefix, keyPrefix)];
      if (legacyKeyPrefix !== keyPrefix) {
        prefixFilters.push(eq(apiKeys.keyPrefix, legacyKeyPrefix));
      }

      const candidateKeys = await db
        .select()
        .from(apiKeys)
        .where(or(...prefixFilters));

      const sortedCandidateKeys = candidateKeys.sort((left, right) => {
        if (left.keyPrefix === right.keyPrefix) {
          return 0;
        }

        if (left.keyPrefix === keyPrefix) {
          return -1;
        }

        if (right.keyPrefix === keyPrefix) {
          return 1;
        }

        return right.keyPrefix.length - left.keyPrefix.length;
      });

      let key = null;
      for (const candidateKey of sortedCandidateKeys) {
        if (await verifyApiKeyToken(token, candidateKey.keyHash)) {
          key = candidateKey;
          break;
        }
      }

      if (!key && candidateKeys.length > 0) {
        log.debug(
          {
            keyPrefix,
            legacyKeyPrefix,
            candidatePrefixes: candidateKeys.map((candidate) => candidate.keyPrefix),
            tokenPrefix: token.slice(0, 20),
          },
          "API key token mismatch"
        );
      }

      if (candidateKeys.length > 0 && !key) {
        c.set("auth", authContext);
        return c.json(
          { success: false, error: { code: "UNAUTHORIZED", message: "Invalid API key" } },
          401
        );
      }

      if (key) {
        // Check if key is expired
        if (key.expiresAt && new Date(key.expiresAt) < new Date()) {
          // Key is expired, don't set auth context
          c.set("auth", authContext);
          return c.json(
            { success: false, error: { code: "UNAUTHORIZED", message: "API key has expired" } },
            401
          );
        }

        // Ensure scopes is an array (handle both parsed and unparsed JSON)
        let scopes = key.scopes as string[];
        if (typeof scopes === 'string') {
          try {
            scopes = JSON.parse(scopes);
          } catch {
            scopes = ['read']; // Fallback to read-only
          }
        }
        if (!Array.isArray(scopes)) {
          scopes = ['read']; // Fallback to read-only
        }

        authContext.apiKey = {
          id: key.id,
          scopes,
        };
        authContext.organizationId = key.organizationId;
        authContext.organizationRole = scopes.includes("admin")
          ? "admin"
          : scopes.includes("write")
            ? "member"
            : "viewer";

        // Hydrate user context from the API key creator for FK-backed created_by fields
        const createdByUser =
          (await db.query.users.findFirst({
            where: eq(users.id, key.createdBy),
            columns: {
              id: true,
              email: true,
              name: true,
            },
          })) || {
            id: key.createdBy,
            email: `${key.createdBy}@example.com`,
            name: "API Key",
          };

        authContext.user = {
          id: createdByUser.id,
          email: createdByUser.email,
          name: createdByUser.name || createdByUser.email,
        };

        // Update last used timestamp
        await db
          .update(apiKeys)
          .set({ lastUsedAt: new Date() })
          .where(eq(apiKeys.id, key.id));
      }
    } catch (error) {
      log.error({ err: error, keyPrefix, legacyKeyPrefix }, "API key authentication error");
    }
  }

  // Check for Console federation token (from Uni-Console proxy)
  if (!authContext.apiKey && !authContext.user) {
    const federatedToken = c.req.header(FEDERATED_AUTH_HEADER);
    const federationSecret = process.env.UNI_SUITE_FEDERATION_SECRET;

    if (federatedToken && federationSecret) {
      try {
        const payload = verifyFederatedToken(federatedToken, federationSecret);
        if (payload) {
          // Federation token is valid - create user context
          authContext.user = {
            id: `federated:${payload.userId}`,
            email: payload.userEmail,
            name: payload.userName,
          };
          // Use organization from token if provided, otherwise keep header value
          if (payload.organizationId) {
            authContext.organizationId = payload.organizationId;
          }
          if (payload.organizationRole && ["owner", "admin", "member", "viewer"].includes(payload.organizationRole)) {
            authContext.organizationRole = payload.organizationRole as AuthContext["organizationRole"];
          }
          // Mark request as federated for audit purposes
          c.set("federatedFrom", "uni-console");
          c.set("federatedPayload", payload);
        }
      } catch (error) {
        log.error({ err: error }, "Federation token authentication error");
      }
    }
  }

  // Check for session authentication (via Authorization bearer or cookies)
  if (!authContext.apiKey && !authContext.user) {
    try {
      // If an Authorization bearer token is present, Better Auth will use it.
      // Otherwise, it will fall back to cookies from the forwarded headers.
      const session = await auth.api.getSession({
        headers: c.req.raw.headers,
      });

      if (session?.user) {
        authContext.user = {
          id: session.user.id,
          email: session.user.email,
          name: session.user.name,
        };
      }
    } catch (error) {
      log.error({ err: error }, "Session authentication error");
    }
  }

  c.set("auth", authContext);
  await next();
}

export function requireAuth(c: Context): AuthContext {
  const auth = c.get("auth");

  if (!auth.user && !auth.apiKey) {
    throw new HTTPException(401, { message: "Unauthorized" });
  }

  return auth;
}

async function ensureOrganizationExists(organizationId: string) {
  const org = await db.query.organizations.findFirst({
    where: eq(organizations.id, organizationId),
    columns: {
      id: true,
    },
  });

  if (!org) {
    throw new HTTPException(404, {
      message: "Organization not found - please select a valid organization",
    });
  }
}

export async function requireOrganization(c: Context): Promise<string> {
  const auth = requireAuth(c);

  if (!auth.organizationId) {
    throw new HTTPException(400, { message: "Organization context required" });
  }

  try {
    if (auth.apiKey) {
      await ensureOrganizationExists(auth.organizationId);
      return auth.organizationId;
    }

    const federatedPayload = c.get("federatedPayload");
    if (federatedPayload?.organizationId === auth.organizationId) {
      await ensureOrganizationExists(auth.organizationId);
      if (federatedPayload.organizationRole && ["owner", "admin", "member", "viewer"].includes(federatedPayload.organizationRole)) {
        auth.organizationRole = federatedPayload.organizationRole as AuthContext["organizationRole"];
      }
      return auth.organizationId;
    }

    if (!auth.user) {
      throw new HTTPException(401, { message: "User authentication required" });
    }

    const membership = await db.query.organizationMembers.findFirst({
      where: and(
        eq(organizationMembers.organizationId, auth.organizationId),
        eq(organizationMembers.userId, auth.user.id)
      ),
      columns: {
        organizationId: true,
        role: true,
      },
    });

    if (!membership) {
      throw new HTTPException(403, { message: "Not a member of this organization" });
    }

    auth.organizationRole = membership.role as AuthContext["organizationRole"];
    return auth.organizationId;
  } catch (error) {
    if (error instanceof HTTPException) {
      throw error;
    }
    throw new HTTPException(500, { message: "Database error while verifying organization" });
  }
}

export function requireScope(c: Context, scope: string): void {
  const auth = requireAuth(c);

  if (auth.apiKey) {
    const scopes = auth.apiKey.scopes;

    // Scope hierarchy: admin includes write and read, write includes read
    const hasScope =
      scopes.includes(scope) ||
      (scope === "write" && scopes.includes("admin")) ||
      (scope === "read" && (scopes.includes("write") || scopes.includes("admin")));

    if (!hasScope) {
      throw new HTTPException(403, { message: `Insufficient permissions: ${scope} required` });
    }
    return;
  }

  if (!auth.user) {
    throw new HTTPException(401, { message: "User authentication required" });
  }

  if (scope === "read") {
    if (!auth.organizationRole) {
      throw new HTTPException(403, { message: "Organization membership required" });
    }
    return;
  }

  if (scope === "write") {
    if (!auth.organizationRole || auth.organizationRole === "viewer") {
      throw new HTTPException(403, { message: "Insufficient permissions: write required" });
    }
    return;
  }

  if (scope === "admin") {
    if (auth.organizationRole !== "owner" && auth.organizationRole !== "admin") {
      throw new HTTPException(403, { message: "Insufficient permissions: admin required" });
    }
    return;
  }
}

export async function requireRole(
  c: Context,
  allowedRoles: Array<"owner" | "admin" | "member" | "viewer">
): Promise<string> {
  const auth = requireAuth(c);

  if (!auth.organizationId) {
    throw new HTTPException(400, { message: "Organization context required" });
  }

  // API keys with admin scope can access admin/owner-restricted endpoints
  if (auth.apiKey) {
    // If admin or owner role is required, check for admin scope
    if (allowedRoles.includes("admin") || allowedRoles.includes("owner")) {
      if (auth.apiKey.scopes.includes("admin")) {
        return "admin"; // Return admin role equivalent
      }
    }
    // If member/viewer role is sufficient, check for read scope at minimum
    if (allowedRoles.includes("member") || allowedRoles.includes("viewer")) {
      if (auth.apiKey.scopes.includes("read") || auth.apiKey.scopes.includes("write") || auth.apiKey.scopes.includes("admin")) {
        return "member"; // Return member role equivalent
      }
    }
    throw new HTTPException(403, { message: "Insufficient API key scope for this role-based operation" });
  }

  if (!auth.user) {
    throw new HTTPException(401, { message: "User authentication required" });
  }

  // Get user's role in the organization
  const membership = await db.query.organizationMembers.findFirst({
    where: and(
      eq(organizationMembers.organizationId, auth.organizationId),
      eq(organizationMembers.userId, auth.user.id)
    ),
  });

  if (!membership) {
    throw new HTTPException(403, { message: "Not a member of this organization" });
  }

  if (!allowedRoles.includes(membership.role as any)) {
    throw new HTTPException(403, { message: `Insufficient permissions: requires ${allowedRoles.join(" or ")} role` });
  }

  return membership.role;
}

export async function requireSuperAdmin(c: Context): Promise<void> {
  const auth = requireAuth(c);

  if (!auth.user) {
    throw new HTTPException(401, { message: "User authentication required" });
  }

  const user = await db.query.users.findFirst({
    where: eq(users.id, auth.user.id),
    columns: {
      systemRole: true,
    },
  });

  if (user?.systemRole !== "super_admin") {
    throw new HTTPException(403, { message: "Super admin access required" });
  }
}

export async function requireSetupComplete(c: Context, next: Next) {
  if (isSelfHosted()) {
    const settings = await db.query.systemSettings.findFirst();
    if (!settings?.setupCompleted) {
      return c.json(
        {
          success: false,
          error: {
            code: "SETUP_REQUIRED",
            message: "Initial setup required",
          },
        },
        503
      );
    }
  }
  await next();
}

export async function getSystemSettings() {
  return db.query.systemSettings.findFirst();
}
