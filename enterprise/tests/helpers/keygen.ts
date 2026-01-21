/**
 * Keygen.sh Test Helpers
 *
 * Mock utilities for Keygen.sh API responses and validation.
 */

import { vi } from "vitest";
import type {
  KeygenLicense,
  KeygenEntitlement,
  KeygenValidationResult,
  KeygenMachine,
} from "@uni-status/shared/lib/keygen";
import type { MockLicense } from "./license";
import { nanoid } from "nanoid";

// ==========================================
// Mock Response Builders
// ==========================================

/**
 * Create a valid Keygen validation response for a license.
 */
export function createValidKeygenResponse(
  license: MockLicense
): KeygenValidationResult {
  return {
    valid: true,
    code: "VALID",
    detail: "License is valid",
    license: mockLicenseToKeygenLicense(license),
    entitlements: mockEntitlementsToKeygenEntitlements(license.entitlements),
  };
}

/**
 * Create an expired Keygen validation response.
 */
export function createExpiredKeygenResponse(
  license?: MockLicense
): KeygenValidationResult {
  return {
    valid: false,
    code: "EXPIRED",
    detail: "License has expired",
    license: license ? mockLicenseToKeygenLicense(license) : undefined,
  };
}

/**
 * Create a suspended Keygen validation response.
 */
export function createSuspendedKeygenResponse(
  license?: MockLicense
): KeygenValidationResult {
  return {
    valid: false,
    code: "SUSPENDED",
    detail: "License has been suspended due to payment failure",
    license: license ? mockLicenseToKeygenLicense(license) : undefined,
  };
}

/**
 * Create a revoked Keygen validation response.
 */
export function createRevokedKeygenResponse(
  license?: MockLicense
): KeygenValidationResult {
  return {
    valid: false,
    code: "BANNED",
    detail: "License has been revoked",
    license: license ? mockLicenseToKeygenLicense(license) : undefined,
  };
}

/**
 * Create a "not found" Keygen validation response.
 */
export function createNotFoundKeygenResponse(): KeygenValidationResult {
  return {
    valid: false,
    code: "FINGERPRINT_SCOPE_MISMATCH",
    detail: "License not found",
  };
}

/**
 * Create a network error response (for simulating API failures).
 */
export function createNetworkErrorResponse(): Error {
  return new Error("Network error: Unable to reach Keygen.sh API");
}

// ==========================================
// Type Converters
// ==========================================

/**
 * Convert MockLicense to KeygenLicense format.
 */
export function mockLicenseToKeygenLicense(
  license: MockLicense
): KeygenLicense {
  const statusMap: Record<string, KeygenLicense["attributes"]["status"]> = {
    active: "ACTIVE",
    expired: "EXPIRED",
    suspended: "SUSPENDED",
    revoked: "BANNED",
  };

  return {
    id: license.keygenLicenseId,
    type: "licenses",
    attributes: {
      key: license.key,
      name: license.name,
      status: statusMap[license.status] || "INACTIVE",
      expiry: license.expiresAt?.toISOString() || null,
      created: license.createdAt.toISOString(),
      updated: license.updatedAt.toISOString(),
      metadata: {
        organizationId: license.organizationId,
        ...license.metadata,
      },
    },
    relationships: {
      policy: license.keygenPolicyId
        ? { data: { id: license.keygenPolicyId, type: "policies" } }
        : { data: null },
      user: null,
      product: null,
    },
  };
}

/**
 * Convert LicenseEntitlements to Keygen entitlement format.
 */
export function mockEntitlementsToKeygenEntitlements(
  entitlements: MockLicense["entitlements"]
): KeygenEntitlement[] {
  const result: KeygenEntitlement[] = [];
  const now = new Date().toISOString();

  // Resource limits
  result.push(
    createKeygenEntitlement("monitors", entitlements.monitors),
    createKeygenEntitlement("status-pages", entitlements.statusPages),
    createKeygenEntitlement("team-members", entitlements.teamMembers),
    createKeygenEntitlement("regions", entitlements.regions)
  );

  // Feature flags (only add if enabled)
  if (entitlements.auditLogs) {
    result.push(createKeygenEntitlement("audit-logs", true));
  }
  if (entitlements.sso) {
    result.push(createKeygenEntitlement("sso", true));
  }
  if (entitlements.customRoles) {
    result.push(createKeygenEntitlement("custom-roles", true));
  }
  if (entitlements.slo) {
    result.push(createKeygenEntitlement("slo", true));
  }
  if (entitlements.reports) {
    result.push(createKeygenEntitlement("reports", true));
  }
  if (entitlements.multiRegion) {
    result.push(createKeygenEntitlement("multi-region", true));
  }

  return result;
}

/**
 * Create a single Keygen entitlement.
 */
function createKeygenEntitlement(
  code: string,
  value: number | boolean
): KeygenEntitlement {
  const now = new Date().toISOString();
  return {
    id: `ent_${nanoid()}`,
    type: "entitlements",
    attributes: {
      name: code
        .split("-")
        .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
        .join(" "),
      code,
      created: now,
      updated: now,
      metadata:
        typeof value === "number" ? { limit: value } : { enabled: value },
    },
  };
}

/**
 * Create a mock Keygen machine.
 */
export function createMockKeygenMachine(
  licenseId: string,
  overrides: Partial<KeygenMachine["attributes"]> = {}
): KeygenMachine {
  const now = new Date().toISOString();
  return {
    id: `mach_${nanoid()}`,
    type: "machines",
    attributes: {
      fingerprint: `fp_${nanoid(16)}`,
      name: "Test Machine",
      ip: "192.168.1.1",
      hostname: "test-host",
      platform: "linux",
      cores: 4,
      created: now,
      updated: now,
      lastHeartbeat: now,
      metadata: {},
      ...overrides,
    },
  };
}

// ==========================================
// Mock Functions
// ==========================================

/**
 * Create a mock function that returns a specific validation response.
 */
export function mockKeygenValidation(response: KeygenValidationResult) {
  return vi.fn().mockResolvedValue(response);
}

/**
 * Create a mock function that rejects with a network error.
 */
export function mockKeygenNetworkError() {
  return vi.fn().mockRejectedValue(createNetworkErrorResponse());
}

/**
 * Create a mock Keygen client with configurable responses.
 */
export function createMockKeygenClient(
  options: {
    validateLicense?: KeygenValidationResult | Error;
    getLicense?: KeygenLicense | Error;
    getEntitlements?: KeygenEntitlement[] | Error;
    activateMachine?: KeygenMachine | Error;
  } = {}
) {
  return {
    validateLicense: options.validateLicense instanceof Error
      ? vi.fn().mockRejectedValue(options.validateLicense)
      : vi.fn().mockResolvedValue(options.validateLicense),
    getLicense: options.getLicense instanceof Error
      ? vi.fn().mockRejectedValue(options.getLicense)
      : vi.fn().mockResolvedValue(options.getLicense),
    getEntitlements: options.getEntitlements instanceof Error
      ? vi.fn().mockRejectedValue(options.getEntitlements)
      : vi.fn().mockResolvedValue(options.getEntitlements),
    activateMachine: options.activateMachine instanceof Error
      ? vi.fn().mockRejectedValue(options.activateMachine)
      : vi.fn().mockResolvedValue(options.activateMachine),
    deactivateMachine: vi.fn().mockResolvedValue(undefined),
    createCheckoutUrl: vi.fn().mockReturnValue("https://portal.keygen.sh/test/checkout"),
    getPortalUrl: vi.fn().mockReturnValue("https://portal.keygen.sh/test"),
    verifyOffline: vi.fn(),
  };
}

// ==========================================
// Fetch Mock Helpers
// ==========================================

/**
 * Create a mock fetch response for Keygen API.
 */
export function createMockKeygenFetchResponse<T>(
  data: T,
  status: number = 200
): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/vnd.api+json" },
  });
}

/**
 * Create a mock fetch that returns a validation response.
 */
export function mockFetchValidation(response: KeygenValidationResult) {
  return vi.spyOn(global, "fetch").mockResolvedValueOnce(
    createMockKeygenFetchResponse({
      meta: {
        valid: response.valid,
        code: response.code,
        detail: response.detail,
      },
      data: response.license,
      included: response.entitlements || [],
    })
  );
}

/**
 * Create a mock fetch that returns an error.
 */
export function mockFetchError(message: string = "Network error") {
  return vi.spyOn(global, "fetch").mockRejectedValueOnce(new Error(message));
}

// ==========================================
// Keygen Response Templates
// ==========================================

export const KEYGEN_VALIDATION_CODES = {
  VALID: "VALID",
  EXPIRED: "EXPIRED",
  SUSPENDED: "SUSPENDED",
  BANNED: "BANNED",
  OVERDUE: "OVERDUE",
  NO_MACHINE: "NO_MACHINE",
  NO_MACHINES: "NO_MACHINES",
  TOO_MANY_MACHINES: "TOO_MANY_MACHINES",
  FINGERPRINT_SCOPE_MISMATCH: "FINGERPRINT_SCOPE_MISMATCH",
  HEARTBEAT_DEAD: "HEARTBEAT_DEAD",
} as const;

export type KeygenValidationCode =
  (typeof KEYGEN_VALIDATION_CODES)[keyof typeof KEYGEN_VALIDATION_CODES];
