import { bootstrapTestContext, type TestContext } from "../helpers/context";
import {
  initializeSystemSettings,
  getSystemSettings,
  insertSuperAdmin,
  insertUser,
  insertOrganization,
  insertOrganizationMember,
  setUserSystemRole,
  getUserSystemRole,
  clearSystemSettings,
} from "../helpers/data";

const DEFAULT_DB_URL =
  "postgresql://uni_status:uni_status_dev@postgres:5432/uni_status?sslmode=disable";
const API_BASE_URL = process.env.API_BASE_URL ?? "http://api:3001";

describe("Self-hosted setup API", () => {
  let ctx: TestContext;

  beforeAll(async () => {
    ctx = await bootstrapTestContext();
  });

  afterAll(async () => {
    await ctx.cleanup();
  });

  beforeEach(async () => {
    // Clear system settings before each test
    await clearSystemSettings();
  });

  describe("GET /api/v1/system/status", () => {
    it("returns status when no settings exist (fresh install)", async () => {
      const response = await fetch(`${API_BASE_URL}/api/v1/system/status`);
      expect(response.status).toBe(200);

      const body = await response.json();
      expect(body.success).toBe(true);
      expect(body.data).toHaveProperty("setupCompleted");
    });

    it("returns correct status after setup is completed", async () => {
      await initializeSystemSettings({
        setupCompleted: true,
        signupMode: "invite_only",
        primaryOrganizationId: ctx.organizationId,
      });

      const response = await fetch(`${API_BASE_URL}/api/v1/system/status`);
      expect(response.status).toBe(200);

      const body = await response.json();
      expect(body.success).toBe(true);
      expect(body.data.setupCompleted).toBe(true);
      expect(body.data.signupMode).toBe("invite_only");
    });

    it("returns isSelfHosted based on deployment type", async () => {
      await initializeSystemSettings({ setupCompleted: true });

      const response = await fetch(`${API_BASE_URL}/api/v1/system/status`);
      expect(response.status).toBe(200);

      const body = await response.json();
      // isSelfHosted depends on DEPLOYMENT_TYPE env var
      expect(body.data).toHaveProperty("isSelfHosted");
      expect(typeof body.data.isSelfHosted).toBe("boolean");
    });
  });

  describe("POST /api/v1/system/setup", () => {
    it("creates admin, organization, and marks setup complete", async () => {
      // Start with no settings
      await clearSystemSettings();

      const response = await fetch(`${API_BASE_URL}/api/v1/system/setup`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          adminName: "Setup Admin",
          adminEmail: "setup-admin@example.com",
          adminPassword: "SecureP@ss123",
          organizationName: "Setup Test Org",
          organizationSlug: "setup-test-org",
          signupMode: "invite_only",
        }),
      });

      expect(response.status).toBe(200);

      const body = await response.json();
      expect(body.success).toBe(true);
      expect(body.data).toHaveProperty("organizationId");
      expect(body.data).toHaveProperty("userId");

      // Verify settings were updated
      const settings = await getSystemSettings();
      expect(settings).not.toBeNull();
      expect(settings?.setupCompleted).toBe(true);
      expect(settings?.signupMode).toBe("invite_only");
      expect(settings?.primaryOrganizationId).toBe(body.data.organizationId);

      // Verify user is super admin
      const systemRole = await getUserSystemRole(body.data.userId);
      expect(systemRole).toBe("super_admin");
    });

    it("rejects setup if already completed", async () => {
      await initializeSystemSettings({
        setupCompleted: true,
        primaryOrganizationId: ctx.organizationId,
      });

      const response = await fetch(`${API_BASE_URL}/api/v1/system/setup`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          adminName: "Another Admin",
          adminEmail: "another-admin@example.com",
          adminPassword: "SecureP@ss123",
          organizationName: "Another Org",
          organizationSlug: "another-org",
          signupMode: "invite_only",
        }),
      });

      expect(response.status).toBe(400);

      const body = await response.json();
      expect(body.success).toBe(false);
      expect(body.error.code).toBe("SETUP_ALREADY_COMPLETE");
    });

    it("validates required fields", async () => {
      const response = await fetch(`${API_BASE_URL}/api/v1/system/setup`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          adminName: "",
          adminEmail: "invalid",
          adminPassword: "short",
          organizationName: "",
          organizationSlug: "",
          signupMode: "invite_only",
        }),
      });

      expect(response.status).toBe(400);
    });

    it("defaults to invite_only for invalid signup mode", async () => {
      // The API defaults invalid signup modes to invite_only rather than rejecting
      const response = await fetch(`${API_BASE_URL}/api/v1/system/setup`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          adminName: "Admin",
          adminEmail: `admin-${Date.now()}@example.com`,
          adminPassword: "SecureP@ss123",
          organizationName: "Test Org",
          organizationSlug: `test-org-${Date.now()}`,
          signupMode: "invalid_mode",
        }),
      });

      expect(response.status).toBe(200);

      // Verify it defaulted to invite_only
      const settings = await getSystemSettings();
      expect(settings?.signupMode).toBe("invite_only");
    });
  });

  describe("GET /api/v1/system/settings", () => {
    it("requires authentication", async () => {
      await initializeSystemSettings({ setupCompleted: true });

      const response = await fetch(`${API_BASE_URL}/api/v1/system/settings`);
      // Returns 403 because no auth means not super admin
      expect(response.status).toBe(403);
    });

    it("requires super admin role", async () => {
      await initializeSystemSettings({
        setupCompleted: true,
        primaryOrganizationId: ctx.organizationId,
      });

      // ctx.token belongs to a non-super-admin user
      const response = await fetch(`${API_BASE_URL}/api/v1/system/settings`, {
        headers: ctx.headers,
      });

      expect(response.status).toBe(403);
    });

    it("returns settings for super admin", async () => {
      await initializeSystemSettings({
        setupCompleted: true,
        signupMode: "open_with_approval",
        primaryOrganizationId: ctx.organizationId,
      });

      // Make user a super admin
      await setUserSystemRole(ctx.userId, "super_admin");

      const response = await fetch(`${API_BASE_URL}/api/v1/system/settings`, {
        headers: ctx.headers,
      });

      expect(response.status).toBe(200);

      const body = await response.json();
      expect(body.success).toBe(true);
      expect(body.data.signupMode).toBe("open_with_approval");
      expect(body.data.setupCompleted).toBe(true);
    });
  });

  describe("PATCH /api/v1/system/settings", () => {
    it("requires super admin role", async () => {
      await initializeSystemSettings({
        setupCompleted: true,
        primaryOrganizationId: ctx.organizationId,
      });

      // Reset to non-super-admin
      await setUserSystemRole(ctx.userId, null);

      const response = await fetch(`${API_BASE_URL}/api/v1/system/settings`, {
        method: "PATCH",
        headers: ctx.headers,
        body: JSON.stringify({ signupMode: "open_with_approval" }),
      });

      expect(response.status).toBe(403);
    });

    it("allows super admin to update signup mode", async () => {
      await initializeSystemSettings({
        setupCompleted: true,
        signupMode: "invite_only",
        primaryOrganizationId: ctx.organizationId,
      });

      await setUserSystemRole(ctx.userId, "super_admin");

      const response = await fetch(`${API_BASE_URL}/api/v1/system/settings`, {
        method: "PATCH",
        headers: ctx.headers,
        body: JSON.stringify({ signupMode: "open_with_approval" }),
      });

      expect(response.status).toBe(200);

      const body = await response.json();
      expect(body.success).toBe(true);
      expect(body.data.signupMode).toBe("open_with_approval");

      // Verify in database
      const settings = await getSystemSettings();
      expect(settings?.signupMode).toBe("open_with_approval");
    });

    it("validates signup mode value", async () => {
      await initializeSystemSettings({
        setupCompleted: true,
        primaryOrganizationId: ctx.organizationId,
      });
      await setUserSystemRole(ctx.userId, "super_admin");

      const response = await fetch(`${API_BASE_URL}/api/v1/system/settings`, {
        method: "PATCH",
        headers: ctx.headers,
        body: JSON.stringify({ signupMode: "invalid_mode" }),
      });

      expect(response.status).toBe(400);
    });
  });
});
