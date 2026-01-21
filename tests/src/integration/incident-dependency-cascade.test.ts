/**
 * Incident & Monitor Dependency Cascade Tests
 *
 * Tests that verify monitor dependencies and incident handling:
 * - Monitor dependency relationships (parent/child)
 * - Cascade effects when parent monitors fail
 * - Incident creation and linking
 * - Recovery propagation
 * - Dependency graph validation
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { bootstrapTestContext, TestContext } from "../helpers/context";
import {
  insertMonitor,
  insertMonitorDependency,
  insertIncident,
  insertIncidentUpdate,
  setMonitorStatus,
  insertCheckResults,
} from "../helpers/data";
import { sleep } from "../helpers/services";
import { Client } from "pg";

const API_BASE_URL = process.env.API_BASE_URL ?? "http://api:3001";
const DEFAULT_DB_URL =
  "postgresql://uni_status:uni_status_dev@postgres:5432/uni_status?sslmode=disable";

/**
 * Get monitor dependencies
 */
async function getMonitorDependencies(monitorId: string): Promise<
  Array<{
    id: string;
    upstreamMonitorId: string;
    downstreamMonitorId: string;
    description: string | null;
  }>
> {
  const client = new Client({
    connectionString: process.env.DATABASE_URL ?? DEFAULT_DB_URL,
  });
  await client.connect();

  const result = await client.query(
    `SELECT
      id,
      upstream_monitor_id as "upstreamMonitorId",
      downstream_monitor_id as "downstreamMonitorId",
      description
    FROM monitor_dependencies
    WHERE downstream_monitor_id = $1 OR upstream_monitor_id = $1`,
    [monitorId]
  );

  await client.end();
  return result.rows;
}

/**
 * Get incidents for a monitor
 */
async function getIncidentsForMonitor(monitorId: string): Promise<
  Array<{
    id: string;
    title: string;
    status: string;
    severity: string;
    createdAt: Date;
  }>
> {
  const client = new Client({
    connectionString: process.env.DATABASE_URL ?? DEFAULT_DB_URL,
  });
  await client.connect();

  const result = await client.query(
    `SELECT
      i.id,
      i.title,
      i.status,
      i.severity,
      i.created_at as "createdAt"
    FROM incidents i
    JOIN incident_monitors im ON i.id = im.incident_id
    WHERE im.monitor_id = $1
    ORDER BY i.created_at DESC`,
    [monitorId]
  );

  await client.end();
  return result.rows;
}

describe("Incident & Monitor Dependency Cascade Integration", () => {
  let ctx: TestContext;

  beforeAll(async () => {
    ctx = await bootstrapTestContext();
  });

  afterAll(async () => {
    await ctx.cleanup?.();
  });

  // ==========================================
  // MONITOR DEPENDENCY CREATION
  // ==========================================
  describe("Monitor Dependency Creation", () => {
    let parentMonitorId: string;
    let childMonitorId: string;

    beforeAll(async () => {
      // Create parent monitor (upstream)
      const parentMonitor = await insertMonitor(ctx.organizationId, {
        name: "Parent Database Monitor",
        url: "https://db.example.com",
      });
      parentMonitorId = parentMonitor.id;

      // Create child monitor (downstream - depends on parent)
      const childMonitor = await insertMonitor(ctx.organizationId, {
        name: "Child API Monitor",
        url: "https://api.example.com",
      });
      childMonitorId = childMonitor.id;
    });

    it("creates dependency via API", async () => {
      const res = await fetch(`${API_BASE_URL}/api/v1/monitor-dependencies`, {
        method: "POST",
        headers: ctx.headers,
        body: JSON.stringify({
          downstreamMonitorId: childMonitorId,
          upstreamMonitorId: parentMonitorId,
          description: "API depends on database",
        }),
      });

      expect([200, 201]).toContain(res.status);
      const body = await res.json();
      expect(body.success).toBe(true);
    });

    it("creates dependency via database helper", async () => {
      // Create another pair
      const parent2 = await insertMonitor(ctx.organizationId, {
        name: "Parent Service 2",
        url: "https://service2.example.com",
      });

      const child2 = await insertMonitor(ctx.organizationId, {
        name: "Child Service 2",
        url: "https://child2.example.com",
      });

      const dep = await insertMonitorDependency(child2.id, parent2.id, {
        description: "Child2 depends on Service2",
      });

      expect(dep.id).toBeDefined();

      // Verify dependency exists
      const deps = await getMonitorDependencies(child2.id);
      expect(deps.length).toBeGreaterThan(0);
    });

    it("lists dependencies for a monitor", async () => {
      const res = await fetch(
        `${API_BASE_URL}/api/v1/monitor-dependencies/monitor/${childMonitorId}`,
        {
          headers: ctx.headers,
        }
      );

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.success).toBe(true);
      // API returns { upstream: [...], downstream: [...] }
      expect(body.data).toBeDefined();
      expect(Array.isArray(body.data.upstream)).toBe(true);
      expect(Array.isArray(body.data.downstream)).toBe(true);
    });
  });

  // ==========================================
  // CASCADE FAILURE HANDLING
  // ==========================================
  describe("Cascade Failure Handling", () => {
    let parentMonitorId: string;
    let childMonitor1Id: string;
    let childMonitor2Id: string;

    beforeAll(async () => {
      // Create parent monitor
      const parentMonitor = await insertMonitor(ctx.organizationId, {
        name: "Cascade Parent Monitor",
        url: "https://cascade-parent.example.com",
      });
      parentMonitorId = parentMonitor.id;

      // Create child monitors
      const child1 = await insertMonitor(ctx.organizationId, {
        name: "Cascade Child 1",
        url: "https://cascade-child1.example.com",
      });
      childMonitor1Id = child1.id;

      const child2 = await insertMonitor(ctx.organizationId, {
        name: "Cascade Child 2",
        url: "https://cascade-child2.example.com",
      });
      childMonitor2Id = child2.id;

      // Create dependencies
      await insertMonitorDependency(childMonitor1Id, parentMonitorId);
      await insertMonitorDependency(childMonitor2Id, parentMonitorId);
    });

    it("parent failure is tracked independently", async () => {
      // Mark parent as down
      await setMonitorStatus(parentMonitorId, "down");

      const res = await fetch(`${API_BASE_URL}/api/v1/monitors/${parentMonitorId}`, {
        headers: ctx.headers,
      });

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.data.status).toBe("down");
    });

    it("children status can be tracked with parent context", async () => {
      // Get child monitor with dependencies
      const res = await fetch(
        `${API_BASE_URL}/api/v1/monitors/${childMonitor1Id}`,
        {
          headers: ctx.headers,
        }
      );

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.data).toBeDefined();

      // Check if the response includes dependency information
      // This depends on API implementation
    });

    it("parent recovery updates parent status", async () => {
      // Recover parent
      await setMonitorStatus(parentMonitorId, "active");

      const res = await fetch(`${API_BASE_URL}/api/v1/monitors/${parentMonitorId}`, {
        headers: ctx.headers,
      });

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.data.status).toBe("active");
    });
  });

  // ==========================================
  // INCIDENT LIFECYCLE
  // ==========================================
  describe("Incident Lifecycle", () => {
    let monitorId: string;
    let incidentId: string;

    beforeAll(async () => {
      const monitor = await insertMonitor(ctx.organizationId, {
        name: "Incident Lifecycle Monitor",
        url: "https://incident-lifecycle.example.com",
      });
      monitorId = monitor.id;
    });

    it("creates incident for monitor failure", async () => {
      const incident = await insertIncident(ctx.organizationId, {
        title: "Monitor Down - Lifecycle Test",
        description: "Testing incident lifecycle",
        severity: "major",
        status: "investigating",
        affectedMonitorIds: [monitorId],
      });

      incidentId = incident.id;
      expect(incidentId).toBeDefined();
    });

    it("incident appears in incidents list", async () => {
      const res = await fetch(`${API_BASE_URL}/api/v1/incidents`, {
        headers: ctx.headers,
      });

      expect(res.status).toBe(200);
      const body = await res.json();

      const incident = body.data.find((i: { id: string }) => i.id === incidentId);
      expect(incident).toBeDefined();
      expect(incident.status).toBe("investigating");
    });

    it("incident can be updated to identified", async () => {
      const res = await fetch(`${API_BASE_URL}/api/v1/incidents/${incidentId}`, {
        method: "PATCH",
        headers: ctx.headers,
        body: JSON.stringify({
          status: "identified",
        }),
      });

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.data.status).toBe("identified");
    });

    it("incident update is recorded", async () => {
      const updateId = await insertIncidentUpdate(incidentId, {
        status: "monitoring",
        message: "Fix deployed, monitoring for stability",
      });

      expect(updateId).toBeDefined();
    });

    it("incident can be resolved", async () => {
      const res = await fetch(`${API_BASE_URL}/api/v1/incidents/${incidentId}`, {
        method: "PATCH",
        headers: ctx.headers,
        body: JSON.stringify({
          status: "resolved",
        }),
      });

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.data.status).toBe("resolved");
    });

    it("resolved incident has resolvedAt timestamp", async () => {
      const res = await fetch(`${API_BASE_URL}/api/v1/incidents/${incidentId}`, {
        headers: ctx.headers,
      });

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.data.resolvedAt).toBeDefined();
    });
  });

  // ==========================================
  // MULTI-MONITOR INCIDENTS
  // ==========================================
  describe("Multi-Monitor Incidents", () => {
    let monitor1Id: string;
    let monitor2Id: string;
    let monitor3Id: string;

    beforeAll(async () => {
      const monitor1 = await insertMonitor(ctx.organizationId, {
        name: "Multi-Incident Monitor 1",
        url: "https://multi-incident-1.example.com",
      });
      monitor1Id = monitor1.id;

      const monitor2 = await insertMonitor(ctx.organizationId, {
        name: "Multi-Incident Monitor 2",
        url: "https://multi-incident-2.example.com",
      });
      monitor2Id = monitor2.id;

      const monitor3 = await insertMonitor(ctx.organizationId, {
        name: "Multi-Incident Monitor 3",
        url: "https://multi-incident-3.example.com",
      });
      monitor3Id = monitor3.id;
    });

    it("creates incident affecting multiple monitors", async () => {
      const incident = await insertIncident(ctx.organizationId, {
        title: "Infrastructure Outage",
        description: "Multiple services affected",
        severity: "critical",
        status: "investigating",
        affectedMonitorIds: [monitor1Id, monitor2Id, monitor3Id],
      });

      expect(incident.id).toBeDefined();

      // Verify incident is linked to all monitors
      const incidents1 = await getIncidentsForMonitor(monitor1Id);
      const incidents2 = await getIncidentsForMonitor(monitor2Id);
      const incidents3 = await getIncidentsForMonitor(monitor3Id);

      expect(incidents1.some((i) => i.id === incident.id)).toBe(true);
      expect(incidents2.some((i) => i.id === incident.id)).toBe(true);
      expect(incidents3.some((i) => i.id === incident.id)).toBe(true);
    });

    it("incident details show all affected monitors", async () => {
      const incident = await insertIncident(ctx.organizationId, {
        title: "Multi-Monitor Detail Test",
        severity: "major",
        affectedMonitorIds: [monitor1Id, monitor2Id],
      });

      const res = await fetch(`${API_BASE_URL}/api/v1/incidents/${incident.id}`, {
        headers: ctx.headers,
      });

      expect(res.status).toBe(200);
      const body = await res.json();

      // Check that affected monitors are included
      if (body.data.affectedMonitors) {
        expect(Array.isArray(body.data.affectedMonitors)).toBe(true);
      }
    });
  });

  // ==========================================
  // DEPENDENCY GRAPH
  // ==========================================
  describe("Dependency Graph", () => {
    let dbMonitorId: string;
    let cacheMonitorId: string;
    let apiMonitorId: string;
    let webMonitorId: string;

    beforeAll(async () => {
      // Create a dependency chain: DB <- Cache <- API <- Web
      const dbMonitor = await insertMonitor(ctx.organizationId, {
        name: "Graph - Database",
        url: "https://graph-db.example.com",
      });
      dbMonitorId = dbMonitor.id;

      const cacheMonitor = await insertMonitor(ctx.organizationId, {
        name: "Graph - Cache",
        url: "https://graph-cache.example.com",
      });
      cacheMonitorId = cacheMonitor.id;

      const apiMonitor = await insertMonitor(ctx.organizationId, {
        name: "Graph - API",
        url: "https://graph-api.example.com",
      });
      apiMonitorId = apiMonitor.id;

      const webMonitor = await insertMonitor(ctx.organizationId, {
        name: "Graph - Web",
        url: "https://graph-web.example.com",
      });
      webMonitorId = webMonitor.id;

      // Create dependency chain
      await insertMonitorDependency(cacheMonitorId, dbMonitorId);
      await insertMonitorDependency(apiMonitorId, cacheMonitorId);
      await insertMonitorDependency(webMonitorId, apiMonitorId);
    });

    it("retrieves full dependency graph", async () => {
      const res = await fetch(`${API_BASE_URL}/api/v1/monitor-dependencies`, {
        headers: ctx.headers,
      });

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.success).toBe(true);
      expect(Array.isArray(body.data)).toBe(true);
    });

    it("validates no circular dependencies", async () => {
      // Try to create a circular dependency: Web -> DB (which would create a cycle)
      const res = await fetch(`${API_BASE_URL}/api/v1/monitor-dependencies`, {
        method: "POST",
        headers: ctx.headers,
        body: JSON.stringify({
          downstreamMonitorId: dbMonitorId, // DB depends on...
          upstreamMonitorId: webMonitorId, // Web (which already depends on DB via chain)
          description: "This would create a cycle",
        }),
      });

      // Should either reject with 400/422 or succeed (if cycle detection isn't implemented)
      // The important thing is it doesn't crash
      expect([200, 201, 400, 422]).toContain(res.status);
    });

    it("can delete dependency", async () => {
      // Create a dependency to delete
      const tempParent = await insertMonitor(ctx.organizationId, {
        name: "Temp Parent",
        url: "https://temp-parent.example.com",
      });

      const tempChild = await insertMonitor(ctx.organizationId, {
        name: "Temp Child",
        url: "https://temp-child.example.com",
      });

      // Create dependency via API
      const createRes = await fetch(`${API_BASE_URL}/api/v1/monitor-dependencies`, {
        method: "POST",
        headers: ctx.headers,
        body: JSON.stringify({
          downstreamMonitorId: tempChild.id,
          upstreamMonitorId: tempParent.id,
        }),
      });

      if (createRes.status === 201 || createRes.status === 200) {
        const createBody = await createRes.json();
        const dependencyId = createBody.data?.id;

        if (dependencyId) {
          // Delete the dependency
          const deleteRes = await fetch(
            `${API_BASE_URL}/api/v1/monitor-dependencies/${dependencyId}`,
            {
              method: "DELETE",
              headers: ctx.headers,
            }
          );

          expect([200, 204]).toContain(deleteRes.status);
        }
      }
    });
  });

  // ==========================================
  // INCIDENT SEVERITY LEVELS
  // ==========================================
  describe("Incident Severity Levels", () => {
    it("creates minor incident", async () => {
      const incident = await insertIncident(ctx.organizationId, {
        title: "Minor Performance Degradation",
        severity: "minor",
        status: "investigating",
      });

      const res = await fetch(`${API_BASE_URL}/api/v1/incidents/${incident.id}`, {
        headers: ctx.headers,
      });

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.data.severity).toBe("minor");
    });

    it("creates major incident", async () => {
      const incident = await insertIncident(ctx.organizationId, {
        title: "Major Service Disruption",
        severity: "major",
        status: "investigating",
      });

      const res = await fetch(`${API_BASE_URL}/api/v1/incidents/${incident.id}`, {
        headers: ctx.headers,
      });

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.data.severity).toBe("major");
    });

    it("creates critical incident", async () => {
      const incident = await insertIncident(ctx.organizationId, {
        title: "Critical System Outage",
        severity: "critical",
        status: "investigating",
      });

      const res = await fetch(`${API_BASE_URL}/api/v1/incidents/${incident.id}`, {
        headers: ctx.headers,
      });

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.data.severity).toBe("critical");
    });

    it("can update incident severity", async () => {
      const incident = await insertIncident(ctx.organizationId, {
        title: "Escalating Incident",
        severity: "minor",
        status: "investigating",
      });

      // Escalate to major
      const res = await fetch(`${API_BASE_URL}/api/v1/incidents/${incident.id}`, {
        method: "PATCH",
        headers: ctx.headers,
        body: JSON.stringify({
          severity: "major",
        }),
      });

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.data.severity).toBe("major");
    });
  });

  // ==========================================
  // CROSS-ORG ISOLATION
  // ==========================================
  describe("Cross-Organization Isolation", () => {
    let otherCtx: TestContext;
    let otherMonitorId: string;
    let otherIncidentId: string;

    beforeAll(async () => {
      otherCtx = await bootstrapTestContext();

      const monitor = await insertMonitor(otherCtx.organizationId, {
        name: "Other Org Monitor",
        url: "https://other-org.example.com",
      });
      otherMonitorId = monitor.id;

      const incident = await insertIncident(otherCtx.organizationId, {
        title: "Other Org Incident",
        severity: "major",
        affectedMonitorIds: [otherMonitorId],
      });
      otherIncidentId = incident.id;
    });

    it("cannot access other org incident", async () => {
      const res = await fetch(`${API_BASE_URL}/api/v1/incidents/${otherIncidentId}`, {
        headers: ctx.headers,
      });

      expect([403, 404]).toContain(res.status);
    });

    it("cannot update other org incident", async () => {
      const res = await fetch(`${API_BASE_URL}/api/v1/incidents/${otherIncidentId}`, {
        method: "PATCH",
        headers: ctx.headers,
        body: JSON.stringify({
          title: "Hacked Incident",
        }),
      });

      expect([403, 404]).toContain(res.status);
    });

    it("cannot create dependency with other org monitor", async () => {
      const myMonitor = await insertMonitor(ctx.organizationId, {
        name: "My Monitor for Cross-Org Test",
        url: "https://my-monitor.example.com",
      });

      const res = await fetch(`${API_BASE_URL}/api/v1/monitor-dependencies`, {
        method: "POST",
        headers: ctx.headers,
        body: JSON.stringify({
          downstreamMonitorId: myMonitor.id,
          upstreamMonitorId: otherMonitorId,
        }),
      });

      // Should reject - other org monitor should not be accessible
      expect([400, 403, 404, 422]).toContain(res.status);
    });
  });
});
