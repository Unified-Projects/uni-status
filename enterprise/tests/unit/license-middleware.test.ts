/**
 * License Middleware Unit Tests
 *
 * Tests for the license middleware functionality including:
 * - License context loading
 * - Resource limit checking
 * - Feature flag checking
 * - Grace period handling
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  getLicenseContext,
  checkResourceLimit,
  requireResourceLimit,
  checkFeature,
  requireFeature,
  isLicenseActive,
  requireActiveLicense,
  loadLicenseContext,
  clearLicenseCache,
  clearAllLicenseCaches,
  createLicenseMiddleware,
  requirePlan,
  type LicenseContext,
} from "../../src/api/middleware/license";
import { DEFAULT_FREE_ENTITLEMENTS } from "../../src/database/schema/licensing";
import {
  createMockLicense,
  createGracePeriodLicense,
  createExpiredLicense,
  createDowngradedLicense,
  FREE_ENTITLEMENTS,
  PRO_ENTITLEMENTS,
  PRO_ENTITLEMENTS,
  ENTERPRISE_ENTITLEMENTS,
  FREE_ORG_LIMITS,
  PROFESSIONAL_ORG_LIMITS,
  ENTERPRISE_ORG_LIMITS,
  planToOrgType,
  getOrgLimitsForType,
} from "../helpers/license";

// ==========================================
// Test Helpers
// ==========================================

/**
 * Create a mock Hono context with optional license context.
 */
function createMockHonoContext(options: {
  license?: LicenseContext | null;
  organizationId?: string;
} = {}): any {
  const store = new Map<string, unknown>();

  if (options.license !== undefined) {
    store.set("license", options.license);
  }
  if (options.organizationId) {
    store.set("organizationId", options.organizationId);
  }

  return {
    get: (key: string) => store.get(key),
    set: (key: string, value: unknown) => store.set(key, value),
  };
}

/**
 * Create a complete LicenseContext with all required fields.
 * Helper to simplify test code.
 */
function createTestLicenseContext(
  partial: Partial<Omit<LicenseContext, "orgType" | "orgLimits" | "enterpriseFeatures">> & {
    plan: LicenseContext["plan"];
    status: LicenseContext["status"];
    entitlements: LicenseContext["entitlements"];
  }
): LicenseContext {
  const orgType = planToOrgType(partial.plan);
  const orgLimits = getOrgLimitsForType(orgType);
  const enterpriseFeatures = orgType === "ENTERPRISE" || orgType === "SELF_HOSTED_ENTERPRISE";

  return {
    ...partial,
    orgType,
    orgLimits,
    enterpriseFeatures,
  };
}

/**
 * Create a license context from a mock license.
 */
function mockLicenseToContext(
  license: ReturnType<typeof createMockLicense>
): LicenseContext {
  let status: LicenseContext["status"] = license.status;
  let gracePeriodDaysRemaining: number | undefined;

  if (license.gracePeriodStatus === "active" && license.gracePeriodEndsAt) {
    status = "grace_period";
    gracePeriodDaysRemaining = Math.max(
      0,
      Math.ceil(
        (license.gracePeriodEndsAt.getTime() - Date.now()) /
          (24 * 60 * 60 * 1000)
      )
    );
  } else if (license.gracePeriodStatus === "expired") {
    status = "downgraded";
  }

  // Get org type based on plan
  const orgType = planToOrgType(license.plan);
  const orgLimits = getOrgLimitsForType(orgType);
  const enterpriseFeatures = orgType === "ENTERPRISE" || orgType === "SELF_HOSTED_ENTERPRISE";

  return {
    plan: license.plan as LicenseContext["plan"],
    status,
    gracePeriodDaysRemaining,
    entitlements: license.entitlements,
    license: {
      id: license.id,
      key: license.key,
      expiresAt: license.expiresAt,
      licenseeEmail: license.licenseeEmail,
      licenseeName: license.licenseeName,
    },
    orgType,
    orgLimits,
    enterpriseFeatures,
  };
}

// ==========================================
// getLicenseContext Tests
// ==========================================

describe("getLicenseContext", () => {
  it("returns free tier context when no license is set", () => {
    const mockContext = createMockHonoContext({ license: null });
    const context = getLicenseContext(mockContext);

    expect(context.plan).toBe("free");
    expect(context.status).toBe("no_license");
    expect(context.entitlements).toEqual(DEFAULT_FREE_ENTITLEMENTS);
  });

  it("returns free tier context when license is undefined", () => {
    const mockContext = createMockHonoContext({});
    const context = getLicenseContext(mockContext);

    expect(context.plan).toBe("free");
    expect(context.status).toBe("no_license");
    expect(context.entitlements).toEqual(DEFAULT_FREE_ENTITLEMENTS);
  });

  it("returns active license context with correct entitlements", () => {
    const license = createMockLicense({ plan: "pro" });
    const licenseContext = mockLicenseToContext(license);
    const mockContext = createMockHonoContext({ license: licenseContext });

    const context = getLicenseContext(mockContext);

    expect(context.plan).toBe("pro");
    expect(context.status).toBe("active");
    expect(context.entitlements.monitors).toBe(25);
    expect(context.entitlements.statusPages).toBe(5);
  });

  it("returns business license context with full entitlements", () => {
    const license = createMockLicense({ plan: "pro" });
    const licenseContext = mockLicenseToContext(license);
    const mockContext = createMockHonoContext({ license: licenseContext });

    const context = getLicenseContext(mockContext);

    expect(context.plan).toBe("pro");
    expect(context.entitlements.multiRegion).toBe(true);
  });

  it("includes grace period info when license is in grace period", () => {
    const license = createGracePeriodLicense(3);
    const licenseContext = mockLicenseToContext(license);
    const mockContext = createMockHonoContext({ license: licenseContext });

    const context = getLicenseContext(mockContext);

    expect(context.status).toBe("grace_period");
    expect(context.gracePeriodDaysRemaining).toBeDefined();
    expect(context.gracePeriodDaysRemaining).toBeGreaterThanOrEqual(2);
    expect(context.gracePeriodDaysRemaining).toBeLessThanOrEqual(4);
  });

  it("returns downgraded status when grace period is expired", () => {
    const license = createDowngradedLicense();
    const licenseContext = mockLicenseToContext(license);
    const mockContext = createMockHonoContext({ license: licenseContext });

    const context = getLicenseContext(mockContext);

    expect(context.status).toBe("downgraded");
    expect(context.entitlements).toEqual(FREE_ENTITLEMENTS);
  });
});

// ==========================================
// checkResourceLimit Tests
// ==========================================

describe("checkResourceLimit", () => {
  it("allows creation when under limit", () => {
    const context = createTestLicenseContext({
      plan: "pro",
      status: "active",
      entitlements: PRO_ENTITLEMENTS,
    });

    // PROFESSIONAL org type has 50 monitors
    expect(checkResourceLimit(context, "monitors", 10)).toBe(true);
    expect(checkResourceLimit(context, "monitors", 49)).toBe(true);
  });

  it("returns false when at limit", () => {
    const context = createTestLicenseContext({
      plan: "pro",
      status: "active",
      entitlements: PRO_ENTITLEMENTS,
    });

    // PROFESSIONAL org type has 50 monitors
    expect(checkResourceLimit(context, "monitors", 50)).toBe(false);
    expect(checkResourceLimit(context, "monitors", 51)).toBe(false);
  });

  it("allows unlimited when entitlement is -1", () => {
    const context = createTestLicenseContext({
      plan: "enterprise",
      status: "active",
      entitlements: ENTERPRISE_ENTITLEMENTS,
    });

    // ENTERPRISE org type has unlimited (-1) monitors
    expect(checkResourceLimit(context, "monitors", 0)).toBe(true);
    expect(checkResourceLimit(context, "monitors", 1000)).toBe(true);
    expect(checkResourceLimit(context, "monitors", 10000)).toBe(true);
  });

  it("checks all resource types correctly", () => {
    const context = createTestLicenseContext({
      plan: "pro",
      status: "active",
      entitlements: PRO_ENTITLEMENTS,
    });

    // PROFESSIONAL org type limits:
    // Monitors: 50 limit
    expect(checkResourceLimit(context, "monitors", 49)).toBe(true);
    expect(checkResourceLimit(context, "monitors", 50)).toBe(false);

    // Status Pages: 10 limit
    expect(checkResourceLimit(context, "statusPages", 9)).toBe(true);
    expect(checkResourceLimit(context, "statusPages", 10)).toBe(false);

    // Team Members: 5 limit
    expect(checkResourceLimit(context, "teamMembers", 4)).toBe(true);
    expect(checkResourceLimit(context, "teamMembers", 5)).toBe(false);

    // Regions: 3 limit
    expect(checkResourceLimit(context, "regions", 2)).toBe(true);
    expect(checkResourceLimit(context, "regions", 3)).toBe(false);
  });

  it("enforces free tier limits correctly", () => {
    const context = createTestLicenseContext({
      plan: "free",
      status: "no_license",
      entitlements: FREE_ENTITLEMENTS,
    });

    // FREE org type limits: 10 monitors, 2 status pages, -1 (unlimited) team members
    expect(checkResourceLimit(context, "monitors", 9)).toBe(true);
    expect(checkResourceLimit(context, "monitors", 10)).toBe(false);
    expect(checkResourceLimit(context, "statusPages", 1)).toBe(true);
    expect(checkResourceLimit(context, "statusPages", 2)).toBe(false);
  });
});

// ==========================================
// requireResourceLimit Tests
// ==========================================

describe("requireResourceLimit", () => {
  it("does not throw when under limit", () => {
    const context = createTestLicenseContext({
      plan: "pro",
      status: "active",
      entitlements: PRO_ENTITLEMENTS,
    });

    expect(() =>
      requireResourceLimit(context, "monitors", 10, "Monitor")
    ).not.toThrow();
  });

  it("throws HTTPException 403 when at limit", () => {
    const context = createTestLicenseContext({
      plan: "pro",
      status: "active",
      entitlements: PRO_ENTITLEMENTS,
    });

    // PROFESSIONAL has 50 monitors limit
    expect(() =>
      requireResourceLimit(context, "monitors", 50, "Monitor")
    ).toThrow();

    try {
      requireResourceLimit(context, "monitors", 50, "Monitor");
    } catch (error: any) {
      expect(error.status).toBe(403);
      expect(error.message).toContain("Monitor limit reached");
      expect(error.message).toContain("50");
    }
  });

  it("does not throw for unlimited resources", () => {
    const context = createTestLicenseContext({
      plan: "enterprise",
      status: "active",
      entitlements: ENTERPRISE_ENTITLEMENTS,
    });

    expect(() =>
      requireResourceLimit(context, "monitors", 10000, "Monitor")
    ).not.toThrow();
  });

  it("uses default resource name when not provided", () => {
    const context = createTestLicenseContext({
      plan: "free",
      status: "no_license",
      entitlements: FREE_ENTITLEMENTS,
    });

    try {
      // FREE has 10 monitors limit
      requireResourceLimit(context, "monitors", 10);
    } catch (error: any) {
      expect(error.message).toContain("Monitors");
    }
  });
});

// ==========================================
// checkFeature Tests
// ==========================================

describe("checkFeature", () => {
  it("returns true when feature is enabled", () => {
    const context = createTestLicenseContext({
      plan: "pro",
      status: "active",
      entitlements: PRO_ENTITLEMENTS,
    });

    expect(checkFeature(context, "auditLogs")).toBe(true);
    expect(checkFeature(context, "sso")).toBe(true);
    expect(checkFeature(context, "slo")).toBe(true);
    expect(checkFeature(context, "reports")).toBe(true);
  });

  it("returns false when feature is disabled", () => {
    const context = createTestLicenseContext({
      plan: "free",
      status: "no_license",
      entitlements: FREE_ENTITLEMENTS,
    });

    expect(checkFeature(context, "auditLogs")).toBe(false);
    expect(checkFeature(context, "sso")).toBe(false);
    expect(checkFeature(context, "customRoles")).toBe(false);
    expect(checkFeature(context, "slo")).toBe(false);
    expect(checkFeature(context, "reports")).toBe(false);
    expect(checkFeature(context, "multiRegion")).toBe(false);
  });

  it("correctly differentiates between pro and business features", () => {
    const proContext = createTestLicenseContext({
      plan: "pro",
      status: "active",
      entitlements: PRO_ENTITLEMENTS,
    });

    // Pro has SLO, reports, multiRegion but not audit logs or SSO
    expect(checkFeature(proContext, "slo")).toBe(true);
    expect(checkFeature(proContext, "reports")).toBe(true);
    expect(checkFeature(proContext, "multiRegion")).toBe(true);
    expect(checkFeature(proContext, "auditLogs")).toBe(false);
    expect(checkFeature(proContext, "sso")).toBe(false);
  });
});

// ==========================================
// requireFeature Tests
// ==========================================

describe("requireFeature", () => {
  it("does not throw when feature is enabled", () => {
    const context = createTestLicenseContext({
      plan: "pro",
      status: "active",
      entitlements: PRO_ENTITLEMENTS,
    });

    expect(() => requireFeature(context, "auditLogs")).not.toThrow();
    expect(() => requireFeature(context, "sso")).not.toThrow();
  });

  it("throws HTTPException 403 when feature is disabled", () => {
    const context = createTestLicenseContext({
      plan: "free",
      status: "no_license",
      entitlements: FREE_ENTITLEMENTS,
    });

    expect(() => requireFeature(context, "auditLogs")).toThrow();

    try {
      requireFeature(context, "auditLogs");
    } catch (error: any) {
      expect(error.status).toBe(403);
      expect(error.message).toContain("Audit logs");
      expect(error.message).toContain("Business");
    }
  });

  it("uses custom feature name when provided", () => {
    const context = createTestLicenseContext({
      plan: "free",
      status: "no_license",
      entitlements: FREE_ENTITLEMENTS,
    });

    try {
      requireFeature(context, "sso", "Single Sign-On");
    } catch (error: any) {
      expect(error.message).toContain("Single Sign-On");
    }
  });
});

// ==========================================
// isLicenseActive Tests
// ==========================================

describe("isLicenseActive", () => {
  it("returns true for active licenses", () => {
    const context = createTestLicenseContext({
      plan: "pro",
      status: "active",
      entitlements: PRO_ENTITLEMENTS,
    });

    expect(isLicenseActive(context)).toBe(true);
  });

  it("returns true for licenses in grace period", () => {
    const context = createTestLicenseContext({
      plan: "pro",
      status: "grace_period",
      gracePeriodDaysRemaining: 3,
      entitlements: PRO_ENTITLEMENTS,
    });

    expect(isLicenseActive(context)).toBe(true);
  });

  it("returns false for expired licenses", () => {
    const context = createTestLicenseContext({
      plan: "pro",
      status: "expired",
      entitlements: PRO_ENTITLEMENTS,
    });

    expect(isLicenseActive(context)).toBe(false);
  });

  it("returns false for downgraded licenses", () => {
    const context = createTestLicenseContext({
      plan: "free",
      status: "downgraded",
      entitlements: FREE_ENTITLEMENTS,
    });

    expect(isLicenseActive(context)).toBe(false);
  });

  it("returns false for suspended licenses (without grace period)", () => {
    const context = createTestLicenseContext({
      plan: "pro",
      status: "suspended",
      entitlements: PRO_ENTITLEMENTS,
    });

    expect(isLicenseActive(context)).toBe(false);
  });
});

// ==========================================
// requireActiveLicense Tests
// ==========================================

describe("requireActiveLicense", () => {
  it("does not throw for active licenses", () => {
    const context = createTestLicenseContext({
      plan: "pro",
      status: "active",
      entitlements: PRO_ENTITLEMENTS,
    });

    expect(() => requireActiveLicense(context)).not.toThrow();
  });

  it("does not throw for licenses in grace period", () => {
    const context = createTestLicenseContext({
      plan: "pro",
      status: "grace_period",
      gracePeriodDaysRemaining: 3,
      entitlements: PRO_ENTITLEMENTS,
    });

    expect(() => requireActiveLicense(context)).not.toThrow();
  });

  it("does not throw when there is no license (free tier)", () => {
    const context = createTestLicenseContext({
      plan: "free",
      status: "no_license",
      entitlements: FREE_ENTITLEMENTS,
    });

    expect(() => requireActiveLicense(context)).not.toThrow();
  });

  it("throws for expired licenses", () => {
    const context = createTestLicenseContext({
      plan: "pro",
      status: "expired",
      entitlements: PRO_ENTITLEMENTS,
    });

    expect(() => requireActiveLicense(context)).toThrow();

    try {
      requireActiveLicense(context);
    } catch (error: any) {
      expect(error.status).toBe(403);
      expect(error.message).toContain("not active");
    }
  });

  it("throws for downgraded licenses", () => {
    const context = createTestLicenseContext({
      plan: "free",
      status: "downgraded",
      entitlements: FREE_ENTITLEMENTS,
    });

    expect(() => requireActiveLicense(context)).toThrow();
  });
});

// ==========================================
// Cache Tests
// ==========================================

describe("License Cache", () => {
  afterEach(() => {
    clearAllLicenseCaches();
  });

  it("clearLicenseCache removes specific organization cache", () => {
    // This is more of an integration test, but we can test the function exists
    expect(() => clearLicenseCache("org_123")).not.toThrow();
  });

  it("clearAllLicenseCaches clears all caches", () => {
    expect(() => clearAllLicenseCaches()).not.toThrow();
  });
});

// ==========================================
// requirePlan Middleware Tests
// ==========================================

describe("requirePlan middleware", () => {
  it("allows access when plan level is sufficient", async () => {
    const context = createTestLicenseContext({
      plan: "pro",
      status: "active",
      entitlements: PRO_ENTITLEMENTS,
    });
    const mockContext = createMockHonoContext({ license: context });

    const middleware = requirePlan("pro");
    const next = vi.fn().mockResolvedValue(undefined);

    await expect(middleware(mockContext, next)).resolves.not.toThrow();
    expect(next).toHaveBeenCalled();
  });

  it("throws 403 when plan level is insufficient", async () => {
    const context = createTestLicenseContext({
      plan: "pro",
      status: "active",
      entitlements: PRO_ENTITLEMENTS,
    });
    const mockContext = createMockHonoContext({ license: context });

    const middleware = requirePlan("enterprise");
    const next = vi.fn().mockResolvedValue(undefined);

    await expect(middleware(mockContext, next)).rejects.toThrow();
    expect(next).not.toHaveBeenCalled();
  });

  it("handles enterprise plan correctly", async () => {
    const context = createTestLicenseContext({
      plan: "enterprise",
      status: "active",
      entitlements: ENTERPRISE_ENTITLEMENTS,
    });
    const mockContext = createMockHonoContext({ license: context });

    const middleware = requirePlan("enterprise");
    const next = vi.fn().mockResolvedValue(undefined);

    await expect(middleware(mockContext, next)).resolves.not.toThrow();
    expect(next).toHaveBeenCalled();
  });

  it("rejects free tier for any paid plan requirement", async () => {
    const context = createTestLicenseContext({
      plan: "free",
      status: "no_license",
      entitlements: FREE_ENTITLEMENTS,
    });
    const mockContext = createMockHonoContext({ license: context });

    const middleware = requirePlan("pro");
    const next = vi.fn().mockResolvedValue(undefined);

    await expect(middleware(mockContext, next)).rejects.toThrow();
    expect(next).not.toHaveBeenCalled();
  });
});

// ==========================================
// createLicenseMiddleware Tests
// ==========================================

describe("createLicenseMiddleware", () => {
  it("creates middleware function", () => {
    const middleware = createLicenseMiddleware();
    expect(typeof middleware).toBe("function");
  });

  it("sets free tier defaults when no organization ID", async () => {
    const mockContext = createMockHonoContext({});
    const middleware = createLicenseMiddleware();
    const next = vi.fn().mockResolvedValue(undefined);

    await middleware(mockContext, next);

    const license = mockContext.get("license");
    expect(license).toBeDefined();
    expect(license.plan).toBe("free");
    expect(license.status).toBe("no_license");
    expect(next).toHaveBeenCalled();
  });
});
