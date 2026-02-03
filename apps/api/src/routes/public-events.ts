import { OpenAPIHono } from "@hono/zod-openapi";
import { nanoid } from "nanoid";
import { db } from "@uni-status/database";
import {
  statusPages,
  statusPageMonitors,
  monitors,
  incidents,
  incidentUpdates,
  incidentDocuments,
  maintenanceWindows,
  eventSubscriptions,
  monitorDependencies,
} from "@uni-status/database/schema";
import { eq, and, desc, gte, lte, inArray, ilike, or } from "drizzle-orm";
import type { UnifiedEvent, EventType, ImpactScopeData } from "@uni-status/shared";
import { IMPACT_SEVERITY_THRESHOLDS } from "@uni-status/shared/constants";
import { getCookie } from "hono/cookie";
import { verify } from "hono/jwt";
import { getJwtSecret, getAppUrl } from "@uni-status/shared/config";
import { sendEventSubscriptionVerificationEmail } from "../lib/email";

// Use function to get JWT secret with fallback for tests
const getJwtSecretOrFallback = () => getJwtSecret() || "test-secret";

export const publicEventsRoutes = new OpenAPIHono();

// Helper to determine maintenance window status
function getMaintenanceStatus(startsAt: Date, endsAt: Date): "scheduled" | "active" | "completed" {
  const now = new Date();
  if (now < startsAt) return "scheduled";
  if (now > endsAt) return "completed";
  return "active";
}

// Helper to calculate impact score based on severity and scope
function calculateImpactScore(
  severity: string,
  affectedMonitorCount: number,
  totalMonitorCount: number,
  affectedRegionCount: number,
  hasDependencies: boolean
): number {
  // Base score from severity
  const severityScores: Record<string, number> = {
    critical: IMPACT_SEVERITY_THRESHOLDS.critical.maxScore,
    major: IMPACT_SEVERITY_THRESHOLDS.high.maxScore,
    minor: IMPACT_SEVERITY_THRESHOLDS.medium.maxScore,
    maintenance: IMPACT_SEVERITY_THRESHOLDS.low.maxScore,
  };
  const baseScore = severityScores[severity] ?? 20;

  // Scope multiplier based on affected percentage
  const affectedPercentage = totalMonitorCount > 0
    ? (affectedMonitorCount / totalMonitorCount) * 100
    : 0;

  let scopeMultiplier = 1.0;
  if (affectedPercentage >= 75) {
    scopeMultiplier = 1.5;
  } else if (affectedPercentage >= 50) {
    scopeMultiplier = 1.3;
  } else if (affectedPercentage >= 25) {
    scopeMultiplier = 1.15;
  }

  // Region factor
  const regionFactor = Math.min(1 + (affectedRegionCount * 0.1), 1.5);

  // Dependency factor
  const dependencyFactor = hasDependencies ? 1.2 : 1.0;

  // Calculate final score (capped at 100)
  const finalScore = Math.min(
    Math.round(baseScore * scopeMultiplier * regionFactor * dependencyFactor),
    100
  );

  return finalScore;
}

// Helper to get impact scope data for an event
async function getImpactScopeData(
  affectedMonitorIds: string[],
  allStatusPageMonitorIds: string[]
): Promise<ImpactScopeData> {
  if (affectedMonitorIds.length === 0) {
    return {
      affectedRegions: [],
      affectedMonitorCount: 0,
      totalMonitorCount: allStatusPageMonitorIds.length,
      impactPercentage: 0,
      dependencies: {
        upstream: [],
        downstream: [],
      },
      impactScore: 0,
      impactLevel: "none",
    };
  }

  // Get monitor details including regions
  const monitorData = await db
    .select({
      id: monitors.id,
      name: monitors.name,
      regions: monitors.regions,
      status: monitors.status,
    })
    .from(monitors)
    .where(inArray(monitors.id, affectedMonitorIds));

  // Collect unique regions
  const regionSet = new Set<string>();
  const regionMonitorMap = new Map<string, { id: string; name: string; status: string }[]>();

  for (const monitor of monitorData) {
    const monitorRegions = (monitor.regions || []) as string[];
    for (const region of monitorRegions) {
      regionSet.add(region);
      if (!regionMonitorMap.has(region)) {
        regionMonitorMap.set(region, []);
      }
      regionMonitorMap.get(region)!.push({
        id: monitor.id,
        name: monitor.name,
        status: monitor.status,
      });
    }
  }

  // Get dependencies for affected monitors
  const [upstreamDeps, downstreamDeps] = await Promise.all([
    // Upstream: monitors that affected monitors depend on
    db
      .select({
        dependencyId: monitorDependencies.id,
        upstreamId: monitorDependencies.upstreamMonitorId,
        downstreamId: monitorDependencies.downstreamMonitorId,
        description: monitorDependencies.description,
      })
      .from(monitorDependencies)
      .where(inArray(monitorDependencies.downstreamMonitorId, affectedMonitorIds)),
    // Downstream: monitors that depend on affected monitors
    db
      .select({
        dependencyId: monitorDependencies.id,
        upstreamId: monitorDependencies.upstreamMonitorId,
        downstreamId: monitorDependencies.downstreamMonitorId,
        description: monitorDependencies.description,
      })
      .from(monitorDependencies)
      .where(inArray(monitorDependencies.upstreamMonitorId, affectedMonitorIds)),
  ]);

  // Get names for dependency monitors
  const depMonitorIds = new Set<string>();
  for (const dep of upstreamDeps) {
    depMonitorIds.add(dep.upstreamId);
  }
  for (const dep of downstreamDeps) {
    depMonitorIds.add(dep.downstreamId);
  }

  const depMonitorData = depMonitorIds.size > 0
    ? await db
        .select({ id: monitors.id, name: monitors.name, status: monitors.status })
        .from(monitors)
        .where(inArray(monitors.id, Array.from(depMonitorIds)))
    : [];

  const depMonitorMap = new Map(depMonitorData.map((m) => [m.id, m]));

  // Build dependency arrays
  const upstream = upstreamDeps
    .map((dep) => {
      const monitor = depMonitorMap.get(dep.upstreamId);
      if (!monitor) return null;
      return {
        monitorId: dep.upstreamId,
        monitorName: monitor.name,
        status: monitor.status,
        description: dep.description || undefined,
      };
    })
    .filter((d): d is NonNullable<typeof d> => d !== null);

  const downstream = downstreamDeps
    .map((dep) => {
      const monitor = depMonitorMap.get(dep.downstreamId);
      if (!monitor) return null;
      return {
        monitorId: dep.downstreamId,
        monitorName: monitor.name,
        status: monitor.status,
        description: dep.description || undefined,
      };
    })
    .filter((d): d is NonNullable<typeof d> => d !== null);

  // Calculate impact metrics
  const affectedMonitorCount = affectedMonitorIds.length;
  const totalMonitorCount = allStatusPageMonitorIds.length;
  const impactPercentage = totalMonitorCount > 0
    ? Math.round((affectedMonitorCount / totalMonitorCount) * 100)
    : 0;

  // Determine impact level
  let impactLevel: "none" | "low" | "medium" | "high" | "critical" = "none";
  if (impactPercentage >= 75) {
    impactLevel = "critical";
  } else if (impactPercentage >= 50) {
    impactLevel = "high";
  } else if (impactPercentage >= 25) {
    impactLevel = "medium";
  } else if (impactPercentage > 0) {
    impactLevel = "low";
  }

  // Build affected regions array
  const affectedRegions = Array.from(regionSet).map((region) => ({
    region,
    affectedMonitors: regionMonitorMap.get(region) || [],
  }));

  return {
    affectedRegions,
    affectedMonitorCount,
    totalMonitorCount,
    impactPercentage,
    dependencies: {
      upstream,
      downstream,
    },
    impactScore: 0, // Will be calculated with severity
    impactLevel,
  };
}

// Helper to verify status page access
async function verifyStatusPageAccess(c: any, slug: string) {
  const page = await db.query.statusPages.findFirst({
    where: eq(statusPages.slug, slug),
  });

  if (!page || !page.published) {
    return { error: { code: "NOT_FOUND", message: "Status page not found" }, status: 404 };
  }

  // Check password protection
  if (page.passwordHash) {
    const tokenCookie = getCookie(c, `sp_token_${slug}`);

    if (!tokenCookie) {
      return { error: { code: "PASSWORD_REQUIRED", message: "This status page is password protected" }, status: 401 };
    }

    try {
      const payload = await verify(tokenCookie, getJwtSecretOrFallback(), "HS256");
      if (payload.slug !== slug) {
        throw new Error("Invalid token");
      }
    } catch {
      return { error: { code: "PASSWORD_REQUIRED", message: "This status page is password protected" }, status: 401 };
    }
  }

  return { page };
}

// Get public events for a status page (unified incidents + maintenance)
publicEventsRoutes.get("/status-pages/:slug/events", async (c) => {
  const { slug } = c.req.param();

  const access = await verifyStatusPageAccess(c, slug);
  if (access.error) {
    return c.json({ success: false, error: access.error }, access.status as any);
  }
  const page = access.page!;

  // Get linked monitor IDs for this status page
  const linkedMonitors = await db.query.statusPageMonitors.findMany({
    where: eq(statusPageMonitors.statusPageId, page.id),
  });
  const monitorIds = linkedMonitors.map((lm) => lm.monitorId);

  // Parse query parameters
  const types = c.req.query("types")?.split(",") as EventType[] | undefined;
  const status = c.req.query("status")?.split(",");
  const search = c.req.query("search");
  const startDate = c.req.query("startDate");
  const endDate = c.req.query("endDate");
  const limit = Math.min(parseInt(c.req.query("limit") || "50"), 100);
  const offset = parseInt(c.req.query("offset") || "0");

  // Advanced filter parameters
  const severityFilter = c.req.query("severity")?.split(",");
  const monitorFilter = c.req.query("monitors")?.split(",");
  const regionFilter = c.req.query("regions")?.split(",");
  // Impact scope data parameter
  const includeImpact = c.req.query("includeImpact") === "true";

  // If region filter is provided, resolve which monitors match those regions
  let regionFilteredMonitorIds: string[] | null = null;
  if (regionFilter && regionFilter.length > 0 && monitorIds.length > 0) {
    const monitorsWithRegions = await db
      .select({ id: monitors.id, regions: monitors.regions })
      .from(monitors)
      .where(inArray(monitors.id, monitorIds));

    regionFilteredMonitorIds = monitorsWithRegions
      .filter((m) => {
        const monitorRegions = (m.regions || []) as string[];
        return monitorRegions.some((r) => regionFilter.includes(r));
      })
      .map((m) => m.id);
  }

  // Determine which event types to include
  // If severity filter is provided, also consider it for type filtering
  // e.g., if severity=["critical"] only, don't include maintenance
  const hasSeverityFilter = severityFilter && severityFilter.length > 0;
  const hasMaintenanceSeverity = severityFilter?.includes("maintenance");
  const hasIncidentSeverity = severityFilter?.some((s) =>
    ["minor", "major", "critical"].includes(s)
  );

  let includeIncidents = !types || types.includes("incident");
  let includeMaintenance = !types || types.includes("maintenance");

  // If severity filter is active, adjust what we include
  if (hasSeverityFilter) {
    // If severity filter only has incident levels, exclude maintenance
    if (hasIncidentSeverity && !hasMaintenanceSeverity) {
      includeMaintenance = false;
    }
    // If severity filter only has "maintenance", exclude incidents
    if (hasMaintenanceSeverity && !hasIncidentSeverity) {
      includeIncidents = false;
    }
  }

  let allEvents: UnifiedEvent[] = [];

  // Build incident status filter
  const incidentStatuses = status?.filter((s) =>
    ["investigating", "identified", "monitoring", "resolved"].includes(s)
  );

  // Fetch incidents
  if (includeIncidents && monitorIds.length > 0) {
    let incidentWhere = eq(incidents.organizationId, page.organizationId);

    // Status filter
    if (incidentStatuses && incidentStatuses.length > 0) {
      incidentWhere = and(
        incidentWhere,
        inArray(incidents.status, incidentStatuses as any)
      )!;
    }

    // Severity filter
    if (severityFilter && severityFilter.length > 0) {
      // Only apply severity filter to incidents (not maintenance)
      const validSeverities = severityFilter.filter((s) =>
        ["minor", "major", "critical"].includes(s)
      );
      if (validSeverities.length > 0) {
        incidentWhere = and(
          incidentWhere,
          inArray(incidents.severity, validSeverities as any)
        )!;
      }
    }

    // Search filter
    if (search) {
      incidentWhere = and(
        incidentWhere,
        or(
          ilike(incidents.title, `%${search}%`),
          ilike(incidents.message, `%${search}%`)
        )
      )!;
    }

    // Date filters
    if (startDate) {
      incidentWhere = and(
        incidentWhere,
        gte(incidents.startedAt, new Date(startDate))
      )!;
    }
    if (endDate) {
      incidentWhere = and(
        incidentWhere,
        lte(incidents.startedAt, new Date(endDate))
      )!;
    }

    const incidentResults = await db.query.incidents.findMany({
      where: incidentWhere,
      orderBy: [desc(incidents.startedAt)],
      with: {
        updates: {
          orderBy: [desc(incidentUpdates.createdAt)],
        },
        documents: {
          orderBy: [desc(incidentDocuments.createdAt)],
        },
      },
    });

    // Filter to incidents that affect monitors on this status page
    const filteredIncidents = incidentResults.filter((incident) => {
      const affectedMonitors = (incident.affectedMonitors || []) as string[];

      // Must affect at least one monitor on this status page
      if (!affectedMonitors.some((mid) => monitorIds.includes(mid))) {
        return false;
      }

      // If monitor filter is provided, check overlap
      if (monitorFilter && monitorFilter.length > 0) {
        if (!affectedMonitors.some((mid) => monitorFilter.includes(mid))) {
          return false;
        }
      }

      // If region filter is provided, check if affected monitors include any region-matching monitors
      if (regionFilteredMonitorIds !== null) {
        if (!affectedMonitors.some((mid) => regionFilteredMonitorIds!.includes(mid))) {
          return false;
        }
      }

      return true;
    });

    for (const incident of filteredIncidents) {
      allEvents.push({
        id: incident.id,
        type: "incident",
        title: incident.title,
        description: incident.message,
        status: incident.status,
        severity: incident.severity,
        affectedMonitors: ((incident.affectedMonitors || []) as string[]).filter(
          (mid) => monitorIds.includes(mid)
        ),
        startedAt: incident.startedAt.toISOString(),
        endedAt: incident.resolvedAt?.toISOString() || null,
        updates: incident.updates.map((u) => ({
          id: u.id,
          status: u.status,
          message: u.message,
          createdAt: u.createdAt.toISOString(),
        })),
        documents: incident.documents?.map((d) => ({
          id: d.id,
          title: d.title,
          documentUrl: d.documentUrl,
          documentType: d.documentType,
          description: d.description,
          createdAt: d.createdAt.toISOString(),
        })) || [],
        createdAt: incident.createdAt.toISOString(),
        updatedAt: incident.updatedAt.toISOString(),
      });
    }
  }

  // Fetch maintenance windows
  if (includeMaintenance && monitorIds.length > 0) {
    let maintenanceWhere = eq(maintenanceWindows.organizationId, page.organizationId);

    // Search filter
    if (search) {
      maintenanceWhere = and(
        maintenanceWhere,
        or(
          ilike(maintenanceWindows.name, `%${search}%`),
          ilike(maintenanceWindows.description, `%${search}%`)
        )
      )!;
    }

    // Date filters
    if (startDate) {
      maintenanceWhere = and(
        maintenanceWhere,
        gte(maintenanceWindows.startsAt, new Date(startDate))
      )!;
    }
    if (endDate) {
      maintenanceWhere = and(
        maintenanceWhere,
        lte(maintenanceWindows.startsAt, new Date(endDate))
      )!;
    }

    const maintenanceResults = await db.query.maintenanceWindows.findMany({
      where: maintenanceWhere,
      orderBy: [desc(maintenanceWindows.startsAt)],
    });

    // Filter to maintenance windows that affect monitors on this status page
    const filteredMaintenance = maintenanceResults.filter((mw) => {
      const affectedMonitors = (mw.affectedMonitors || []) as string[];

      // Must affect at least one monitor on this status page
      if (!affectedMonitors.some((mid) => monitorIds.includes(mid))) {
        return false;
      }

      // If monitor filter is provided, check overlap
      if (monitorFilter && monitorFilter.length > 0) {
        if (!affectedMonitors.some((mid) => monitorFilter.includes(mid))) {
          return false;
        }
      }

      // If region filter is provided, check if affected monitors include any region-matching monitors
      if (regionFilteredMonitorIds !== null) {
        if (!affectedMonitors.some((mid) => regionFilteredMonitorIds!.includes(mid))) {
          return false;
        }
      }

      return true;
    });

    // Filter by computed status if needed
    const maintenanceStatuses = status?.filter((s) =>
      ["scheduled", "active", "completed"].includes(s)
    );

    for (const mw of filteredMaintenance) {
      const computedStatus = getMaintenanceStatus(mw.startsAt, mw.endsAt);

      // Skip if status filter doesn't match
      if (maintenanceStatuses && maintenanceStatuses.length > 0 && !maintenanceStatuses.includes(computedStatus)) {
        continue;
      }

      allEvents.push({
        id: mw.id,
        type: "maintenance",
        title: mw.name,
        description: mw.description,
        status: computedStatus,
        severity: "maintenance",
        affectedMonitors: ((mw.affectedMonitors || []) as string[]).filter(
          (mid) => monitorIds.includes(mid)
        ),
        startedAt: mw.startsAt.toISOString(),
        endedAt: mw.endsAt.toISOString(),
        timezone: mw.timezone,
        updates: [],
        createdAt: mw.createdAt.toISOString(),
        updatedAt: mw.updatedAt.toISOString(),
      });
    }
  }

  // Get monitor details for display
  const allMonitorIds = new Set<string>();
  for (const event of allEvents) {
    for (const monitorId of event.affectedMonitors) {
      allMonitorIds.add(monitorId);
    }
  }

  if (allMonitorIds.size > 0) {
    const monitorData = await db
      .select({ id: monitors.id, name: monitors.name })
      .from(monitors)
      .where(inArray(monitors.id, Array.from(allMonitorIds)));

    const monitorMap = new Map(monitorData.map((m) => [m.id, m]));

    // Get display names from status page monitor config
    const displayNameMap = new Map(
      linkedMonitors.map((lm) => [lm.monitorId, lm.displayName])
    );

    for (const event of allEvents) {
      event.affectedMonitorDetails = event.affectedMonitors
        .map((id) => {
          const monitor = monitorMap.get(id);
          if (!monitor) return null;
          return {
            id: monitor.id,
            name: displayNameMap.get(id) || monitor.name,
          };
        })
        .filter((m): m is { id: string; name: string } => m !== null);
    }
  }

  // Sort all events by start date (newest first)
  allEvents.sort(
    (a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime()
  );

  // Fetch impact scope data if requested
  if (includeImpact && allEvents.length > 0) {
    // Process events in batches to avoid too many parallel queries
    const batchSize = 10;
    for (let i = 0; i < allEvents.length; i += batchSize) {
      const batch = allEvents.slice(i, i + batchSize);
      await Promise.all(
        batch.map(async (event) => {
          const impactScope = await getImpactScopeData(
            event.affectedMonitors,
            monitorIds
          );
          // Calculate impact score with severity
          const hasDependencies =
            impactScope.dependencies.upstream.length > 0 ||
            impactScope.dependencies.downstream.length > 0;
          impactScope.impactScore = calculateImpactScore(
            event.severity,
            impactScope.affectedMonitorCount,
            impactScope.totalMonitorCount,
            impactScope.affectedRegions.length,
            hasDependencies
          );
          // Update impact level based on combined score
          if (impactScope.impactScore >= 80) {
            impactScope.impactLevel = "critical";
          } else if (impactScope.impactScore >= 60) {
            impactScope.impactLevel = "high";
          } else if (impactScope.impactScore >= 40) {
            impactScope.impactLevel = "medium";
          } else if (impactScope.impactScore > 0) {
            impactScope.impactLevel = "low";
          }
          event.impactScope = impactScope;
        })
      );
    }
  }

  // Apply pagination
  const total = allEvents.length;
  const paginatedEvents = allEvents.slice(offset, offset + limit);

  return c.json({
    success: true,
    data: {
      events: paginatedEvents,
      total,
      hasMore: offset + limit < total,
    },
  });
});

publicEventsRoutes.get("/status-pages/:slug/events/:type/:id", async (c) => {
  const { slug, type, id } = c.req.param();
  // Impact is always included for single event requests (opt-out with includeImpact=false)
  const includeImpact = c.req.query("includeImpact") !== "false";

  const access = await verifyStatusPageAccess(c, slug);
  if (access.error) {
    return c.json({ success: false, error: access.error }, access.status as any);
  }
  const page = access.page!;

  // Get linked monitor IDs
  const linkedMonitors = await db.query.statusPageMonitors.findMany({
    where: eq(statusPageMonitors.statusPageId, page.id),
  });
  const monitorIds = linkedMonitors.map((lm) => lm.monitorId);

  if (type === "incident") {
    const incident = await db.query.incidents.findFirst({
      where: and(
        eq(incidents.id, id),
        eq(incidents.organizationId, page.organizationId)
      ),
      with: {
        updates: {
          orderBy: [desc(incidentUpdates.createdAt)],
        },
        documents: {
          orderBy: [desc(incidentDocuments.createdAt)],
        },
      },
    });

    if (!incident) {
      return c.json({ success: false, error: { code: "NOT_FOUND" } }, 404);
    }

    // Verify incident affects monitors on this status page
    const affectedMonitors = (incident.affectedMonitors || []) as string[];
    if (!affectedMonitors.some((mid) => monitorIds.includes(mid))) {
      return c.json({ success: false, error: { code: "NOT_FOUND" } }, 404);
    }

    // Get monitor details
    const visibleMonitors = affectedMonitors.filter((mid) => monitorIds.includes(mid));
    const monitorData = await db
      .select({ id: monitors.id, name: monitors.name })
      .from(monitors)
      .where(inArray(monitors.id, visibleMonitors));

    const displayNameMap = new Map(linkedMonitors.map((lm) => [lm.monitorId, lm.displayName]));

    const event: UnifiedEvent = {
      id: incident.id,
      type: "incident",
      title: incident.title,
      description: incident.message,
      status: incident.status,
      severity: incident.severity,
      affectedMonitors: visibleMonitors,
      affectedMonitorDetails: monitorData.map((m) => ({
        id: m.id,
        name: displayNameMap.get(m.id) || m.name,
      })),
      startedAt: incident.startedAt.toISOString(),
      endedAt: incident.resolvedAt?.toISOString() || null,
      updates: incident.updates.map((u) => ({
        id: u.id,
        status: u.status,
        message: u.message,
        createdAt: u.createdAt.toISOString(),
      })),
      documents: incident.documents?.map((d) => ({
        id: d.id,
        title: d.title,
        documentUrl: d.documentUrl,
        documentType: d.documentType,
        description: d.description,
        createdAt: d.createdAt.toISOString(),
      })) || [],
      createdAt: incident.createdAt.toISOString(),
      updatedAt: incident.updatedAt.toISOString(),
    };

    // Add impact scope data
    if (includeImpact) {
      const impactScope = await getImpactScopeData(visibleMonitors, monitorIds);
      const hasDependencies =
        impactScope.dependencies.upstream.length > 0 ||
        impactScope.dependencies.downstream.length > 0;
      impactScope.impactScore = calculateImpactScore(
        incident.severity,
        impactScope.affectedMonitorCount,
        impactScope.totalMonitorCount,
        impactScope.affectedRegions.length,
        hasDependencies
      );
      if (impactScope.impactScore >= 80) {
        impactScope.impactLevel = "critical";
      } else if (impactScope.impactScore >= 60) {
        impactScope.impactLevel = "high";
      } else if (impactScope.impactScore >= 40) {
        impactScope.impactLevel = "medium";
      } else if (impactScope.impactScore > 0) {
        impactScope.impactLevel = "low";
      }
      event.impactScope = impactScope;
    }

    return c.json({ success: true, data: event });
  } else if (type === "maintenance") {
    const mw = await db.query.maintenanceWindows.findFirst({
      where: and(
        eq(maintenanceWindows.id, id),
        eq(maintenanceWindows.organizationId, page.organizationId)
      ),
    });

    if (!mw) {
      return c.json({ success: false, error: { code: "NOT_FOUND" } }, 404);
    }

    // Verify maintenance affects monitors on this status page
    const affectedMonitors = (mw.affectedMonitors || []) as string[];
    if (!affectedMonitors.some((mid) => monitorIds.includes(mid))) {
      return c.json({ success: false, error: { code: "NOT_FOUND" } }, 404);
    }

    // Get monitor details
    const visibleMonitors = affectedMonitors.filter((mid) => monitorIds.includes(mid));
    const monitorData = await db
      .select({ id: monitors.id, name: monitors.name })
      .from(monitors)
      .where(inArray(monitors.id, visibleMonitors));

    const displayNameMap = new Map(linkedMonitors.map((lm) => [lm.monitorId, lm.displayName]));

    const event: UnifiedEvent = {
      id: mw.id,
      type: "maintenance",
      title: mw.name,
      description: mw.description,
      status: getMaintenanceStatus(mw.startsAt, mw.endsAt),
      severity: "maintenance",
      affectedMonitors: visibleMonitors,
      affectedMonitorDetails: monitorData.map((m) => ({
        id: m.id,
        name: displayNameMap.get(m.id) || m.name,
      })),
      startedAt: mw.startsAt.toISOString(),
      endedAt: mw.endsAt.toISOString(),
      timezone: mw.timezone,
      updates: [],
      createdAt: mw.createdAt.toISOString(),
      updatedAt: mw.updatedAt.toISOString(),
    };

    // Add impact scope data
    if (includeImpact) {
      const impactScope = await getImpactScopeData(visibleMonitors, monitorIds);
      const hasDependencies =
        impactScope.dependencies.upstream.length > 0 ||
        impactScope.dependencies.downstream.length > 0;
      impactScope.impactScore = calculateImpactScore(
        "maintenance",
        impactScope.affectedMonitorCount,
        impactScope.totalMonitorCount,
        impactScope.affectedRegions.length,
        hasDependencies
      );
      if (impactScope.impactScore >= 80) {
        impactScope.impactLevel = "critical";
      } else if (impactScope.impactScore >= 60) {
        impactScope.impactLevel = "high";
      } else if (impactScope.impactScore >= 40) {
        impactScope.impactLevel = "medium";
      } else if (impactScope.impactScore > 0) {
        impactScope.impactLevel = "low";
      }
      event.impactScope = impactScope;
    }

    return c.json({ success: true, data: event });
  } else {
    return c.json({ success: false, error: { code: "INVALID_TYPE" } }, 400);
  }
});

// Subscribe to a specific event (public, email-based)
publicEventsRoutes.post("/status-pages/:slug/events/:type/:id/subscribe", async (c) => {
  const { slug, type, id } = c.req.param();

  if (type !== "incident" && type !== "maintenance") {
    return c.json({ success: false, error: { code: "INVALID_TYPE" } }, 400);
  }

  const access = await verifyStatusPageAccess(c, slug);
  if (access.error) {
    return c.json({ success: false, error: access.error }, access.status as any);
  }
  const page = access.page!;

  // Verify event exists and belongs to this status page's organization
  let eventTitle: string;
  if (type === "incident") {
    const incident = await db.query.incidents.findFirst({
      where: and(
        eq(incidents.id, id),
        eq(incidents.organizationId, page.organizationId)
      ),
    });
    if (!incident) {
      return c.json({ success: false, error: { code: "NOT_FOUND" } }, 404);
    }
    eventTitle = incident.title;
  } else {
    const mw = await db.query.maintenanceWindows.findFirst({
      where: and(
        eq(maintenanceWindows.id, id),
        eq(maintenanceWindows.organizationId, page.organizationId)
      ),
    });
    if (!mw) {
      return c.json({ success: false, error: { code: "NOT_FOUND" } }, 404);
    }
    eventTitle = mw.name;
  }

  const body = await c.req.json();
  const { email } = body;

  if (!email || !email.includes("@")) {
    return c.json(
      {
        success: false,
        error: {
          code: "INVALID_EMAIL",
          message: "Please provide a valid email address",
        },
      },
      400
    );
  }

  // Check if already subscribed
  const existing = await db.query.eventSubscriptions.findFirst({
    where: and(
      eq(eventSubscriptions.eventType, type),
      eq(eventSubscriptions.eventId, id),
      eq(eventSubscriptions.email, email.toLowerCase())
    ),
  });

  if (existing) {
    if (existing.verified) {
      return c.json({
        success: true,
        data: { message: "You are already subscribed to this event" },
      });
    }
    // Resend verification email with a new token
    const newVerificationToken = nanoid(32);
    await db
      .update(eventSubscriptions)
      .set({ verificationToken: newVerificationToken })
      .where(eq(eventSubscriptions.id, existing.id));

    await sendEventSubscriptionVerificationEmail({
      email: email.toLowerCase(),
      eventType: type as "incident" | "maintenance",
      eventId: id,
      eventTitle,
      statusPageName: page.name,
      statusPageSlug: slug,
      verificationToken: newVerificationToken,
    });

    return c.json({
      success: true,
      data: { message: "Verification email sent. Please check your inbox." },
    });
  }

  // Create new subscription
  const subscriptionId = nanoid();
  const verificationToken = nanoid(32);
  const unsubscribeToken = nanoid(32);

  await db.insert(eventSubscriptions).values({
    id: subscriptionId,
    eventType: type,
    eventId: id,
    email: email.toLowerCase(),
    channels: { email: true },
    verified: false,
    verificationToken,
    unsubscribeToken,
    createdAt: new Date(),
  });

  await sendEventSubscriptionVerificationEmail({
    email: email.toLowerCase(),
    eventType: type as "incident" | "maintenance",
    eventId: id,
    eventTitle,
    statusPageName: page.name,
    statusPageSlug: slug,
    verificationToken,
  });

  return c.json({
    success: true,
    data: { message: "Verification email sent. Please check your inbox." },
  });
});

publicEventsRoutes.get("/events/unsubscribe", async (c) => {
  const token = c.req.query("token");

  if (!token) {
    return c.json({ success: false, error: { code: "INVALID_TOKEN" } }, 400);
  }

  const [deleted] = await db
    .delete(eventSubscriptions)
    .where(eq(eventSubscriptions.unsubscribeToken, token))
    .returning();

  if (!deleted) {
    return c.json({ success: false, error: { code: "NOT_FOUND" } }, 404);
  }

  return c.json({
    success: true,
    data: { message: "You have been unsubscribed" },
  });
});

publicEventsRoutes.get("/events/:eventType/:eventId/verify", async (c) => {
  const { eventType, eventId } = c.req.param();
  const token = c.req.query("token");

  if (!token) {
    return c.json({ success: false, error: { code: "INVALID_TOKEN", message: "Verification token is required" } }, 400);
  }

  if (eventType !== "incident" && eventType !== "maintenance") {
    return c.json({ success: false, error: { code: "INVALID_TYPE", message: "Invalid event type" } }, 400);
  }

  const subscription = await db.query.eventSubscriptions.findFirst({
    where: eq(eventSubscriptions.verificationToken, token),
  });

  if (!subscription) {
    return c.json({ success: false, error: { code: "NOT_FOUND", message: "Subscription not found or already verified" } }, 404);
  }

  if (subscription.eventType !== eventType || subscription.eventId !== eventId) {
    return c.json({ success: false, error: { code: "INVALID_TOKEN", message: "Token does not match this event" } }, 400);
  }

  if (subscription.verified) {
    return c.redirect(`${getAppUrl()}/status?verified=already`);
  }

  await db
    .update(eventSubscriptions)
    .set({ verified: true, verificationToken: null })
    .where(eq(eventSubscriptions.id, subscription.id));

  // Find the status page slug for redirection
  let statusPageSlug = "";
  if (eventType === "incident") {
    const incident = await db.query.incidents.findFirst({
      where: eq(incidents.id, eventId),
    });
    if (incident) {
      const page = await db.query.statusPages.findFirst({
        where: eq(statusPages.organizationId, incident.organizationId),
      });
      if (page) statusPageSlug = page.slug;
    }
  } else {
    const mw = await db.query.maintenanceWindows.findFirst({
      where: eq(maintenanceWindows.id, eventId),
    });
    if (mw) {
      const page = await db.query.statusPages.findFirst({
        where: eq(statusPages.organizationId, mw.organizationId),
      });
      if (page) statusPageSlug = page.slug;
    }
  }

  const redirectUrl = statusPageSlug
    ? `${getAppUrl()}/status/${statusPageSlug}?verified=success`
    : `${getAppUrl()}/status?verified=success`;

  return c.redirect(redirectUrl);
});
