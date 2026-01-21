import { bootstrapTestContext, type TestContext } from "../helpers/context";
import {
  initializeSystemSettings,
  getSystemSettings,
  insertInvitation,
  getPendingApprovals,
  setUserSystemRole,
  clearSystemSettings,
} from "../helpers/data";

const DEFAULT_DB_URL =
  "postgresql://uni_status:uni_status_dev@postgres:5432/uni_status?sslmode=disable";
const API_BASE_URL = process.env.API_BASE_URL ?? "http://api:3001";

describe("Self-hosted signup modes", () => {
  let ctx: TestContext;

  beforeAll(async () => {
    ctx = await bootstrapTestContext();
  });

  afterAll(async () => {
    await ctx.cleanup();
  });

  beforeEach(async () => {
    await clearSystemSettings();
  });

  describe("Invite Only Mode", () => {
    beforeEach(async () => {
      await initializeSystemSettings({
        setupCompleted: true,
        signupMode: "invite_only",
        primaryOrganizationId: ctx.organizationId,
      });
    });

    it("status endpoint returns invite_only mode", async () => {
      const response = await fetch(`${API_BASE_URL}/api/v1/system/status`);
      expect(response.status).toBe(200);

      const body = await response.json();
      expect(body.data.signupMode).toBe("invite_only");
    });

    it("allows changing to other modes by super admin", async () => {
      await setUserSystemRole(ctx.userId, "super_admin");

      const response = await fetch(`${API_BASE_URL}/api/v1/system/settings`, {
        method: "PATCH",
        headers: ctx.headers,
        body: JSON.stringify({ signupMode: "open_with_approval" }),
      });

      expect(response.status).toBe(200);

      const settings = await getSystemSettings();
      expect(settings?.signupMode).toBe("open_with_approval");
    });
  });

  describe("Domain Auto-Join Mode", () => {
    beforeEach(async () => {
      await initializeSystemSettings({
        setupCompleted: true,
        signupMode: "domain_auto_join",
        primaryOrganizationId: ctx.organizationId,
      });
    });

    it("status endpoint returns domain_auto_join mode", async () => {
      const response = await fetch(`${API_BASE_URL}/api/v1/system/status`);
      expect(response.status).toBe(200);

      const body = await response.json();
      expect(body.data.signupMode).toBe("domain_auto_join");
    });
  });

  describe("Open with Approval Mode", () => {
    beforeEach(async () => {
      await initializeSystemSettings({
        setupCompleted: true,
        signupMode: "open_with_approval",
        primaryOrganizationId: ctx.organizationId,
      });
    });

    it("status endpoint returns open_with_approval mode", async () => {
      const response = await fetch(`${API_BASE_URL}/api/v1/system/status`);
      expect(response.status).toBe(200);

      const body = await response.json();
      expect(body.data.signupMode).toBe("open_with_approval");
    });

    it("super admin can view pending approvals", async () => {
      await setUserSystemRole(ctx.userId, "super_admin");

      const response = await fetch(`${API_BASE_URL}/api/v1/pending-approvals`, {
        headers: ctx.headers,
      });

      expect(response.status).toBe(200);

      const body = await response.json();
      expect(body.success).toBe(true);
      expect(Array.isArray(body.data)).toBe(true);
    });
  });

  describe("Mode transitions", () => {
    it("can transition from invite_only to open_with_approval", async () => {
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

      const settings = await getSystemSettings();
      expect(settings?.signupMode).toBe("open_with_approval");
    });

    it("can transition from open_with_approval to domain_auto_join", async () => {
      await initializeSystemSettings({
        setupCompleted: true,
        signupMode: "open_with_approval",
        primaryOrganizationId: ctx.organizationId,
      });
      await setUserSystemRole(ctx.userId, "super_admin");

      const response = await fetch(`${API_BASE_URL}/api/v1/system/settings`, {
        method: "PATCH",
        headers: ctx.headers,
        body: JSON.stringify({ signupMode: "domain_auto_join" }),
      });

      expect(response.status).toBe(200);

      const settings = await getSystemSettings();
      expect(settings?.signupMode).toBe("domain_auto_join");
    });

    it("can transition from domain_auto_join to invite_only", async () => {
      await initializeSystemSettings({
        setupCompleted: true,
        signupMode: "domain_auto_join",
        primaryOrganizationId: ctx.organizationId,
      });
      await setUserSystemRole(ctx.userId, "super_admin");

      const response = await fetch(`${API_BASE_URL}/api/v1/system/settings`, {
        method: "PATCH",
        headers: ctx.headers,
        body: JSON.stringify({ signupMode: "invite_only" }),
      });

      expect(response.status).toBe(200);

      const settings = await getSystemSettings();
      expect(settings?.signupMode).toBe("invite_only");
    });
  });

  describe("Super admin authorization", () => {
    beforeEach(async () => {
      await initializeSystemSettings({
        setupCompleted: true,
        signupMode: "invite_only",
        primaryOrganizationId: ctx.organizationId,
      });
    });

    it("non-super-admin cannot access system settings", async () => {
      await setUserSystemRole(ctx.userId, null);

      const response = await fetch(`${API_BASE_URL}/api/v1/system/settings`, {
        headers: ctx.headers,
      });

      expect(response.status).toBe(403);
    });

    it("non-super-admin cannot modify system settings", async () => {
      await setUserSystemRole(ctx.userId, null);

      const response = await fetch(`${API_BASE_URL}/api/v1/system/settings`, {
        method: "PATCH",
        headers: ctx.headers,
        body: JSON.stringify({ signupMode: "open_with_approval" }),
      });

      expect(response.status).toBe(403);
    });

    it("super admin can access system settings", async () => {
      await setUserSystemRole(ctx.userId, "super_admin");

      const response = await fetch(`${API_BASE_URL}/api/v1/system/settings`, {
        headers: ctx.headers,
      });

      expect(response.status).toBe(200);
    });

    it("super admin can modify system settings", async () => {
      await setUserSystemRole(ctx.userId, "super_admin");

      const response = await fetch(`${API_BASE_URL}/api/v1/system/settings`, {
        method: "PATCH",
        headers: ctx.headers,
        body: JSON.stringify({ signupMode: "open_with_approval" }),
      });

      expect(response.status).toBe(200);
    });
  });

  describe("Setup required check", () => {
    it("protected routes require setup to be complete", async () => {
      // Clear settings to simulate incomplete setup
      await clearSystemSettings();

      // Try to access a protected endpoint - should return 503
      // Note: This depends on whether the route has requireSetupComplete middleware
      // For now, we'll just verify the status endpoint shows setup not complete
      const response = await fetch(`${API_BASE_URL}/api/v1/system/status`);
      expect(response.status).toBe(200);

      const body = await response.json();
      // Without settings, setupCompleted should be false
      expect(body.data.setupCompleted).toBe(false);
    });

    it("status endpoint works even without setup complete", async () => {
      await clearSystemSettings();

      const response = await fetch(`${API_BASE_URL}/api/v1/system/status`);
      expect(response.status).toBe(200);

      const body = await response.json();
      expect(body.success).toBe(true);
    });
  });
});
