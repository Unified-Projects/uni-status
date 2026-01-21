import { createVerify, createSign, generateKeyPairSync } from "crypto";

/**
 * License payload structure for self-hosted deployments.
 * This is the data that gets signed and embedded in the license key.
 */
export interface LicensePayload {
  /** License ID (from Keygen.sh) */
  lid: string;
  /** Organization ID this license is bound to (optional, can be bound on activation) */
  oid?: string;
  /** Plan tier */
  plan: "pro" | "enterprise";
  /** Feature limits and toggles */
  features: {
    monitors: number; // -1 = unlimited
    statusPages: number;
    teamMembers: number;
    regions: number;
    auditLogs: boolean;
    sso: boolean;
    customRoles: boolean;
    slo: boolean;
    reports: boolean;
    multiRegion: boolean;
  };
  /** Issued at (Unix timestamp in seconds) */
  iat: number;
  /** Expires at (Unix timestamp in seconds), null for perpetual */
  exp: number | null;
  /** Licensee email */
  email: string;
  /** Licensee name (person or organization) */
  name: string;
  /** License version for future compatibility */
  version?: number;
}

/**
 * Result of license verification
 */
export interface LicenseVerificationResult {
  valid: boolean;
  payload?: LicensePayload;
  error?: string;
  errorCode?: LicenseErrorCode;
}

/**
 * Error codes for license verification failures
 */
export type LicenseErrorCode =
  | "INVALID_FORMAT"
  | "INVALID_SIGNATURE"
  | "EXPIRED"
  | "NOT_YET_VALID"
  | "PARSE_ERROR"
  | "MISSING_PUBLIC_KEY";

/**
 * Default public key for license verification.
 * This key is embedded in the application and used to verify license signatures.
 * The corresponding private key is kept secure on the license server.
 */
const DEFAULT_PUBLIC_KEY = `-----BEGIN PUBLIC KEY-----
MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAu5xyP8WcOJzaRt1kVLmb
VfZM8iR7mDXQfZ3Q9F6Q5WJ8R7LVgK6YhN8x9V6dMpR8mJV7wYV3fLsK9gK7mCqY
9JzX3bH7R8xKq5zV4m8K2L3xJ7wN8qF6R9vZ3wX5yK8mP2JdL7qH6fK3mN8R9wT4
xH7yJ3qL8wK5vN6mF9R2xT4qD8yH3mL6wK5qN7vF8R3xT5qD9yH4mL7wK6qN8vF9
R4xT6qD0yH5mL8wK7qN9vF0R5xT7qD1yH6mL9wK8qN0vF1R6xT8qD2yH7mL0wK9q
N1vF2R7xT9qD3yH8mL1wK0qN2vF3R8xT0qD4yH9mL2wK1qN3vF4R9xT1qD5yH0mL
3wIDAQAB
-----END PUBLIC KEY-----`;

/**
 * Get the public key for license verification.
 * Uses environment variable if set, otherwise falls back to default.
 */
function getPublicKey(): string {
  return process.env.UNI_STATUS_LICENSE_PUBLIC_KEY || DEFAULT_PUBLIC_KEY;
}

/**
 * Verify a license key offline using RSA-SHA256 signature verification.
 *
 * License format: <base64url_payload>.<base64url_signature>
 *
 * @param licenseKey The license key to verify
 * @returns Verification result with payload if valid
 */
export function verifyLicenseOffline(
  licenseKey: string
): LicenseVerificationResult {
  try {
    // Check for empty or invalid input
    if (!licenseKey || typeof licenseKey !== "string") {
      return {
        valid: false,
        error: "License key is required",
        errorCode: "INVALID_FORMAT",
      };
    }

    // Split into payload and signature
    const parts = licenseKey.trim().split(".");
    if (parts.length !== 2) {
      return {
        valid: false,
        error: "Invalid license format: expected payload.signature",
        errorCode: "INVALID_FORMAT",
      };
    }

    const [payloadB64, signatureB64] = parts;
    if (!payloadB64 || !signatureB64) {
      return {
        valid: false,
        error: "Invalid license format: expected payload.signature",
        errorCode: "INVALID_FORMAT",
      };
    }

    // Decode payload
    let payloadJson: string;
    try {
      payloadJson = Buffer.from(payloadB64, "base64url").toString("utf8");
    } catch {
      return {
        valid: false,
        error: "Failed to decode license payload",
        errorCode: "PARSE_ERROR",
      };
    }

    // Parse payload JSON
    let payload: LicensePayload;
    try {
      payload = JSON.parse(payloadJson);
    } catch {
      return {
        valid: false,
        error: "Failed to parse license payload JSON",
        errorCode: "PARSE_ERROR",
      };
    }

    // Decode signature
    let signature: Buffer;
    try {
      signature = Buffer.from(signatureB64, "base64url");
    } catch {
      return {
        valid: false,
        error: "Failed to decode license signature",
        errorCode: "PARSE_ERROR",
      };
    }

    // Get public key
    const publicKey = getPublicKey();
    if (!publicKey) {
      return {
        valid: false,
        error: "License public key not configured",
        errorCode: "MISSING_PUBLIC_KEY",
      };
    }

    // Verify signature
    const verifier = createVerify("RSA-SHA256");
    verifier.update(payloadJson);

    let isValidSignature: boolean;
    try {
      isValidSignature = verifier.verify(publicKey, signature);
    } catch (err) {
      return {
        valid: false,
        error: "Signature verification failed",
        errorCode: "INVALID_SIGNATURE",
      };
    }

    if (!isValidSignature) {
      return {
        valid: false,
        error: "Invalid license signature",
        errorCode: "INVALID_SIGNATURE",
      };
    }

    // Check expiry
    const now = Math.floor(Date.now() / 1000);

    if (payload.exp !== null && payload.exp < now) {
      return {
        valid: false,
        error: "License has expired",
        errorCode: "EXPIRED",
        payload, // Include payload so caller can see expiry details
      };
    }

    // Check not-before (issued at)
    if (payload.iat > now) {
      return {
        valid: false,
        error: "License is not yet valid",
        errorCode: "NOT_YET_VALID",
        payload,
      };
    }

    // License is valid
    return {
      valid: true,
      payload,
    };
  } catch (error) {
    return {
      valid: false,
      error:
        error instanceof Error ? error.message : "Unknown verification error",
      errorCode: "PARSE_ERROR",
    };
  }
}

/**
 * Parse a license key without verifying the signature.
 * Useful for displaying license information before activation.
 *
 * @param licenseKey The license key to parse
 * @returns The payload if successfully parsed, null otherwise
 */
export function parseLicenseKey(licenseKey: string): LicensePayload | null {
  try {
    if (!licenseKey || typeof licenseKey !== "string") {
      return null;
    }

    const parts = licenseKey.trim().split(".");
    if (parts.length !== 2) {
      return null;
    }

    const payloadB64 = parts[0];
    if (!payloadB64) {
      return null;
    }

    const payloadJson = Buffer.from(payloadB64, "base64url").toString("utf8");
    return JSON.parse(payloadJson);
  } catch {
    return null;
  }
}

/**
 * Get the number of days remaining until license expiry.
 *
 * @param payload The license payload
 * @returns Number of days remaining, Infinity for perpetual licenses, 0 if expired
 */
export function getLicenseRemainingDays(payload: LicensePayload): number {
  if (payload.exp === null) {
    return Infinity; // Perpetual license
  }

  const now = Math.floor(Date.now() / 1000);
  const secondsRemaining = payload.exp - now;

  if (secondsRemaining <= 0) {
    return 0;
  }

  return Math.floor(secondsRemaining / 86400); // 86400 seconds in a day
}

/**
 * Check if a license is within the warning period (30 days before expiry).
 *
 * @param payload The license payload
 * @returns true if within warning period
 */
export function isLicenseExpiringSoon(payload: LicensePayload): boolean {
  const daysRemaining = getLicenseRemainingDays(payload);
  return daysRemaining !== Infinity && daysRemaining <= 30;
}

/**
 * Get the expiry date as a Date object.
 *
 * @param payload The license payload
 * @returns Date object or null for perpetual licenses
 */
export function getLicenseExpiryDate(payload: LicensePayload): Date | null {
  if (payload.exp === null) {
    return null;
  }
  return new Date(payload.exp * 1000);
}

/**
 * Get the issue date as a Date object.
 *
 * @param payload The license payload
 * @returns Date object
 */
export function getLicenseIssueDate(payload: LicensePayload): Date {
  return new Date(payload.iat * 1000);
}

/**
 * Default feature limits by plan tier.
 * Used as fallback when license doesn't specify features.
 */
export const DEFAULT_PLAN_FEATURES: Record<
  LicensePayload["plan"],
  LicensePayload["features"]
> = {
  pro: {
    monitors: 50,
    statusPages: 5,
    teamMembers: 10,
    regions: 3,
    auditLogs: false,
    sso: false,
    customRoles: false,
    slo: false,
    reports: false,
    multiRegion: true,
  },
  enterprise: {
    monitors: -1, // unlimited
    statusPages: -1,
    teamMembers: -1,
    regions: -1,
    auditLogs: true,
    sso: true,
    customRoles: true,
    slo: true,
    reports: true,
    multiRegion: true,
  },
};

/**
 * Get effective features for a license, merging payload features with defaults.
 *
 * @param payload The license payload
 * @returns Complete feature set
 */
export function getLicenseFeatures(
  payload: LicensePayload
): LicensePayload["features"] {
  const defaults = DEFAULT_PLAN_FEATURES[payload.plan];
  return {
    ...defaults,
    ...payload.features,
  };
}

// ==========================================
// License Generation (for testing/admin use)
// ==========================================

/**
 * Generate a new RSA key pair for license signing.
 * Only used for initial setup or key rotation.
 */
export function generateLicenseKeyPair(): {
  publicKey: string;
  privateKey: string;
} {
  const { publicKey, privateKey } = generateKeyPairSync("rsa", {
    modulusLength: 2048,
    publicKeyEncoding: {
      type: "spki",
      format: "pem",
    },
    privateKeyEncoding: {
      type: "pkcs8",
      format: "pem",
    },
  });

  return { publicKey, privateKey };
}

/**
 * Sign a license payload to create a license key.
 * This should only be called on the license server, never in the client app.
 *
 * @param payload The license payload to sign
 * @param privateKey The private key for signing
 * @returns The signed license key
 */
export function signLicensePayload(
  payload: LicensePayload,
  privateKey: string
): string {
  const payloadJson = JSON.stringify(payload);
  const payloadB64 = Buffer.from(payloadJson, "utf8").toString("base64url");

  const signer = createSign("RSA-SHA256");
  signer.update(payloadJson);
  const signature = signer.sign(privateKey);
  const signatureB64 = signature.toString("base64url");

  return `${payloadB64}.${signatureB64}`;
}

/**
 * Create a test license for development/testing purposes.
 * Uses a generated key pair - DO NOT use in production.
 */
export function createTestLicense(
  options: Partial<LicensePayload> & { privateKey: string }
): string {
  const now = Math.floor(Date.now() / 1000);
  const oneYear = 365 * 24 * 60 * 60;

  const payload: LicensePayload = {
    lid: options.lid || `test_${Date.now()}`,
    oid: options.oid,
    plan: options.plan || "enterprise",
    features: options.features || DEFAULT_PLAN_FEATURES.enterprise,
    iat: options.iat || now,
    exp: options.exp !== undefined ? options.exp : now + oneYear,
    email: options.email || "test@example.com",
    name: options.name || "Test License",
    version: options.version || 1,
  };

  return signLicensePayload(payload, options.privateKey);
}
