/**
 * SLO (Service Level Objectives) Comprehensive Tests
 *
 * Tests SLO API including:
 * - CRUD operations for SLO targets
 * - Error budget calculations
 * - Breach detection and history
 * - Dashboard summary
 * - Authorization and organization isolation
 * - Validation
 */

import { describe, it, expect, beforeAll } from "vitest";
import { randomUUID } from "crypto";
import { bootstrapTestContext, TestContext } from "../helpers/context";
import { createMonitor, insertApiKey, insertSloTarget } from "../helpers/data";

const API_BASE_URL = process.env.API_BASE_URL ?? "http://api:3001";

describe("SLO API", () => {
  let ctx: TestContext;
  let monitorId: string;

  beforeAll(async () => {
    ctx = await bootstrapTestContext();

    // Create a monitor for SLO testing
    monitorId = await createMonitor(ctx, {
      name: `SLO Test Monitor ${randomUUID().slice(0, 8)}`,
      type: "https",
      url: "https://example.com",
    });
  });

  describe("CRUD Operations", () => {
    describe("Create SLO Target", () => {
      it("creates SLO target with all parameters", async () => {
        const response = await fetch(`${API_BASE_URL}/api/v1/slo`, {
          method: "POST",
          headers: ctx.headers,
          body: JSON.stringify({
            monitorId,
            name: "API Availability SLO",
            targetPercentage: 99.9,
            window: "monthly",
            gracePeriodMinutes: 5,
            alertThresholds: [75, 50, 25],
            active: true,
          }),
        });

        expect(response.status).toBe(201);
        const body = await response.json();
        expect(body.success).toBe(true);
        expect(body.data.id).toBeDefined();
        expect(body.data.name).toBe("API Availability SLO");
        expect(body.data.targetPercentage).toBe("99.9");
        expect(body.data.window).toBe("monthly");
        expect(body.data.monitorId).toBe(monitorId);
      });

      it("creates SLO target with minimal parameters", async () => {
        const response = await fetch(`${API_BASE_URL}/api/v1/slo`, {
          method: "POST",
          headers: ctx.headers,
          body: JSON.stringify({
            monitorId,
            name: "Minimal SLO",
            targetPercentage: 99.5,
          }),
        });

        expect(response.status).toBe(201);
        const body = await response.json();
        expect(body.success).toBe(true);
        expect(body.data.window).toBe("monthly"); // Default
        expect(body.data.active).toBe(true); // Default
      });

      it("creates SLO target with different window types", async () => {
        const windows = ["daily", "weekly", "monthly", "quarterly", "annually"];

        for (const window of windows) {
          const response = await fetch(`${API_BASE_URL}/api/v1/slo`, {
            method: "POST",
            headers: ctx.headers,
            body: JSON.stringify({
              monitorId,
              name: `${window} SLO`,
              targetPercentage: 99.0,
              window,
            }),
          });

          expect(response.status).toBe(201);
          const body = await response.json();
          expect(body.data.window).toBe(window);
        }
      });

      it("rejects SLO with invalid monitor ID", async () => {
        const response = await fetch(`${API_BASE_URL}/api/v1/slo`, {
          method: "POST",
          headers: ctx.headers,
          body: JSON.stringify({
            monitorId: randomUUID(),
            name: "Invalid Monitor SLO",
            targetPercentage: 99.9,
          }),
        });

        expect(response.status).toBe(404);
      });

      it("rejects SLO with monitor from different organization", async () => {
        // Create second org context
        const otherCtx = await bootstrapTestContext();
        const otherMonitorId = await createMonitor(otherCtx, {
          name: "Other Org Monitor",
          type: "https",
          url: "https://other.example.com",
        });

        // Try to create SLO with other org's monitor
        const response = await fetch(`${API_BASE_URL}/api/v1/slo`, {
          method: "POST",
          headers: ctx.headers,
          body: JSON.stringify({
            monitorId: otherMonitorId,
            name: "Cross-org SLO",
            targetPercentage: 99.9,
          }),
        });

        expect(response.status).toBe(404);
      });
    });

    describe("List SLO Targets", () => {
      it("lists SLO targets with pagination", async () => {
        const response = await fetch(`${API_BASE_URL}/api/v1/slo?limit=10&offset=0`, {
          method: "GET",
          headers: ctx.headers,
        });

        expect(response.status).toBe(200);
        const body = await response.json();
        expect(body.success).toBe(true);
        expect(Array.isArray(body.data)).toBe(true);
        expect(body.meta.limit).toBe(10);
        expect(body.meta.offset).toBe(0);
      });

      it("includes current budget status in list", async () => {
        // Create an SLO first
        const createResponse = await fetch(`${API_BASE_URL}/api/v1/slo`, {
          method: "POST",
          headers: ctx.headers,
          body: JSON.stringify({
            monitorId,
            name: `Budget Test SLO ${randomUUID().slice(0, 8)}`,
            targetPercentage: 99.9,
            window: "monthly",
          }),
        });
        expect(createResponse.status).toBe(201);

        // List and check for budget data
        const response = await fetch(`${API_BASE_URL}/api/v1/slo`, {
          method: "GET",
          headers: ctx.headers,
        });

        expect(response.status).toBe(200);
        const body = await response.json();
        expect(body.data.length).toBeGreaterThan(0);

        // Check that current budget info is enriched
        const slo = body.data.find((s: any) => s.name.includes("Budget Test SLO"));
        expect(slo).toBeDefined();
        expect(slo.currentBudget).toBeDefined();
        expect(slo.periodStart).toBeDefined();
        expect(slo.periodEnd).toBeDefined();
      });

      it("includes monitor info in list", async () => {
        const response = await fetch(`${API_BASE_URL}/api/v1/slo`, {
          method: "GET",
          headers: ctx.headers,
        });

        expect(response.status).toBe(200);
        const body = await response.json();
        expect(body.data.length).toBeGreaterThan(0);

        // Check that monitor info is included
        const slo = body.data[0];
        expect(slo.monitor).toBeDefined();
        expect(slo.monitor.id).toBeDefined();
        expect(slo.monitor.name).toBeDefined();
        expect(slo.monitor.type).toBeDefined();
      });
    });

    describe("Get SLO Target by ID", () => {
      it("gets SLO target with full details", async () => {
        // Create an SLO
        const createResponse = await fetch(`${API_BASE_URL}/api/v1/slo`, {
          method: "POST",
          headers: ctx.headers,
          body: JSON.stringify({
            monitorId,
            name: "Get Test SLO",
            targetPercentage: 99.9,
            window: "monthly",
          }),
        });
        const createBody = await createResponse.json();
        const sloId = createBody.data.id;

        // Get the SLO
        const response = await fetch(`${API_BASE_URL}/api/v1/slo/${sloId}`, {
          method: "GET",
          headers: ctx.headers,
        });

        expect(response.status).toBe(200);
        const body = await response.json();
        expect(body.success).toBe(true);
        expect(body.data.id).toBe(sloId);
        expect(body.data.name).toBe("Get Test SLO");
        expect(body.data.monitor).toBeDefined();
        expect(body.data.currentBudget).toBeDefined();
        expect(body.data.periodStart).toBeDefined();
        expect(body.data.periodEnd).toBeDefined();
      });

      it("returns 404 for non-existent SLO", async () => {
        const response = await fetch(`${API_BASE_URL}/api/v1/slo/${randomUUID()}`, {
          method: "GET",
          headers: ctx.headers,
        });

        expect(response.status).toBe(404);
      });

      it("returns 404 for SLO from different organization", async () => {
        // Create an SLO in another org
        const otherCtx = await bootstrapTestContext();
        const otherMonitorId = await createMonitor(otherCtx, { type: "https" });

        const createResponse = await fetch(`${API_BASE_URL}/api/v1/slo`, {
          method: "POST",
          headers: otherCtx.headers,
          body: JSON.stringify({
            monitorId: otherMonitorId,
            name: "Other Org SLO",
            targetPercentage: 99.9,
          }),
        });
        const otherSloId = (await createResponse.json()).data.id;

        // Try to access with our token
        const response = await fetch(`${API_BASE_URL}/api/v1/slo/${otherSloId}`, {
          method: "GET",
          headers: ctx.headers,
        });

        expect(response.status).toBe(404);
      });
    });

    describe("Update SLO Target", () => {
      it("updates SLO target name", async () => {
        // Create an SLO
        const createResponse = await fetch(`${API_BASE_URL}/api/v1/slo`, {
          method: "POST",
          headers: ctx.headers,
          body: JSON.stringify({
            monitorId,
            name: "Original Name",
            targetPercentage: 99.9,
          }),
        });
        const sloId = (await createResponse.json()).data.id;

        // Update the name
        const response = await fetch(`${API_BASE_URL}/api/v1/slo/${sloId}`, {
          method: "PATCH",
          headers: ctx.headers,
          body: JSON.stringify({
            name: "Updated Name",
          }),
        });

        expect(response.status).toBe(200);
        const body = await response.json();
        expect(body.data.name).toBe("Updated Name");
      });

      it("updates SLO target percentage", async () => {
        const createResponse = await fetch(`${API_BASE_URL}/api/v1/slo`, {
          method: "POST",
          headers: ctx.headers,
          body: JSON.stringify({
            monitorId,
            name: "Percentage Test",
            targetPercentage: 99.9,
          }),
        });
        const sloId = (await createResponse.json()).data.id;

        const response = await fetch(`${API_BASE_URL}/api/v1/slo/${sloId}`, {
          method: "PATCH",
          headers: ctx.headers,
          body: JSON.stringify({
            targetPercentage: 99.5,
          }),
        });

        expect(response.status).toBe(200);
        const body = await response.json();
        expect(body.data.targetPercentage).toBe("99.5");
      });

      it("updates SLO window type", async () => {
        const createResponse = await fetch(`${API_BASE_URL}/api/v1/slo`, {
          method: "POST",
          headers: ctx.headers,
          body: JSON.stringify({
            monitorId,
            name: "Window Test",
            targetPercentage: 99.9,
            window: "monthly",
          }),
        });
        const sloId = (await createResponse.json()).data.id;

        const response = await fetch(`${API_BASE_URL}/api/v1/slo/${sloId}`, {
          method: "PATCH",
          headers: ctx.headers,
          body: JSON.stringify({
            window: "weekly",
          }),
        });

        expect(response.status).toBe(200);
        const body = await response.json();
        expect(body.data.window).toBe("weekly");
      });

      it("toggles SLO active status", async () => {
        const createResponse = await fetch(`${API_BASE_URL}/api/v1/slo`, {
          method: "POST",
          headers: ctx.headers,
          body: JSON.stringify({
            monitorId,
            name: "Active Test",
            targetPercentage: 99.9,
            active: true,
          }),
        });
        const sloId = (await createResponse.json()).data.id;

        // Deactivate
        const response = await fetch(`${API_BASE_URL}/api/v1/slo/${sloId}`, {
          method: "PATCH",
          headers: ctx.headers,
          body: JSON.stringify({
            active: false,
          }),
        });

        expect(response.status).toBe(200);
        const body = await response.json();
        expect(body.data.active).toBe(false);
      });

      it("returns 404 when updating non-existent SLO", async () => {
        const response = await fetch(`${API_BASE_URL}/api/v1/slo/${randomUUID()}`, {
          method: "PATCH",
          headers: ctx.headers,
          body: JSON.stringify({
            name: "Updated",
          }),
        });

        expect(response.status).toBe(404);
      });
    });

    describe("Delete SLO Target", () => {
      it("deletes SLO target", async () => {
        // Create an SLO
        const createResponse = await fetch(`${API_BASE_URL}/api/v1/slo`, {
          method: "POST",
          headers: ctx.headers,
          body: JSON.stringify({
            monitorId,
            name: "To Delete",
            targetPercentage: 99.9,
          }),
        });
        const sloId = (await createResponse.json()).data.id;

        // Delete it
        const response = await fetch(`${API_BASE_URL}/api/v1/slo/${sloId}`, {
          method: "DELETE",
          headers: ctx.headers,
        });

        expect(response.status).toBe(200);
        const body = await response.json();
        expect(body.data.deleted).toBe(true);

        // Verify it's gone
        const getResponse = await fetch(`${API_BASE_URL}/api/v1/slo/${sloId}`, {
          method: "GET",
          headers: ctx.headers,
        });
        expect(getResponse.status).toBe(404);
      });

      it("returns 404 when deleting non-existent SLO", async () => {
        const response = await fetch(`${API_BASE_URL}/api/v1/slo/${randomUUID()}`, {
          method: "DELETE",
          headers: ctx.headers,
        });

        expect(response.status).toBe(404);
      });
    });
  });

  describe("Error Budget History", () => {
    it("gets error budget history for SLO", async () => {
      // Create an SLO (this initializes an error budget)
      const createResponse = await fetch(`${API_BASE_URL}/api/v1/slo`, {
        method: "POST",
        headers: ctx.headers,
        body: JSON.stringify({
          monitorId,
          name: "Budget History Test",
          targetPercentage: 99.9,
          window: "monthly",
        }),
      });
      const sloId = (await createResponse.json()).data.id;

      // Get budget history
      const response = await fetch(`${API_BASE_URL}/api/v1/slo/${sloId}/budgets`, {
        method: "GET",
        headers: ctx.headers,
      });

      expect(response.status).toBe(200);
      const body = await response.json();
      expect(body.success).toBe(true);
      expect(Array.isArray(body.data)).toBe(true);
      expect(body.data.length).toBeGreaterThan(0);

      // Check budget structure
      const budget = body.data[0];
      expect(budget.id).toBeDefined();
      expect(budget.periodStart).toBeDefined();
      expect(budget.periodEnd).toBeDefined();
      expect(typeof budget.totalMinutes).toBe("number");
      expect(typeof budget.budgetMinutes).toBe("number");
      expect(typeof budget.percentRemaining).toBe("number");
    });

    it("returns 404 for budget history of non-existent SLO", async () => {
      const response = await fetch(`${API_BASE_URL}/api/v1/slo/${randomUUID()}/budgets`, {
        method: "GET",
        headers: ctx.headers,
      });

      expect(response.status).toBe(404);
    });

    it("respects pagination for budget history", async () => {
      const createResponse = await fetch(`${API_BASE_URL}/api/v1/slo`, {
        method: "POST",
        headers: ctx.headers,
        body: JSON.stringify({
          monitorId,
          name: "Budget Pagination Test",
          targetPercentage: 99.9,
        }),
      });
      const sloId = (await createResponse.json()).data.id;

      const response = await fetch(`${API_BASE_URL}/api/v1/slo/${sloId}/budgets?limit=5&offset=0`, {
        method: "GET",
        headers: ctx.headers,
      });

      expect(response.status).toBe(200);
      const body = await response.json();
      expect(body.meta.limit).toBe(5);
      expect(body.meta.offset).toBe(0);
    });
  });

  describe("Breach History", () => {
    it("gets breach history for SLO", async () => {
      const createResponse = await fetch(`${API_BASE_URL}/api/v1/slo`, {
        method: "POST",
        headers: ctx.headers,
        body: JSON.stringify({
          monitorId,
          name: "Breach History Test",
          targetPercentage: 99.9,
        }),
      });
      const sloId = (await createResponse.json()).data.id;

      const response = await fetch(`${API_BASE_URL}/api/v1/slo/${sloId}/breaches`, {
        method: "GET",
        headers: ctx.headers,
      });

      expect(response.status).toBe(200);
      const body = await response.json();
      expect(body.success).toBe(true);
      expect(Array.isArray(body.data)).toBe(true);
      // New SLO should have no breaches
      expect(body.data.length).toBe(0);
    });

    it("returns 404 for breach history of non-existent SLO", async () => {
      const response = await fetch(`${API_BASE_URL}/api/v1/slo/${randomUUID()}/breaches`, {
        method: "GET",
        headers: ctx.headers,
      });

      expect(response.status).toBe(404);
    });
  });

  describe("Dashboard Summary", () => {
    it("gets SLO dashboard summary", async () => {
      // Create a couple of active SLOs
      await fetch(`${API_BASE_URL}/api/v1/slo`, {
        method: "POST",
        headers: ctx.headers,
        body: JSON.stringify({
          monitorId,
          name: "Dashboard SLO 1",
          targetPercentage: 99.9,
          active: true,
        }),
      });

      await fetch(`${API_BASE_URL}/api/v1/slo`, {
        method: "POST",
        headers: ctx.headers,
        body: JSON.stringify({
          monitorId,
          name: "Dashboard SLO 2",
          targetPercentage: 99.5,
          active: true,
        }),
      });

      const response = await fetch(`${API_BASE_URL}/api/v1/slo/summary/dashboard`, {
        method: "GET",
        headers: ctx.headers,
      });

      expect(response.status).toBe(200);
      const body = await response.json();
      expect(body.success).toBe(true);
      expect(Array.isArray(body.data.slos)).toBe(true);
      expect(body.data.stats).toBeDefined();
      expect(typeof body.data.stats.total).toBe("number");
      expect(typeof body.data.stats.healthy).toBe("number");
      expect(typeof body.data.stats.atRisk).toBe("number");
      expect(typeof body.data.stats.breached).toBe("number");
    });

    it("only includes active SLOs in dashboard", async () => {
      // Create an inactive SLO
      const createResponse = await fetch(`${API_BASE_URL}/api/v1/slo`, {
        method: "POST",
        headers: ctx.headers,
        body: JSON.stringify({
          monitorId,
          name: "Inactive Dashboard SLO",
          targetPercentage: 99.9,
          active: false,
        }),
      });
      const inactiveSloId = (await createResponse.json()).data.id;

      const response = await fetch(`${API_BASE_URL}/api/v1/slo/summary/dashboard`, {
        method: "GET",
        headers: ctx.headers,
      });

      expect(response.status).toBe(200);
      const body = await response.json();

      // Verify the inactive SLO is not in the dashboard
      const inactiveSlo = body.data.slos.find((s: any) => s.id === inactiveSloId);
      expect(inactiveSlo).toBeUndefined();
    });

    it("includes status categorization in dashboard", async () => {
      const response = await fetch(`${API_BASE_URL}/api/v1/slo/summary/dashboard`, {
        method: "GET",
        headers: ctx.headers,
      });

      expect(response.status).toBe(200);
      const body = await response.json();

      if (body.data.slos.length > 0) {
        const slo = body.data.slos[0];
        expect(["healthy", "at_risk", "breached"]).toContain(slo.status);
        expect(typeof slo.percentRemaining).toBe("number");
        expect(typeof slo.percentConsumed).toBe("number");
      }
    });
  });

  describe("Authorization", () => {
    it("requires authentication for all endpoints", async () => {
      const endpoints = [
        { method: "GET", path: "/api/v1/slo" },
        { method: "POST", path: "/api/v1/slo" },
        { method: "GET", path: `/api/v1/slo/${randomUUID()}` },
        { method: "PATCH", path: `/api/v1/slo/${randomUUID()}` },
        { method: "DELETE", path: `/api/v1/slo/${randomUUID()}` },
        { method: "GET", path: `/api/v1/slo/${randomUUID()}/budgets` },
        { method: "GET", path: `/api/v1/slo/${randomUUID()}/breaches` },
        { method: "GET", path: "/api/v1/slo/summary/dashboard" },
      ];

      for (const endpoint of endpoints) {
        const response = await fetch(`${API_BASE_URL}${endpoint.path}`, {
          method: endpoint.method,
          headers: { "Content-Type": "application/json" },
        });

        expect(response.status).toBe(401);
      }
    });

    it("allows read scope to list and view SLOs", async () => {
      const { token: readOnlyToken } = await insertApiKey(
        ctx.organizationId,
        ctx.userId,
        { name: "read-only-slo", scopes: ["read"] }
      );

      const response = await fetch(`${API_BASE_URL}/api/v1/slo`, {
        method: "GET",
        headers: {
          Authorization: `Bearer ${readOnlyToken}`,
          "Content-Type": "application/json",
        },
      });

      expect(response.status).toBe(200);
    });

    it("requires write scope to create SLO", async () => {
      const { token: readOnlyToken } = await insertApiKey(
        ctx.organizationId,
        ctx.userId,
        { name: "read-only-slo-create", scopes: ["read"] }
      );

      const response = await fetch(`${API_BASE_URL}/api/v1/slo`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${readOnlyToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          monitorId,
          name: "Read Only Test",
          targetPercentage: 99.9,
        }),
      });

      expect(response.status).toBe(403);
    });

    it("requires write scope to update SLO", async () => {
      // First create an SLO with full access
      const createResponse = await fetch(`${API_BASE_URL}/api/v1/slo`, {
        method: "POST",
        headers: ctx.headers,
        body: JSON.stringify({
          monitorId,
          name: "Update Auth Test",
          targetPercentage: 99.9,
        }),
      });
      const sloId = (await createResponse.json()).data.id;

      // Try to update with read-only token
      const { token: readOnlyToken } = await insertApiKey(
        ctx.organizationId,
        ctx.userId,
        { name: "read-only-slo-update", scopes: ["read"] }
      );

      const response = await fetch(`${API_BASE_URL}/api/v1/slo/${sloId}`, {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${readOnlyToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ name: "Updated Name" }),
      });

      expect(response.status).toBe(403);
    });

    it("requires write scope to delete SLO", async () => {
      const createResponse = await fetch(`${API_BASE_URL}/api/v1/slo`, {
        method: "POST",
        headers: ctx.headers,
        body: JSON.stringify({
          monitorId,
          name: "Delete Auth Test",
          targetPercentage: 99.9,
        }),
      });
      const sloId = (await createResponse.json()).data.id;

      const { token: readOnlyToken } = await insertApiKey(
        ctx.organizationId,
        ctx.userId,
        { name: "read-only-slo-delete", scopes: ["read"] }
      );

      const response = await fetch(`${API_BASE_URL}/api/v1/slo/${sloId}`, {
        method: "DELETE",
        headers: {
          Authorization: `Bearer ${readOnlyToken}`,
          "Content-Type": "application/json",
        },
      });

      expect(response.status).toBe(403);
    });
  });

  describe("Organization Isolation", () => {
    let otherCtx: TestContext;
    let otherMonitorId: string;
    let otherSloId: string;

    beforeAll(async () => {
      otherCtx = await bootstrapTestContext();
      otherMonitorId = await createMonitor(otherCtx, {
        name: "Other Org Monitor",
        type: "https",
      });

      const createResponse = await fetch(`${API_BASE_URL}/api/v1/slo`, {
        method: "POST",
        headers: otherCtx.headers,
        body: JSON.stringify({
          monitorId: otherMonitorId,
          name: "Other Org SLO",
          targetPercentage: 99.9,
        }),
      });
      otherSloId = (await createResponse.json()).data.id;
    });

    it("cannot view SLO from another organization", async () => {
      const response = await fetch(`${API_BASE_URL}/api/v1/slo/${otherSloId}`, {
        method: "GET",
        headers: ctx.headers,
      });

      expect(response.status).toBe(404);
    });

    it("cannot update SLO from another organization", async () => {
      const response = await fetch(`${API_BASE_URL}/api/v1/slo/${otherSloId}`, {
        method: "PATCH",
        headers: ctx.headers,
        body: JSON.stringify({ name: "Hacked" }),
      });

      expect(response.status).toBe(404);
    });

    it("cannot delete SLO from another organization", async () => {
      const response = await fetch(`${API_BASE_URL}/api/v1/slo/${otherSloId}`, {
        method: "DELETE",
        headers: ctx.headers,
      });

      expect(response.status).toBe(404);
    });

    it("cannot access budget history from another organization", async () => {
      const response = await fetch(`${API_BASE_URL}/api/v1/slo/${otherSloId}/budgets`, {
        method: "GET",
        headers: ctx.headers,
      });

      expect(response.status).toBe(404);
    });

    it("cannot access breach history from another organization", async () => {
      const response = await fetch(`${API_BASE_URL}/api/v1/slo/${otherSloId}/breaches`, {
        method: "GET",
        headers: ctx.headers,
      });

      expect(response.status).toBe(404);
    });

    it("list only returns SLOs from own organization", async () => {
      const response = await fetch(`${API_BASE_URL}/api/v1/slo`, {
        method: "GET",
        headers: ctx.headers,
      });

      expect(response.status).toBe(200);
      const body = await response.json();

      // Should not contain other org's SLO
      const sloIds = body.data.map((s: any) => s.id);
      expect(sloIds).not.toContain(otherSloId);
    });
  });

  describe("Validation", () => {
    it("rejects missing required fields", async () => {
      const response = await fetch(`${API_BASE_URL}/api/v1/slo`, {
        method: "POST",
        headers: ctx.headers,
        body: JSON.stringify({
          // Missing monitorId, name, targetPercentage
        }),
      });

      expect(response.status).toBe(400);
    });

    it("rejects invalid window type", async () => {
      const response = await fetch(`${API_BASE_URL}/api/v1/slo`, {
        method: "POST",
        headers: ctx.headers,
        body: JSON.stringify({
          monitorId,
          name: "Invalid Window",
          targetPercentage: 99.9,
          window: "invalid",
        }),
      });

      expect(response.status).toBe(400);
    });

    it("rejects target percentage above 100", async () => {
      const response = await fetch(`${API_BASE_URL}/api/v1/slo`, {
        method: "POST",
        headers: ctx.headers,
        body: JSON.stringify({
          monitorId,
          name: "Invalid Percentage",
          targetPercentage: 101,
        }),
      });

      expect(response.status).toBe(400);
    });

    it("rejects target percentage below 0", async () => {
      const response = await fetch(`${API_BASE_URL}/api/v1/slo`, {
        method: "POST",
        headers: ctx.headers,
        body: JSON.stringify({
          monitorId,
          name: "Negative Percentage",
          targetPercentage: -5,
        }),
      });

      expect(response.status).toBe(400);
    });

    it("rejects empty name", async () => {
      const response = await fetch(`${API_BASE_URL}/api/v1/slo`, {
        method: "POST",
        headers: ctx.headers,
        body: JSON.stringify({
          monitorId,
          name: "",
          targetPercentage: 99.9,
        }),
      });

      expect(response.status).toBe(400);
    });
  });
});
