import { z } from "zod";
import { readFileSync, existsSync } from "fs";

/**
 * List of environment variable keys that support the _FILE suffix pattern
 * for Docker secrets. When VAR_FILE is set, the value is read from the file
 * at the specified path instead of directly from the environment variable.
 */
const SECRET_ENV_KEYS = [
  // Database & Cache
  "UNI_STATUS_DB_URL",
  "UNI_STATUS_REDIS_URL",
  // Authentication & Encryption
  "UNI_STATUS_AUTH_SECRET",
  "UNI_STATUS_JWT_SECRET",
  "UNI_STATUS_ENCRYPTION_KEY",
  "UNI_STATUS_SSO_ENCRYPTION_KEY",
  // OAuth Client Secrets
  "UNI_STATUS_OAUTH_GITHUB_CLIENT_SECRET",
  "UNI_STATUS_OAUTH_GOOGLE_CLIENT_SECRET",
  "UNI_STATUS_OAUTH_MICROSOFT_CLIENT_SECRET",
  "UNI_STATUS_OAUTH_OKTA_CLIENT_SECRET",
  "UNI_STATUS_OAUTH_AUTH0_CLIENT_SECRET",
  "UNI_STATUS_OAUTH_KEYCLOAK_CLIENT_SECRET",
  "UNI_STATUS_OAUTH_OIDC_CLIENT_SECRET",
  // Email & Notifications
  "UNI_STATUS_SMTP_PASSWORD",
  "UNI_STATUS_RESEND_API_KEY",
  "UNI_STATUS_SLACK_WEBHOOK_URL",
  "UNI_STATUS_DISCORD_WEBHOOK_URL",
  "UNI_STATUS_TWILIO_AUTH_TOKEN",
  // AWS Credentials (legacy)
  "UNI_STATUS_AWS_ACCESS_KEY_ID",
  "UNI_STATUS_AWS_SECRET_ACCESS_KEY",
  // S3-Compatible Storage Credentials
  "UNI_STATUS_S3_ACCESS_KEY",
  "UNI_STATUS_S3_SECRET_KEY",
  // Licensing
  "UNI_STATUS_LICENCE",
  "UNI_STATUS_KEYGEN_API_TOKEN",
  "UNI_STATUS_KEYGEN_WEBHOOK_SECRET",
  "UNI_STATUS_KEYGEN_PUBLIC_KEY",
] as const;

/**
 * Reads a secret value from a file if the _FILE variant is set,
 * otherwise returns the direct environment variable value.
 *
 * @param envKey - The base environment variable key (e.g., "UNI_STATUS_DB_URL")
 * @returns The secret value from file or environment, or undefined if neither is set
 * @throws Error if the _FILE variant points to a non-existent file
 */
function readFileSecret(envKey: string): string | undefined {
  const fileEnvKey = `${envKey}_FILE`;
  const filePath = process.env[fileEnvKey];

  if (filePath) {
    if (!existsSync(filePath)) {
      throw new Error(`Secret file not found: ${filePath} (from ${fileEnvKey})`);
    }
    return readFileSync(filePath, "utf-8").trim();
  }

  return process.env[envKey];
}

/**
 * Resolves all _FILE variants for secret environment variables.
 * This populates a record with values read from files where applicable.
 */
function resolveFileSecrets(): Record<string, string | undefined> {
  const resolved: Record<string, string | undefined> = {};

  for (const key of SECRET_ENV_KEYS) {
    const value = readFileSecret(key);
    if (value !== undefined) {
      resolved[key] = value;
    }
  }

  // Also check for legacy DATABASE_URL_FILE -> UNI_STATUS_DB_URL
  if (!resolved.UNI_STATUS_DB_URL) {
    const legacyDbFile = process.env.DATABASE_URL_FILE;
    if (legacyDbFile) {
      if (!existsSync(legacyDbFile)) {
        throw new Error(`Secret file not found: ${legacyDbFile} (from DATABASE_URL_FILE)`);
      }
      resolved.UNI_STATUS_DB_URL = readFileSync(legacyDbFile, "utf-8").trim();
    }
  }

  // Also check for legacy REDIS_URL_FILE -> UNI_STATUS_REDIS_URL
  if (!resolved.UNI_STATUS_REDIS_URL) {
    const legacyRedisFile = process.env.REDIS_URL_FILE;
    if (legacyRedisFile) {
      if (!existsSync(legacyRedisFile)) {
        throw new Error(`Secret file not found: ${legacyRedisFile} (from REDIS_URL_FILE)`);
      }
      resolved.UNI_STATUS_REDIS_URL = readFileSync(legacyRedisFile, "utf-8").trim();
    }
  }

  return resolved;
}

export const DeploymentType = z.enum(["SELF-HOSTED", "HOSTED"]);
export type DeploymentType = z.infer<typeof DeploymentType>;

const envSchema = z.object({
  // Deployment
  DEPLOYMENT_TYPE: DeploymentType.default("SELF-HOSTED"),

  // URLs
  UNI_STATUS_URL: z.string().default("http://localhost:3000"),
  UNI_STATUS_CORS_ENABLED: z.coerce.boolean().default(true),
  UNI_STATUS_CORS_ORIGINS: z.string().optional(),

  // Cookie domain for cross-subdomain auth (e.g., ".unified.sh")
  COOKIE_DOMAIN: z.string().optional(),

  // Landing page URL for federated auth
  LANDING_URL: z.string().optional(),

  // Database
  UNI_STATUS_DB_URL: z.string().optional(),

  // Cache
  UNI_STATUS_REDIS_URL: z.string().default("redis://localhost:6379"),
  UNI_STATUS_QUEUE_PREFIX: z.string().default("uni-status"),

  // Authentication
  UNI_STATUS_AUTH_SECRET: z.string().optional(),
  UNI_STATUS_JWT_SECRET: z.string().optional(),
  UNI_STATUS_ENCRYPTION_KEY: z.string().optional(),

  // OAuth - GitHub
  UNI_STATUS_OAUTH_GITHUB_CLIENT_ID: z.string().optional(),
  UNI_STATUS_OAUTH_GITHUB_CLIENT_SECRET: z.string().optional(),

  // OAuth - Google
  UNI_STATUS_OAUTH_GOOGLE_CLIENT_ID: z.string().optional(),
  UNI_STATUS_OAUTH_GOOGLE_CLIENT_SECRET: z.string().optional(),

  // OAuth - Microsoft
  UNI_STATUS_OAUTH_MICROSOFT_CLIENT_ID: z.string().optional(),
  UNI_STATUS_OAUTH_MICROSOFT_CLIENT_SECRET: z.string().optional(),
  UNI_STATUS_OAUTH_MICROSOFT_TENANT_ID: z.string().default("common"),

  // OAuth - Okta
  UNI_STATUS_OAUTH_OKTA_CLIENT_ID: z.string().optional(),
  UNI_STATUS_OAUTH_OKTA_CLIENT_SECRET: z.string().optional(),
  UNI_STATUS_OAUTH_OKTA_ISSUER: z.string().optional(),

  // OAuth - Auth0
  UNI_STATUS_OAUTH_AUTH0_CLIENT_ID: z.string().optional(),
  UNI_STATUS_OAUTH_AUTH0_CLIENT_SECRET: z.string().optional(),
  UNI_STATUS_OAUTH_AUTH0_DOMAIN: z.string().optional(),

  // OAuth - Keycloak
  UNI_STATUS_OAUTH_KEYCLOAK_CLIENT_ID: z.string().optional(),
  UNI_STATUS_OAUTH_KEYCLOAK_CLIENT_SECRET: z.string().optional(),
  UNI_STATUS_OAUTH_KEYCLOAK_ISSUER: z.string().optional(),

  // OAuth - Generic OIDC
  UNI_STATUS_OAUTH_OIDC_CLIENT_ID: z.string().optional(),
  UNI_STATUS_OAUTH_OIDC_CLIENT_SECRET: z.string().optional(),
  UNI_STATUS_OAUTH_OIDC_ISSUER: z.string().optional(),
  UNI_STATUS_OAUTH_OIDC_PROVIDER_ID: z.string().default("oidc"),
  UNI_STATUS_OAUTH_OIDC_PROVIDER_NAME: z.string().default("SSO"),
  UNI_STATUS_OAUTH_OIDC_AUTHORIZATION_URL: z.string().optional(),
  UNI_STATUS_OAUTH_OIDC_TOKEN_URL: z.string().optional(),
  UNI_STATUS_OAUTH_OIDC_USERINFO_URL: z.string().optional(),
  UNI_STATUS_OAUTH_OIDC_SCOPES: z.string().default("openid email profile"),
  UNI_STATUS_OAUTH_OIDC_PKCE: z.coerce.boolean().default(true),

  // SSO
  UNI_STATUS_SSO_ENCRYPTION_KEY: z.string().optional(),
  UNI_STATUS_ENABLE_SSO: z.coerce.boolean().default(false),

  // Email
  UNI_STATUS_SMTP_HOST: z.string().default("localhost"),
  UNI_STATUS_SMTP_PORT: z.coerce.number().default(1025),
  UNI_STATUS_SMTP_SECURE: z.coerce.boolean().default(false),
  UNI_STATUS_SMTP_USER: z.string().optional(),
  UNI_STATUS_SMTP_PASSWORD: z.string().optional(),
  UNI_STATUS_SMTP_FROM: z.string().default("noreply@uni-status.local"),
  UNI_STATUS_RESEND_API_KEY: z.string().optional(),

  // Notifications
  UNI_STATUS_SLACK_WEBHOOK_URL: z.string().optional(),
  UNI_STATUS_DISCORD_WEBHOOK_URL: z.string().optional(),
  UNI_STATUS_TWILIO_ACCOUNT_SID: z.string().optional(),
  UNI_STATUS_TWILIO_AUTH_TOKEN: z.string().optional(),
  UNI_STATUS_TWILIO_FROM_NUMBER: z.string().optional(),

  // AWS / Storage (legacy - kept for backwards compatibility)
  UNI_STATUS_AWS_ACCESS_KEY_ID: z.string().optional(),
  UNI_STATUS_AWS_SECRET_ACCESS_KEY: z.string().optional(),
  UNI_STATUS_AWS_REGION: z.string().default("us-east-1"),
  UNI_STATUS_AWS_S3_BUCKET: z.string().optional(),

  // S3-Compatible Storage (works with AWS S3, MinIO, Cloudflare R2, Backblaze B2, etc.)
  UNI_STATUS_S3_ENDPOINT: z.string().optional(),
  UNI_STATUS_S3_ACCESS_KEY: z.string().optional(),
  UNI_STATUS_S3_SECRET_KEY: z.string().optional(),
  UNI_STATUS_S3_BUCKET: z.string().optional(),
  UNI_STATUS_S3_REGION: z.string().default("us-east-1"),
  UNI_STATUS_S3_PUBLIC_URL: z.string().optional(),
  UNI_STATUS_S3_FORCE_PATH_STYLE: z.coerce.boolean().default(false),
  UNI_STATUS_S3_SUB_FOLDER: z.string().optional(),

  // Storage directories
  UNI_STATUS_STORAGE_REPORTS_DIR: z.string().default("/app/reports"),
  UNI_STATUS_STORAGE_UPLOADS_DIR: z.string().default("./uploads"),

  // Monitoring
  UNI_STATUS_CHECK_TIMEOUT_MS: z.coerce.number().default(30000),
  UNI_STATUS_MONITOR_DEFAULT_INTERVAL: z.coerce.number().default(60),
  UNI_STATUS_MONITOR_DEFAULT_REGION: z.string().default("uk"),

  // Features
  UNI_STATUS_ENABLE_AUDIT_LOGS: z.coerce.boolean().default(true),
  UNI_STATUS_ENABLE_MULTI_REGION: z.coerce.boolean().default(false),

  // Retention
  UNI_STATUS_RETENTION_CHECK_RESULTS_DAYS: z.coerce.number().default(45),
  UNI_STATUS_RETENTION_AUDIT_LOGS_DAYS: z.coerce.number().default(365),

  // Internal
  UNI_STATUS_API_PORT: z.coerce.number().default(3001),

  // Rate Limiting
  UNI_STATUS_DISABLE_RATE_LIMITS: z.coerce.boolean().default(false),

  // Licensing - Self-Hosted License Key (stored in env or activated via UI)
  UNI_STATUS_LICENCE: z.string().optional(),

  // Keygen.sh - License Management (ALL modes)
  UNI_STATUS_KEYGEN_ACCOUNT_ID: z.string().optional(),
  UNI_STATUS_KEYGEN_API_URL: z.string().default("https://api.keygen.sh"),
  UNI_STATUS_KEYGEN_API_TOKEN: z.string().optional(), // Admin token for hosted mode
  UNI_STATUS_KEYGEN_WEBHOOK_SECRET: z.string().optional(), // For verifying Keygen webhooks
  UNI_STATUS_KEYGEN_PUBLIC_KEY: z.string().optional(), // Ed25519 public key for offline verification
  UNI_STATUS_KEYGEN_PRODUCT_ID: z.string().optional(), // Product ID in Keygen.sh
  // Note: Policy IDs are hardcoded in @uni-status/licensing package
});

type EnvConfig = z.infer<typeof envSchema>;

function mapLegacyEnv(): Partial<Record<keyof EnvConfig, string | undefined>> {
  const legacyMappings: Array<[keyof EnvConfig, string]> = [
    ["UNI_STATUS_URL", "NEXT_PUBLIC_APP_URL"],
    ["UNI_STATUS_URL", "BETTER_AUTH_URL"],
    ["UNI_STATUS_DB_URL", "DATABASE_URL"],
    ["UNI_STATUS_REDIS_URL", "REDIS_URL"],
    ["UNI_STATUS_AUTH_SECRET", "BETTER_AUTH_SECRET"],
    ["UNI_STATUS_JWT_SECRET", "JWT_SECRET"],
    ["UNI_STATUS_ENCRYPTION_KEY", "ENCRYPTION_KEY"],
    ["UNI_STATUS_OAUTH_GITHUB_CLIENT_ID", "GITHUB_CLIENT_ID"],
    ["UNI_STATUS_OAUTH_GITHUB_CLIENT_SECRET", "GITHUB_CLIENT_SECRET"],
    ["UNI_STATUS_OAUTH_GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_ID"],
    ["UNI_STATUS_OAUTH_GOOGLE_CLIENT_SECRET", "GOOGLE_CLIENT_SECRET"],
    ["UNI_STATUS_OAUTH_MICROSOFT_CLIENT_ID", "MICROSOFT_CLIENT_ID"],
    ["UNI_STATUS_OAUTH_MICROSOFT_CLIENT_SECRET", "MICROSOFT_CLIENT_SECRET"],
    ["UNI_STATUS_OAUTH_MICROSOFT_TENANT_ID", "MICROSOFT_TENANT_ID"],
    ["UNI_STATUS_OAUTH_OKTA_CLIENT_ID", "OKTA_CLIENT_ID"],
    ["UNI_STATUS_OAUTH_OKTA_CLIENT_SECRET", "OKTA_CLIENT_SECRET"],
    ["UNI_STATUS_OAUTH_OKTA_ISSUER", "OKTA_ISSUER"],
    ["UNI_STATUS_OAUTH_AUTH0_CLIENT_ID", "AUTH0_CLIENT_ID"],
    ["UNI_STATUS_OAUTH_AUTH0_CLIENT_SECRET", "AUTH0_CLIENT_SECRET"],
    ["UNI_STATUS_OAUTH_AUTH0_DOMAIN", "AUTH0_DOMAIN"],
    ["UNI_STATUS_OAUTH_KEYCLOAK_CLIENT_ID", "KEYCLOAK_CLIENT_ID"],
    ["UNI_STATUS_OAUTH_KEYCLOAK_CLIENT_SECRET", "KEYCLOAK_CLIENT_SECRET"],
    ["UNI_STATUS_OAUTH_KEYCLOAK_ISSUER", "KEYCLOAK_ISSUER"],
    ["UNI_STATUS_OAUTH_OIDC_CLIENT_ID", "OIDC_CLIENT_ID"],
    ["UNI_STATUS_OAUTH_OIDC_CLIENT_SECRET", "OIDC_CLIENT_SECRET"],
    ["UNI_STATUS_OAUTH_OIDC_ISSUER", "OIDC_ISSUER"],
    ["UNI_STATUS_OAUTH_OIDC_PROVIDER_ID", "OIDC_PROVIDER_ID"],
    ["UNI_STATUS_OAUTH_OIDC_PROVIDER_NAME", "OIDC_PROVIDER_NAME"],
    ["UNI_STATUS_OAUTH_OIDC_AUTHORIZATION_URL", "OIDC_AUTHORIZATION_URL"],
    ["UNI_STATUS_OAUTH_OIDC_TOKEN_URL", "OIDC_TOKEN_URL"],
    ["UNI_STATUS_OAUTH_OIDC_USERINFO_URL", "OIDC_USERINFO_URL"],
    ["UNI_STATUS_OAUTH_OIDC_SCOPES", "OIDC_SCOPES"],
    ["UNI_STATUS_OAUTH_OIDC_PKCE", "OIDC_PKCE"],
    ["UNI_STATUS_SSO_ENCRYPTION_KEY", "SSO_ENCRYPTION_KEY"],
    ["UNI_STATUS_ENABLE_SSO", "ENABLE_SSO"],
    ["UNI_STATUS_SMTP_HOST", "SMTP_HOST"],
    ["UNI_STATUS_SMTP_PORT", "SMTP_PORT"],
    ["UNI_STATUS_SMTP_SECURE", "SMTP_SECURE"],
    ["UNI_STATUS_SMTP_USER", "SMTP_USER"],
    ["UNI_STATUS_SMTP_PASSWORD", "SMTP_PASSWORD"],
    ["UNI_STATUS_SMTP_FROM", "SMTP_FROM"],
    ["UNI_STATUS_RESEND_API_KEY", "RESEND_API_KEY"],
    ["UNI_STATUS_SLACK_WEBHOOK_URL", "SLACK_WEBHOOK_URL"],
    ["UNI_STATUS_DISCORD_WEBHOOK_URL", "DISCORD_WEBHOOK_URL"],
    ["UNI_STATUS_TWILIO_ACCOUNT_SID", "TWILIO_ACCOUNT_SID"],
    ["UNI_STATUS_TWILIO_AUTH_TOKEN", "TWILIO_AUTH_TOKEN"],
    ["UNI_STATUS_TWILIO_FROM_NUMBER", "TWILIO_FROM_NUMBER"],
    ["UNI_STATUS_AWS_ACCESS_KEY_ID", "AWS_ACCESS_KEY_ID"],
    ["UNI_STATUS_AWS_SECRET_ACCESS_KEY", "AWS_SECRET_ACCESS_KEY"],
    ["UNI_STATUS_AWS_REGION", "AWS_REGION"],
    ["UNI_STATUS_AWS_S3_BUCKET", "AWS_S3_BUCKET"],
    ["UNI_STATUS_S3_ENDPOINT", "S3_ENDPOINT"],
    ["UNI_STATUS_S3_ACCESS_KEY", "S3_ACCESS_KEY"],
    ["UNI_STATUS_S3_SECRET_KEY", "S3_SECRET_KEY"],
    ["UNI_STATUS_S3_BUCKET", "S3_BUCKET"],
    ["UNI_STATUS_S3_REGION", "S3_REGION"],
    ["UNI_STATUS_S3_PUBLIC_URL", "S3_PUBLIC_URL"],
    ["UNI_STATUS_S3_FORCE_PATH_STYLE", "S3_FORCE_PATH_STYLE"],
    ["UNI_STATUS_S3_SUB_FOLDER", "S3_SUB_FOLDER"],
    ["UNI_STATUS_STORAGE_REPORTS_DIR", "REPORTS_DIR"],
    ["UNI_STATUS_STORAGE_UPLOADS_DIR", "UPLOADS_DIR"],
    ["UNI_STATUS_CHECK_TIMEOUT_MS", "CHECK_TIMEOUT_MS"],
    ["UNI_STATUS_MONITOR_DEFAULT_INTERVAL", "DEFAULT_CHECK_INTERVAL"],
    ["UNI_STATUS_MONITOR_DEFAULT_REGION", "MONITOR_DEFAULT_REGION"],
    ["UNI_STATUS_ENABLE_AUDIT_LOGS", "ENABLE_AUDIT_LOGS"],
    ["UNI_STATUS_ENABLE_MULTI_REGION", "ENABLE_MULTI_REGION"],
    ["UNI_STATUS_RETENTION_CHECK_RESULTS_DAYS", "CHECK_RESULTS_RETENTION_DAYS"],
    ["UNI_STATUS_RETENTION_AUDIT_LOGS_DAYS", "AUDIT_LOGS_RETENTION_DAYS"],
    ["UNI_STATUS_API_PORT", "API_PORT"],
    ["UNI_STATUS_DISABLE_RATE_LIMITS", "DISABLE_RATE_LIMITS"],
  ];

  const result: Partial<Record<keyof EnvConfig, string | undefined>> = {};

  for (const [newKey, legacyKey] of legacyMappings) {
    const newValue = process.env[newKey];
    const legacyValue = process.env[legacyKey];

    if (newValue) {
      result[newKey] = newValue;
    } else if (legacyValue) {
      result[newKey] = legacyValue;
    }
  }

  if (process.env.DEPLOYMENT_TYPE) {
    result.DEPLOYMENT_TYPE = process.env.DEPLOYMENT_TYPE as DeploymentType;
  }

  return result;
}

function parseEnv(): EnvConfig {
  const fileSecrets = resolveFileSecrets();
  const mapped = mapLegacyEnv();
  // File secrets take precedence over direct env vars, legacy mappings fill in gaps
  const merged = { ...process.env, ...mapped, ...fileSecrets };

  const filtered = Object.fromEntries(
    Object.entries(merged).filter(([_, v]) => v !== undefined)
  );

  return envSchema.parse(filtered);
}

let _env: EnvConfig | null = null;

export function getEnv(): EnvConfig {
  if (!_env) {
    _env = parseEnv();
  }
  return _env;
}

export function resetEnvCache(): void {
  _env = null;
}

export function getAppUrl(): string {
  return getEnv().UNI_STATUS_URL.replace(/\/$/, "");
}

export function getApiUrl(): string {
  const appUrl = getAppUrl();
  return `${appUrl}/api`;
}

export function getDatabaseUrl(): string {
  return getEnv().UNI_STATUS_DB_URL || "";
}

export function getRedisUrl(): string {
  return getEnv().UNI_STATUS_REDIS_URL;
}

export function getQueuePrefix(): string {
  return getEnv().UNI_STATUS_QUEUE_PREFIX;
}

export function getAuthSecret(): string {
  return getEnv().UNI_STATUS_AUTH_SECRET || "";
}

export function getJwtSecret(): string {
  return getEnv().UNI_STATUS_JWT_SECRET || "";
}

export function getEncryptionKey(): string {
  return getEnv().UNI_STATUS_ENCRYPTION_KEY || "";
}

export function getDeploymentType(): DeploymentType {
  return getEnv().DEPLOYMENT_TYPE;
}

export function getCorsConfig(): { enabled: boolean; origins: string[] } {
  const env = getEnv();
  const enabled = env.UNI_STATUS_CORS_ENABLED;

  const origins: string[] = [];

  origins.push(getAppUrl());
  origins.push("http://localhost:3000");

  if (env.UNI_STATUS_CORS_ORIGINS) {
    const extra = env.UNI_STATUS_CORS_ORIGINS.split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    origins.push(...extra);
  }

  return { enabled, origins: [...new Set(origins)] };
}

export function getSmtpConfig() {
  const env = getEnv();
  return {
    host: env.UNI_STATUS_SMTP_HOST,
    port: env.UNI_STATUS_SMTP_PORT,
    secure: env.UNI_STATUS_SMTP_SECURE,
    user: env.UNI_STATUS_SMTP_USER,
    password: env.UNI_STATUS_SMTP_PASSWORD,
    from: env.UNI_STATUS_SMTP_FROM,
  };
}

export function getResendApiKey(): string | undefined {
  return getEnv().UNI_STATUS_RESEND_API_KEY;
}

export function getMonitorConfig() {
  const env = getEnv();
  return {
    checkTimeoutMs: env.UNI_STATUS_CHECK_TIMEOUT_MS,
    defaultInterval: env.UNI_STATUS_MONITOR_DEFAULT_INTERVAL,
    defaultRegion: env.UNI_STATUS_MONITOR_DEFAULT_REGION,
  };
}

export function getRetentionConfig() {
  const env = getEnv();
  return {
    checkResultsDays: env.UNI_STATUS_RETENTION_CHECK_RESULTS_DAYS,
    auditLogsDays: env.UNI_STATUS_RETENTION_AUDIT_LOGS_DAYS,
  };
}

export function getFeatureFlags() {
  const env = getEnv();
  return {
    sso: env.UNI_STATUS_ENABLE_SSO,
    auditLogs: env.UNI_STATUS_ENABLE_AUDIT_LOGS,
    multiRegion: env.UNI_STATUS_ENABLE_MULTI_REGION,
  };
}

export function getAwsConfig() {
  const env = getEnv();
  return {
    accessKeyId: env.UNI_STATUS_AWS_ACCESS_KEY_ID,
    secretAccessKey: env.UNI_STATUS_AWS_SECRET_ACCESS_KEY,
    region: env.UNI_STATUS_AWS_REGION,
    s3Bucket: env.UNI_STATUS_AWS_S3_BUCKET,
  };
}

export function getStorageConfig() {
  const env = getEnv();
  return {
    reportsDir: env.UNI_STATUS_STORAGE_REPORTS_DIR,
    uploadsDir: env.UNI_STATUS_STORAGE_UPLOADS_DIR,
  };
}

export function getS3Config() {
  const env = getEnv();
  return {
    endpoint: env.UNI_STATUS_S3_ENDPOINT,
    accessKey: env.UNI_STATUS_S3_ACCESS_KEY,
    secretKey: env.UNI_STATUS_S3_SECRET_KEY,
    bucket: env.UNI_STATUS_S3_BUCKET,
    region: env.UNI_STATUS_S3_REGION,
    publicUrl: env.UNI_STATUS_S3_PUBLIC_URL,
    forcePathStyle: env.UNI_STATUS_S3_FORCE_PATH_STYLE,
    subFolder: env.UNI_STATUS_S3_SUB_FOLDER,
  };
}

export function getApiPort(): number {
  return getEnv().UNI_STATUS_API_PORT;
}

export function isRateLimitDisabled(): boolean {
  return getEnv().UNI_STATUS_DISABLE_RATE_LIMITS;
}

export function isSelfHosted(): boolean {
  return getEnv().DEPLOYMENT_TYPE === "SELF-HOSTED";
}

export function getLicence(): string | undefined {
  return getEnv().UNI_STATUS_LICENCE;
}

export function getOAuthConfig(provider: string) {
  const env = getEnv();

  switch (provider) {
    case "github":
      return {
        clientId: env.UNI_STATUS_OAUTH_GITHUB_CLIENT_ID,
        clientSecret: env.UNI_STATUS_OAUTH_GITHUB_CLIENT_SECRET,
      };
    case "google":
      return {
        clientId: env.UNI_STATUS_OAUTH_GOOGLE_CLIENT_ID,
        clientSecret: env.UNI_STATUS_OAUTH_GOOGLE_CLIENT_SECRET,
      };
    case "microsoft":
      return {
        clientId: env.UNI_STATUS_OAUTH_MICROSOFT_CLIENT_ID,
        clientSecret: env.UNI_STATUS_OAUTH_MICROSOFT_CLIENT_SECRET,
        tenantId: env.UNI_STATUS_OAUTH_MICROSOFT_TENANT_ID,
      };
    case "okta":
      return {
        clientId: env.UNI_STATUS_OAUTH_OKTA_CLIENT_ID,
        clientSecret: env.UNI_STATUS_OAUTH_OKTA_CLIENT_SECRET,
        issuer: env.UNI_STATUS_OAUTH_OKTA_ISSUER,
      };
    case "auth0":
      return {
        clientId: env.UNI_STATUS_OAUTH_AUTH0_CLIENT_ID,
        clientSecret: env.UNI_STATUS_OAUTH_AUTH0_CLIENT_SECRET,
        domain: env.UNI_STATUS_OAUTH_AUTH0_DOMAIN,
      };
    case "keycloak":
      return {
        clientId: env.UNI_STATUS_OAUTH_KEYCLOAK_CLIENT_ID,
        clientSecret: env.UNI_STATUS_OAUTH_KEYCLOAK_CLIENT_SECRET,
        issuer: env.UNI_STATUS_OAUTH_KEYCLOAK_ISSUER,
      };
    case "oidc":
      return {
        clientId: env.UNI_STATUS_OAUTH_OIDC_CLIENT_ID,
        clientSecret: env.UNI_STATUS_OAUTH_OIDC_CLIENT_SECRET,
        issuer: env.UNI_STATUS_OAUTH_OIDC_ISSUER,
        providerId: env.UNI_STATUS_OAUTH_OIDC_PROVIDER_ID,
        providerName: env.UNI_STATUS_OAUTH_OIDC_PROVIDER_NAME,
        authorizationUrl: env.UNI_STATUS_OAUTH_OIDC_AUTHORIZATION_URL,
        tokenUrl: env.UNI_STATUS_OAUTH_OIDC_TOKEN_URL,
        userinfoUrl: env.UNI_STATUS_OAUTH_OIDC_USERINFO_URL,
        scopes: env.UNI_STATUS_OAUTH_OIDC_SCOPES,
        pkce: env.UNI_STATUS_OAUTH_OIDC_PKCE,
      };
    default:
      return null;
  }
}

export function getSsoEncryptionKey(): string | undefined {
  return getEnv().UNI_STATUS_SSO_ENCRYPTION_KEY;
}

export const config = {
  deployment: { type: getDeploymentType, isSelfHosted },
  urls: { app: getAppUrl, api: getApiUrl },
  database: { url: getDatabaseUrl },
  cache: { url: getRedisUrl },
  auth: { secret: getAuthSecret, encryptionKey: getEncryptionKey },
  cors: getCorsConfig,
  smtp: getSmtpConfig,
  resend: { apiKey: getResendApiKey },
  monitor: getMonitorConfig,
  retention: getRetentionConfig,
  features: getFeatureFlags,
  aws: getAwsConfig,
  s3: getS3Config,
  storage: getStorageConfig,
  api: { port: getApiPort },
  oauth: getOAuthConfig,
  sso: { encryptionKey: getSsoEncryptionKey },
  rateLimit: { disabled: isRateLimitDisabled },
  licence: { key: getLicence },
};
