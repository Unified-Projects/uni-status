/**
 * Keygen Client Unit Tests
 *
 * Tests for the Keygen.sh API client including:
 * - License validation (online)
 * - Offline verification
 * - Entitlement mapping
 * - API error handling
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  KeygenClient,
  validateLicenseOnline,
  getLicense,
  getLicenseEntitlements,
  activateMachine,
  deactivateMachine,
  createCheckoutUrl,
  getPortalUrl,
  verifyLicenseOffline,
  verifyWebhookSignature,
  mapKeygenEntitlements,
  mapKeygenLicenseStatus,
  initKeygenConfig,
  resetKeygenConfig,
  isKeygenConfigured,
  type KeygenValidationResult,
  type KeygenLicense,
  type KeygenEntitlement,
} from "@uni-status/shared/lib/keygen";
import {
  createMockLicense,
  PRO_ENTITLEMENTS,
  PRO_ENTITLEMENTS,
} from "../helpers/license";
import {
  createValidKeygenResponse,
  createExpiredKeygenResponse,
  createSuspendedKeygenResponse,
  createRevokedKeygenResponse,
  mockLicenseToKeygenLicense,
  mockEntitlementsToKeygenEntitlements,
  createMockKeygenFetchResponse,
} from "../helpers/keygen";

// ==========================================
// Test Setup
// ==========================================

describe("KeygenClient", () => {
  beforeEach(() => {
    // Reset config and set up test environment
    resetKeygenConfig();
    process.env.UNI_STATUS_KEYGEN_ACCOUNT_ID = "test-account";
    process.env.UNI_STATUS_KEYGEN_API_URL = "https://api.keygen.sh";
    process.env.UNI_STATUS_KEYGEN_API_TOKEN = "test-token";
  });

  afterEach(() => {
    vi.restoreAllMocks();
    resetKeygenConfig();
  });

  // ==========================================
  // Configuration Tests
  // ==========================================

  describe("Configuration", () => {
    it("initializes config from environment variables", () => {
      const config = initKeygenConfig();

      expect(config.accountId).toBe("test-account");
      expect(config.apiUrl).toBe("https://api.keygen.sh");
      expect(config.apiToken).toBe("test-token");
    });

    it("uses default API URL when not set", () => {
      resetKeygenConfig();
      delete process.env.UNI_STATUS_KEYGEN_API_URL;

      const config = initKeygenConfig();

      expect(config.apiUrl).toBe("https://api.keygen.sh");
    });

    it("isKeygenConfigured returns true when account ID is set", () => {
      expect(isKeygenConfigured()).toBe(true);
    });

    it("isKeygenConfigured returns false when account ID is missing", () => {
      resetKeygenConfig();
      delete process.env.UNI_STATUS_KEYGEN_ACCOUNT_ID;

      expect(isKeygenConfigured()).toBe(false);
    });
  });

  // ==========================================
  // validateLicenseOnline Tests
  // ==========================================

  describe("validateLicenseOnline", () => {
    it("returns valid response for active license", async () => {
      const license = createMockLicense();
      const expectedResponse = createValidKeygenResponse(license);

      vi.spyOn(global, "fetch").mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            meta: {
              valid: true,
              code: "VALID",
              detail: "License is valid",
            },
            data: mockLicenseToKeygenLicense(license),
            included: mockEntitlementsToKeygenEntitlements(license.entitlements),
          }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        )
      );

      const result = await validateLicenseOnline(license.key);

      expect(result.valid).toBe(true);
      expect(result.code).toBe("VALID");
      expect(result.license).toBeDefined();
      expect(result.entitlements).toBeDefined();
    });

    it("returns invalid response for expired license", async () => {
      vi.spyOn(global, "fetch").mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            meta: {
              valid: false,
              code: "EXPIRED",
              detail: "License has expired",
            },
            data: null,
          }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        )
      );

      const result = await validateLicenseOnline("expired-key");

      expect(result.valid).toBe(false);
      expect(result.code).toBe("EXPIRED");
    });

    it("returns suspended response for suspended license", async () => {
      vi.spyOn(global, "fetch").mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            meta: {
              valid: false,
              code: "SUSPENDED",
              detail: "License has been suspended",
            },
            data: null,
          }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        )
      );

      const result = await validateLicenseOnline("suspended-key");

      expect(result.valid).toBe(false);
      expect(result.code).toBe("SUSPENDED");
    });

    it("handles network errors gracefully", async () => {
      vi.spyOn(global, "fetch").mockRejectedValueOnce(
        new Error("Network error")
      );

      await expect(validateLicenseOnline("any-key")).rejects.toThrow(
        "Network error"
      );
    });

    it("includes fingerprint in validation request when provided", async () => {
      const fetchSpy = vi.spyOn(global, "fetch").mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            meta: { valid: true, code: "VALID", detail: "" },
            data: null,
          }),
          { status: 200 }
        )
      );

      await validateLicenseOnline("test-key", { fingerprint: "fp_test123" });

      expect(fetchSpy).toHaveBeenCalled();
      const callBody = JSON.parse(fetchSpy.mock.calls[0][1]?.body as string);
      expect(callBody.meta.scope.fingerprint).toBe("fp_test123");
    });
  });

  // ==========================================
  // getLicense Tests
  // ==========================================

  describe("getLicense", () => {
    it("fetches license by ID", async () => {
      const license = createMockLicense();
      const keygenLicense = mockLicenseToKeygenLicense(license);

      vi.spyOn(global, "fetch").mockResolvedValueOnce(
        new Response(JSON.stringify({ data: keygenLicense }), { status: 200 })
      );

      const result = await getLicense(license.keygenLicenseId);

      expect(result.id).toBe(license.keygenLicenseId);
      expect(result.attributes.key).toBe(license.key);
    });

    it("throws error for non-existent license", async () => {
      vi.spyOn(global, "fetch").mockResolvedValueOnce(
        new Response(JSON.stringify({ errors: [{ detail: "Not found" }] }), {
          status: 404,
          statusText: "Not Found",
        })
      );

      await expect(getLicense("non-existent")).rejects.toThrow();
    });
  });

  // ==========================================
  // getLicenseEntitlements Tests
  // ==========================================

  describe("getLicenseEntitlements", () => {
    it("fetches entitlements for a license", async () => {
      const license = createMockLicense({ plan: "pro" });
      const entitlements = mockEntitlementsToKeygenEntitlements(
        license.entitlements
      );

      vi.spyOn(global, "fetch").mockResolvedValueOnce(
        new Response(JSON.stringify({ data: entitlements }), { status: 200 })
      );

      const result = await getLicenseEntitlements(license.keygenLicenseId);

      expect(Array.isArray(result)).toBe(true);
      expect(result.length).toBeGreaterThan(0);
    });
  });

  // ==========================================
  // activateMachine Tests
  // ==========================================

  describe("activateMachine", () => {
    it("activates a machine for a license", async () => {
      const machineData = {
        id: "mach_123",
        type: "machines",
        attributes: {
          fingerprint: "fp_test",
          name: "Test Machine",
          ip: null,
          hostname: null,
          platform: "linux",
          cores: 4,
          created: new Date().toISOString(),
          updated: new Date().toISOString(),
          lastHeartbeat: null,
          metadata: {},
        },
      };

      vi.spyOn(global, "fetch").mockResolvedValueOnce(
        new Response(JSON.stringify({ data: machineData }), { status: 201 })
      );

      const result = await activateMachine("lic_123", "fp_test", {
        name: "Test Machine",
        platform: "linux",
        cores: 4,
      });

      expect(result.id).toBe("mach_123");
      expect(result.attributes.fingerprint).toBe("fp_test");
    });
  });

  // ==========================================
  // deactivateMachine Tests
  // ==========================================

  describe("deactivateMachine", () => {
    it("deactivates a machine", async () => {
      vi.spyOn(global, "fetch").mockResolvedValueOnce(
        new Response(null, { status: 204 })
      );

      await expect(deactivateMachine("mach_123")).resolves.not.toThrow();
    });
  });

  // ==========================================
  // URL Generation Tests
  // ==========================================

  describe("createCheckoutUrl", () => {
    it("generates checkout URL with policy ID", () => {
      const url = createCheckoutUrl("policy_pro");

      expect(url).toContain("portal.keygen.sh");
      expect(url).toContain("test-account");
      expect(url).toContain("policy=policy_pro");
    });

    it("includes email when provided", () => {
      const url = createCheckoutUrl("policy_pro", {
        email: "test@example.com",
      });

      expect(url).toContain("email=test%40example.com");
    });

    it("includes organization ID in metadata", () => {
      const url = createCheckoutUrl("policy_pro", {
        organizationId: "org_123",
      });

      expect(url).toContain("metadata%5BorganizationId%5D=org_123");
    });

    it("includes success and cancel URLs", () => {
      const url = createCheckoutUrl("policy_pro", {
        successUrl: "https://example.com/success",
        cancelUrl: "https://example.com/cancel",
      });

      expect(url).toContain("success_url=");
      expect(url).toContain("cancel_url=");
    });
  });

  describe("getPortalUrl", () => {
    it("generates portal URL without license key", () => {
      const url = getPortalUrl();

      expect(url).toContain("portal.keygen.sh");
      expect(url).toContain("test-account");
    });

    it("includes license key when provided", () => {
      const url = getPortalUrl("UNIS-TEST-KEY");

      expect(url).toContain("license=UNIS-TEST-KEY");
    });
  });

  // ==========================================
  // mapKeygenEntitlements Tests
  // ==========================================

  describe("mapKeygenEntitlements", () => {
    it("maps resource limits from metadata correctly", () => {
      const keygenEntitlements: KeygenEntitlement[] = [
        {
          id: "ent_1",
          type: "entitlements",
          attributes: {
            name: "Pro Plan",
            code: "pro-plan",
            created: new Date().toISOString(),
            updated: new Date().toISOString(),
            metadata: { monitors: 25, statusPages: 5 },
          },
        },
      ];

      const result = mapKeygenEntitlements(keygenEntitlements);

      expect(result.monitors).toBe(25);
      expect(result.statusPages).toBe(5);
    });

    it("maps feature flags from metadata correctly", () => {
      const keygenEntitlements: KeygenEntitlement[] = [
        {
          id: "ent_1",
          type: "entitlements",
          attributes: {
            name: "Enterprise Features",
            code: "enterprise-features",
            created: new Date().toISOString(),
            updated: new Date().toISOString(),
            metadata: { auditLogs: true, sso: true },
          },
        },
      ];

      const result = mapKeygenEntitlements(keygenEntitlements);

      expect(result.auditLogs).toBe(true);
      expect(result.sso).toBe(true);
    });

    it("combines multiple entitlements (sums limits, ORs booleans)", () => {
      const keygenEntitlements: KeygenEntitlement[] = [
        {
          id: "ent_1",
          type: "entitlements",
          attributes: {
            name: "Pro Plan",
            code: "pro-plan",
            created: new Date().toISOString(),
            updated: new Date().toISOString(),
            metadata: { monitors: 50, teamMembers: 10, multiRegion: true },
          },
        },
        {
          id: "ent_2",
          type: "entitlements",
          attributes: {
            name: "Monitors Addon",
            code: "monitors-addon",
            created: new Date().toISOString(),
            updated: new Date().toISOString(),
            metadata: { monitors: 25 },
          },
        },
      ];

      const result = mapKeygenEntitlements(keygenEntitlements);

      expect(result.monitors).toBe(75); // 50 + 25
      expect(result.teamMembers).toBe(10);
      expect(result.multiRegion).toBe(true);
    });

    it("returns defaults for missing entitlements", () => {
      const result = mapKeygenEntitlements([]);

      expect(result.monitors).toBe(5);
      expect(result.statusPages).toBe(1);
      expect(result.auditLogs).toBe(false);
    });

    it("handles unlimited (-1) values", () => {
      const keygenEntitlements: KeygenEntitlement[] = [
        {
          id: "ent_1",
          type: "entitlements",
          attributes: {
            name: "Enterprise Plan",
            code: "enterprise-plan",
            created: new Date().toISOString(),
            updated: new Date().toISOString(),
            metadata: { monitors: -1, statusPages: -1 },
          },
        },
      ];

      const result = mapKeygenEntitlements(keygenEntitlements);

      expect(result.monitors).toBe(-1);
      expect(result.statusPages).toBe(-1);
    });

    it("unlimited wins when combined with limited", () => {
      const keygenEntitlements: KeygenEntitlement[] = [
        {
          id: "ent_1",
          type: "entitlements",
          attributes: {
            name: "Base Plan",
            code: "base",
            created: new Date().toISOString(),
            updated: new Date().toISOString(),
            metadata: { monitors: 50 },
          },
        },
        {
          id: "ent_2",
          type: "entitlements",
          attributes: {
            name: "Unlimited Addon",
            code: "unlimited-addon",
            created: new Date().toISOString(),
            updated: new Date().toISOString(),
            metadata: { monitors: -1 },
          },
        },
      ];

      const result = mapKeygenEntitlements(keygenEntitlements);

      expect(result.monitors).toBe(-1); // unlimited wins
    });
  });

  // ==========================================
  // mapKeygenLicenseStatus Tests
  // ==========================================

  describe("mapKeygenLicenseStatus", () => {
    it("maps ACTIVE to active", () => {
      expect(mapKeygenLicenseStatus("ACTIVE")).toBe("active");
    });

    it("maps EXPIRED to expired", () => {
      expect(mapKeygenLicenseStatus("EXPIRED")).toBe("expired");
    });

    it("maps SUSPENDED to suspended", () => {
      expect(mapKeygenLicenseStatus("SUSPENDED")).toBe("suspended");
    });

    it("maps BANNED to revoked", () => {
      expect(mapKeygenLicenseStatus("BANNED")).toBe("revoked");
    });

    it("maps INACTIVE to revoked", () => {
      expect(mapKeygenLicenseStatus("INACTIVE")).toBe("revoked");
    });
  });

  // ==========================================
  // KeygenClient Class Tests
  // ==========================================

  describe("KeygenClient Class", () => {
    let client: KeygenClient;

    beforeEach(() => {
      client = new KeygenClient();
    });

    it("creates client with default config", () => {
      expect(client).toBeDefined();
    });

    it("creates client with custom config", () => {
      const customClient = new KeygenClient({
        accountId: "custom-account",
        apiUrl: "https://custom.api.keygen.sh",
      });

      expect(customClient).toBeDefined();
    });

    it("validateLicense delegates to validateLicenseOnline", async () => {
      vi.spyOn(global, "fetch").mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            meta: { valid: true, code: "VALID", detail: "" },
            data: null,
          }),
          { status: 200 }
        )
      );

      const result = await client.validateLicense("test-key");

      expect(result.valid).toBe(true);
    });

    it("verifyOffline uses configured public key", () => {
      process.env.UNI_STATUS_KEYGEN_PUBLIC_KEY = "test-public-key";
      resetKeygenConfig();

      const customClient = new KeygenClient();
      const result = customClient.verifyOffline("invalid-key");

      // Should fail validation but not throw
      expect(result.valid).toBe(false);
    });
  });
});

// ==========================================
// Offline Verification Tests
// ==========================================

describe("verifyLicenseOffline", () => {
  beforeEach(() => {
    resetKeygenConfig();
  });

  it("returns error when no public key is configured", () => {
    const result = verifyLicenseOffline("any-key");

    expect(result.valid).toBe(false);
    expect(result.code).toBe("NO_PUBLIC_KEY");
  });

  it("returns error for invalid key format", () => {
    process.env.UNI_STATUS_KEYGEN_PUBLIC_KEY = "test-public-key";
    resetKeygenConfig();

    const result = verifyLicenseOffline("invalid");

    expect(result.valid).toBe(false);
    expect(result.code).toBe("INVALID_FORMAT");
  });

  it("returns error for keys with wrong number of parts", () => {
    process.env.UNI_STATUS_KEYGEN_PUBLIC_KEY = "test-public-key";
    resetKeygenConfig();

    const result = verifyLicenseOffline("key/part1.part2.part3.part4");

    expect(result.valid).toBe(false);
  });
});

// ==========================================
// Webhook Signature Verification Tests
// ==========================================

describe("verifyWebhookSignature", () => {
  it("returns false when no public key is configured", () => {
    resetKeygenConfig();

    const result = verifyWebhookSignature(
      "test-payload",
      "test-signature"
    );

    expect(result).toBe(false);
  });

  it("returns false for invalid signature", () => {
    process.env.UNI_STATUS_KEYGEN_PUBLIC_KEY = "test-public-key";
    resetKeygenConfig();

    const result = verifyWebhookSignature(
      "test-payload",
      "invalid-signature"
    );

    expect(result).toBe(false);
  });
});
