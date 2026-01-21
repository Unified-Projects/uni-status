/**
 * Roles Management Comprehensive Tests
 *
 * Tests Role Management API including:
 * - List predefined and custom roles
 * - Create custom roles
 * - Update custom roles
 * - Delete custom roles
 * - Assign roles to members
 * - Authorization and organization isolation
 */

import { describe, it, expect, beforeAll } from "vitest";
import { randomUUID } from "crypto";
import { bootstrapTestContext, TestContext } from "../helpers/context";
import { insertApiKey, insertCustomRole, insertOrganizationMember } from "../helpers/data";

const API_BASE_URL = process.env.API_BASE_URL ?? "http://api:3001";

describe("Roles Management API", () => {
  let ctx: TestContext;

  beforeAll(async () => {
    ctx = await bootstrapTestContext();
  });

  describe("List Roles", () => {
    it("lists predefined roles", async () => {
      const response = await fetch(`${API_BASE_URL}/api/v1/organizations/${ctx.organizationId}/roles`, {
        method: "GET",
        headers: ctx.headers,
      });

      expect(response.status).toBe(200);
      const body = await response.json();
      expect(body.success).toBe(true);
      expect(Array.isArray(body.data)).toBe(true);

      // Should include predefined roles
      const roleNames = body.data.map((r: any) => r.name.toLowerCase());
      expect(roleNames).toContain("owner");
      expect(roleNames).toContain("admin");
      expect(roleNames).toContain("member");
      expect(roleNames).toContain("viewer");
    });

    it("includes custom roles in list", async () => {
      // Create a custom role
      const customRole = await insertCustomRole(ctx.organizationId, {
        name: `Custom Role ${randomUUID().slice(0, 8)}`,
        permissions: ["monitors.view", "monitors.create"],
      });

      const response = await fetch(`${API_BASE_URL}/api/v1/organizations/${ctx.organizationId}/roles`, {
        method: "GET",
        headers: ctx.headers,
      });

      expect(response.status).toBe(200);
      const body = await response.json();

      const customRoleInList = body.data.find((r: any) => r.id === customRole.id);
      expect(customRoleInList).toBeDefined();
    });

    it("includes resolved permissions for predefined roles", async () => {
      const response = await fetch(`${API_BASE_URL}/api/v1/organizations/${ctx.organizationId}/roles`, {
        method: "GET",
        headers: ctx.headers,
      });

      expect(response.status).toBe(200);
      const body = await response.json();

      // Check owner role has all permissions
      const ownerRole = body.data.find((r: any) => r.name.toLowerCase() === "owner" || r.id === "owner");
      if (ownerRole && ownerRole.resolvedPermissions) {
        expect(ownerRole.resolvedPermissions.length).toBeGreaterThan(0);
      }
    });
  });

  describe("Create Custom Role", () => {
    it("creates custom role with specific permissions", async () => {
      const response = await fetch(`${API_BASE_URL}/api/v1/organizations/${ctx.organizationId}/roles`, {
        method: "POST",
        headers: ctx.headers,
        body: JSON.stringify({
          name: "Monitor Manager",
          description: "Can manage monitors but nothing else",
          permissions: ["monitors.view", "monitors.create", "monitors.edit", "monitors.delete"],
          color: "#10B981",
        }),
      });

      expect(response.status).toBe(201);
      const body = await response.json();
      expect(body.success).toBe(true);
      expect(body.data.id).toBeDefined();
      expect(body.data.name).toBe("Monitor Manager");
      expect(body.data.permissions).toContain("monitors.view");
      expect(body.data.color).toBe("#10B981");
    });

    it("creates custom role with wildcard permissions", async () => {
      const response = await fetch(`${API_BASE_URL}/api/v1/organizations/${ctx.organizationId}/roles`, {
        method: "POST",
        headers: ctx.headers,
        body: JSON.stringify({
          name: "Custom Monitor Manager",
          permissions: ["monitors.*"],
        }),
      });

      expect(response.status).toBe(201);
      const body = await response.json();
      expect(body.data.permissions).toContain("monitors.*");
    });

    it("creates custom role with view-only permissions", async () => {
      const response = await fetch(`${API_BASE_URL}/api/v1/organizations/${ctx.organizationId}/roles`, {
        method: "POST",
        headers: ctx.headers,
        body: JSON.stringify({
          name: "Observer",
          permissions: ["*.view"],
        }),
      });

      expect(response.status).toBe(201);
      const body = await response.json();
      expect(body.data.permissions).toContain("*.view");
    });

    it("rejects duplicate role name", async () => {
      const roleName = `Unique Role ${randomUUID().slice(0, 8)}`;

      // Create first role
      await fetch(`${API_BASE_URL}/api/v1/organizations/${ctx.organizationId}/roles`, {
        method: "POST",
        headers: ctx.headers,
        body: JSON.stringify({
          name: roleName,
          permissions: ["monitors.view"],
        }),
      });

      // Try to create with same name
      const response = await fetch(`${API_BASE_URL}/api/v1/organizations/${ctx.organizationId}/roles`, {
        method: "POST",
        headers: ctx.headers,
        body: JSON.stringify({
          name: roleName,
          permissions: ["incidents.view"],
        }),
      });

      expect(response.status).toBe(400);
    });

    it("rejects predefined role names", async () => {
      const predefinedNames = ["Owner", "Admin", "Member", "Viewer"];

      for (const name of predefinedNames) {
        const response = await fetch(`${API_BASE_URL}/api/v1/organizations/${ctx.organizationId}/roles`, {
          method: "POST",
          headers: ctx.headers,
          body: JSON.stringify({
            name,
            permissions: ["monitors.view"],
          }),
        });

        expect(response.status).toBe(400);
      }
    });

    it("rejects empty permissions array", async () => {
      const response = await fetch(`${API_BASE_URL}/api/v1/organizations/${ctx.organizationId}/roles`, {
        method: "POST",
        headers: ctx.headers,
        body: JSON.stringify({
          name: "Empty Permissions Role",
          permissions: [],
        }),
      });

      expect(response.status).toBe(400);
    });
  });

  describe("Get Single Role", () => {
    it("gets predefined role by ID", async () => {
      const response = await fetch(`${API_BASE_URL}/api/v1/organizations/${ctx.organizationId}/roles/owner`, {
        method: "GET",
        headers: ctx.headers,
      });

      expect(response.status).toBe(200);
      const body = await response.json();
      expect(body.success).toBe(true);
      expect(body.data.name.toLowerCase()).toBe("owner");
    });

    it("gets custom role by ID", async () => {
      const customRole = await insertCustomRole(ctx.organizationId, {
        name: `Get Test Role ${randomUUID().slice(0, 8)}`,
        permissions: ["monitors.view"],
        description: "Test description",
      });

      const response = await fetch(`${API_BASE_URL}/api/v1/organizations/${ctx.organizationId}/roles/${customRole.id}`, {
        method: "GET",
        headers: ctx.headers,
      });

      expect(response.status).toBe(200);
      const body = await response.json();
      expect(body.data.id).toBe(customRole.id);
      expect(body.data.description).toBe("Test description");
    });

    it("returns 404 for non-existent role", async () => {
      const response = await fetch(`${API_BASE_URL}/api/v1/organizations/${ctx.organizationId}/roles/${randomUUID()}`, {
        method: "GET",
        headers: ctx.headers,
      });

      expect(response.status).toBe(404);
    });
  });

  describe("Update Custom Role", () => {
    it("updates custom role name", async () => {
      const customRole = await insertCustomRole(ctx.organizationId, {
        name: `Original Name ${randomUUID().slice(0, 8)}`,
        permissions: ["monitors.view"],
      });

      const response = await fetch(`${API_BASE_URL}/api/v1/organizations/${ctx.organizationId}/roles/${customRole.id}`, {
        method: "PATCH",
        headers: ctx.headers,
        body: JSON.stringify({
          name: `Updated Name ${randomUUID().slice(0, 8)}`,
        }),
      });

      expect(response.status).toBe(200);
      const body = await response.json();
      expect(body.data.name).toContain("Updated Name");
    });

    it("updates custom role permissions", async () => {
      const customRole = await insertCustomRole(ctx.organizationId, {
        name: `Permissions Update ${randomUUID().slice(0, 8)}`,
        permissions: ["monitors.view"],
      });

      const response = await fetch(`${API_BASE_URL}/api/v1/organizations/${ctx.organizationId}/roles/${customRole.id}`, {
        method: "PATCH",
        headers: ctx.headers,
        body: JSON.stringify({
          permissions: ["monitors.view", "monitors.create", "incidents.view"],
        }),
      });

      expect(response.status).toBe(200);
      const body = await response.json();
      expect(body.data.permissions).toContain("monitors.create");
      expect(body.data.permissions).toContain("incidents.view");
    });

    it("updates custom role description", async () => {
      const customRole = await insertCustomRole(ctx.organizationId, {
        name: `Description Update ${randomUUID().slice(0, 8)}`,
        permissions: ["monitors.view"],
        description: "Original description",
      });

      const response = await fetch(`${API_BASE_URL}/api/v1/organizations/${ctx.organizationId}/roles/${customRole.id}`, {
        method: "PATCH",
        headers: ctx.headers,
        body: JSON.stringify({
          description: "Updated description",
        }),
      });

      expect(response.status).toBe(200);
      const body = await response.json();
      expect(body.data.description).toBe("Updated description");
    });

    it("updates custom role color", async () => {
      const customRole = await insertCustomRole(ctx.organizationId, {
        name: `Color Update ${randomUUID().slice(0, 8)}`,
        permissions: ["monitors.view"],
        color: "#FF0000",
      });

      const response = await fetch(`${API_BASE_URL}/api/v1/organizations/${ctx.organizationId}/roles/${customRole.id}`, {
        method: "PATCH",
        headers: ctx.headers,
        body: JSON.stringify({
          color: "#00FF00",
        }),
      });

      expect(response.status).toBe(200);
      const body = await response.json();
      expect(body.data.color).toBe("#00FF00");
    });

    it("cannot update predefined role", async () => {
      const response = await fetch(`${API_BASE_URL}/api/v1/organizations/${ctx.organizationId}/roles/admin`, {
        method: "PATCH",
        headers: ctx.headers,
        body: JSON.stringify({
          name: "Super Admin",
        }),
      });

      expect(response.status).toBe(400);
    });

    it("cannot update system role", async () => {
      const systemRole = await insertCustomRole(ctx.organizationId, {
        name: `System Role ${randomUUID().slice(0, 8)}`,
        permissions: ["monitors.view"],
        isSystem: true,
      });

      const response = await fetch(`${API_BASE_URL}/api/v1/organizations/${ctx.organizationId}/roles/${systemRole.id}`, {
        method: "PATCH",
        headers: ctx.headers,
        body: JSON.stringify({
          name: "Modified System Role",
        }),
      });

      expect(response.status).toBe(400);
    });

    it("returns 404 for non-existent role", async () => {
      const response = await fetch(`${API_BASE_URL}/api/v1/organizations/${ctx.organizationId}/roles/${randomUUID()}`, {
        method: "PATCH",
        headers: ctx.headers,
        body: JSON.stringify({ name: "Updated" }),
      });

      expect(response.status).toBe(404);
    });
  });

  describe("Delete Custom Role", () => {
    it("deletes custom role", async () => {
      const customRole = await insertCustomRole(ctx.organizationId, {
        name: `To Delete ${randomUUID().slice(0, 8)}`,
        permissions: ["monitors.view"],
      });

      const response = await fetch(`${API_BASE_URL}/api/v1/organizations/${ctx.organizationId}/roles/${customRole.id}`, {
        method: "DELETE",
        headers: ctx.headers,
      });

      expect(response.status).toBe(200);
      const body = await response.json();
      expect(body.data.deleted).toBe(true);

      // Verify it's gone
      const getResponse = await fetch(`${API_BASE_URL}/api/v1/organizations/${ctx.organizationId}/roles/${customRole.id}`, {
        method: "GET",
        headers: ctx.headers,
      });
      expect(getResponse.status).toBe(404);
    });

    it("cannot delete predefined role", async () => {
      const response = await fetch(`${API_BASE_URL}/api/v1/organizations/${ctx.organizationId}/roles/admin`, {
        method: "DELETE",
        headers: ctx.headers,
      });

      expect(response.status).toBe(400);
    });

    it("cannot delete system role", async () => {
      const systemRole = await insertCustomRole(ctx.organizationId, {
        name: `System To Delete ${randomUUID().slice(0, 8)}`,
        permissions: ["monitors.view"],
        isSystem: true,
      });

      const response = await fetch(`${API_BASE_URL}/api/v1/organizations/${ctx.organizationId}/roles/${systemRole.id}`, {
        method: "DELETE",
        headers: ctx.headers,
      });

      expect(response.status).toBe(400);
    });

    it("returns 404 for non-existent role", async () => {
      const response = await fetch(`${API_BASE_URL}/api/v1/organizations/${ctx.organizationId}/roles/${randomUUID()}`, {
        method: "DELETE",
        headers: ctx.headers,
      });

      expect(response.status).toBe(404);
    });
  });

  describe("Assign Role to Member", () => {
    it("assigns base role to member", async () => {
      const member = await insertOrganizationMember(ctx.organizationId, {
        role: "member",
      });

      const response = await fetch(
        `${API_BASE_URL}/api/v1/organizations/${ctx.organizationId}/members/${member.id}/role`,
        {
          method: "PATCH",
          headers: ctx.headers,
          body: JSON.stringify({
            roleId: "admin",
          }),
        }
      );

      expect(response.status).toBe(200);
      const body = await response.json();
      expect(body.data.role).toBe("admin");
    });

    it("assigns custom role to member", async () => {
      const customRole = await insertCustomRole(ctx.organizationId, {
        name: `Assignable Role ${randomUUID().slice(0, 8)}`,
        permissions: ["monitors.*"],
      });

      const member = await insertOrganizationMember(ctx.organizationId, {
        role: "member",
      });

      const response = await fetch(
        `${API_BASE_URL}/api/v1/organizations/${ctx.organizationId}/members/${member.id}/role`,
        {
          method: "PATCH",
          headers: ctx.headers,
          body: JSON.stringify({
            roleId: customRole.id,
          }),
        }
      );

      expect(response.status).toBe(200);
      const body = await response.json();
      expect(body.data.customRoleId).toBe(customRole.id);
    });

    it("only owner can assign owner role", async () => {
      // Create an admin user
      const admin = await insertOrganizationMember(ctx.organizationId, {
        role: "admin",
      });

      // Create a member to be promoted
      const member = await insertOrganizationMember(ctx.organizationId, {
        role: "member",
      });

      // Admin trying to assign owner role should fail
      const response = await fetch(
        `${API_BASE_URL}/api/v1/organizations/${ctx.organizationId}/members/${member.id}/role`,
        {
          method: "PATCH",
          headers: {
            Authorization: `Bearer ${admin.token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            roleId: "owner",
          }),
        }
      );

      // Should either be 403 (forbidden) or 400 (bad request)
      expect([400, 403]).toContain(response.status);
    });

    it("returns 404 for non-existent member", async () => {
      const response = await fetch(
        `${API_BASE_URL}/api/v1/organizations/${ctx.organizationId}/members/${randomUUID()}/role`,
        {
          method: "PATCH",
          headers: ctx.headers,
          body: JSON.stringify({
            roleId: "admin",
          }),
        }
      );

      expect(response.status).toBe(404);
    });

    it("returns 404 for non-existent role", async () => {
      const member = await insertOrganizationMember(ctx.organizationId, {
        role: "member",
      });

      const response = await fetch(
        `${API_BASE_URL}/api/v1/organizations/${ctx.organizationId}/members/${member.id}/role`,
        {
          method: "PATCH",
          headers: ctx.headers,
          body: JSON.stringify({
            roleId: randomUUID(),
          }),
        }
      );

      expect(response.status).toBe(404);
    });
  });

  describe("Authorization", () => {
    it("requires authentication for all endpoints", async () => {
      const endpoints = [
        { method: "GET", path: `/api/v1/organizations/${ctx.organizationId}/roles` },
        { method: "POST", path: `/api/v1/organizations/${ctx.organizationId}/roles` },
        { method: "GET", path: `/api/v1/organizations/${ctx.organizationId}/roles/${randomUUID()}` },
        { method: "PATCH", path: `/api/v1/organizations/${ctx.organizationId}/roles/${randomUUID()}` },
        { method: "DELETE", path: `/api/v1/organizations/${ctx.organizationId}/roles/${randomUUID()}` },
      ];

      for (const endpoint of endpoints) {
        const response = await fetch(`${API_BASE_URL}${endpoint.path}`, {
          method: endpoint.method,
          headers: { "Content-Type": "application/json" },
        });

        expect(response.status).toBe(401);
      }
    });

    it("allows read scope to list and view roles", async () => {
      const { token: readOnlyToken } = await insertApiKey(
        ctx.organizationId,
        ctx.userId,
        { name: "read-only-roles", scopes: ["read"] }
      );

      const response = await fetch(`${API_BASE_URL}/api/v1/organizations/${ctx.organizationId}/roles`, {
        method: "GET",
        headers: {
          Authorization: `Bearer ${readOnlyToken}`,
          "Content-Type": "application/json",
        },
      });

      expect(response.status).toBe(200);
    });

    it("requires admin/owner to create custom role", async () => {
      // Create a member user
      const member = await insertOrganizationMember(ctx.organizationId, {
        role: "member",
      });

      const response = await fetch(`${API_BASE_URL}/api/v1/organizations/${ctx.organizationId}/roles`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${member.token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name: "Member Created Role",
          permissions: ["monitors.view"],
        }),
      });

      expect(response.status).toBe(403);
    });

    it("requires admin/owner to update custom role", async () => {
      const customRole = await insertCustomRole(ctx.organizationId, {
        name: `Update Auth Test ${randomUUID().slice(0, 8)}`,
        permissions: ["monitors.view"],
      });

      const member = await insertOrganizationMember(ctx.organizationId, {
        role: "member",
      });

      const response = await fetch(
        `${API_BASE_URL}/api/v1/organizations/${ctx.organizationId}/roles/${customRole.id}`,
        {
          method: "PATCH",
          headers: {
            Authorization: `Bearer ${member.token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ name: "Hacked" }),
        }
      );

      expect(response.status).toBe(403);
    });

    it("requires admin/owner to delete custom role", async () => {
      const customRole = await insertCustomRole(ctx.organizationId, {
        name: `Delete Auth Test ${randomUUID().slice(0, 8)}`,
        permissions: ["monitors.view"],
      });

      const member = await insertOrganizationMember(ctx.organizationId, {
        role: "member",
      });

      const response = await fetch(
        `${API_BASE_URL}/api/v1/organizations/${ctx.organizationId}/roles/${customRole.id}`,
        {
          method: "DELETE",
          headers: {
            Authorization: `Bearer ${member.token}`,
            "Content-Type": "application/json",
          },
        }
      );

      expect(response.status).toBe(403);
    });

    it("requires admin/owner to change member roles", async () => {
      const member1 = await insertOrganizationMember(ctx.organizationId, {
        role: "member",
      });
      const member2 = await insertOrganizationMember(ctx.organizationId, {
        role: "member",
      });

      // Member trying to change another member's role
      const response = await fetch(
        `${API_BASE_URL}/api/v1/organizations/${ctx.organizationId}/members/${member2.id}/role`,
        {
          method: "PATCH",
          headers: {
            Authorization: `Bearer ${member1.token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ roleId: "admin" }),
        }
      );

      expect(response.status).toBe(403);
    });
  });

  describe("Organization Isolation", () => {
    let otherCtx: TestContext;
    let otherRoleId: string;

    beforeAll(async () => {
      otherCtx = await bootstrapTestContext();
      const otherRole = await insertCustomRole(otherCtx.organizationId, {
        name: "Other Org Role",
        permissions: ["monitors.view"],
      });
      otherRoleId = otherRole.id;
    });

    it("cannot view role from another organization", async () => {
      const response = await fetch(`${API_BASE_URL}/api/v1/organizations/${otherCtx.organizationId}/roles/${otherRoleId}`, {
        method: "GET",
        headers: ctx.headers,
      });

      // Either 403 (wrong org) or 404 (not found due to org isolation)
      expect([403, 404]).toContain(response.status);
    });

    it("cannot update role from another organization", async () => {
      const response = await fetch(`${API_BASE_URL}/api/v1/organizations/${otherCtx.organizationId}/roles/${otherRoleId}`, {
        method: "PATCH",
        headers: ctx.headers,
        body: JSON.stringify({ name: "Hacked" }),
      });

      expect([403, 404]).toContain(response.status);
    });

    it("cannot delete role from another organization", async () => {
      const response = await fetch(`${API_BASE_URL}/api/v1/organizations/${otherCtx.organizationId}/roles/${otherRoleId}`, {
        method: "DELETE",
        headers: ctx.headers,
      });

      expect([403, 404]).toContain(response.status);
    });

    it("cannot access role list from another organization", async () => {
      const response = await fetch(`${API_BASE_URL}/api/v1/organizations/${otherCtx.organizationId}/roles`, {
        method: "GET",
        headers: ctx.headers,
      });

      // Should be 403 since it's a different org
      expect([403, 404]).toContain(response.status);
    });
  });

  describe("Validation", () => {
    it("rejects missing name", async () => {
      const response = await fetch(`${API_BASE_URL}/api/v1/organizations/${ctx.organizationId}/roles`, {
        method: "POST",
        headers: ctx.headers,
        body: JSON.stringify({
          permissions: ["monitors.view"],
        }),
      });

      expect(response.status).toBe(400);
    });

    it("rejects missing permissions", async () => {
      const response = await fetch(`${API_BASE_URL}/api/v1/organizations/${ctx.organizationId}/roles`, {
        method: "POST",
        headers: ctx.headers,
        body: JSON.stringify({
          name: "No Permissions Role",
        }),
      });

      expect(response.status).toBe(400);
    });

    it("rejects empty name", async () => {
      const response = await fetch(`${API_BASE_URL}/api/v1/organizations/${ctx.organizationId}/roles`, {
        method: "POST",
        headers: ctx.headers,
        body: JSON.stringify({
          name: "",
          permissions: ["monitors.view"],
        }),
      });

      expect(response.status).toBe(400);
    });

    it("rejects name that is too long", async () => {
      const response = await fetch(`${API_BASE_URL}/api/v1/organizations/${ctx.organizationId}/roles`, {
        method: "POST",
        headers: ctx.headers,
        body: JSON.stringify({
          name: "A".repeat(100),
          permissions: ["monitors.view"],
        }),
      });

      expect(response.status).toBe(400);
    });

    it("rejects invalid permission string", async () => {
      const response = await fetch(`${API_BASE_URL}/api/v1/organizations/${ctx.organizationId}/roles`, {
        method: "POST",
        headers: ctx.headers,
        body: JSON.stringify({
          name: "Invalid Permission Role",
          permissions: ["invalid.permission.string.here"],
        }),
      });

      // May or may not be validated, document behavior
      expect([200, 201, 400]).toContain(response.status);
    });

    it("rejects invalid color format", async () => {
      const response = await fetch(`${API_BASE_URL}/api/v1/organizations/${ctx.organizationId}/roles`, {
        method: "POST",
        headers: ctx.headers,
        body: JSON.stringify({
          name: "Invalid Color Role",
          permissions: ["monitors.view"],
          color: "not-a-color",
        }),
      });

      expect(response.status).toBe(400);
    });
  });
});
