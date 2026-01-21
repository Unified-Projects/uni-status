import { OpenAPIHono } from "@hono/zod-openapi";
import { db } from "@uni-status/database";
import {
  statusPages,
  statusPageMonitors,
  incidents,
  incidentUpdates,
  maintenanceWindows,
} from "@uni-status/database/schema";
import { eq, and, desc, gte, lte, or } from "drizzle-orm";
import { getAppUrl } from "@uni-status/shared/config";

type IncidentWithUpdates = typeof incidents.$inferSelect & {
  updates: Array<typeof incidentUpdates.$inferSelect>;
};
type MaintenanceWindowItem = typeof maintenanceWindows.$inferSelect;

// Helper to filter incidents by status page monitors
async function filterIncidentsByStatusPage<T extends { affectedMonitors: string[] | null }>(
  allIncidents: T[],
  statusPageId: string
): Promise<T[]> {
  // Get monitors linked to this status page
  const pageMonitors = await db.query.statusPageMonitors.findMany({
    where: eq(statusPageMonitors.statusPageId, statusPageId),
    columns: { monitorId: true },
  });

  const monitorIds = new Set(pageMonitors.map(m => m.monitorId));

  // If no monitors linked to status page, return empty array
  if (monitorIds.size === 0) {
    return [];
  }

  // Filter incidents that affect at least one of the status page's monitors
  return allIncidents.filter(incident => {
    const affected = incident.affectedMonitors || [];
    return affected.some(monitorId => monitorIds.has(monitorId));
  });
}

// Helper to filter maintenance windows by status page monitors
async function filterMaintenanceByStatusPage<T extends { affectedMonitors: string[] | null }>(
  allMaintenance: T[],
  statusPageId: string
): Promise<T[]> {
  // Get monitors linked to this status page
  const pageMonitors = await db.query.statusPageMonitors.findMany({
    where: eq(statusPageMonitors.statusPageId, statusPageId),
    columns: { monitorId: true },
  });

  const monitorIds = new Set(pageMonitors.map(m => m.monitorId));

  // If no monitors linked to status page, return empty array
  if (monitorIds.size === 0) {
    return [];
  }

  // Filter maintenance windows that affect at least one of the status page's monitors
  return allMaintenance.filter(maint => {
    const affected = maint.affectedMonitors || [];
    return affected.some(monitorId => monitorIds.has(monitorId));
  });
}

export const feedsRoutes = new OpenAPIHono();

// Helper to escape XML/HTML entities
function escapeXml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

// Helper to format date for RSS (RFC 822)
function toRfc822(date: Date): string {
  return date.toUTCString();
}

// Helper to format date for Atom (RFC 3339)
function toRfc3339(date: Date): string {
  return date.toISOString();
}

// Get base URL for links
function getBaseUrl(): string {
  return getAppUrl();
}

// Helper to determine maintenance window status
function getMaintenanceStatus(startsAt: Date, endsAt: Date): "scheduled" | "active" | "completed" {
  const now = new Date();
  if (now < startsAt) return "scheduled";
  if (now > endsAt) return "completed";
  return "active";
}

// Interface for unified feed items
interface UnifiedFeedItem {
  id: string;
  type: "incident" | "maintenance";
  title: string;
  description: string;
  status: string;
  severity: string;
  createdAt: Date;
  updatedAt: Date;
  startedAt: Date | null;
  endedAt: Date | null;
  latestUpdate?: string;
}

// RSS 2.0 Feed for status page events (incidents + maintenance)
feedsRoutes.get("/status-pages/:slug/rss", async (c) => {
  const { slug } = c.req.param();

  // Find status page
  const page = await db.query.statusPages.findFirst({
    where: and(eq(statusPages.slug, slug), eq(statusPages.published, true)),
  });

  if (!page) {
    return c.text("Status page not found", 404);
  }

  // Get recent incidents (last 30 days)
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  const allIncidents: IncidentWithUpdates[] = await db.query.incidents.findMany({
    where: and(
      eq(incidents.organizationId, page.organizationId),
      gte(incidents.createdAt, thirtyDaysAgo)
    ),
    orderBy: [desc(incidents.createdAt)],
    limit: 50,
    with: {
      updates: {
        orderBy: [desc(incidentUpdates.createdAt)],
        limit: 1,
      },
    },
  });

  // Filter incidents by status page monitors
  const recentIncidents = await filterIncidentsByStatusPage(allIncidents, page.id);

  // Get maintenance windows (last 30 days + upcoming 90 days)
  const ninetyDaysAhead = new Date();
  ninetyDaysAhead.setDate(ninetyDaysAhead.getDate() + 90);

  const allMaintenance: MaintenanceWindowItem[] = await db.query.maintenanceWindows.findMany({
    where: and(
      eq(maintenanceWindows.organizationId, page.organizationId),
      or(
        gte(maintenanceWindows.startsAt, thirtyDaysAgo),
        lte(maintenanceWindows.endsAt, ninetyDaysAhead)
      )
    ),
    orderBy: [desc(maintenanceWindows.createdAt)],
    limit: 50,
  });

  // Filter maintenance by status page monitors
  const recentMaintenance = await filterMaintenanceByStatusPage(allMaintenance, page.id);

  // Combine into unified feed items
  const feedItems: UnifiedFeedItem[] = [];

  for (const incident of recentIncidents) {
    const latestUpdate = incident.updates[0];
    feedItems.push({
      id: incident.id,
      type: "incident",
      title: incident.title,
      description: latestUpdate
        ? `${incident.message || ""}\n\nLatest Update (${incident.status}): ${latestUpdate.message}`
        : incident.message || "",
      status: incident.status,
      severity: incident.severity,
      createdAt: incident.createdAt,
      updatedAt: incident.updatedAt,
      startedAt: incident.startedAt,
      endedAt: incident.resolvedAt,
      latestUpdate: latestUpdate?.message,
    });
  }

  for (const mw of recentMaintenance) {
    const status = getMaintenanceStatus(mw.startsAt, mw.endsAt);
    feedItems.push({
      id: mw.id,
      type: "maintenance",
      title: mw.name,
      description: mw.description || "",
      status,
      severity: "maintenance",
      createdAt: mw.createdAt,
      updatedAt: mw.updatedAt,
      startedAt: mw.startsAt,
      endedAt: mw.endsAt,
    });
  }

  // Sort by createdAt descending
  feedItems.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

  const baseUrl = getBaseUrl();
  const feedUrl = `${baseUrl}/api/public/feeds/status-pages/${slug}/rss`;
  const pageUrl = `${baseUrl}/status/${slug}`;

  const rss = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>${escapeXml(page.name)} - Status Updates</title>
    <link>${escapeXml(pageUrl)}</link>
    <description>Status updates, incidents, and maintenance for ${escapeXml(page.name)}</description>
    <language>en-gb</language>
    <lastBuildDate>${toRfc822(new Date())}</lastBuildDate>
    <atom:link href="${escapeXml(feedUrl)}" rel="self" type="application/rss+xml"/>
    <ttl>5</ttl>
${feedItems
  .map((item) => {
    const typeLabel = item.type === "incident" ? item.severity.toUpperCase() : "MAINTENANCE";
    const linkAnchor = item.type === "incident" ? `incident-${item.id}` : `maintenance-${item.id}`;
    return `    <item>
      <title>${escapeXml(`[${typeLabel}] ${item.title}`)}</title>
      <link>${escapeXml(`${pageUrl}/events/${item.type}/${item.id}`)}</link>
      <guid isPermaLink="false">${item.type}-${item.id}</guid>
      <pubDate>${toRfc822(item.createdAt)}</pubDate>
      <description><![CDATA[${item.description}]]></description>
      <category>${escapeXml(item.type)}</category>
      <category>${escapeXml(item.status)}</category>
    </item>`;
  })
  .join("\n")}
  </channel>
</rss>`;

  c.header("Content-Type", "application/rss+xml; charset=utf-8");
  c.header("Cache-Control", "public, max-age=300"); // Cache for 5 minutes
  return c.body(rss);
});

// Atom Feed for status page events (incidents + maintenance)
feedsRoutes.get("/status-pages/:slug/atom", async (c) => {
  const { slug } = c.req.param();

  // Find status page
  const page = await db.query.statusPages.findFirst({
    where: and(eq(statusPages.slug, slug), eq(statusPages.published, true)),
  });

  if (!page) {
    return c.text("Status page not found", 404);
  }

  // Get recent incidents (last 30 days)
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  const allIncidents: IncidentWithUpdates[] = await db.query.incidents.findMany({
    where: and(
      eq(incidents.organizationId, page.organizationId),
      gte(incidents.createdAt, thirtyDaysAgo)
    ),
    orderBy: [desc(incidents.createdAt)],
    limit: 50,
    with: {
      updates: {
        orderBy: [desc(incidentUpdates.createdAt)],
        limit: 1,
      },
    },
  });

  // Filter incidents by status page monitors
  const recentIncidents = await filterIncidentsByStatusPage(allIncidents, page.id);

  // Get maintenance windows (last 30 days + upcoming 90 days)
  const ninetyDaysAhead = new Date();
  ninetyDaysAhead.setDate(ninetyDaysAhead.getDate() + 90);

  const allMaintenance: MaintenanceWindowItem[] = await db.query.maintenanceWindows.findMany({
    where: and(
      eq(maintenanceWindows.organizationId, page.organizationId),
      or(
        gte(maintenanceWindows.startsAt, thirtyDaysAgo),
        lte(maintenanceWindows.endsAt, ninetyDaysAhead)
      )
    ),
    orderBy: [desc(maintenanceWindows.createdAt)],
    limit: 50,
  });

  // Filter maintenance by status page monitors
  const recentMaintenance = await filterMaintenanceByStatusPage(allMaintenance, page.id);

  // Combine into unified feed items
  const feedItems: UnifiedFeedItem[] = [];

  for (const incident of recentIncidents) {
    const latestUpdate = incident.updates[0];
    feedItems.push({
      id: incident.id,
      type: "incident",
      title: incident.title,
      description: incident.message || "",
      status: incident.status,
      severity: incident.severity,
      createdAt: incident.createdAt,
      updatedAt: incident.updatedAt,
      startedAt: incident.startedAt,
      endedAt: incident.resolvedAt,
      latestUpdate: latestUpdate?.message,
    });
  }

  for (const mw of recentMaintenance) {
    const status = getMaintenanceStatus(mw.startsAt, mw.endsAt);
    feedItems.push({
      id: mw.id,
      type: "maintenance",
      title: mw.name,
      description: mw.description || "",
      status,
      severity: "maintenance",
      createdAt: mw.createdAt,
      updatedAt: mw.updatedAt,
      startedAt: mw.startsAt,
      endedAt: mw.endsAt,
    });
  }

  // Sort by createdAt descending
  feedItems.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

  const baseUrl = getBaseUrl();
  const feedUrl = `${baseUrl}/api/public/feeds/status-pages/${slug}/atom`;
  const pageUrl = `${baseUrl}/status/${slug}`;

  const atom = `<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <title>${escapeXml(page.name)} - Status Updates</title>
  <subtitle>Status updates, incidents, and maintenance for ${escapeXml(page.name)}</subtitle>
  <link href="${escapeXml(feedUrl)}" rel="self" type="application/atom+xml"/>
  <link href="${escapeXml(pageUrl)}" rel="alternate" type="text/html"/>
  <id>urn:uuid:${page.id}</id>
  <updated>${toRfc3339(new Date())}</updated>
  <generator>Uni-Status</generator>
${feedItems
  .map((item) => {
    const typeLabel = item.type === "incident" ? item.severity.toUpperCase() : "MAINTENANCE";
    const content = item.latestUpdate
      ? `<p>${escapeXml(item.description)}</p><h4>Latest Update (${item.status})</h4><p>${escapeXml(item.latestUpdate)}</p>`
      : `<p>${escapeXml(item.description)}</p>`;
    return `  <entry>
    <title>${escapeXml(`[${typeLabel}] ${item.title}`)}</title>
    <link href="${escapeXml(`${pageUrl}/events/${item.type}/${item.id}`)}" rel="alternate"/>
    <id>urn:uuid:${item.type}-${item.id}</id>
    <updated>${toRfc3339(item.updatedAt || item.createdAt)}</updated>
    <published>${toRfc3339(item.createdAt)}</published>
    <content type="html"><![CDATA[${content}]]></content>
    <category term="${escapeXml(item.type)}"/>
    <category term="${escapeXml(item.status)}"/>
    <category term="${escapeXml(item.severity)}"/>
  </entry>`;
  })
  .join("\n")}
</feed>`;

  c.header("Content-Type", "application/atom+xml; charset=utf-8");
  c.header("Cache-Control", "public, max-age=300");
  return c.body(atom);
});

// JSON Feed (v1.1) for status page events (incidents + maintenance)
feedsRoutes.get("/status-pages/:slug/json", async (c) => {
  const { slug } = c.req.param();

  // Find status page
  const page = await db.query.statusPages.findFirst({
    where: and(eq(statusPages.slug, slug), eq(statusPages.published, true)),
  });

  if (!page) {
    return c.json({ error: "Status page not found" }, 404);
  }

  // Get recent incidents (last 30 days)
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  const allIncidents: IncidentWithUpdates[] = await db.query.incidents.findMany({
    where: and(
      eq(incidents.organizationId, page.organizationId),
      gte(incidents.createdAt, thirtyDaysAgo)
    ),
    orderBy: [desc(incidents.createdAt)],
    limit: 50,
    with: {
      updates: {
        orderBy: [desc(incidentUpdates.createdAt)],
        limit: 1,
      },
    },
  });

  // Filter incidents by status page monitors
  const recentIncidents = await filterIncidentsByStatusPage(allIncidents, page.id);

  // Get maintenance windows (last 30 days + upcoming 90 days)
  const ninetyDaysAhead = new Date();
  ninetyDaysAhead.setDate(ninetyDaysAhead.getDate() + 90);

  const allMaintenance: MaintenanceWindowItem[] = await db.query.maintenanceWindows.findMany({
    where: and(
      eq(maintenanceWindows.organizationId, page.organizationId),
      or(
        gte(maintenanceWindows.startsAt, thirtyDaysAgo),
        lte(maintenanceWindows.endsAt, ninetyDaysAhead)
      )
    ),
    orderBy: [desc(maintenanceWindows.createdAt)],
    limit: 50,
  });

  // Filter maintenance by status page monitors
  const recentMaintenance = await filterMaintenanceByStatusPage(allMaintenance, page.id);

  // Combine into unified feed items
  const feedItems: UnifiedFeedItem[] = [];

  for (const incident of recentIncidents) {
    const latestUpdate = incident.updates[0];
    feedItems.push({
      id: incident.id,
      type: "incident",
      title: incident.title,
      description: latestUpdate
        ? `${incident.message || ""}\n\nLatest Update (${incident.status}): ${latestUpdate.message}`
        : incident.message || "",
      status: incident.status,
      severity: incident.severity,
      createdAt: incident.createdAt,
      updatedAt: incident.updatedAt,
      startedAt: incident.startedAt,
      endedAt: incident.resolvedAt,
      latestUpdate: latestUpdate?.message,
    });
  }

  for (const mw of recentMaintenance) {
    const status = getMaintenanceStatus(mw.startsAt, mw.endsAt);
    feedItems.push({
      id: mw.id,
      type: "maintenance",
      title: mw.name,
      description: mw.description || "",
      status,
      severity: "maintenance",
      createdAt: mw.createdAt,
      updatedAt: mw.updatedAt,
      startedAt: mw.startsAt,
      endedAt: mw.endsAt,
    });
  }

  // Sort by createdAt descending
  feedItems.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

  const baseUrl = getBaseUrl();
  const feedUrl = `${baseUrl}/api/public/feeds/status-pages/${slug}/json`;
  const pageUrl = `${baseUrl}/status/${slug}`;

  const jsonFeed = {
    version: "https://jsonfeed.org/version/1.1",
    title: `${page.name} - Status Updates`,
    home_page_url: pageUrl,
    feed_url: feedUrl,
    description: `Status updates, incidents, and maintenance for ${page.name}`,
    icon: page.logo || undefined,
    favicon: page.favicon || undefined,
    language: "en-GB",
    items: feedItems.map((item) => {
      const typeLabel = item.type === "incident" ? item.severity.toUpperCase() : "MAINTENANCE";
      return {
        id: `${item.type}-${item.id}`,
        url: `${pageUrl}/events/${item.type}/${item.id}`,
        title: `[${typeLabel}] ${item.title}`,
        content_text: item.description,
        date_published: item.createdAt.toISOString(),
        date_modified: (item.updatedAt || item.createdAt).toISOString(),
        tags: [item.type, item.status, item.severity],
        _uni_status: {
          type: item.type,
          status: item.status,
          severity: item.severity,
          started_at: item.startedAt?.toISOString(),
          ended_at: item.endedAt?.toISOString(),
        },
      };
    }),
  };

  c.header("Cache-Control", "public, max-age=300");
  return c.body(JSON.stringify(jsonFeed), 200, {
    "Content-Type": "application/feed+json; charset=utf-8",
  });
});

// ICS Calendar Feed for maintenance windows
feedsRoutes.get("/status-pages/:slug/calendar.ics", async (c) => {
  const { slug } = c.req.param();

  // Find status page
  const page = await db.query.statusPages.findFirst({
    where: and(eq(statusPages.slug, slug), eq(statusPages.published, true)),
  });

  if (!page) {
    return c.text("Status page not found", 404);
  }

  // Get maintenance windows (upcoming and recent past)
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  const ninetyDaysAhead = new Date();
  ninetyDaysAhead.setDate(ninetyDaysAhead.getDate() + 90);

  const windows = await db.query.maintenanceWindows.findMany({
    where: and(
      eq(maintenanceWindows.organizationId, page.organizationId),
      or(
        // Upcoming
        gte(maintenanceWindows.startsAt, new Date()),
        // Recently ended
        and(
          gte(maintenanceWindows.endsAt, thirtyDaysAgo),
          lte(maintenanceWindows.startsAt, new Date())
        )
      )
    ),
    orderBy: [maintenanceWindows.startsAt],
    limit: 100,
  });

  const baseUrl = getBaseUrl();
  const calendarUrl = `${baseUrl}/api/public/feeds/status-pages/${slug}/calendar.ics`;

  // Format date for ICS (YYYYMMDDTHHMMSSZ)
  const toIcsDate = (date: Date): string => {
    return date.toISOString().replace(/[-:]/g, "").split(".")[0] + "Z";
  };

  // Generate unique ID for each event
  const generateUid = (id: string): string => {
    return `${id}@uni-status`;
  };

  // Escape ICS text fields
  const escapeIcsText = (text: string): string => {
    return text
      .replace(/\\/g, "\\\\")
      .replace(/;/g, "\\;")
      .replace(/,/g, "\\,")
      .replace(/\n/g, "\\n");
  };

  const ics = `BEGIN:VCALENDAR
VERSION:2.0
PRODID:-//Uni-Status//Maintenance Calendar//EN
CALSCALE:GREGORIAN
METHOD:PUBLISH
X-WR-CALNAME:${escapeIcsText(page.name)} - Maintenance Schedule
X-WR-CALDESC:Scheduled maintenance windows for ${escapeIcsText(page.name)}
REFRESH-INTERVAL;VALUE=DURATION:PT5M
SOURCE;VALUE=URI:${calendarUrl}
${windows
  .map((window) => {
    const computedStatus = getMaintenanceStatus(window.startsAt, window.endsAt);
    const status = computedStatus === "completed" ? "CONFIRMED" : "TENTATIVE";
    return `BEGIN:VEVENT
UID:${generateUid(window.id)}
DTSTAMP:${toIcsDate(new Date())}
DTSTART:${toIcsDate(window.startsAt)}
DTEND:${toIcsDate(window.endsAt)}
SUMMARY:${escapeIcsText(`[Maintenance] ${window.name}`)}
DESCRIPTION:${escapeIcsText(window.description || "")}
STATUS:${status}
CATEGORIES:MAINTENANCE
END:VEVENT`;
  })
  .join("\n")}
END:VCALENDAR`;

  c.header("Content-Type", "text/calendar; charset=utf-8");
  c.header("Content-Disposition", `attachment; filename="${slug}-events.ics"`);
  c.header("Cache-Control", "public, max-age=300");
  return c.body(ics);
});
