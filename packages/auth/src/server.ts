import { betterAuth } from "better-auth";
import { organization, admin, twoFactor, genericOAuth } from "better-auth/plugins";
import { sso } from "@better-auth/sso";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import * as React from "react";
import { sendEmail } from "@uni-status/email";
import { InvitationEmail } from "@uni-status/email/templates/invitation";
import {
  db,
  organizations,
  organizationMembers,
  organizationDomains,
  users,
  eq,
  and,
} from "@uni-status/database";
import * as schema from "@uni-status/database/schema";
import { getAppUrl, getAuthSecret, getOAuthConfig, getEnv } from "@uni-status/shared/config";
import { handleSelfHostedUserCreation, isSelfHosted } from "./lib/self-hosted";
import { withSsoEncryption } from "./lib/sso-adapter";
import { applyGroupRoleMapping } from "./lib/group-role-mapping";
import { createLogger } from "@uni-status/shared";

const log = createLogger({ module: "auth-server" });


const APP_URL = getAppUrl();

// Build global OAuth providers from environment variables
type OAuthProviderConfig = {
  id: string;
  providerId: string;
  name: string;
  clientId: string;
  clientSecret: string;
  authorizationUrl?: string;
  tokenUrl?: string;
  userInfoUrl?: string;
  scopes?: string[];
  pkce?: boolean;
  profile?: (profile: Record<string, unknown>) => {
    id: string;
    email: string;
    name?: string;
    image?: string;
    emailVerified?: boolean;
  };
};

const globalOAuthProviders: OAuthProviderConfig[] = [];
const env = getEnv();
const database = withSsoEncryption(drizzleAdapter(db, { provider: "pg", schema }));

// Microsoft Entra ID (Azure AD)
const microsoftConfig = getOAuthConfig("microsoft");
if (microsoftConfig?.clientId && microsoftConfig?.clientSecret) {
  const tenantId = microsoftConfig.tenantId || "common";
  globalOAuthProviders.push({
    id: "microsoft",
    providerId: "microsoft",
    name: "Microsoft",
    clientId: microsoftConfig.clientId,
    clientSecret: microsoftConfig.clientSecret,
    authorizationUrl: `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/authorize`,
    tokenUrl: `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`,
    userInfoUrl: "https://graph.microsoft.com/oidc/userinfo",
    scopes: ["openid", "email", "profile"],
    pkce: true,
    profile: (profile) => ({
      id: profile.sub as string,
      email: profile.email as string,
      name: profile.name as string,
      image: profile.picture as string,
      emailVerified: true, // Microsoft verifies emails
    }),
  });
}

// Okta
const oktaConfig = getOAuthConfig("okta");
if (oktaConfig?.clientId && oktaConfig?.clientSecret && oktaConfig?.issuer) {
  const issuer = oktaConfig.issuer;
  globalOAuthProviders.push({
    id: "okta",
    providerId: "okta",
    name: "Okta",
    clientId: oktaConfig.clientId,
    clientSecret: oktaConfig.clientSecret,
    authorizationUrl: `${issuer}/v1/authorize`,
    tokenUrl: `${issuer}/v1/token`,
    userInfoUrl: `${issuer}/v1/userinfo`,
    scopes: ["openid", "email", "profile"],
    pkce: true,
    profile: (profile) => ({
      id: profile.sub as string,
      email: profile.email as string,
      name: profile.name as string,
      image: profile.picture as string,
      emailVerified: profile.email_verified as boolean,
    }),
  });
}

// Auth0
const auth0Config = getOAuthConfig("auth0");
if (auth0Config?.clientId && auth0Config?.clientSecret && auth0Config?.domain) {
  const domain = auth0Config.domain;
  globalOAuthProviders.push({
    id: "auth0",
    providerId: "auth0",
    name: "Auth0",
    clientId: auth0Config.clientId,
    clientSecret: auth0Config.clientSecret,
    authorizationUrl: `https://${domain}/authorize`,
    tokenUrl: `https://${domain}/oauth/token`,
    userInfoUrl: `https://${domain}/userinfo`,
    scopes: ["openid", "email", "profile"],
    pkce: true,
    profile: (profile) => ({
      id: profile.sub as string,
      email: profile.email as string,
      name: profile.name as string,
      image: profile.picture as string,
      emailVerified: profile.email_verified as boolean,
    }),
  });
}

// Keycloak
const keycloakConfig = getOAuthConfig("keycloak");
if (keycloakConfig?.clientId && keycloakConfig?.clientSecret && keycloakConfig?.issuer) {
  const issuer = keycloakConfig.issuer;
  globalOAuthProviders.push({
    id: "keycloak",
    providerId: "keycloak",
    name: "Keycloak",
    clientId: keycloakConfig.clientId,
    clientSecret: keycloakConfig.clientSecret,
    authorizationUrl: `${issuer}/protocol/openid-connect/auth`,
    tokenUrl: `${issuer}/protocol/openid-connect/token`,
    userInfoUrl: `${issuer}/protocol/openid-connect/userinfo`,
    scopes: ["openid", "email", "profile"],
    pkce: true,
    profile: (profile) => ({
      id: profile.sub as string,
      email: profile.email as string,
      name: profile.name as string || profile.preferred_username as string,
      image: profile.picture as string,
      emailVerified: profile.email_verified as boolean,
    }),
  });
}

// Generic OIDC (any compliant provider)
const oidcConfig = getOAuthConfig("oidc");
if (oidcConfig?.clientId && oidcConfig?.clientSecret && oidcConfig?.issuer) {
  const issuer = oidcConfig.issuer;
  const providerId = oidcConfig.providerId || "oidc";
  globalOAuthProviders.push({
    id: providerId,
    providerId: providerId,
    name: oidcConfig.providerName || "SSO",
    clientId: oidcConfig.clientId,
    clientSecret: oidcConfig.clientSecret,
    authorizationUrl: oidcConfig.authorizationUrl || `${issuer}/authorize`,
    tokenUrl: oidcConfig.tokenUrl || `${issuer}/token`,
    userInfoUrl: oidcConfig.userinfoUrl || `${issuer}/userinfo`,
    scopes: (oidcConfig.scopes || "openid email profile").split(" "),
    pkce: oidcConfig.pkce !== false,
    profile: (profile) => ({
      id: profile.sub as string,
      email: profile.email as string,
      name: profile.name as string,
      image: profile.picture as string,
      emailVerified: profile.email_verified as boolean,
    }),
  });
}

// Export the list of enabled global OAuth providers for the frontend
// Defined before auth export to ensure Turbopack can see it
export function getEnabledGlobalProviders(): Array<{ id: string; name: string }> {
    const providers: Array<{ id: string; name: string }> = [];

    // Check built-in social providers
    if (process.env.GITHUB_CLIENT_ID && process.env.GITHUB_CLIENT_SECRET) {
        providers.push({ id: "github", name: "GitHub" });
    }
    if (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET) {
        providers.push({ id: "google", name: "Google" });
    }

    // Add generic OAuth providers
    for (const provider of globalOAuthProviders) {
        providers.push({ id: provider.id, name: provider.name });
    }

    return providers;
}

export const auth = betterAuth({
    baseURL: APP_URL,
    secret: getAuthSecret(),
    database,
    advanced: {
        useSecureCookies: APP_URL.startsWith("https://"),
        crossSubDomainCookies: {
            enabled: !!env.COOKIE_DOMAIN,
            domain: env.COOKIE_DOMAIN || undefined,
        },
        defaultCookieAttributes: {
            sameSite: "lax",
            secure: APP_URL.startsWith("https://"),
        },
    },
    session: {
        expiresIn: 60 * 60 * 24 * 7, // 7 days
        updateAge: 60 * 60 * 24, // 1 day
        cookieCache: {
            enabled: true,
            maxAge: 60 * 5, // 5 minutes
        },
    },
    account: {
        accountLinking: {
            enabled: true,
            // Trust all configured OAuth/SSO providers to link accounts by email
            // Includes common provider IDs and organization SSO provider names
            trustedProviders: ["microsoft", "github", "google", "okta", "auth0", "keycloak", "oidc", "entra", "azure", "azuread", "aad", "saml", "sso"],
        },
        // Store OAuth state in database to avoid cookie issues with proxies
        storeStateStrategy: "database",
    },
    emailAndPassword: {
        enabled: true,
        autoSignIn: true,
        minPasswordLength: 8,
    },
    socialProviders: {
        github: (() => {
            const config = getOAuthConfig("github");
            return {
                clientId: config?.clientId || "",
                clientSecret: config?.clientSecret || "",
                enabled: !!(config?.clientId && config?.clientSecret),
            };
        })(),
        google: (() => {
            const config = getOAuthConfig("google");
            return {
                clientId: config?.clientId || "",
                clientSecret: config?.clientSecret || "",
                enabled: !!(config?.clientId && config?.clientSecret),
            };
        })(),
    },
    plugins: [
    organization({
      allowUserToCreateOrganization: true,
      organizationLimit: 5,
      creatorRole: "owner",
      membershipLimit: 100,
      schema: {
        organization: {
          modelName: "organizations",
          fields: {
            id: "id",
            name: "name",
            slug: "slug",
            logo: "logo",
            metadata: "metadata",
            createdAt: "createdAt",
            updatedAt: "updatedAt",
          },
        },
        member: {
          modelName: "organizationMembers",
          fields: {
            id: "id",
            organizationId: "organizationId",
            userId: "userId",
            role: "role",
            customRoleId: "customRoleId",
            invitedBy: "invitedBy",
            joinedAt: "joinedAt",
            createdAt: "createdAt",
            updatedAt: "updatedAt",
          },
        },
        invitation: {
          modelName: "organizationInvitations",
          fields: {
            id: "id",
            organizationId: "organizationId",
            email: "email",
            role: "role",
            token: "token",
            status: "status",
            invitedBy: "invitedBy",
            expiresAt: "expiresAt",
            createdAt: "createdAt",
            updatedAt: "updatedAt",
          },
        },
      },
            sendInvitationEmail: async ({ email, organization, inviter, invitation }) => {
                const inviteUrl = `${APP_URL}/invite/${invitation.id}`;
                const expiresAt = new Date(invitation.expiresAt).toLocaleDateString("en-GB", {
                    month: "long",
                    day: "numeric",
                    year: "numeric",
                });

                const result = await sendEmail({
                    to: email,
                    subject: `You've been invited to join ${organization.name}`,
                    react: React.createElement(InvitationEmail, {
                        inviterName: inviter.user.name || inviter.user.email,
                        organizationName: organization.name,
                        role: invitation.role,
                        inviteUrl,
                        expiresAt,
                    }),
                });

                if (!result.success) {
                    log.error({ email, organizationName: organization.name, error: result.error }, "Failed to send invitation email");
                } else {
                    log.info({ email, organizationName: organization.name }, "Sent invitation email");
                }
            },
        }),
        admin({
            impersonationSessionDuration: 60 * 60, // 1 hour
        }),
        twoFactor({
            issuer: "Uni-Status",
        }),
        // Add generic OAuth providers if any are configured
        ...(globalOAuthProviders.length > 0
          ? [genericOAuth({ config: globalOAuthProviders })]
          : []),
        // Add SSO plugin for organization-specific OIDC/SAML providers
        sso({
            organizationProvisioning: {
                disabled: false,
                defaultRole: "member",
            },
        }),
    ],
    trustedOrigins: [
        APP_URL,
        "http://localhost:3000",
        "http://localhost:3003", // Landing dev
        env.LANDING_URL,
    ].filter(Boolean) as string[],
    rateLimit: {
        enabled: true,
        window: 60,
        max: 100,
    },
    databaseHooks: {
        account: {
            create: {
                after: async (account) => {
                    // When an OAuth/SSO account is linked, the provider has verified the email
                    // Auto-verify the user's email since trusted providers confirm email ownership
                    const trustedProviders = ["microsoft", "github", "google", "okta", "auth0", "keycloak", "oidc", "entra", "azure", "azuread", "aad", "saml", "sso"];
                    if (account.providerId && trustedProviders.includes(account.providerId)) {
                        try {
                            await db
                                .update(users)
                                .set({ emailVerified: true })
                                .where(eq(users.id, account.userId));
                            log.info({ userId: account.userId, providerId: account.providerId }, "Auto-verified email via SSO");
                        } catch (error) {
                            log.error({ err: error, userId: account.userId }, "Failed to auto-verify email");
                        }
                    }

                    // Apply group-based role mapping for SSO providers
                    // This reads group claims from the ID token and maps them to organization roles
                    if (account.providerId && account.idToken) {
                        try {
                            const result = await applyGroupRoleMapping({
                                userId: account.userId,
                                providerId: account.providerId,
                                idToken: account.idToken,
                                accessToken: account.accessToken,
                            });
                            if (result.success && result.role) {
                                log.info({ userId: account.userId, role: result.role }, "Applied group role mapping");
                            }
                        } catch (error) {
                            log.error({ err: error, userId: account.userId }, "Failed to apply group role mapping");
                        }
                    }
                },
            },
            update: {
                after: async (account) => {
                    // Re-apply group-based role mapping on login for role sync
                    // This handles the syncOnLogin feature where roles are updated on every SSO login
                    if (account.providerId && account.idToken) {
                        try {
                            const result = await applyGroupRoleMapping({
                                userId: account.userId,
                                providerId: account.providerId,
                                idToken: account.idToken,
                                accessToken: account.accessToken,
                            });
                            if (result.success && result.role) {
                                log.info({ userId: account.userId, role: result.role }, "Synced group role mapping");
                            }
                        } catch (error) {
                            log.error({ err: error, userId: account.userId }, "Failed to sync group role mapping");
                        }
                    }
                },
            },
        },
        user: {
            create: {
                after: async (user) => {
                    try {
                        // Check if this is a portal-only user (e.g., billing portal access only)
                        const userRecord = await db.query.users.findFirst({
                            where: eq(users.id, user.id),
                        });

                        if (userRecord?.portalOnly) {
                            log.info({ userId: user.id }, "Skipping personal org for portal-only user");
                            return;
                        }

                        // Handle self-hosted mode first
                        if (isSelfHosted()) {
                            const result = await handleSelfHostedUserCreation(user);
                            if (result.handled) {
                                if (!result.createPersonalOrg) {
                                    // Self-hosted handled everything, no personal org needed
                                    return;
                                }
                                // Self-hosted handled but wants personal org created
                            }
                            // If not handled, fall through to hosted mode logic
                        }

                        // Hosted mode: Extract email domain for auto-join check
                        const emailDomain = user.email.split("@")[1]?.toLowerCase();

                        if (emailDomain) {
                            // Check for verified domain with auto-join enabled
                            const domainConfig = await db.query.organizationDomains.findFirst({
                                where: and(
                                    eq(organizationDomains.domain, emailDomain),
                                    eq(organizationDomains.verified, true),
                                    eq(organizationDomains.autoJoinEnabled, true)
                                ),
                            });

                            if (domainConfig) {
                                // Auto-join user to the organization
                                const memberId = crypto.randomUUID();
                                await db.insert(organizationMembers).values({
                                    id: memberId,
                                    organizationId: domainConfig.organizationId,
                                    userId: user.id,
                                    role: domainConfig.autoJoinRole,
                                });

                                log.info({ userId: user.id, organizationId: domainConfig.organizationId, emailDomain }, "Auto-joined user to organisation via domain");

                                // Still create a personal org for the user
                                const personalOrgId = crypto.randomUUID();
                                const personalMemberId = crypto.randomUUID();
                                const slug = `personal-${user.id.slice(0, 8)}`;

                                await db.insert(organizations).values({
                                    id: personalOrgId,
                                    name: "Personal",
                                    slug,
                                    plan: "free",
                                });

                                await db.insert(organizationMembers).values({
                                    id: personalMemberId,
                                    organizationId: personalOrgId,
                                    userId: user.id,
                                    role: "owner",
                                });

                                log.info({ userId: user.id }, "Also created Personal organisation");
                                return;
                            }
                        }

                        // Default: Create personal organisation only
                        const orgId = crypto.randomUUID();
                        const memberId = crypto.randomUUID();
                        const slug = `personal-${user.id.slice(0, 8)}`;

                        await db.insert(organizations).values({
                            id: orgId,
                            name: "Personal",
                            slug,
                            plan: "free",
                        });

                        await db.insert(organizationMembers).values({
                            id: memberId,
                            organizationId: orgId,
                            userId: user.id,
                            role: "owner",
                        });

                        log.info({ userId: user.id }, "Created Personal organisation");
                    } catch (error) {
                        log.error({ err: error, userId: user.id }, "Failed to create organisation");
                    }
                },
            },
        },
    },
});

export const authHandler = auth.handler;

export type Auth = typeof auth;
