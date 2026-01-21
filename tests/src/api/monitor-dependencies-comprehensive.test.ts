import { describe, it, expect, beforeAll } from "vitest";
import { bootstrapTestContext, TestContext } from "../helpers/context";
import {
  insertOrganization,
  insertUser,
  insertApiKey,
  insertMonitor,
  insertMonitorDependency,
} from "../helpers/data";

const API_BASE_URL = process.env.API_BASE_URL ?? "http://api:3001";
const apiUrl = `${API_BASE_URL}/api/v1`;

describe("Monitor Dependencies API", () => {
  let ctx: TestContext;
  let orgId: string;
  let adminToken: string;
  let readOnlyToken: string;
  let otherOrgId: string;
  let otherOrgToken: string;
  let upstreamMonitorId: string;
  let downstreamMonitorId: string;
  let thirdMonitorId: string;
  let otherOrgMonitor1: string;
  let otherOrgMonitor2: string;

  beforeAll(async () => {
    ctx = await bootstrapTestContext();

    // Create test organization
    const org = await insertOrganization({ name: "Dependencies Test Org" });
    orgId = org.id;

    // Create admin user with API key
    const adminUser = await insertUser({
      email: "deps-admin@test.com",
      name: "Dependencies Admin",
    });
    const adminKey = await insertApiKey(orgId, {
      userId: adminUser.id,
      scope: "admin",
    });
    adminToken = adminKey.key;

    // Create read-only API key
    const readKey = await insertApiKey(orgId, {
      userId: adminUser.id,
      scope: "read",
    });
    readOnlyToken = readKey.key;

    // Create test monitors
    const upstream = await insertMonitor(orgId, {
      name: "Database Service",
      type: "http",
      url: "https://db.example.com",
    });
    upstreamMonitorId = upstream.id;

    const downstream = await insertMonitor(orgId, {
      name: "API Service",
      type: "http",
      url: "https://api.example.com",
    });
    downstreamMonitorId = downstream.id;

    const third = await insertMonitor(orgId, {
      name: "Frontend Service",
      type: "http",
      url: "https://frontend.example.com",
    });
    thirdMonitorId = third.id;

    // Create another organization for isolation tests
    const otherOrg = await insertOrganization({ name: "Other Dependencies Org" });
    otherOrgId = otherOrg.id;

    const otherUser = await insertUser({
      email: "other-deps@test.com",
      name: "Other Dependencies User",
    });
    const otherKey = await insertApiKey(otherOrgId, {
      userId: otherUser.id,
      scope: "admin",
    });
    otherOrgToken = otherKey.key;

    // Create monitors in other org for isolation tests
    const otherMon1 = await insertMonitor(otherOrgId, {
      name: "Other Org Monitor 1",
      type: "http",
      url: "https://other1.example.com",
    });
    otherOrgMonitor1 = otherMon1.id;

    const otherMon2 = await insertMonitor(otherOrgId, {
      name: "Other Org Monitor 2",
      type: "http",
      url: "https://other2.example.com",
    });
    otherOrgMonitor2 = otherMon2.id;
  });

  // ==========================================
  // Single Dependency CRUD
  // ==========================================
  describe("Single Dependency CRUD", () => {
    describe("POST /monitor-dependencies", () => {
      it("creates a single dependency", async () => {
        const res = await fetch(`${apiUrl}/monitor-dependencies`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${adminToken}`,
          },
          body: JSON.stringify({
            downstreamMonitorId: downstreamMonitorId,
            upstreamMonitorId: upstreamMonitorId,
            description: "API depends on Database",
          }),
        });

        expect(res.status).toBe(201);
        const body = await res.json();
        expect(body.success).toBe(true);
        expect(body.data.id).toBeDefined();
        expect(body.data.downstreamMonitorId).toBe(downstreamMonitorId);
        expect(body.data.upstreamMonitorId).toBe(upstreamMonitorId);
        expect(body.data.description).toBe("API depends on Database");
      });

      it("creates dependency without description", async () => {
        // Create new monitors for this test
        const upstream = await insertMonitor(orgId, {
          name: "Cache Service",
          type: "http",
          url: "https://cache.example.com",
        });
        const downstream = await insertMonitor(orgId, {
          name: "Auth Service",
          type: "http",
          url: "https://auth.example.com",
        });

        const res = await fetch(`${apiUrl}/monitor-dependencies`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${adminToken}`,
          },
          body: JSON.stringify({
            downstreamMonitorId: downstream.id,
            upstreamMonitorId: upstream.id,
          }),
        });

        expect(res.status).toBe(201);
        const body = await res.json();
        expect(body.success).toBe(true);
      });

      it("rejects self-reference dependency", async () => {
        const res = await fetch(`${apiUrl}/monitor-dependencies`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${adminToken}`,
          },
          body: JSON.stringify({
            downstreamMonitorId: downstreamMonitorId,
            upstreamMonitorId: downstreamMonitorId,
          }),
        });

        expect(res.status).toBe(400);
        const body = await res.json();
        expect(body.success).toBe(false);
        expect(body.error).toContain("cannot depend on itself");
      });

      it("rejects duplicate dependency", async () => {
        const res = await fetch(`${apiUrl}/monitor-dependencies`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${adminToken}`,
          },
          body: JSON.stringify({
            downstreamMonitorId: downstreamMonitorId,
            upstreamMonitorId: upstreamMonitorId,
          }),
        });

        expect(res.status).toBe(409);
        const body = await res.json();
        expect(body.success).toBe(false);
        expect(body.error).toContain("already exists");
      });

      it("returns 404 for non-existent downstream monitor", async () => {
        const res = await fetch(`${apiUrl}/monitor-dependencies`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${adminToken}`,
          },
          body: JSON.stringify({
            downstreamMonitorId: "non-existent-id",
            upstreamMonitorId: upstreamMonitorId,
          }),
        });

        expect(res.status).toBe(404);
        const body = await res.json();
        expect(body.success).toBe(false);
        expect(body.error).toContain("Downstream monitor not found");
      });

      it("returns 404 for non-existent upstream monitor", async () => {
        const res = await fetch(`${apiUrl}/monitor-dependencies`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${adminToken}`,
          },
          body: JSON.stringify({
            downstreamMonitorId: downstreamMonitorId,
            upstreamMonitorId: "non-existent-id",
          }),
        });

        expect(res.status).toBe(404);
        const body = await res.json();
        expect(body.success).toBe(false);
        expect(body.error).toContain("Upstream monitor not found");
      });
    });

    describe("GET /monitor-dependencies", () => {
      it("lists all dependencies for organization", async () => {
        const res = await fetch(`${apiUrl}/monitor-dependencies`, {
          headers: {
            Authorization: `Bearer ${adminToken}`,
          },
        });

        expect(res.status).toBe(200);
        const body = await res.json();
        expect(body.success).toBe(true);
        expect(Array.isArray(body.data)).toBe(true);
        expect(body.data.length).toBeGreaterThan(0);
      });

      it("enriches dependencies with monitor info", async () => {
        const res = await fetch(`${apiUrl}/monitor-dependencies`, {
          headers: {
            Authorization: `Bearer ${adminToken}`,
          },
        });

        expect(res.status).toBe(200);
        const body = await res.json();
        expect(body.success).toBe(true);

        for (const dep of body.data) {
          if (dep.downstreamMonitor) {
            expect(dep.downstreamMonitor.id).toBeDefined();
            expect(dep.downstreamMonitor.name).toBeDefined();
            expect(dep.downstreamMonitor.type).toBeDefined();
            expect(dep.downstreamMonitor.status).toBeDefined();
          }
          if (dep.upstreamMonitor) {
            expect(dep.upstreamMonitor.id).toBeDefined();
            expect(dep.upstreamMonitor.name).toBeDefined();
          }
        }
      });
    });

    describe("GET /monitor-dependencies/monitor/:monitorId", () => {
      it("gets dependencies for a specific monitor", async () => {
        const res = await fetch(
          `${apiUrl}/monitor-dependencies/monitor/${downstreamMonitorId}`,
          {
            headers: {
              Authorization: `Bearer ${adminToken}`,
            },
          }
        );

        expect(res.status).toBe(200);
        const body = await res.json();
        expect(body.success).toBe(true);
        expect(body.data.upstream).toBeDefined();
        expect(body.data.downstream).toBeDefined();
        expect(Array.isArray(body.data.upstream)).toBe(true);
        expect(Array.isArray(body.data.downstream)).toBe(true);
      });

      it("returns upstream dependencies correctly", async () => {
        const res = await fetch(
          `${apiUrl}/monitor-dependencies/monitor/${downstreamMonitorId}`,
          {
            headers: {
              Authorization: `Bearer ${adminToken}`,
            },
          }
        );

        expect(res.status).toBe(200);
        const body = await res.json();
        expect(body.success).toBe(true);

        // The API service (downstream) should have Database (upstream) as a dependency
        expect(body.data.upstream.length).toBeGreaterThan(0);
        const hasDbDep = body.data.upstream.some(
          (dep: any) => dep.upstreamMonitorId === upstreamMonitorId
        );
        expect(hasDbDep).toBe(true);
      });

      it("returns downstream dependencies correctly", async () => {
        const res = await fetch(
          `${apiUrl}/monitor-dependencies/monitor/${upstreamMonitorId}`,
          {
            headers: {
              Authorization: `Bearer ${adminToken}`,
            },
          }
        );

        expect(res.status).toBe(200);
        const body = await res.json();
        expect(body.success).toBe(true);

        // The Database (upstream) should have API service (downstream) depending on it
        expect(body.data.downstream.length).toBeGreaterThan(0);
        const hasApiDep = body.data.downstream.some(
          (dep: any) => dep.downstreamMonitorId === downstreamMonitorId
        );
        expect(hasApiDep).toBe(true);
      });

      it("returns 404 for non-existent monitor", async () => {
        const res = await fetch(
          `${apiUrl}/monitor-dependencies/monitor/non-existent-id`,
          {
            headers: {
              Authorization: `Bearer ${adminToken}`,
            },
          }
        );

        expect(res.status).toBe(404);
        const body = await res.json();
        expect(body.success).toBe(false);
      });
    });

    describe("PATCH /monitor-dependencies/:id", () => {
      let updateDepId: string;

      beforeAll(async () => {
        const dep = await insertMonitorDependency(thirdMonitorId, downstreamMonitorId, {
          description: "Original description",
        });
        updateDepId = dep.id;
      });

      it("updates dependency description", async () => {
        const res = await fetch(`${apiUrl}/monitor-dependencies/${updateDepId}`, {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${adminToken}`,
          },
          body: JSON.stringify({
            description: "Updated description",
          }),
        });

        expect(res.status).toBe(200);
        const body = await res.json();
        expect(body.success).toBe(true);
        expect(body.data.description).toBe("Updated description");
      });

      it("returns 404 for non-existent dependency", async () => {
        const res = await fetch(`${apiUrl}/monitor-dependencies/non-existent-id`, {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${adminToken}`,
          },
          body: JSON.stringify({
            description: "New description",
          }),
        });

        expect(res.status).toBe(404);
        const body = await res.json();
        expect(body.success).toBe(false);
      });
    });

    describe("DELETE /monitor-dependencies/:id", () => {
      it("deletes a dependency", async () => {
        // Create a dependency to delete
        const m1 = await insertMonitor(orgId, {
          name: "Delete Test Monitor 1",
          type: "http",
          url: "https://delete1.example.com",
        });
        const m2 = await insertMonitor(orgId, {
          name: "Delete Test Monitor 2",
          type: "http",
          url: "https://delete2.example.com",
        });

        const dep = await insertMonitorDependency(m1.id, m2.id, {
          description: "To be deleted",
        });

        const res = await fetch(`${apiUrl}/monitor-dependencies/${dep.id}`, {
          method: "DELETE",
          headers: {
            Authorization: `Bearer ${adminToken}`,
          },
        });

        expect(res.status).toBe(200);
        const body = await res.json();
        expect(body.success).toBe(true);
        expect(body.data.deleted).toBe(true);
      });

      it("returns 404 for non-existent dependency", async () => {
        const res = await fetch(`${apiUrl}/monitor-dependencies/non-existent-id`, {
          method: "DELETE",
          headers: {
            Authorization: `Bearer ${adminToken}`,
          },
        });

        expect(res.status).toBe(404);
        const body = await res.json();
        expect(body.success).toBe(false);
      });
    });
  });

  // ==========================================
  // Bulk Dependencies
  // ==========================================
  describe("Bulk Dependencies", () => {
    describe("POST /monitor-dependencies/bulk", () => {
      it("creates multiple dependencies at once", async () => {
        const downstream = await insertMonitor(orgId, {
          name: "Bulk Downstream",
          type: "http",
          url: "https://bulk-downstream.example.com",
        });
        const upstream1 = await insertMonitor(orgId, {
          name: "Bulk Upstream 1",
          type: "http",
          url: "https://bulk-upstream1.example.com",
        });
        const upstream2 = await insertMonitor(orgId, {
          name: "Bulk Upstream 2",
          type: "http",
          url: "https://bulk-upstream2.example.com",
        });
        const upstream3 = await insertMonitor(orgId, {
          name: "Bulk Upstream 3",
          type: "http",
          url: "https://bulk-upstream3.example.com",
        });

        const res = await fetch(`${apiUrl}/monitor-dependencies/bulk`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${adminToken}`,
          },
          body: JSON.stringify({
            downstreamMonitorId: downstream.id,
            upstreamMonitorIds: [upstream1.id, upstream2.id, upstream3.id],
            description: "Bulk created dependencies",
          }),
        });

        expect(res.status).toBe(201);
        const body = await res.json();
        expect(body.success).toBe(true);
        expect(body.data.length).toBe(3);
      });

      it("filters out self-references in bulk", async () => {
        const monitor = await insertMonitor(orgId, {
          name: "Self Ref Bulk",
          type: "http",
          url: "https://self-ref.example.com",
        });
        const upstream = await insertMonitor(orgId, {
          name: "Valid Upstream",
          type: "http",
          url: "https://valid-upstream.example.com",
        });

        const res = await fetch(`${apiUrl}/monitor-dependencies/bulk`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${adminToken}`,
          },
          body: JSON.stringify({
            downstreamMonitorId: monitor.id,
            upstreamMonitorIds: [monitor.id, upstream.id], // Self-reference should be filtered
            description: "Should filter self-ref",
          }),
        });

        expect(res.status).toBe(201);
        const body = await res.json();
        expect(body.success).toBe(true);
        expect(body.data.length).toBe(1);
      });

      it("returns error when all upstream IDs are self-references", async () => {
        const monitor = await insertMonitor(orgId, {
          name: "All Self Ref",
          type: "http",
          url: "https://all-self-ref.example.com",
        });

        const res = await fetch(`${apiUrl}/monitor-dependencies/bulk`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${adminToken}`,
          },
          body: JSON.stringify({
            downstreamMonitorId: monitor.id,
            upstreamMonitorIds: [monitor.id],
          }),
        });

        expect(res.status).toBe(400);
        const body = await res.json();
        expect(body.success).toBe(false);
        expect(body.error).toContain("No valid upstream monitors");
      });

      it("skips already existing dependencies in bulk", async () => {
        const downstream = await insertMonitor(orgId, {
          name: "Bulk Dup Downstream",
          type: "http",
          url: "https://bulk-dup-downstream.example.com",
        });
        const upstream = await insertMonitor(orgId, {
          name: "Bulk Dup Upstream",
          type: "http",
          url: "https://bulk-dup-upstream.example.com",
        });

        // Create the dependency first
        await insertMonitorDependency(downstream.id, upstream.id);

        // Try to create it again via bulk
        const res = await fetch(`${apiUrl}/monitor-dependencies/bulk`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${adminToken}`,
          },
          body: JSON.stringify({
            downstreamMonitorId: downstream.id,
            upstreamMonitorIds: [upstream.id],
          }),
        });

        expect(res.status).toBe(200);
        const body = await res.json();
        expect(body.success).toBe(true);
        expect(body.data.length).toBe(0);
        expect(body.message).toContain("already exist");
      });

      it("returns 404 for non-existent downstream monitor", async () => {
        const res = await fetch(`${apiUrl}/monitor-dependencies/bulk`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${adminToken}`,
          },
          body: JSON.stringify({
            downstreamMonitorId: "non-existent-id",
            upstreamMonitorIds: [upstreamMonitorId],
          }),
        });

        expect(res.status).toBe(404);
        const body = await res.json();
        expect(body.success).toBe(false);
        expect(body.error).toContain("Downstream monitor not found");
      });

      it("returns 404 for invalid upstream monitors", async () => {
        const downstream = await insertMonitor(orgId, {
          name: "Invalid Upstream Test",
          type: "http",
          url: "https://invalid-upstream.example.com",
        });

        const res = await fetch(`${apiUrl}/monitor-dependencies/bulk`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${adminToken}`,
          },
          body: JSON.stringify({
            downstreamMonitorId: downstream.id,
            upstreamMonitorIds: ["invalid-id-1", "invalid-id-2"],
          }),
        });

        expect(res.status).toBe(404);
        const body = await res.json();
        expect(body.success).toBe(false);
        expect(body.error).toContain("Some upstream monitors not found");
      });
    });
  });

  // ==========================================
  // Authorization
  // ==========================================
  describe("Authorization", () => {
    it("requires authentication for listing dependencies", async () => {
      const res = await fetch(`${apiUrl}/monitor-dependencies`);
      expect(res.status).toBe(401);
    });

    it("requires authentication for creating dependencies", async () => {
      const res = await fetch(`${apiUrl}/monitor-dependencies`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          downstreamMonitorId: downstreamMonitorId,
          upstreamMonitorId: upstreamMonitorId,
        }),
      });
      expect(res.status).toBe(401);
    });

    it("allows read-only access for listing dependencies", async () => {
      const res = await fetch(`${apiUrl}/monitor-dependencies`, {
        headers: {
          Authorization: `Bearer ${readOnlyToken}`,
        },
      });
      expect(res.status).toBe(200);
    });

    it("allows read-only access for getting monitor dependencies", async () => {
      const res = await fetch(
        `${apiUrl}/monitor-dependencies/monitor/${downstreamMonitorId}`,
        {
          headers: {
            Authorization: `Bearer ${readOnlyToken}`,
          },
        }
      );
      expect(res.status).toBe(200);
    });
  });

  // ==========================================
  // Organization Isolation
  // ==========================================
  describe("Organization Isolation", () => {
    let otherOrgMonitor1: string;
    let otherOrgMonitor2: string;

    beforeAll(async () => {
      const m1 = await insertMonitor(otherOrgId, {
        name: "Other Org Monitor 1",
        type: "http",
        url: "https://other1.example.com",
      });
      otherOrgMonitor1 = m1.id;

      const m2 = await insertMonitor(otherOrgId, {
        name: "Other Org Monitor 2",
        type: "http",
        url: "https://other2.example.com",
      });
      otherOrgMonitor2 = m2.id;
    });

    it("cannot create dependency using monitor from another org", async () => {
      // Try to create dependency with our downstream and their upstream
      const res = await fetch(`${apiUrl}/monitor-dependencies`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${adminToken}`,
        },
        body: JSON.stringify({
          downstreamMonitorId: downstreamMonitorId,
          upstreamMonitorId: otherOrgMonitor1,
        }),
      });

      expect(res.status).toBe(404);
      const body = await res.json();
      expect(body.success).toBe(false);
    });

    it("cannot create dependency with downstream from another org", async () => {
      const res = await fetch(`${apiUrl}/monitor-dependencies`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${adminToken}`,
        },
        body: JSON.stringify({
          downstreamMonitorId: otherOrgMonitor1,
          upstreamMonitorId: upstreamMonitorId,
        }),
      });

      expect(res.status).toBe(404);
      const body = await res.json();
      expect(body.success).toBe(false);
    });

    it("cannot get dependencies for monitor from another org", async () => {
      const res = await fetch(
        `${apiUrl}/monitor-dependencies/monitor/${otherOrgMonitor1}`,
        {
          headers: {
            Authorization: `Bearer ${adminToken}`,
          },
        }
      );

      expect(res.status).toBe(404);
      const body = await res.json();
      expect(body.success).toBe(false);
    });

    it("cannot delete dependency from another org", async () => {
      // Create a dependency in other org
      const dep = await insertMonitorDependency(otherOrgMonitor1, otherOrgMonitor2);

      const res = await fetch(`${apiUrl}/monitor-dependencies/${dep.id}`, {
        method: "DELETE",
        headers: {
          Authorization: `Bearer ${adminToken}`,
        },
      });

      expect(res.status).toBe(404);
      const body = await res.json();
      expect(body.success).toBe(false);
    });

    it("cannot update dependency from another org", async () => {
      const dep = await insertMonitorDependency(otherOrgMonitor2, otherOrgMonitor1, {
        description: "Other org dep",
      });

      const res = await fetch(`${apiUrl}/monitor-dependencies/${dep.id}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${adminToken}`,
        },
        body: JSON.stringify({
          description: "Hacked description",
        }),
      });

      expect(res.status).toBe(404);
      const body = await res.json();
      expect(body.success).toBe(false);
    });

    it("does not list dependencies from another org", async () => {
      // A dependency already exists in other org from previous tests
      // Just verify it doesn't appear in our list
      const res = await fetch(`${apiUrl}/monitor-dependencies`, {
        headers: {
          Authorization: `Bearer ${adminToken}`,
        },
      });

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.success).toBe(true);

      // Should not contain other org's monitors
      for (const dep of body.data) {
        expect(dep.downstreamMonitorId).not.toBe(otherOrgMonitor1);
        expect(dep.upstreamMonitorId).not.toBe(otherOrgMonitor2);
      }
    });
  });

  // ==========================================
  // Audit Logging
  // ==========================================
  describe("Audit Logging", () => {
    it("creates audit entry when creating dependency", async () => {
      const m1 = await insertMonitor(orgId, {
        name: "Audit Create Downstream",
        type: "http",
        url: "https://audit-create-down.example.com",
      });
      const m2 = await insertMonitor(orgId, {
        name: "Audit Create Upstream",
        type: "http",
        url: "https://audit-create-up.example.com",
      });

      await fetch(`${apiUrl}/monitor-dependencies`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${adminToken}`,
        },
        body: JSON.stringify({
          downstreamMonitorId: m1.id,
          upstreamMonitorId: m2.id,
        }),
      });

      const auditRes = await fetch(`${apiUrl}/audit-logs?action=monitor.update&limit=1`, {
        headers: {
          Authorization: `Bearer ${adminToken}`,
        },
      });

      expect(auditRes.status).toBe(200);
      const auditBody = await auditRes.json();
      expect(auditBody.success).toBe(true);
      expect(auditBody.data.data.length).toBeGreaterThan(0);
    });

    it("creates audit entry when deleting dependency", async () => {
      const m1 = await insertMonitor(orgId, {
        name: "Audit Delete Downstream",
        type: "http",
        url: "https://audit-delete-down.example.com",
      });
      const m2 = await insertMonitor(orgId, {
        name: "Audit Delete Upstream",
        type: "http",
        url: "https://audit-delete-up.example.com",
      });

      const dep = await insertMonitorDependency(m1.id, m2.id);

      await fetch(`${apiUrl}/monitor-dependencies/${dep.id}`, {
        method: "DELETE",
        headers: {
          Authorization: `Bearer ${adminToken}`,
        },
      });

      const auditRes = await fetch(`${apiUrl}/audit-logs?action=monitor.update&limit=1`, {
        headers: {
          Authorization: `Bearer ${adminToken}`,
        },
      });

      expect(auditRes.status).toBe(200);
      const auditBody = await auditRes.json();
      expect(auditBody.success).toBe(true);
      expect(auditBody.data.data.length).toBeGreaterThan(0);
    });

    it("creates audit entry when bulk creating dependencies", async () => {
      const downstream = await insertMonitor(orgId, {
        name: "Audit Bulk Downstream",
        type: "http",
        url: "https://audit-bulk-down.example.com",
      });
      const upstream = await insertMonitor(orgId, {
        name: "Audit Bulk Upstream",
        type: "http",
        url: "https://audit-bulk-up.example.com",
      });

      await fetch(`${apiUrl}/monitor-dependencies/bulk`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${adminToken}`,
        },
        body: JSON.stringify({
          downstreamMonitorId: downstream.id,
          upstreamMonitorIds: [upstream.id],
        }),
      });

      const auditRes = await fetch(`${apiUrl}/audit-logs?action=monitor.update&limit=1`, {
        headers: {
          Authorization: `Bearer ${adminToken}`,
        },
      });

      expect(auditRes.status).toBe(200);
      const auditBody = await auditRes.json();
      expect(auditBody.success).toBe(true);
      expect(auditBody.data.data.length).toBeGreaterThan(0);
    });
  });

  // ==========================================
  // Edge Cases
  // ==========================================
  describe("Edge Cases", () => {
    it("handles empty organization (no monitors)", async () => {
      // Create a new org with no monitors
      const emptyOrg = await insertOrganization({ name: "Empty Org" });
      const emptyUser = await insertUser({
        email: "empty-org@test.com",
        name: "Empty User",
      });
      const emptyKey = await insertApiKey(emptyOrg.id, {
        userId: emptyUser.id,
        scope: "admin",
      });

      const res = await fetch(`${apiUrl}/monitor-dependencies`, {
        headers: {
          Authorization: `Bearer ${emptyKey.key}`,
        },
      });

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.success).toBe(true);
      expect(body.data).toEqual([]);
    });

    it("handles monitor with no dependencies", async () => {
      const isolated = await insertMonitor(orgId, {
        name: "Isolated Monitor",
        type: "http",
        url: "https://isolated.example.com",
      });

      const res = await fetch(`${apiUrl}/monitor-dependencies/monitor/${isolated.id}`, {
        headers: {
          Authorization: `Bearer ${adminToken}`,
        },
      });

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.success).toBe(true);
      expect(body.data.upstream).toEqual([]);
      expect(body.data.downstream).toEqual([]);
    });
  });
});
