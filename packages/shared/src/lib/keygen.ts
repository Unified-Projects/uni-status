import { createVerify } from "crypto";
import { getSelfHostedKeygenConfig } from "@uni-status/licensing";

// ==========================================
// Configuration
// ==========================================

export interface KeygenConfig {
    accountId: string;
    apiUrl: string;
    apiToken?: string; // Admin token for hosted mode
    publicKey?: string; // RSA/Ed25519 public key for offline verification
    productId?: string;
    webhookSecret?: string;
}

let _config: KeygenConfig | null = null;

export interface LicenseEntitlements {
    // Resource limits (-1 = unlimited)
    monitors: number;
    statusPages: number;
    teamMembers: number;
    regions: number;
    // Feature flags
    auditLogs: boolean;
    sso: boolean;
    oauthProviders: boolean;
    customRoles: boolean;
    slo: boolean;
    reports: boolean;
    multiRegion: boolean;
    oncall: boolean;
}

/**
 * Check if running in self-hosted mode.
 */
function isSelfHostedMode(): boolean {
    return (
        !process.env.DEPLOYMENT_TYPE ||
        process.env.DEPLOYMENT_TYPE === "SELF-HOSTED"
    );
}

/**
 * Initialize Keygen.sh configuration.
 *
 * For SELF-HOSTED mode: Uses hardcoded values from @uni-status/licensing
 * For HOSTED mode: Uses environment variables (operator controls their own Keygen account)
 */
export function initKeygenConfig(): KeygenConfig {
    if (_config) return _config;

    if (isSelfHostedMode()) {
        // Self-hosted: Use hardcoded Unified Projects Keygen account
        // This allows self-hosted users to purchase licenses from us
        const selfHostedConfig = getSelfHostedKeygenConfig();
        _config = {
            accountId: selfHostedConfig.accountId,
            apiUrl: selfHostedConfig.apiUrl,
            publicKey: selfHostedConfig.publicKey,
            // No API token for self-hosted (they don't need it)
            apiToken: undefined,
            productId: undefined,
            // Allow webhook secret for testing/development
            webhookSecret: process.env.UNI_STATUS_KEYGEN_WEBHOOK_SECRET,
        };
    } else {
        // Hosted mode: Use environment variables (we control the deployment)
        _config = {
            accountId: process.env.UNI_STATUS_KEYGEN_ACCOUNT_ID || "",
            apiUrl: process.env.UNI_STATUS_KEYGEN_API_URL || "https://api.keygen.sh",
            apiToken: process.env.UNI_STATUS_KEYGEN_API_TOKEN,
            publicKey: process.env.UNI_STATUS_KEYGEN_PUBLIC_KEY,
            productId: process.env.UNI_STATUS_KEYGEN_PRODUCT_ID,
            webhookSecret: process.env.UNI_STATUS_KEYGEN_WEBHOOK_SECRET,
        };
    }

    return _config;
}

/**
 * Check if Keygen.sh is properly configured.
 */
export function isKeygenConfigured(): boolean {
    const config = initKeygenConfig();
    return Boolean(config.accountId);
}

/**
 * Reset configuration (for testing).
 */
export function resetKeygenConfig(): void {
    _config = null;
}

// ==========================================
// API Types
// ==========================================

export interface KeygenLicense {
    id: string;
    type: "licenses";
    attributes: {
        key: string;
        name: string | null;
        status: "ACTIVE" | "INACTIVE" | "EXPIRED" | "SUSPENDED" | "BANNED";
        expiry: string | null;
        created: string;
        updated: string;
        metadata: Record<string, unknown>;
    };
    relationships: {
        policy: { data: { id: string; type: "policies" } | null };
        user: { data: { id: string; type: "users" } | null };
        product: { data: { id: string; type: "products" } | null };
    };
}

export interface KeygenEntitlement {
    id: string;
    type: "entitlements";
    attributes: {
        name: string;
        code: string;
        created: string;
        updated: string;
        metadata: Record<string, unknown>;
    };
}

export interface KeygenMachine {
    id: string;
    type: "machines";
    attributes: {
        fingerprint: string;
        name: string | null;
        ip: string | null;
        hostname: string | null;
        platform: string | null;
        cores: number | null;
        created: string;
        updated: string;
        lastHeartbeat: string | null;
        metadata: Record<string, unknown>;
    };
}

export interface KeygenValidationResult {
    valid: boolean;
    code:
    | "VALID"
    | "EXPIRED"
    | "SUSPENDED"
    | "OVERDUE"
    | "NO_MACHINE"
    | "NO_MACHINES"
    | "TOO_MANY_MACHINES"
    | "TOO_MANY_CORES"
    | "TOO_MANY_PROCESSES"
    | "FINGERPRINT_SCOPE_MISMATCH"
    | "HEARTBEAT_NOT_STARTED"
    | "HEARTBEAT_DEAD"
    | "PRODUCT_SCOPE_REQUIRED"
    | "PRODUCT_SCOPE_MISMATCH"
    | "POLICY_SCOPE_REQUIRED"
    | "POLICY_SCOPE_MISMATCH"
    | "MACHINE_SCOPE_REQUIRED"
    | "MACHINE_SCOPE_MISMATCH"
    | "ENTITLEMENTS_MISSING"
    | "ENTITLEMENTS_SCOPE_EMPTY"
    | "BANNED";
    detail: string;
    license?: KeygenLicense;
    entitlements?: KeygenEntitlement[];
}

const VALIDATION_CODES: ReadonlyArray<KeygenValidationResult["code"]> = [
    "VALID",
    "EXPIRED",
    "SUSPENDED",
    "OVERDUE",
    "NO_MACHINE",
    "NO_MACHINES",
    "TOO_MANY_MACHINES",
    "TOO_MANY_CORES",
    "TOO_MANY_PROCESSES",
    "FINGERPRINT_SCOPE_MISMATCH",
    "HEARTBEAT_NOT_STARTED",
    "HEARTBEAT_DEAD",
    "PRODUCT_SCOPE_REQUIRED",
    "PRODUCT_SCOPE_MISMATCH",
    "POLICY_SCOPE_REQUIRED",
    "POLICY_SCOPE_MISMATCH",
    "MACHINE_SCOPE_REQUIRED",
    "MACHINE_SCOPE_MISMATCH",
    "ENTITLEMENTS_MISSING",
    "ENTITLEMENTS_SCOPE_EMPTY",
    "BANNED",
];

function getValidationCode(value: unknown): KeygenValidationResult["code"] {
    if (typeof value !== "string") {
        return "VALID";
    }
    if (VALIDATION_CODES.includes(value as KeygenValidationResult["code"])) {
        return value as KeygenValidationResult["code"];
    }
    return "VALID";
}

export interface KeygenWebhookEvent {
    data: {
        id: string;
        type: string;
        attributes: {
            endpoint: string;
            event: string;
            payload: Record<string, unknown>;
            status: string;
            created: string;
        };
    };
}

// ==========================================
// API Client
// ==========================================

/**
 * Make a request to the Keygen.sh API.
 */
async function keygenRequest<T>(
    method: string,
    path: string,
    body?: unknown,
    useAdminToken = false
): Promise<T> {
    const config = initKeygenConfig();

    if (!config.accountId) {
        throw new Error("Keygen.sh account ID not configured");
    }

    const url = `${config.apiUrl}/v1/accounts/${config.accountId}${path}`;

    const headers: Record<string, string> = {
        "Content-Type": "application/vnd.api+json",
        Accept: "application/vnd.api+json",
    };

    if (useAdminToken && config.apiToken) {
        headers.Authorization = `Bearer ${config.apiToken}`;
    }

    const response = await fetch(url, {
        method,
        headers,
        body: body ? JSON.stringify(body) : undefined,
    });

    if (!response.ok) {
        const errorBody = await response.text();
        throw new Error(
            `Keygen API error: ${response.status} ${response.statusText} - ${errorBody}`
        );
    }

    return (await response.json()) as T;
}

/**
 * Validate a license key with Keygen.sh API.
 */
export async function validateLicenseOnline(
    licenseKey: string,
    options?: {
        fingerprint?: string;
        scope?: {
            product?: string;
            policy?: string;
            machine?: string;
            fingerprint?: string;
            entitlements?: string[];
        };
    }
): Promise<KeygenValidationResult> {
    const config = initKeygenConfig();

    const body: Record<string, unknown> = {
        meta: {
            key: licenseKey,
        },
    };

    if (options?.fingerprint) {
        (body.meta as Record<string, unknown>).scope = {
            fingerprint: options.fingerprint,
        };
    }

    if (options?.scope) {
        (body.meta as Record<string, unknown>).scope = {
            ...((body.meta as Record<string, unknown>).scope || {}),
            ...options.scope,
        };
    }

    const response = await fetch(
        `${config.apiUrl}/v1/accounts/${config.accountId}/licenses/actions/validate-key`,
        {
            method: "POST",
            headers: {
                "Content-Type": "application/vnd.api+json",
                Accept: "application/vnd.api+json",
            },
            body: JSON.stringify(body),
        }
    );

    const result = (await response.json()) as {
        meta?: { valid?: boolean; code?: string; detail?: string };
        data?: KeygenLicense;
        included?: KeygenEntitlement[];
    };

    // Map Keygen response to our validation result
    const meta = result.meta || {};
    const data = result.data;
    const included = result.included || [];

    return {
        valid: meta.valid === true,
        code: getValidationCode(meta.code),
        detail: meta.detail || "",
        license: data,
        entitlements: included.filter(
            (item: { type: string }) => item.type === "entitlements"
        ),
    };
}

/**
 * Get a license by ID.
 */
export async function getLicense(licenseId: string): Promise<KeygenLicense> {
    const response = await keygenRequest<{ data: KeygenLicense }>(
        "GET",
        `/licenses/${licenseId}`,
        undefined,
        true
    );
    return response.data;
}

/**
 * Get entitlements for a license.
 */
export async function getLicenseEntitlements(
    licenseId: string
): Promise<KeygenEntitlement[]> {
    const response = await keygenRequest<{ data: KeygenEntitlement[] }>(
        "GET",
        `/licenses/${licenseId}/entitlements`,
        undefined,
        true
    );
    return response.data;
}

/**
 * Activate a machine for a license.
 * For self-hosted mode, pass the licenseKey to authenticate with the license key itself.
 * For hosted mode with admin token, licenseKey can be omitted.
 */
export async function activateMachine(
    licenseId: string,
    fingerprint: string,
    options?: {
        name?: string;
        platform?: string;
        hostname?: string;
        cores?: number;
        metadata?: Record<string, unknown>;
        licenseKey?: string; // Used for auth in self-hosted mode
    }
): Promise<KeygenMachine> {
    const config = initKeygenConfig();

    const url = `${config.apiUrl}/v1/accounts/${config.accountId}/machines`;

    const headers: Record<string, string> = {
        "Content-Type": "application/vnd.api+json",
        Accept: "application/vnd.api+json",
    };

    // Use admin token if available (hosted mode), otherwise use license key (self-hosted mode)
    if (config.apiToken) {
        headers.Authorization = `Bearer ${config.apiToken}`;
    } else if (options?.licenseKey) {
        headers.Authorization = `License ${options.licenseKey}`;
    }

    const response = await fetch(url, {
        method: "POST",
        headers,
        body: JSON.stringify({
            data: {
                type: "machines",
                attributes: {
                    fingerprint,
                    name: options?.name,
                    platform: options?.platform,
                    hostname: options?.hostname,
                    cores: options?.cores,
                    metadata: options?.metadata,
                },
                relationships: {
                    license: {
                        data: { type: "licenses", id: licenseId },
                    },
                },
            },
        }),
    });

    if (!response.ok) {
        const errorBody = await response.text();
        throw new Error(
            `Keygen API error: ${response.status} ${response.statusText} - ${errorBody}`
        );
    }

    const result = (await response.json()) as { data: KeygenMachine };
    return result.data;
}

/**
 * Deactivate (delete) a machine.
 */
export async function deactivateMachine(machineId: string): Promise<void> {
    await keygenRequest("DELETE", `/machines/${machineId}`, undefined, true);
}

/**
 * Get machines for a license.
 */
export async function getLicenseMachines(
    licenseId: string
): Promise<KeygenMachine[]> {
    const response = await keygenRequest<{ data: KeygenMachine[] }>(
        "GET",
        `/licenses/${licenseId}/machines`,
        undefined,
        true
    );
    return response.data;
}

// ==========================================
// Checkout & Portal URLs
// ==========================================

/**
 * Create a checkout URL for a specific policy/plan.
 */
export function createCheckoutUrl(
    policyId: string,
    options?: {
        email?: string;
        organizationId?: string;
        successUrl?: string;
        cancelUrl?: string;
    }
): string {
    const config = initKeygenConfig();

    const params = new URLSearchParams();
    params.set("policy", policyId);

    if (options?.email) {
        params.set("email", options.email);
    }

    if (options?.organizationId) {
        params.set("metadata[organizationId]", options.organizationId);
    }

    if (options?.successUrl) {
        params.set("success_url", options.successUrl);
    }

    if (options?.cancelUrl) {
        params.set("cancel_url", options.cancelUrl);
    }

    // Keygen.sh checkout portal URL format
    return `https://portal.keygen.sh/${config.accountId}/checkout?${params.toString()}`;
}

/**
 * Get the customer portal URL for managing a license.
 */
export function getPortalUrl(licenseKey?: string): string {
    const config = initKeygenConfig();

    if (licenseKey) {
        return `https://portal.keygen.sh/${config.accountId}?license=${encodeURIComponent(licenseKey)}`;
    }

    return `https://portal.keygen.sh/${config.accountId}`;
}

// ==========================================
// Webhook Verification
// ==========================================

/**
 * Verify a Keygen.sh webhook signature.
 *
 * Keygen.sh supports two webhook signature formats:
 * 1. HMAC-SHA256: Uses a shared webhook secret (format: "t=timestamp,v1=signature")
 * 2. Ed25519: Uses the account's public key (raw base64 signature)
 *
 * This function auto-detects the signature type and verifies accordingly.
 */
export function verifyWebhookSignature(
    payload: string,
    signature: string,
    publicKeyOrSecret?: string
): boolean {
    const config = initKeygenConfig();

    // Check if signature is HMAC format (t=timestamp,v1=signature)
    if (signature.includes("t=") && signature.includes("v1=")) {
        // HMAC-SHA256 verification
        const webhookSecret = publicKeyOrSecret || config.webhookSecret;

        if (!webhookSecret) {
            console.warn("No webhook secret configured for HMAC verification");
            return false;
        }

        try {
            // Parse signature header
            const parts: Record<string, string> = {};
            for (const part of signature.split(",")) {
                const [key, value] = part.split("=", 2);
                if (key && value) {
                    parts[key] = value;
                }
            }

            const timestamp = parts["t"];
            const signatureHash = parts["v1"];

            if (!timestamp || !signatureHash) {
                console.warn("Invalid HMAC signature format");
                return false;
            }

            // Recreate the signed payload
            const signedPayload = `${timestamp}.${payload}`;

            // Calculate expected signature
            const { createHmac } = require("crypto");
            const expectedSignature = createHmac("sha256", webhookSecret)
                .update(signedPayload)
                .digest("hex");

            // Constant-time comparison
            const { timingSafeEqual } = require("crypto");
            const sigBuffer = Buffer.from(signatureHash, "hex");
            const expectedBuffer = Buffer.from(expectedSignature, "hex");

            if (sigBuffer.length !== expectedBuffer.length) {
                return false;
            }

            return timingSafeEqual(sigBuffer, expectedBuffer);
        } catch (error) {
            console.error("HMAC webhook signature verification failed:", error);
            return false;
        }
    }

    // Ed25519 verification (raw base64 signature)
    const publicKey = publicKeyOrSecret || config.publicKey;

    if (!publicKey) {
        console.warn("No public key configured for Ed25519 webhook verification");
        return false;
    }

    try {
        const verifier = createVerify("Ed25519");
        verifier.update(payload);
        return verifier.verify(publicKey, Buffer.from(signature, "base64"));
    } catch (error) {
        console.error("Ed25519 webhook signature verification failed:", error);
        return false;
    }
}

/**
 * Parse Keygen.sh webhook event types.
 */
export type KeygenWebhookEventType =
    | "license.created"
    | "license.updated"
    | "license.deleted"
    | "license.validated"
    | "license.validation-succeeded"
    | "license.validation-failed"
    | "license.expiring-soon"
    | "license.expired"
    | "license.renewed"
    | "license.revoked"
    | "license.suspended"
    | "license.reinstated"
    | "license.policy-changed"
    | "license.entitlements-attached"
    | "license.entitlements-detached"
    | "machine.created"
    | "machine.updated"
    | "machine.deleted"
    | "machine.heartbeat-ping"
    | "machine.heartbeat-pong"
    | "machine.heartbeat-dead"
    | "machine.heartbeat-reset";

// ==========================================
// Entitlement Mapping
// ==========================================

/**
 * Helper to add numeric limit values, respecting -1 as unlimited.
 * If either value is -1 (unlimited), result is unlimited.
 */
function addLimit(current: number, value: number): number {
    if (current === -1 || value === -1) return -1;
    return current + value;
}

/**
 * Map Keygen.sh entitlements to our LicenseEntitlements structure.
 *
 * Entitlements use metadata-based format:
 * - code can be anything (e.g., "pro-plan", "monitors-addon")
 * - limits/features are in metadata: {monitors: 50, statusPages: 5, sso: true}
 *
 * Multiple entitlements are combined:
 * - Numeric limits are SUMMED (50 + 25 = 75)
 * - Boolean features are OR'd (any true = true)
 * - -1 means unlimited (if any entitlement has unlimited, result is unlimited)
 *
 * IMPORTANT: In self-hosted mode, all numeric limits are unlimited (-1)
 * because the user controls their own infrastructure.
 */
export function mapKeygenEntitlements(
    entitlements: KeygenEntitlement[]
): LicenseEntitlements {
    // Self-hosted mode: all numeric limits are unlimited
    // Users control their own infrastructure, so no need for limits
    if (isSelfHostedMode()) {
        const result: LicenseEntitlements = {
            monitors: -1,
            statusPages: -1,
            teamMembers: -1,
            regions: -1,
            auditLogs: false,
            sso: false,
            oauthProviders: false,
            customRoles: false,
            slo: false,
            reports: false,
            multiRegion: false,
            oncall: false,
        };

        // Still extract boolean features from entitlements
        for (const entitlement of entitlements) {
            const metadata = entitlement.attributes.metadata || {};
            if (metadata.auditLogs === true) result.auditLogs = true;
            if (metadata.sso === true) result.sso = true;
            if (metadata.oauthProviders === true) result.oauthProviders = true;
            if (metadata.customRoles === true) result.customRoles = true;
            if (metadata.slo === true) result.slo = true;
            if (metadata.reports === true) result.reports = true;
            if (metadata.multiRegion === true) result.multiRegion = true;
            if (metadata.oncall === true) result.oncall = true;
        }

        return result;
    }

    // Hosted mode: use entitlement metadata for limits
    const result: LicenseEntitlements = {
        monitors: 0,
        statusPages: 0,
        teamMembers: 0,
        regions: 0,
        auditLogs: false,
        sso: false,
        oauthProviders: false,
        customRoles: false,
        slo: false,
        reports: false,
        multiRegion: false,
        oncall: false,
    };

    for (const entitlement of entitlements) {
        const metadata = entitlement.attributes.metadata || {};

        // Numeric limits (sum them)
        if (typeof metadata.monitors === "number") {
            result.monitors = addLimit(result.monitors, metadata.monitors);
        }
        if (typeof metadata.statusPages === "number") {
            result.statusPages = addLimit(result.statusPages, metadata.statusPages);
        }
        if (typeof metadata.teamMembers === "number") {
            result.teamMembers = addLimit(result.teamMembers, metadata.teamMembers);
        }
        if (typeof metadata.regions === "number") {
            result.regions = addLimit(result.regions, metadata.regions);
        }

        // Boolean features (OR them)
        if (metadata.auditLogs === true) result.auditLogs = true;
        if (metadata.sso === true) result.sso = true;
        if (metadata.oauthProviders === true) result.oauthProviders = true;
        if (metadata.customRoles === true) result.customRoles = true;
        if (metadata.slo === true) result.slo = true;
        if (metadata.reports === true) result.reports = true;
        if (metadata.multiRegion === true) result.multiRegion = true;
        if (metadata.oncall === true) result.oncall = true;
    }

    // If no entitlements provided any limits, use FREE tier defaults
    if (result.monitors === 0) result.monitors = 5;
    if (result.statusPages === 0) result.statusPages = 1;
    if (result.teamMembers === 0) result.teamMembers = 1;
    if (result.regions === 0) result.regions = 1;

    return result;
}

/**
 * Map Keygen.sh license status to our license status.
 */
export function mapKeygenLicenseStatus(
    status: KeygenLicense["attributes"]["status"]
): "active" | "expired" | "suspended" | "revoked" {
    switch (status) {
        case "ACTIVE":
            return "active";
        case "EXPIRED":
            return "expired";
        case "SUSPENDED":
            return "suspended";
        case "BANNED":
        case "INACTIVE":
            return "revoked";
        default:
            return "suspended";
    }
}

// ==========================================
// Offline Verification
// ==========================================

/**
 * Keygen.sh license key format for offline verification.
 * Keygen uses a signed license format that can be verified offline.
 *
 * The license key format is:
 * key/<scheme>.<encoded_dataset>.<signature>
 *
 * Supported schemes:
 * - RSA_2048_PKCS1_PSS_SIGN_V2 (RSA 2048-bit with PSS padding)
 * - RSA_2048_PKCS1_SIGN_V2 (RSA 2048-bit with PKCS1 v1.5 padding)
 * - ED25519_SIGN (Ed25519)
 */
export interface KeygenOfflineVerificationResult {
    valid: boolean;
    code: string;
    detail: string;
    license?: {
        id: string;
        expiry: string | null;
        status: string;
        policy: string | null;
        metadata: Record<string, unknown>;
    };
}

/**
 * Verify a Keygen.sh license key offline.
 * Supports RSA 2048-bit (PSS and PKCS1) and Ed25519 signatures.
 * This requires the public key to be configured.
 */
export function verifyLicenseOffline(
    licenseKey: string,
    publicKey?: string
): KeygenOfflineVerificationResult {
    const config = initKeygenConfig();
    const key = publicKey || config.publicKey;

    if (!key) {
        return {
            valid: false,
            code: "NO_PUBLIC_KEY",
            detail: "Public key not configured for offline verification",
        };
    }

    try {
        // Keygen.sh signed keys have format: key/<scheme>.<encoded_dataset>.<signature>
        if (!licenseKey.startsWith("key/")) {
            return {
                valid: false,
                code: "INVALID_FORMAT",
                detail: "Invalid license key format - must start with 'key/'",
            };
        }

        const parts = licenseKey.slice(4).split(".");
        if (parts.length !== 3) {
            return {
                valid: false,
                code: "INVALID_FORMAT",
                detail: "Invalid license key format - expected scheme.data.signature",
            };
        }

        const [scheme, encodedData, signatureBase64] = parts;
        if (!scheme || !encodedData || !signatureBase64) {
            return {
                valid: false,
                code: "INVALID_FORMAT",
                detail: "Invalid license key format - expected scheme.data.signature",
            };
        }

        // The signing data is "scheme.encodedData"
        const signingData = `${scheme}.${encodedData}`;

        // Decode the signature
        const signature = Buffer.from(signatureBase64, "base64");

        // Verify based on scheme
        let isValid = false;

        if (scheme === "RSA_2048_PKCS1_PSS_SIGN_V2") {
            // RSA 2048-bit with PSS padding
            const { createPublicKey, constants } = require("crypto");
            const publicKeyObj = createPublicKey(key);
            const verifier = createVerify("SHA256");
            verifier.update(signingData);
            isValid = verifier.verify(
                {
                    key: publicKeyObj,
                    padding: constants.RSA_PKCS1_PSS_PADDING,
                    saltLength: constants.RSA_PSS_SALTLEN_DIGEST,
                },
                signature
            );
        } else if (scheme === "RSA_2048_PKCS1_SIGN_V2") {
            // RSA 2048-bit with PKCS1 v1.5 padding
            const verifier = createVerify("SHA256");
            verifier.update(signingData);
            isValid = verifier.verify(key, signature);
        } else if (scheme === "ED25519_SIGN") {
            // Ed25519
            const verifier = createVerify("Ed25519");
            verifier.update(signingData);
            isValid = verifier.verify(key, signature);
        } else {
            return {
                valid: false,
                code: "UNSUPPORTED_SCHEME",
                detail: `Unsupported license scheme: ${scheme}`,
            };
        }

        if (!isValid) {
            return {
                valid: false,
                code: "INVALID_SIGNATURE",
                detail: "License signature verification failed",
            };
        }

        // Decode the license data (base64url encoded JSON)
        let licenseData: {
            id?: string;
            exp?: number; // Unix timestamp
            expiry?: string; // ISO date string (legacy)
            status?: string;
            policy?: string;
            metadata?: Record<string, unknown>;
        };

        try {
            const decodedPayload = Buffer.from(encodedData, "base64url").toString(
                "utf8"
            );
            licenseData = JSON.parse(decodedPayload);
        } catch {
            return {
                valid: false,
                code: "PARSE_ERROR",
                detail: "Failed to parse license data",
            };
        }

        // Check expiry (supports both exp timestamp and expiry ISO string)
        const expiryTimestamp = licenseData.exp
            ? licenseData.exp * 1000
            : licenseData.expiry
                ? new Date(licenseData.expiry).getTime()
                : null;

        if (expiryTimestamp && expiryTimestamp < Date.now()) {
            return {
                valid: false,
                code: "EXPIRED",
                detail: "License has expired",
                license: {
                    id: licenseData.id || "",
                    expiry: expiryTimestamp
                        ? new Date(expiryTimestamp).toISOString()
                        : null,
                    status: "EXPIRED",
                    policy: licenseData.policy || null,
                    metadata: licenseData.metadata || {},
                },
            };
        }

        // Check status
        if (
            licenseData.status &&
            !["ACTIVE", "active"].includes(licenseData.status)
        ) {
            return {
                valid: false,
                code: licenseData.status.toUpperCase(),
                detail: `License status is ${licenseData.status}`,
                license: {
                    id: licenseData.id || "",
                    expiry: expiryTimestamp
                        ? new Date(expiryTimestamp).toISOString()
                        : null,
                    status: licenseData.status,
                    policy: licenseData.policy || null,
                    metadata: licenseData.metadata || {},
                },
            };
        }

        return {
            valid: true,
            code: "VALID",
            detail: "License is valid",
            license: {
                id: licenseData.id || "",
                expiry: expiryTimestamp
                    ? new Date(expiryTimestamp).toISOString()
                    : null,
                status: licenseData.status || "ACTIVE",
                policy: licenseData.policy || null,
                metadata: licenseData.metadata || {},
            },
        };
    } catch (error) {
        return {
            valid: false,
            code: "VERIFICATION_ERROR",
            detail:
                error instanceof Error ? error.message : "Unknown verification error",
        };
    }
}

// ==========================================
// License File Certificate Verification
// ==========================================

/**
 * Result from verifying a license file certificate.
 */
export interface LicenseFileCertificateResult {
    valid: boolean;
    code: string;
    detail: string;
    license?: {
        id: string;
        key?: string;
        expiry: string | null;
        status: string;
        policy?: string | null;
        metadata: Record<string, unknown>;
        entitlements?: Array<{
            id: string;
            code: string;
            metadata: Record<string, unknown>;
        }>;
    };
    meta?: {
        issued: string;
        expiry: string;
        ttl: number;
    };
}

/**
 * Verify a license file certificate (BEGIN LICENSE FILE format).
 *
 * This handles the cryptographic license file format from Keygen.sh:
 * - Parses the PEM-style certificate
 * - Verifies the Ed25519 or RSA signature
 * - Decrypts the payload if encrypted (requires license key)
 * - Validates expiry and clock drift
 *
 * @param certificate - The full license file certificate (with BEGIN/END markers)
 * @param licenseKey - Optional license key for decrypting encrypted certificates
 */
export function verifyLicenseFileCertificate(
    certificate: string,
    licenseKey?: string
): LicenseFileCertificateResult {
    const config = initKeygenConfig();

    if (!config.publicKey) {
        return {
            valid: false,
            code: "NO_PUBLIC_KEY",
            detail: "Public key not configured for license file verification",
        };
    }

    try {
        // Step 1: Extract payload from PEM format
        const lines = certificate.trim().split("\n");
        const beginIndex = lines.findIndex((l) =>
            l.includes("-----BEGIN LICENSE FILE-----")
        );
        const endIndex = lines.findIndex((l) =>
            l.includes("-----END LICENSE FILE-----")
        );

        if (beginIndex === -1 || endIndex === -1 || beginIndex >= endIndex) {
            return {
                valid: false,
                code: "INVALID_FORMAT",
                detail:
                    "Invalid license file format - missing BEGIN/END LICENSE FILE markers",
            };
        }

        // Extract base64 payload (removing headers and joining lines)
        const base64Payload = lines
            .slice(beginIndex + 1, endIndex)
            .join("")
            .replace(/\s/g, "");

        // Step 2: Decode base64 to get JSON
        const jsonPayload = Buffer.from(base64Payload, "base64").toString("utf-8");
        let certData: {
            enc: string;
            sig: string;
            alg: string;
        };

        try {
            certData = JSON.parse(jsonPayload);
        } catch {
            return {
                valid: false,
                code: "PARSE_ERROR",
                detail: "Failed to parse license file certificate JSON",
            };
        }

        const { enc, sig, alg } = certData;

        if (!enc || !sig || !alg) {
            return {
                valid: false,
                code: "INVALID_CERTIFICATE",
                detail: "License file certificate missing required fields (enc, sig, alg)",
            };
        }

        // Step 3: Verify signature
        // The signing data is prefixed with "license/" for license files
        const signingData = `license/${enc}`;
        const signatureBytes = Buffer.from(sig, "base64");

        let isSignatureValid = false;

        if (alg === "aes-256-gcm+ed25519" || alg === "base64+ed25519") {
            // Ed25519 verification
            const { createPublicKey, verify, constants } = require("crypto");

            // Check if the public key is already in PEM format or needs conversion
            let publicKeyObj;
            if (config.publicKey.includes("-----BEGIN")) {
                // Already PEM format (might be RSA or Ed25519)
                publicKeyObj = createPublicKey(config.publicKey);
            } else {
                // Assume DER-encoded Ed25519 public key (base64)
                const derKey = Buffer.from(config.publicKey, "base64");
                publicKeyObj = createPublicKey({
                    key: derKey,
                    format: "der",
                    type: "spki",
                });
            }

            isSignatureValid = verify(
                null, // Ed25519 doesn't use a digest algorithm
                Buffer.from(signingData),
                publicKeyObj,
                signatureBytes
            );
        } else if (alg === "aes-256-gcm+rsa-pss-sha256" || alg === "base64+rsa-pss-sha256") {
            const { createPublicKey, createVerify, constants } = require("crypto");

            const publicKeyObj = createPublicKey(config.publicKey);

            const verifier = createVerify("SHA256");
            verifier.update(signingData, "utf8");
            verifier.end();

            isSignatureValid = verifier.verify(
                {
                    key: publicKeyObj,
                    padding: constants.RSA_PKCS1_PSS_PADDING,
                    saltLength: constants.RSA_PSS_SALTLEN_AUTO,
                },
                signatureBytes
            );
        } else if (alg === "aes-256-gcm+rsa-sha256" || alg === "base64+rsa-sha256") {
            // RSA PKCS1 v1.5 verification
            const { createVerify } = require("crypto");
            const verifier = createVerify("SHA256");
            verifier.update(signingData);
            isSignatureValid = verifier.verify(config.publicKey, signatureBytes);
        } else {
            return {
                valid: false,
                code: "UNSUPPORTED_ALGORITHM",
                detail: `Unsupported license file algorithm: ${alg}`,
            };
        }

        if (!isSignatureValid) {
            return {
                valid: false,
                code: "INVALID_SIGNATURE",
                detail: "License file signature verification failed",
            };
        }

        // Step 4: Decode or decrypt the payload
        let decodedData: string;

        if (alg.startsWith("aes-256-gcm")) {
            // Encrypted - need to decrypt with license key
            if (!licenseKey) {
                return {
                    valid: false,
                    code: "DECRYPTION_KEY_REQUIRED",
                    detail:
                        "License key required to decrypt encrypted license file certificate",
                };
            }

            // Split enc into ciphertext.iv.tag
            const encParts = enc.split(".");
            if (encParts.length !== 3) {
                return {
                    valid: false,
                    code: "INVALID_ENCRYPTED_FORMAT",
                    detail: "Invalid encrypted license file format",
                };
            }

            const ciphertextB64 = encParts[0]!;
            const ivB64 = encParts[1]!;
            const tagB64 = encParts[2]!;
            const ciphertext = Buffer.from(ciphertextB64, "base64");
            const iv = Buffer.from(ivB64, "base64");
            const tag = Buffer.from(tagB64, "base64");

            // Derive decryption key from license key using SHA256
            const { createHash, createDecipheriv } = require("crypto");
            const decryptionKey = createHash("sha256").update(licenseKey).digest();

            try {
                const decipher = createDecipheriv("aes-256-gcm", decryptionKey, iv);
                decipher.setAuthTag(tag);
                decodedData =
                    decipher.update(ciphertext, undefined, "utf-8") +
                    decipher.final("utf-8");
            } catch (decryptError) {
                return {
                    valid: false,
                    code: "DECRYPTION_FAILED",
                    detail: "Failed to decrypt license file - invalid license key",
                };
            }
        } else {
            // Base64 encoded (not encrypted)
            decodedData = Buffer.from(enc, "base64").toString("utf-8");
        }

        // Step 5: Parse the decoded license data
        let licenseData: {
            data?: {
                id?: string;
                type?: string;
                attributes?: {
                    key?: string;
                    status?: string;
                    expiry?: string;
                    metadata?: Record<string, unknown>;
                };
                relationships?: {
                    policy?: { data?: { id: string } };
                };
            };
            included?: Array<{
                id: string;
                type: string;
                attributes?: {
                    code?: string;
                    metadata?: Record<string, unknown>;
                };
            }>;
            meta?: {
                issued?: string;
                expiry?: string;
                ttl?: number;
            };
        };

        try {
            licenseData = JSON.parse(decodedData);
        } catch {
            return {
                valid: false,
                code: "PARSE_ERROR",
                detail: "Failed to parse decrypted license data",
            };
        }

        // Step 6: Validate expiry and clock drift
        const meta = licenseData.meta;
        if (meta) {
            const now = Date.now();

            if (meta.issued) {
                const issuedTime = new Date(meta.issued).getTime();
                // Allow 5 minutes of clock drift
                if (issuedTime > now + 5 * 60 * 1000) {
                    return {
                        valid: false,
                        code: "CLOCK_DRIFT",
                        detail:
                            "License file was issued in the future - check system clock",
                    };
                }
            }

            if (meta.expiry) {
                const expiryTime = new Date(meta.expiry).getTime();
                if (expiryTime < now) {
                    return {
                        valid: false,
                        code: "LICENSE_FILE_EXPIRED",
                        detail: "License file certificate has expired - download a fresh one",
                    };
                }
            }
        }

        // Step 7: Extract license data
        const data = licenseData.data;
        const entitlements = (licenseData.included || [])
            .filter((item) => item.type === "entitlements")
            .map((e) => ({
                id: e.id,
                code: e.attributes?.code || "",
                metadata: e.attributes?.metadata || {},
            }));

        return {
            valid: true,
            code: "VALID",
            detail: "License file certificate is valid",
            license: {
                id: data?.id || "",
                key: data?.attributes?.key,
                expiry: data?.attributes?.expiry || null,
                status: data?.attributes?.status || "ACTIVE",
                policy: data?.relationships?.policy?.data?.id || null,
                metadata: data?.attributes?.metadata || {},
                entitlements,
            },
            meta: meta
                ? {
                    issued: meta.issued || "",
                    expiry: meta.expiry || "",
                    ttl: meta.ttl || 0,
                }
                : undefined,
        };
    } catch (error) {
        return {
            valid: false,
            code: "VERIFICATION_ERROR",
            detail:
                error instanceof Error
                    ? error.message
                    : "Unknown license file verification error",
        };
    }
}

/**
 * Read license from environment variable or file path.
 * If the value looks like a file path, reads the file content.
 * Otherwise returns the value directly.
 */
export function readLicenseFromEnvOrFile(envValue: string): {
    type: "key" | "certificate" | "signed_key";
    content: string;
} {
    const { existsSync, readFileSync } = require("fs");

    // Check if it's a file path
    const isPath =
        envValue.startsWith("/") ||
        envValue.startsWith("./") ||
        envValue.startsWith("~") ||
        envValue.includes(".pem") ||
        envValue.includes(".lic");

    let content = envValue;

    if (isPath && existsSync(envValue)) {
        content = readFileSync(envValue, "utf-8").trim();
    }

    // Determine the type of license content
    if (content.includes("-----BEGIN LICENSE FILE-----")) {
        return { type: "certificate", content };
    } else if (content.startsWith("key/")) {
        return { type: "signed_key", content };
    } else {
        return { type: "key", content };
    }
}

// ==========================================
// Export Client Class
// ==========================================

/**
 * Keygen.sh API client class for more structured usage.
 */
export class KeygenClient {
    private config: KeygenConfig;

    constructor(config?: Partial<KeygenConfig>) {
        this.config = {
            ...initKeygenConfig(),
            ...config,
        };
    }

    async validateLicense(
        key: string,
        fingerprint?: string
    ): Promise<KeygenValidationResult> {
        return validateLicenseOnline(key, { fingerprint });
    }

    async getLicense(licenseId: string): Promise<KeygenLicense> {
        return getLicense(licenseId);
    }

    async getEntitlements(licenseId: string): Promise<KeygenEntitlement[]> {
        return getLicenseEntitlements(licenseId);
    }

    async activateMachine(
        licenseId: string,
        fingerprint: string,
        options?: Parameters<typeof activateMachine>[2]
    ): Promise<KeygenMachine> {
        return activateMachine(licenseId, fingerprint, options);
    }

    async deactivateMachine(machineId: string): Promise<void> {
        return deactivateMachine(machineId);
    }

    createCheckoutUrl(
        policyId: string,
        options?: Parameters<typeof createCheckoutUrl>[1]
    ): string {
        return createCheckoutUrl(policyId, options);
    }

    getPortalUrl(licenseKey?: string): string {
        return getPortalUrl(licenseKey);
    }

    verifyOffline(licenseKey: string): KeygenOfflineVerificationResult {
        return verifyLicenseOffline(licenseKey, this.config.publicKey);
    }
}
