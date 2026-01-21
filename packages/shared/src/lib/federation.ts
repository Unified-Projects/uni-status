/**
 * Federation utilities for Uni-Suite cross-app authentication.
 * Verifies tokens issued by Uni-Console for federated authentication.
 */

import crypto from "node:crypto";

/**
 * Payload structure for federated session tokens.
 */
export interface FederatedSessionPayload {
  /** User ID from the source application (Uni-Console) */
  userId: string;
  /** User's email address */
  userEmail: string;
  /** User's display name */
  userName: string;
  /** User's role in the source application */
  userRole: string;
  /** Organization ID if user is in org context */
  organizationId?: string;
  /** User's role within the organization */
  organizationRole?: string;
  /** Timestamp when token was issued (ms since epoch) */
  issuedAt: number;
  /** Timestamp when token expires (ms since epoch) */
  expiresAt: number;
  /** Unique nonce to prevent replay attacks */
  nonce: string;
}

/** Header name used to pass the federated session token */
export const FEDERATED_AUTH_HEADER = "X-Console-Session-Token";

/**
 * Verify and decode a federation token.
 * Returns null if token is invalid, expired, or signature doesn't match.
 *
 * @param token - The token to verify (format: base64payload.signature)
 * @param secret - The shared federation secret (UNI_SUITE_FEDERATION_SECRET)
 * @returns Decoded payload if valid, null otherwise
 */
export function verifyFederatedToken(
  token: string,
  secret: string
): FederatedSessionPayload | null {
  if (!token || typeof token !== "string") {
    return null;
  }

  const parts = token.split(".");
  if (parts.length !== 2) {
    return null;
  }

  const [payloadBase64, signature] = parts;

  if (!payloadBase64 || !signature) {
    return null;
  }

  // Compute expected signature
  const expectedSignature = crypto
    .createHmac("sha256", secret)
    .update(payloadBase64)
    .digest("hex");

  // Timing-safe comparison to prevent timing attacks
  if (signature.length !== expectedSignature.length) {
    return null;
  }

  const signatureBuffer = Buffer.from(signature, "hex");
  const expectedBuffer = Buffer.from(expectedSignature, "hex");

  if (signatureBuffer.length !== expectedBuffer.length) {
    return null;
  }

  if (!crypto.timingSafeEqual(signatureBuffer, expectedBuffer)) {
    return null;
  }

  // Decode and validate payload
  try {
    const payloadJson = Buffer.from(payloadBase64, "base64url").toString(
      "utf-8"
    );
    const payload = JSON.parse(payloadJson) as FederatedSessionPayload;

    // Validate required fields
    if (
      !payload.userId ||
      !payload.userEmail ||
      !payload.issuedAt ||
      !payload.expiresAt ||
      !payload.nonce
    ) {
      return null;
    }

    // Check expiration
    if (payload.expiresAt < Date.now()) {
      return null;
    }

    // Check that token wasn't issued in the future (clock skew tolerance: 30 seconds)
    if (payload.issuedAt > Date.now() + 30000) {
      return null;
    }

    return payload;
  } catch {
    return null;
  }
}
