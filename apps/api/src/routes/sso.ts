import { OpenAPIHono } from "@hono/zod-openapi";
import { nanoid } from "nanoid";
import { db } from "@uni-status/database";
import {
  organizations,
  organizationMembers,
  ssoProvider,
  organizationDomains,
  resourceScopes,
} from "@uni-status/database/schema";
import { requireAuth } from "../middleware/auth";
import { eq, and, desc } from "drizzle-orm";
import { getEnabledGlobalProviders } from "@uni-status/auth/server";
import { isSelfHosted } from "@uni-status/shared/config";
import { verifyLicenseOffline } from "@uni-status/shared/lib/keygen";
import { resolveDnsRecords } from "@uni-status/shared/lib/dns-resolver";
import { encryptSsoSecret, isEncrypted } from "@uni-status/shared/crypto";

// Public routes (no auth required) - for /api/v1/auth/sso
export const ssoPublicRoutes = new OpenAPIHono();

// Protected routes (auth required) - for /api/v1/sso
export const ssoRoutes = new OpenAPIHono();

const encryptOidcConfig = async (
  oidcConfig?: Record<string, unknown> | null
): Promise<Record<string, unknown> | null | undefined> => {
  if (oidcConfig === null) {
    return null;
  }
  if (!oidcConfig) {
    return undefined;
  }

  const config = { ...oidcConfig };
  const clientSecret = typeof config.clientSecret === "string" ? config.clientSecret : undefined;

  if (clientSecret) {
    config.clientSecretEncrypted = isEncrypted(clientSecret)
      ? clientSecret
      : await encryptSsoSecret(clientSecret);
    delete config.clientSecret;
  }

  return config;
};

// ===== Global Auth Providers (Public) =====

// List all enabled global OAuth providers (public endpoint)
// Self-hosted deployments require enterprise license for OAuth
ssoPublicRoutes.get("/providers", async (c) => {
  // Hosted (cloud) mode: always return all configured providers
  if (!isSelfHosted()) {
    const providers = getEnabledGlobalProviders();
    return c.json({
      success: true,
      data: providers.map((p) => ({
        id: p.id,
        name: p.name,
        icon: p.id,
      })),
    });
  }

  // Self-hosted mode: check for valid enterprise license
  const licenseKey = process.env.UNI_STATUS_LICENCE?.trim();
  if (!licenseKey) {
    // No license = no OAuth for self-hosted
    return c.json({ success: true, data: [] });
  }

  const result = verifyLicenseOffline(licenseKey);
  if (!result.valid) {
    // Invalid license = no OAuth
    return c.json({ success: true, data: [] });
  }

  // Valid enterprise license - return all configured providers
  const providers = getEnabledGlobalProviders();
  return c.json({
    success: true,
    data: providers.map((p) => ({
      id: p.id,
      name: p.name,
      icon: p.id,
    })),
  });
});

// ===== SSO Discovery (Public) =====

ssoPublicRoutes.get("/discover", async (c) => {
  const rawEmail = c.req.query("email");

  if (!rawEmail || !rawEmail.includes("@")) {
    return c.json({
      success: true,
      data: { hasSSO: false },
    });
  }

  // Normalize email to lowercase for case-insensitive matching
  const email = rawEmail.toLowerCase();
  const domain = email.split("@")[1];

  if (!domain) {
    return c.json({
      success: true,
      data: { hasSSO: false },
    });
  }

  // Check for domain with SSO configured
  const domainConfig = await db.query.organizationDomains.findFirst({
    where: and(
      eq(organizationDomains.domain, domain),
      eq(organizationDomains.verified, true)
    ),
    with: {
      ssoProvider: true,
      organization: true,
    },
  });

  if (!domainConfig) {
    return c.json({
      success: true,
      data: { hasSSO: false },
    });
  }

  // If domain has SSO provider linked
  if (domainConfig.ssoProvider && domainConfig.ssoProvider.enabled) {
    // Generate Better Auth SSO redirect URL
    const appUrl = c.req.header("Origin") || c.req.header("Referer")?.split("/").slice(0, 3).join("/") || process.env.UNI_STATUS_URL || "http://localhost:3000";
    const redirectUrl = `${appUrl}/api/auth/sign-in/sso?providerId=${domainConfig.ssoProvider.providerId}`;

    return c.json({
      success: true,
      data: {
        hasSSO: true,
        ssoRequired: domainConfig.ssoRequired,
        providerId: domainConfig.ssoProvider.providerId,
        providerName: domainConfig.ssoProvider.name,
        organizationName: domainConfig.organization.name,
        organizationId: domainConfig.organizationId,
        redirectUrl,
      },
    });
  }

  // Domain exists but no SSO provider - might have auto-join enabled
  return c.json({
    success: true,
    data: {
      hasSSO: false,
      autoJoinEnabled: domainConfig.autoJoinEnabled,
      organizationName: domainConfig.organization.name,
    },
  });
});

// ===== Organization SSO Providers =====
// Note: SSO authentication flow is now handled by better-auth's SSO plugin
// Endpoints are available at /api/auth/sso/*

ssoRoutes.get("/organizations/:id/providers", async (c) => {
  const auth = requireAuth(c);
  const { id } = c.req.param();

  if (!auth.user) {
    throw new Error("Unauthorized");
  }

  // Verify user is admin or owner
  const membership = await db.query.organizationMembers.findFirst({
    where: and(
      eq(organizationMembers.organizationId, id),
      eq(organizationMembers.userId, auth.user.id)
    ),
  });

  if (!membership || !["owner", "admin"].includes(membership.role)) {
    throw new Error("Insufficient permissions: admin required");
  }

  const providers = await db.query.ssoProvider.findMany({
    where: eq(ssoProvider.organizationId, id),
    orderBy: [desc(ssoProvider.createdAt)],
  });

  return c.json({
    success: true,
    data: providers.map((p) => {
      // Parse config to extract group role mapping
      let groupRoleMapping = null;
      if (p.type === "oidc" && p.oidcConfig) {
        try {
          const config = typeof p.oidcConfig === "string" ? JSON.parse(p.oidcConfig) : p.oidcConfig;
          groupRoleMapping = config.groupRoleMapping || null;
        } catch {
          // Invalid config
        }
      } else if (p.type === "saml" && p.samlConfig) {
        try {
          const config = typeof p.samlConfig === "string" ? JSON.parse(p.samlConfig) : p.samlConfig;
          groupRoleMapping = config.groupRoleMapping || null;
        } catch {
          // Invalid config
        }
      }

      return {
        id: p.id,
        providerId: p.providerId,
        name: p.name || p.providerId,
        type: p.type || "oidc",
        issuer: p.issuer,
        domain: p.domain,
        enabled: p.enabled ?? true,
        metadata: p.metadata ? JSON.parse(p.metadata) : {},
        createdAt: p.createdAt,
        updatedAt: p.updatedAt,
        // Don't expose sensitive config
        hasOidcConfig: !!p.oidcConfig,
        hasSamlConfig: !!p.samlConfig,
        // Include group role mapping configuration (not sensitive)
        groupRoleMapping,
      };
    }),
  });
});

ssoRoutes.post("/organizations/:id/providers", async (c) => {
  const auth = requireAuth(c);
  const { id } = c.req.param();

  if (!auth.user) {
    throw new Error("Unauthorized");
  }

  // Verify user is admin or owner
  const membership = await db.query.organizationMembers.findFirst({
    where: and(
      eq(organizationMembers.organizationId, id),
      eq(organizationMembers.userId, auth.user.id)
    ),
  });

  if (!membership || !["owner", "admin"].includes(membership.role)) {
    throw new Error("Insufficient permissions: admin required");
  }

  const body = await c.req.json();
  const {
    providerId,
    name,
    type,
    issuer,
    domain,
    oidcConfig,
    samlConfig,
    metadata,
    groupRoleMapping,
  } = body;

  const providersId = nanoid();
  const now = new Date();

  // Merge groupRoleMapping into oidcConfig or samlConfig
  let mergedOidcConfig = oidcConfig;
  let mergedSamlConfig = samlConfig;

  if (groupRoleMapping) {
    if (type === "oidc" || !type) {
      mergedOidcConfig = { ...(oidcConfig || {}), groupRoleMapping };
    } else if (type === "saml") {
      mergedSamlConfig = { ...(samlConfig || {}), groupRoleMapping };
    }
  }

  const encryptedOidcConfig = await encryptOidcConfig(mergedOidcConfig);

  // Create in ssoProvider table (Better Auth + our extensions)
  const [provider] = await db
    .insert(ssoProvider)
    .values({
      id: providersId,
      organizationId: id,
      providerId,
      name,
      type,
      issuer,
      domain: domain?.toLowerCase() || "",
      domainVerified: true,
      oidcConfig: encryptedOidcConfig ? JSON.stringify(encryptedOidcConfig) : null,
      samlConfig: mergedSamlConfig ? JSON.stringify(mergedSamlConfig) : null,
      metadata: metadata ? JSON.stringify(metadata) : null,
      enabled: true,
      userId: null,
      createdAt: now,
      updatedAt: now,
    })
    .returning();

  if (!provider) {
    return c.json({ success: false, error: "Failed to create SSO provider" }, 500);
  }

  return c.json(
    {
      success: true,
      data: {
        id: provider.id,
        providerId: provider.providerId,
        name: provider.name,
        type: provider.type,
        issuer: provider.issuer,
        domain: provider.domain,
        enabled: provider.enabled,
        createdAt: provider.createdAt,
      },
    },
    201
  );
});

ssoRoutes.patch("/organizations/:id/providers/:providerId", async (c) => {
  const auth = requireAuth(c);
  const { id, providerId } = c.req.param();

  if (!auth.user) {
    throw new Error("Unauthorized");
  }

  // Verify user is admin or owner
  const membership = await db.query.organizationMembers.findFirst({
    where: and(
      eq(organizationMembers.organizationId, id),
      eq(organizationMembers.userId, auth.user.id)
    ),
  });

  if (!membership || !["owner", "admin"].includes(membership.role)) {
    throw new Error("Insufficient permissions: admin required");
  }

  const body = await c.req.json();
  const { name, issuer, domain, oidcConfig, samlConfig, metadata, enabled, groupRoleMapping } = body;

  const updateData: Record<string, unknown> = {
    updatedAt: new Date(),
  };

  if (name !== undefined) updateData.name = name;
  if (issuer !== undefined) updateData.issuer = issuer;
  if (domain !== undefined) updateData.domain = domain?.toLowerCase();
  if (metadata !== undefined) updateData.metadata = metadata;
  if (enabled !== undefined) updateData.enabled = enabled;

  // Handle groupRoleMapping - need to fetch existing config to merge
  let existingProvider = null;
  if (groupRoleMapping !== undefined || oidcConfig !== undefined || samlConfig !== undefined) {
    existingProvider = await db.query.ssoProvider.findFirst({
      where: and(eq(ssoProvider.id, providerId), eq(ssoProvider.organizationId, id)),
    });
  }

  if (oidcConfig !== undefined || (groupRoleMapping !== undefined && existingProvider?.type === "oidc")) {
    // Merge new oidcConfig with groupRoleMapping
    let mergedConfig = oidcConfig || {};

    // If we're updating groupRoleMapping, merge with existing oidcConfig
    if (groupRoleMapping !== undefined && existingProvider?.oidcConfig) {
      try {
        const existingConfig = typeof existingProvider.oidcConfig === "string"
          ? JSON.parse(existingProvider.oidcConfig)
          : existingProvider.oidcConfig;

        // If only updating groupRoleMapping, preserve existing config
        if (oidcConfig === undefined) {
          mergedConfig = { ...existingConfig };
        }

        mergedConfig.groupRoleMapping = groupRoleMapping;
      } catch {
        mergedConfig.groupRoleMapping = groupRoleMapping;
      }
    } else if (groupRoleMapping !== undefined) {
      mergedConfig.groupRoleMapping = groupRoleMapping;
    }

    const encryptedConfig = await encryptOidcConfig(mergedConfig);
    if (encryptedConfig !== undefined) {
      updateData.oidcConfig = encryptedConfig;
    }
  }

  if (samlConfig !== undefined || (groupRoleMapping !== undefined && existingProvider?.type === "saml")) {
    // Merge new samlConfig with groupRoleMapping
    let mergedConfig = samlConfig || {};

    // If we're updating groupRoleMapping, merge with existing samlConfig
    if (groupRoleMapping !== undefined && existingProvider?.samlConfig) {
      try {
        const existingConfig = typeof existingProvider.samlConfig === "string"
          ? JSON.parse(existingProvider.samlConfig)
          : existingProvider.samlConfig;

        // If only updating groupRoleMapping, preserve existing config
        if (samlConfig === undefined) {
          mergedConfig = { ...existingConfig };
        }

        mergedConfig.groupRoleMapping = groupRoleMapping;
      } catch {
        mergedConfig.groupRoleMapping = groupRoleMapping;
      }
    } else if (groupRoleMapping !== undefined) {
      mergedConfig.groupRoleMapping = groupRoleMapping;
    }

    updateData.samlConfig = mergedConfig;
  }

  // Convert JSON fields to strings if provided
  if (updateData.oidcConfig) {
    updateData.oidcConfig = JSON.stringify(updateData.oidcConfig);
  }
  if (updateData.samlConfig) {
    updateData.samlConfig = JSON.stringify(updateData.samlConfig);
  }
  if (updateData.metadata) {
    updateData.metadata = JSON.stringify(updateData.metadata);
  }

  const [provider] = await db
    .update(ssoProvider)
    .set(updateData)
    .where(and(eq(ssoProvider.id, providerId), eq(ssoProvider.organizationId, id)))
    .returning();

  if (!provider) {
    throw new Error("SSO provider not found");
  }

  // Extract groupRoleMapping for response
  let responseGroupRoleMapping = null;
  if (provider.type === "oidc" && provider.oidcConfig) {
    try {
      const config = typeof provider.oidcConfig === "string" ? JSON.parse(provider.oidcConfig) : provider.oidcConfig;
      responseGroupRoleMapping = config.groupRoleMapping || null;
    } catch {
      // Invalid config
    }
  } else if (provider.type === "saml" && provider.samlConfig) {
    try {
      const config = typeof provider.samlConfig === "string" ? JSON.parse(provider.samlConfig) : provider.samlConfig;
      responseGroupRoleMapping = config.groupRoleMapping || null;
    } catch {
      // Invalid config
    }
  }

  return c.json({
    success: true,
    data: {
      id: provider.id,
      providerId: provider.providerId,
      name: provider.name,
      type: provider.type,
      issuer: provider.issuer,
      domain: provider.domain,
      enabled: provider.enabled,
      updatedAt: provider.updatedAt,
      groupRoleMapping: responseGroupRoleMapping,
    },
  });
});

ssoRoutes.delete("/organizations/:id/providers/:providerId", async (c) => {
  const auth = requireAuth(c);
  const { id, providerId } = c.req.param();

  if (!auth.user) {
    throw new Error("Unauthorized");
  }

  // Verify user is admin or owner
  const membership = await db.query.organizationMembers.findFirst({
    where: and(
      eq(organizationMembers.organizationId, id),
      eq(organizationMembers.userId, auth.user.id)
    ),
  });

  if (!membership || !["owner", "admin"].includes(membership.role)) {
    throw new Error("Insufficient permissions: admin required");
  }

  // Safety check: Prevent deletion if this is the only SSO provider and password auth is disabled
  const allProviders = await db.query.ssoProvider.findMany({
    where: eq(ssoProvider.organizationId, id),
  });

  const domainsWithSSORequired = await db.query.organizationDomains.findMany({
    where: and(
      eq(organizationDomains.organizationId, id),
      eq(organizationDomains.ssoRequired, true),
      eq(organizationDomains.ssoProviderId, providerId)
    ),
  });

  if (allProviders.length === 1 && domainsWithSSORequired.length > 0) {
    throw new Error(
      "Cannot delete the only SSO provider when domains have SSO required. Disable SSO requirement first or add another provider."
    );
  }

  const result = await db
    .delete(ssoProvider)
    .where(and(eq(ssoProvider.id, providerId), eq(ssoProvider.organizationId, id)))
    .returning();

  if (result.length === 0) {
    throw new Error("SSO provider not found");
  }

  return c.json({
    success: true,
    data: { deleted: true },
  });
});

ssoRoutes.post("/organizations/:id/providers/:providerId/test", async (c) => {
  const auth = requireAuth(c);
  const { id, providerId } = c.req.param();

  if (!auth.user) {
    throw new Error("Unauthorized");
  }

  // Verify user is admin or owner
  const membership = await db.query.organizationMembers.findFirst({
    where: and(
      eq(organizationMembers.organizationId, id),
      eq(organizationMembers.userId, auth.user.id)
    ),
  });

  if (!membership || !["owner", "admin"].includes(membership.role)) {
    throw new Error("Insufficient permissions: admin required");
  }

  const provider = await db.query.ssoProvider.findFirst({
    where: and(eq(ssoProvider.id, providerId), eq(ssoProvider.organizationId, id)),
  });

  if (!provider) {
    throw new Error("SSO provider not found");
  }

  try {
    if (provider.type === "oidc" && provider.oidcConfig) {
      // Parse oidcConfig JSON
      const oidcConfig = typeof provider.oidcConfig === "string"
        ? JSON.parse(provider.oidcConfig)
        : provider.oidcConfig;

      // Test OIDC discovery endpoint
      const discoveryUrl =
        oidcConfig.discoveryEndpoint || oidcConfig.discoveryUrl ||
        `${provider.issuer}/.well-known/openid-configuration`;

      const response = await fetch(discoveryUrl);
      if (!response.ok) {
        throw new Error(`Discovery endpoint returned ${response.status}`);
      }

      const config = await response.json();
      if (!config.issuer || !config.authorization_endpoint) {
        throw new Error("Invalid OIDC discovery response");
      }

      return c.json({
        success: true,
        data: {
          status: "connected",
          message: "OIDC provider is reachable",
          issuer: config.issuer,
        },
      });
    } else if (provider.type === "saml" && provider.samlConfig) {
      // Test SAML metadata endpoint if available
      return c.json({
        success: true,
        data: {
          status: "configured",
          message: "SAML provider configuration saved",
        },
      });
    }

    throw new Error("No provider configuration found");
  } catch (error) {
    return c.json({
      success: false,
      error: {
        code: "CONNECTION_FAILED",
        message: error instanceof Error ? error.message : "Connection test failed",
      },
    });
  }
});

// ===== Organization Domains =====

ssoRoutes.get("/organizations/:id/domains", async (c) => {
  const auth = requireAuth(c);
  const { id } = c.req.param();

  if (!auth.user) {
    throw new Error("Unauthorized");
  }

  // Verify user is admin or owner
  const membership = await db.query.organizationMembers.findFirst({
    where: and(
      eq(organizationMembers.organizationId, id),
      eq(organizationMembers.userId, auth.user.id)
    ),
  });

  if (!membership || !["owner", "admin"].includes(membership.role)) {
    throw new Error("Insufficient permissions: admin required");
  }

  const domains = await db.query.organizationDomains.findMany({
    where: eq(organizationDomains.organizationId, id),
    with: {
      ssoProvider: true,
    },
    orderBy: [desc(organizationDomains.createdAt)],
  });

  return c.json({
    success: true,
    data: domains.map((d) => ({
      id: d.id,
      domain: d.domain,
      verified: d.verified,
      verificationToken: d.verified ? null : d.verificationToken,
      verifiedAt: d.verifiedAt,
      autoJoinEnabled: d.autoJoinEnabled,
      autoJoinRole: d.autoJoinRole,
      ssoRequired: d.ssoRequired,
      ssoProvider: d.ssoProvider
        ? {
            id: d.ssoProvider.id,
            name: d.ssoProvider.name,
            type: d.ssoProvider.type,
          }
        : null,
      createdAt: d.createdAt,
    })),
  });
});

ssoRoutes.post("/organizations/:id/domains", async (c) => {
  const auth = requireAuth(c);
  const { id } = c.req.param();

  // Allow API key auth with admin scope or user session auth
  if (auth.apiKey) {
    if (!auth.apiKey.scopes.includes("admin")) {
      throw new Error("Insufficient permissions: admin scope required");
    }
  } else if (auth.user) {
    // Verify user is admin or owner
    const membership = await db.query.organizationMembers.findFirst({
      where: and(
        eq(organizationMembers.organizationId, id),
        eq(organizationMembers.userId, auth.user.id)
      ),
    });

    if (!membership || !["owner", "admin"].includes(membership.role)) {
      throw new Error("Insufficient permissions: admin required");
    }
  } else {
    throw new Error("Unauthorized");
  }

  const body = await c.req.json();
  const { domain } = body;

  if (!domain || typeof domain !== "string") {
    throw new Error("Domain is required");
  }

  const normalizedDomain = domain.toLowerCase().trim();

  // Validate domain format
  const domainRegex = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/;
  if (!domainRegex.test(normalizedDomain)) {
    throw new Error("Invalid domain format");
  }

  // Check if domain already exists
  const existingDomain = await db.query.organizationDomains.findFirst({
    where: eq(organizationDomains.domain, normalizedDomain),
  });

  if (existingDomain) {
    throw new Error("Domain is already registered");
  }

  // Generate verification token
  const verificationToken = `uni-status-verify=${nanoid(32)}`;
  const domainId = nanoid();
  const now = new Date();

  const [newDomain] = await db
    .insert(organizationDomains)
    .values({
      id: domainId,
      organizationId: id,
      domain: normalizedDomain,
      verified: false,
      verificationToken,
      autoJoinEnabled: false,
      autoJoinRole: "member",
      ssoRequired: false,
      createdAt: now,
      updatedAt: now,
    })
    .returning();

  if (!newDomain) {
    return c.json({ success: false, error: "Failed to create domain" }, 500);
  }

  return c.json(
    {
      success: true,
      data: {
        id: newDomain.id,
        domain: newDomain.domain,
        verified: newDomain.verified,
        verificationToken: newDomain.verificationToken,
        verificationInstructions: {
          type: "dns_txt",
          record: `TXT`,
          name: `_uni-status.${normalizedDomain}`,
          value: verificationToken,
          ttl: 300,
        },
        createdAt: newDomain.createdAt,
      },
    },
    201
  );
});

ssoRoutes.post("/organizations/:id/domains/:domainId/verify", async (c) => {
  const auth = requireAuth(c);
  const { id, domainId } = c.req.param();

  if (!auth.user) {
    throw new Error("Unauthorized");
  }

  // Verify user is admin or owner
  const membership = await db.query.organizationMembers.findFirst({
    where: and(
      eq(organizationMembers.organizationId, id),
      eq(organizationMembers.userId, auth.user.id)
    ),
  });

  if (!membership || !["owner", "admin"].includes(membership.role)) {
    throw new Error("Insufficient permissions: admin required");
  }

  const domainRecord = await db.query.organizationDomains.findFirst({
    where: and(
      eq(organizationDomains.id, domainId),
      eq(organizationDomains.organizationId, id)
    ),
  });

  if (!domainRecord) {
    throw new Error("Domain not found");
  }

  if (domainRecord.verified) {
    return c.json({
      success: true,
      data: {
        verified: true,
        message: "Domain is already verified",
      },
    });
  }

  // Use robust DNS resolution with multiple public resolvers and retry logic
  const txtRecordName = `_uni-status.${domainRecord.domain}`;
  const dnsResult = await resolveDnsRecords({
    hostname: txtRecordName,
    recordType: "TXT",
    timeoutMs: 10000,
    retries: 3,
  });

  if (!dnsResult.success) {
    return c.json({
      success: false,
      error: {
        code: "DNS_RECORD_NOT_FOUND",
        message: `No TXT record found at ${txtRecordName}. ${dnsResult.error || "The record may not have propagated yet."}`,
        expectedRecord: {
          name: txtRecordName,
          value: domainRecord.verificationToken,
        },
        hint: "DNS propagation can take up to 48 hours. Please wait and try again.",
      },
    });
  }

  // Check if verification token exists in the found records
  const verified = dnsResult.records.some(
    (record) => record === domainRecord.verificationToken
  );

  if (verified) {
    // Update domain as verified
    const now = new Date();
    await db
      .update(organizationDomains)
      .set({
        verified: true,
        verifiedAt: now,
        updatedAt: now,
      })
      .where(eq(organizationDomains.id, domainId));

    return c.json({
      success: true,
      data: {
        verified: true,
        message: "Domain verified successfully",
        verifiedAt: now,
        resolverUsed: dnsResult.resolverUsed,
      },
    });
  }

  return c.json({
    success: false,
    error: {
      code: "VERIFICATION_FAILED",
      message: "Verification token not found in DNS TXT records",
      expectedRecord: {
        name: txtRecordName,
        value: domainRecord.verificationToken,
      },
      foundRecords: dnsResult.records,
      resolverUsed: dnsResult.resolverUsed,
      hint: "Make sure the TXT record value matches exactly (including the 'uni-status-verify=' prefix).",
    },
  });
});

ssoRoutes.patch("/organizations/:id/domains/:domainId", async (c) => {
  const auth = requireAuth(c);
  const { id, domainId } = c.req.param();

  if (!auth.user) {
    throw new Error("Unauthorized");
  }

  // Verify user is admin or owner
  const membership = await db.query.organizationMembers.findFirst({
    where: and(
      eq(organizationMembers.organizationId, id),
      eq(organizationMembers.userId, auth.user.id)
    ),
  });

  if (!membership || !["owner", "admin"].includes(membership.role)) {
    throw new Error("Insufficient permissions: admin required");
  }

  const body = await c.req.json();
  const { autoJoinEnabled, autoJoinRole, ssoProviderId, ssoRequired } = body;

  const updateData: Record<string, unknown> = {
    updatedAt: new Date(),
  };

  if (autoJoinEnabled !== undefined) updateData.autoJoinEnabled = autoJoinEnabled;
  if (autoJoinRole !== undefined) updateData.autoJoinRole = autoJoinRole;
  if (ssoProviderId !== undefined) updateData.ssoProviderId = ssoProviderId || null;
  if (ssoRequired !== undefined) updateData.ssoRequired = ssoRequired;

  const [domain] = await db
    .update(organizationDomains)
    .set(updateData)
    .where(
      and(eq(organizationDomains.id, domainId), eq(organizationDomains.organizationId, id))
    )
    .returning();

  if (!domain) {
    throw new Error("Domain not found");
  }

  return c.json({
    success: true,
    data: {
      id: domain.id,
      domain: domain.domain,
      verified: domain.verified,
      autoJoinEnabled: domain.autoJoinEnabled,
      autoJoinRole: domain.autoJoinRole,
      ssoProviderId: domain.ssoProviderId,
      ssoRequired: domain.ssoRequired,
      updatedAt: domain.updatedAt,
    },
  });
});

ssoRoutes.delete("/organizations/:id/domains/:domainId", async (c) => {
  const auth = requireAuth(c);
  const { id, domainId } = c.req.param();

  if (!auth.user) {
    throw new Error("Unauthorized");
  }

  // Verify user is admin or owner
  const membership = await db.query.organizationMembers.findFirst({
    where: and(
      eq(organizationMembers.organizationId, id),
      eq(organizationMembers.userId, auth.user.id)
    ),
  });

  if (!membership || !["owner", "admin"].includes(membership.role)) {
    throw new Error("Insufficient permissions: admin required");
  }

  const result = await db
    .delete(organizationDomains)
    .where(
      and(eq(organizationDomains.id, domainId), eq(organizationDomains.organizationId, id))
    )
    .returning();

  if (result.length === 0) {
    throw new Error("Domain not found");
  }

  return c.json({
    success: true,
    data: { deleted: true },
  });
});

// ===== Resource Scopes =====

ssoRoutes.get("/organizations/:id/members/:memberId/scopes", async (c) => {
  const auth = requireAuth(c);
  const { id, memberId } = c.req.param();

  if (!auth.user) {
    throw new Error("Unauthorized");
  }

  // Verify user is admin or owner
  const membership = await db.query.organizationMembers.findFirst({
    where: and(
      eq(organizationMembers.organizationId, id),
      eq(organizationMembers.userId, auth.user.id)
    ),
  });

  if (!membership || !["owner", "admin"].includes(membership.role)) {
    throw new Error("Insufficient permissions: admin required");
  }

  const scopes = await db.query.resourceScopes.findMany({
    where: and(
      eq(resourceScopes.memberId, memberId),
      eq(resourceScopes.organizationId, id)
    ),
  });

  return c.json({
    success: true,
    data: scopes.map((s) => ({
      id: s.id,
      resourceType: s.resourceType,
      resourceId: s.resourceId,
      role: s.role,
      createdAt: s.createdAt,
    })),
  });
});

ssoRoutes.post("/organizations/:id/members/:memberId/scopes", async (c) => {
  const auth = requireAuth(c);
  const { id, memberId } = c.req.param();

  // Allow API key auth with admin scope or user session auth
  if (auth.apiKey) {
    if (!auth.apiKey.scopes.includes("admin")) {
      throw new Error("Insufficient permissions: admin scope required");
    }
  } else if (auth.user) {
    // Verify user is admin or owner
    const membership = await db.query.organizationMembers.findFirst({
      where: and(
        eq(organizationMembers.organizationId, id),
        eq(organizationMembers.userId, auth.user.id)
      ),
    });

    if (!membership || !["owner", "admin"].includes(membership.role)) {
      throw new Error("Insufficient permissions: admin required");
    }
  } else {
    throw new Error("Unauthorized");
  }

  const body = await c.req.json();
  const { resourceType, resourceId, role } = body;

  const scopeId = nanoid();
  const now = new Date();

  const [scope] = await db
    .insert(resourceScopes)
    .values({
      id: scopeId,
      organizationId: id,
      memberId,
      resourceType,
      resourceId: resourceId || null,
      role,
      createdAt: now,
    })
    .returning();

  if (!scope) {
    return c.json({ success: false, error: "Failed to create scope" }, 500);
  }

  return c.json(
    {
      success: true,
      data: {
        id: scope.id,
        resourceType: scope.resourceType,
        resourceId: scope.resourceId,
        role: scope.role,
        createdAt: scope.createdAt,
      },
    },
    201
  );
});

ssoRoutes.delete("/organizations/:id/members/:memberId/scopes/:scopeId", async (c) => {
  const auth = requireAuth(c);
  const { id, memberId, scopeId } = c.req.param();

  // Allow API key auth with admin scope or user session auth
  if (auth.apiKey) {
    if (!auth.apiKey.scopes.includes("admin")) {
      throw new Error("Insufficient permissions: admin scope required");
    }
  } else if (auth.user) {
    // Verify user is admin or owner
    const membership = await db.query.organizationMembers.findFirst({
      where: and(
        eq(organizationMembers.organizationId, id),
        eq(organizationMembers.userId, auth.user.id)
      ),
    });

    if (!membership || !["owner", "admin"].includes(membership.role)) {
      throw new Error("Insufficient permissions: admin required");
    }
  } else {
    throw new Error("Unauthorized");
  }

  const result = await db
    .delete(resourceScopes)
    .where(
      and(
        eq(resourceScopes.id, scopeId),
        eq(resourceScopes.memberId, memberId),
        eq(resourceScopes.organizationId, id)
      )
    )
    .returning();

  if (result.length === 0) {
    throw new Error("Resource scope not found");
  }

  return c.json({
    success: true,
    data: { deleted: true },
  });
});
