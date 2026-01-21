/**
 * Keygen.sh License Validation Configuration
 *
 * DO NOT MODIFY THIS FILE
 *
 * This file contains the hardcoded Keygen.sh configuration for validating
 * Uni-Status Enterprise licenses. Modifying these values will break license
 * validation and may violate the terms of service.
 *
 * To purchase an enterprise license, visit: https://status.unified.sh/pricing
 *
 * @license See LICENSE file in this directory
 * @copyright Unified Projects Ltd
 */

/**
 * Keygen.sh Account ID for Unified Projects
 * This identifies the Keygen account that issues Uni-Status licenses.
 *
 * DO NOT MODIFY
 */
export const KEYGEN_ACCOUNT_ID = "fa5b32d3-050f-4af5-a0c6-5d3a0112814f" as const;

/**
 * Keygen.sh API URL
 * Standard Keygen.sh API endpoint.
 *
 * DO NOT MODIFY
 */
export const KEYGEN_API_URL = "https://api.keygen.sh" as const;

/**
 * RSA 2048-bit Public Key for License Verification (Base64 encoded)
 *
 * This key is used to verify the authenticity of license keys offline.
 * It can only VERIFY signatures - it cannot create them.
 * The corresponding private key is held securely by Keygen.sh.
 *
 * DO NOT MODIFY
 */
export const KEYGEN_PUBLIC_KEY_BASE64 =
    "LS0tLS1CRUdJTiBQVUJMSUMgS0VZLS0tLS0KTUlJQklqQU5CZ2txaGtpRzl3MEJBUUVGQUFPQ0FROEFNSUlCQ2dLQ0FRRUF5cE1wWWNub0xnVU1DcEVzRXFCYQptZmRqZURWcXZ1Z2YrRkNYa3c1b2ZZZ0gxeEN3WjhnNVBCZ0JVdHJoT0gzTlpNUXcwV3VYejBzZVJLdFoxNDZaCmlPTVNXUFp6N0tyMCtVYjBnMmpPUXFZNUF1ak5kRWlxT0JnRllXVVBrZXVpbE8rUFk4TjlXU0RiajBZaUIzREIKa2dlSjJGMVFhS2Y5T1p0NFVEUldRdEN2Q2hxT1pqS01GQTN0bWJWNllONXh5WTB5bXRVdjJkL2Q1S2l5bG9yeApYQjVPUnhvSmQzVVFOZzdZMUN5bDVKcS9hTjNWcGV0MElwQ2xBMW5nT0J0UkFCZmRRcEg1b2dEM2FmTVp5cUk4CjVPUmx4eVNlS3FxcU9LS0RtbzdRUDNJdjZpcGFzRHAyL1ZkMVZIZFZFRWtVaDR1SHVVc0dsNVcxT000WWdscjkKeHdJREFRQUIKLS0tLS1FTkQgUFVCTElDIEtFWS0tLS0tCg==" as const;

/**
 * Decoded PEM format of the public key.
 * Used directly for cryptographic verification.
 */
export const KEYGEN_PUBLIC_KEY_PEM = Buffer.from(
    KEYGEN_PUBLIC_KEY_BASE64,
    "base64"
).toString("utf-8");

/**
 * License Portal URL
 * Where users can manage their licenses after purchase.
 *
 * DO NOT MODIFY
 */
export const KEYGEN_PORTAL_URL =
    `https://portal.keygen.sh/${KEYGEN_ACCOUNT_ID}` as const;

/**
 * Pricing Page URL
 * Where users can purchase enterprise licenses.
 */
export const PRICING_URL = "https://status.unified.sh/#pricing" as const;

/**
 * Policy IDs for license plans
 * These map to policies configured in the Keygen.sh dashboard.
 *
 * DO NOT MODIFY - These are the official Unified Projects policy IDs
 */
export const KEYGEN_POLICY_IDS = {
    PRO: "91dfc168-5f09-4e90-8535-ef7a4413f861",
    ENTERPRISE: "ab31b577-d067-4c16-afc9-1242ad1fb11e",
} as const;

/**
 * Get the self-hosted Keygen configuration.
 * This returns the hardcoded values for license validation.
 */
export function getSelfHostedKeygenConfig() {
    return {
        accountId: KEYGEN_ACCOUNT_ID,
        apiUrl: KEYGEN_API_URL,
        publicKey: KEYGEN_PUBLIC_KEY_PEM,
        portalUrl: KEYGEN_PORTAL_URL,
        pricingUrl: PRICING_URL,
        policyIds: KEYGEN_POLICY_IDS,
    } as const;
}
