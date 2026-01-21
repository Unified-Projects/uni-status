import { createHmac, timingSafeEqual } from "crypto";

/**
 * Generate HMAC-SHA256 signature for webhook payload.
 * The signature is computed over: `${timestamp}.${payload}`
 * This matches the pattern used by Stripe, GitHub, and other webhook providers.
 */
export function signWebhookPayload(
  payload: string,
  secretKey: string,
  timestamp: number
): string {
  const signaturePayload = `${timestamp}.${payload}`;
  return createHmac("sha256", secretKey).update(signaturePayload).digest("hex");
}

/**
 * Verify webhook signature using timing-safe comparison.
 * Returns true if the signature is valid and the timestamp is within tolerance.
 *
 * @param payload - The raw JSON body string
 * @param signature - The signature from X-Uni-Status-Signature header (without sha256= prefix)
 * @param secretKey - The shared secret key
 * @param timestamp - The timestamp from X-Uni-Status-Timestamp header
 * @param toleranceSeconds - Maximum age of the request in seconds (default: 5 minutes)
 */
export function verifyWebhookSignature(
  payload: string,
  signature: string,
  secretKey: string,
  timestamp: number,
  toleranceSeconds: number = 300
): boolean {
  // Check timestamp is within tolerance to prevent replay attacks
  const now = Math.floor(Date.now() / 1000);
  if (Math.abs(now - timestamp) > toleranceSeconds) {
    return false;
  }

  const expectedSignature = signWebhookPayload(payload, secretKey, timestamp);

  // Use timing-safe comparison to prevent timing attacks
  try {
    const sigBuffer = Buffer.from(signature, "hex");
    const expectedBuffer = Buffer.from(expectedSignature, "hex");

    if (sigBuffer.length !== expectedBuffer.length) {
      return false;
    }

    return timingSafeEqual(sigBuffer, expectedBuffer);
  } catch {
    return false;
  }
}

/**
 * Generate a cryptographically secure random signing key.
 * Returns a 32-character hex string (128 bits of entropy).
 */
export function generateSigningKey(): string {
  const { randomBytes } = require("crypto");
  return randomBytes(32).toString("hex");
}
