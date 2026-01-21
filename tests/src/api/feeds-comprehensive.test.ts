import { describe, it, expect, beforeAll } from "vitest";
import { bootstrapTestContext, TestContext } from "../helpers/context";
import {
  insertStatusPage,
  insertIncident,
  insertIncidentUpdate,
  insertMaintenanceWindow,
  linkMonitorToStatusPage,
  createMonitor,
} from "../helpers/data";
import { randomUUID } from "crypto";

const API_BASE_URL = process.env.API_BASE_URL ?? "http://api:3001";

describe("Public Feeds API - Comprehensive", () => {
  let ctx: TestContext;
  let headers: Record<string, string>;
  let statusPageSlug: string;
  let statusPageId: string;
  let monitorId: string;
  let incidentId: string;
  let maintenanceId: string;

  beforeAll(async () => {
    ctx = await bootstrapTestContext();
    headers = {
      Authorization: `Bearer ${ctx.token}`,
      "Content-Type": "application/json",
      "X-Organization-Id": ctx.organizationId,
    };

    // Create a published status page
    statusPageSlug = `feed-test-${randomUUID().slice(0, 8)}`.toLowerCase();
    statusPageId = await insertStatusPage(ctx.organizationId, {
      name: "Feed Test Status Page",
      slug: statusPageSlug,
      description: "Status page for feed testing",
      published: true,
    });

    // Create a monitor and link to status page
    monitorId = await createMonitor(
      { organizationId: ctx.organizationId, headers },
      { name: "Feed Test Monitor" }
    );
    await linkMonitorToStatusPage(statusPageId, monitorId);

    // Create an incident
    const incidentResult = await insertIncident(ctx.organizationId, ctx.userId, {
      title: "API Degradation",
      description: "API response times are elevated",
      severity: "major",
      status: "investigating",
      affectedMonitorIds: [monitorId],
    });
    incidentId = incidentResult.id;

    // Add an incident update
    await insertIncidentUpdate(incidentId, {
      status: "identified",
      message: "Root cause identified as database issue",
    });

    // Create a maintenance window
    const startsAt = new Date();
    startsAt.setDate(startsAt.getDate() + 1);
    const endsAt = new Date(startsAt);
    endsAt.setHours(endsAt.getHours() + 4);

    const { id: mwId } = await insertMaintenanceWindow(
      ctx.organizationId,
      ctx.userId,
      {
        name: "Scheduled Database Upgrade",
        startsAt,
        endsAt,
        affectedMonitors: [monitorId],
        description: "Routine database maintenance",
      }
    );
    maintenanceId = mwId;
  });

  // ==========================================
  // RSS Feed
  // ==========================================

  describe("RSS Feed", () => {
    it("returns valid RSS 2.0 feed", async () => {
      const response = await fetch(
        `${API_BASE_URL}/api/public/feeds/status-pages/${statusPageSlug}/rss`
      );

      expect(response.status).toBe(200);
      expect(response.headers.get("Content-Type")).toContain(
        "application/rss+xml"
      );

      const body = await response.text();
      expect(body).toContain('<?xml version="1.0"');
      expect(body).toContain('<rss version="2.0"');
      expect(body).toContain("<channel>");
      expect(body).toContain("</channel>");
      expect(body).toContain("</rss>");
    });

    it("includes channel metadata", async () => {
      const response = await fetch(
        `${API_BASE_URL}/api/public/feeds/status-pages/${statusPageSlug}/rss`
      );

      const body = await response.text();
      expect(body).toContain("<title>");
      expect(body).toContain("Feed Test Status Page");
      expect(body).toContain("<link>");
      expect(body).toContain("<description>");
      expect(body).toContain("<language>");
      expect(body).toContain("<lastBuildDate>");
    });

    it("includes atom:link self reference", async () => {
      const response = await fetch(
        `${API_BASE_URL}/api/public/feeds/status-pages/${statusPageSlug}/rss`
      );

      const body = await response.text();
      expect(body).toContain('xmlns:atom="http://www.w3.org/2005/Atom"');
      expect(body).toContain('rel="self"');
      expect(body).toContain('type="application/rss+xml"');
    });

    it("includes TTL element for caching hint", async () => {
      const response = await fetch(
        `${API_BASE_URL}/api/public/feeds/status-pages/${statusPageSlug}/rss`
      );

      const body = await response.text();
      expect(body).toContain("<ttl>");
    });

    it("includes incident items", async () => {
      const response = await fetch(
        `${API_BASE_URL}/api/public/feeds/status-pages/${statusPageSlug}/rss`
      );

      const body = await response.text();
      expect(body).toContain("<item>");
      expect(body).toContain("API Degradation");
      expect(body).toContain("<category>incident</category>");
    });

    it("includes maintenance items", async () => {
      const response = await fetch(
        `${API_BASE_URL}/api/public/feeds/status-pages/${statusPageSlug}/rss`
      );

      const body = await response.text();
      expect(body).toContain("Scheduled Database Upgrade");
      expect(body).toContain("<category>maintenance</category>");
    });

    it("includes severity in item title for incidents", async () => {
      const response = await fetch(
        `${API_BASE_URL}/api/public/feeds/status-pages/${statusPageSlug}/rss`
      );

      const body = await response.text();
      expect(body).toContain("[MAJOR]");
    });

    it("includes MAINTENANCE label in item title for maintenance windows", async () => {
      const response = await fetch(
        `${API_BASE_URL}/api/public/feeds/status-pages/${statusPageSlug}/rss`
      );

      const body = await response.text();
      expect(body).toContain("[MAINTENANCE]");
    });

    it("includes item GUIDs with isPermaLink=false", async () => {
      const response = await fetch(
        `${API_BASE_URL}/api/public/feeds/status-pages/${statusPageSlug}/rss`
      );

      const body = await response.text();
      expect(body).toContain('<guid isPermaLink="false">');
    });

    it("includes pubDate for items", async () => {
      const response = await fetch(
        `${API_BASE_URL}/api/public/feeds/status-pages/${statusPageSlug}/rss`
      );

      const body = await response.text();
      expect(body).toContain("<pubDate>");
    });

    it("sets Cache-Control header", async () => {
      const response = await fetch(
        `${API_BASE_URL}/api/public/feeds/status-pages/${statusPageSlug}/rss`
      );

      expect(response.headers.get("Cache-Control")).toContain("public");
      expect(response.headers.get("Cache-Control")).toContain("max-age=");
    });

    it("returns 404 for non-existent status page", async () => {
      const response = await fetch(
        `${API_BASE_URL}/api/public/feeds/status-pages/non-existent-slug/rss`
      );

      expect(response.status).toBe(404);
    });

    it("returns 404 for unpublished status page", async () => {
      // Create an unpublished status page
      const unpubSlug = `unpub-${randomUUID().slice(0, 8)}`.toLowerCase();
      await insertStatusPage(ctx.organizationId, {
        name: "Unpublished Page",
        slug: unpubSlug,
        published: false,
      });

      const response = await fetch(
        `${API_BASE_URL}/api/public/feeds/status-pages/${unpubSlug}/rss`
      );

      expect(response.status).toBe(404);
    });
  });

  // ==========================================
  // Atom Feed
  // ==========================================

  describe("Atom Feed", () => {
    it("returns valid Atom feed", async () => {
      const response = await fetch(
        `${API_BASE_URL}/api/public/feeds/status-pages/${statusPageSlug}/atom`
      );

      expect(response.status).toBe(200);
      expect(response.headers.get("Content-Type")).toContain(
        "application/atom+xml"
      );

      const body = await response.text();
      expect(body).toContain('<?xml version="1.0"');
      expect(body).toContain('<feed xmlns="http://www.w3.org/2005/Atom"');
      expect(body).toContain("</feed>");
    });

    it("includes feed metadata", async () => {
      const response = await fetch(
        `${API_BASE_URL}/api/public/feeds/status-pages/${statusPageSlug}/atom`
      );

      const body = await response.text();
      expect(body).toContain("<title>");
      expect(body).toContain("Feed Test Status Page");
      expect(body).toContain("<subtitle>");
      expect(body).toContain("<id>");
      expect(body).toContain("<updated>");
      expect(body).toContain("<generator>");
    });

    it("includes self and alternate links", async () => {
      const response = await fetch(
        `${API_BASE_URL}/api/public/feeds/status-pages/${statusPageSlug}/atom`
      );

      const body = await response.text();
      expect(body).toContain('rel="self"');
      expect(body).toContain('type="application/atom+xml"');
      expect(body).toContain('rel="alternate"');
      expect(body).toContain('type="text/html"');
    });

    it("includes entry elements for incidents", async () => {
      const response = await fetch(
        `${API_BASE_URL}/api/public/feeds/status-pages/${statusPageSlug}/atom`
      );

      const body = await response.text();
      expect(body).toContain("<entry>");
      expect(body).toContain("API Degradation");
      expect(body).toContain("</entry>");
    });

    it("includes entry elements for maintenance", async () => {
      const response = await fetch(
        `${API_BASE_URL}/api/public/feeds/status-pages/${statusPageSlug}/atom`
      );

      const body = await response.text();
      expect(body).toContain("Scheduled Database Upgrade");
    });

    it("includes entry IDs in URN format", async () => {
      const response = await fetch(
        `${API_BASE_URL}/api/public/feeds/status-pages/${statusPageSlug}/atom`
      );

      const body = await response.text();
      expect(body).toContain("<id>urn:uuid:");
    });

    it("includes updated and published timestamps", async () => {
      const response = await fetch(
        `${API_BASE_URL}/api/public/feeds/status-pages/${statusPageSlug}/atom`
      );

      const body = await response.text();
      expect(body).toContain("<updated>");
      expect(body).toContain("<published>");
    });

    it("includes content with type=html", async () => {
      const response = await fetch(
        `${API_BASE_URL}/api/public/feeds/status-pages/${statusPageSlug}/atom`
      );

      const body = await response.text();
      expect(body).toContain('<content type="html">');
    });

    it("includes category terms", async () => {
      const response = await fetch(
        `${API_BASE_URL}/api/public/feeds/status-pages/${statusPageSlug}/atom`
      );

      const body = await response.text();
      expect(body).toContain('<category term="incident"');
      expect(body).toContain('<category term="maintenance"');
    });

    it("sets Cache-Control header", async () => {
      const response = await fetch(
        `${API_BASE_URL}/api/public/feeds/status-pages/${statusPageSlug}/atom`
      );

      expect(response.headers.get("Cache-Control")).toContain("public");
    });

    it("returns 404 for non-existent status page", async () => {
      const response = await fetch(
        `${API_BASE_URL}/api/public/feeds/status-pages/non-existent-slug/atom`
      );

      expect(response.status).toBe(404);
    });

    it("returns 404 for unpublished status page", async () => {
      const unpubSlug = `unpub-atom-${randomUUID().slice(0, 8)}`.toLowerCase();
      await insertStatusPage(ctx.organizationId, {
        name: "Unpublished Atom Page",
        slug: unpubSlug,
        published: false,
      });

      const response = await fetch(
        `${API_BASE_URL}/api/public/feeds/status-pages/${unpubSlug}/atom`
      );

      expect(response.status).toBe(404);
    });
  });

  // ==========================================
  // JSON Feed
  // ==========================================

  describe("JSON Feed", () => {
    it("returns valid JSON Feed v1.1", async () => {
      const response = await fetch(
        `${API_BASE_URL}/api/public/feeds/status-pages/${statusPageSlug}/json`
      );

      expect(response.status).toBe(200);
      expect(response.headers.get("Content-Type")).toContain(
        "application/feed+json"
      );

      const body = await response.json();
      expect(body.version).toBe("https://jsonfeed.org/version/1.1");
    });

    it("includes feed metadata", async () => {
      const response = await fetch(
        `${API_BASE_URL}/api/public/feeds/status-pages/${statusPageSlug}/json`
      );

      const body = await response.json();
      expect(body.title).toContain("Feed Test Status Page");
      expect(body.home_page_url).toBeDefined();
      expect(body.feed_url).toBeDefined();
      expect(body.description).toBeDefined();
      expect(body.language).toBe("en-GB");
    });

    it("includes items array", async () => {
      const response = await fetch(
        `${API_BASE_URL}/api/public/feeds/status-pages/${statusPageSlug}/json`
      );

      const body = await response.json();
      expect(Array.isArray(body.items)).toBe(true);
      expect(body.items.length).toBeGreaterThan(0);
    });

    it("includes incident items with proper structure", async () => {
      const response = await fetch(
        `${API_BASE_URL}/api/public/feeds/status-pages/${statusPageSlug}/json`
      );

      const body = await response.json();
      const incident = body.items.find((item: { id: string }) =>
        item.id.startsWith("incident-")
      );

      expect(incident).toBeDefined();
      expect(incident.id).toBeDefined();
      expect(incident.url).toBeDefined();
      expect(incident.title).toContain("[MAJOR]");
      expect(incident.content_text).toBeDefined();
      expect(incident.date_published).toBeDefined();
      expect(incident.date_modified).toBeDefined();
      expect(Array.isArray(incident.tags)).toBe(true);
    });

    it("includes maintenance items with proper structure", async () => {
      const response = await fetch(
        `${API_BASE_URL}/api/public/feeds/status-pages/${statusPageSlug}/json`
      );

      const body = await response.json();
      const maintenance = body.items.find((item: { id: string }) =>
        item.id.startsWith("maintenance-")
      );

      expect(maintenance).toBeDefined();
      expect(maintenance.title).toContain("[MAINTENANCE]");
    });

    it("includes custom _uni_status extension", async () => {
      const response = await fetch(
        `${API_BASE_URL}/api/public/feeds/status-pages/${statusPageSlug}/json`
      );

      const body = await response.json();
      const item = body.items[0];

      expect(item._uni_status).toBeDefined();
      expect(item._uni_status.type).toBeDefined();
      expect(item._uni_status.status).toBeDefined();
      expect(item._uni_status.severity).toBeDefined();
    });

    it("includes tags for type, status, and severity", async () => {
      const response = await fetch(
        `${API_BASE_URL}/api/public/feeds/status-pages/${statusPageSlug}/json`
      );

      const body = await response.json();
      const incident = body.items.find((item: { id: string }) =>
        item.id.startsWith("incident-")
      );

      expect(incident.tags).toContain("incident");
      expect(incident.tags).toContain("major");
    });

    it("sets Cache-Control header", async () => {
      const response = await fetch(
        `${API_BASE_URL}/api/public/feeds/status-pages/${statusPageSlug}/json`
      );

      expect(response.headers.get("Cache-Control")).toContain("public");
    });

    it("returns 404 for non-existent status page", async () => {
      const response = await fetch(
        `${API_BASE_URL}/api/public/feeds/status-pages/non-existent-slug/json`
      );

      expect(response.status).toBe(404);
    });

    it("returns 404 for unpublished status page", async () => {
      const unpubSlug = `unpub-json-${randomUUID().slice(0, 8)}`.toLowerCase();
      await insertStatusPage(ctx.organizationId, {
        name: "Unpublished JSON Page",
        slug: unpubSlug,
        published: false,
      });

      const response = await fetch(
        `${API_BASE_URL}/api/public/feeds/status-pages/${unpubSlug}/json`
      );

      expect(response.status).toBe(404);
    });
  });

  // ==========================================
  // ICS Calendar Feed
  // ==========================================

  describe("ICS Calendar Feed", () => {
    it("returns valid iCalendar format", async () => {
      const response = await fetch(
        `${API_BASE_URL}/api/public/feeds/status-pages/${statusPageSlug}/calendar.ics`
      );

      expect(response.status).toBe(200);
      expect(response.headers.get("Content-Type")).toContain("text/calendar");

      const body = await response.text();
      expect(body).toContain("BEGIN:VCALENDAR");
      expect(body).toContain("END:VCALENDAR");
      expect(body).toContain("VERSION:2.0");
    });

    it("includes PRODID", async () => {
      const response = await fetch(
        `${API_BASE_URL}/api/public/feeds/status-pages/${statusPageSlug}/calendar.ics`
      );

      const body = await response.text();
      expect(body).toContain("PRODID:");
    });

    it("includes CALSCALE and METHOD", async () => {
      const response = await fetch(
        `${API_BASE_URL}/api/public/feeds/status-pages/${statusPageSlug}/calendar.ics`
      );

      const body = await response.text();
      expect(body).toContain("CALSCALE:GREGORIAN");
      expect(body).toContain("METHOD:PUBLISH");
    });

    it("includes calendar name and description", async () => {
      const response = await fetch(
        `${API_BASE_URL}/api/public/feeds/status-pages/${statusPageSlug}/calendar.ics`
      );

      const body = await response.text();
      expect(body).toContain("X-WR-CALNAME:");
      expect(body).toContain("X-WR-CALDESC:");
    });

    it("includes refresh interval", async () => {
      const response = await fetch(
        `${API_BASE_URL}/api/public/feeds/status-pages/${statusPageSlug}/calendar.ics`
      );

      const body = await response.text();
      expect(body).toContain("REFRESH-INTERVAL;VALUE=DURATION:");
    });

    it("includes VEVENT for maintenance windows", async () => {
      const response = await fetch(
        `${API_BASE_URL}/api/public/feeds/status-pages/${statusPageSlug}/calendar.ics`
      );

      const body = await response.text();
      expect(body).toContain("BEGIN:VEVENT");
      expect(body).toContain("END:VEVENT");
    });

    it("includes event UID", async () => {
      const response = await fetch(
        `${API_BASE_URL}/api/public/feeds/status-pages/${statusPageSlug}/calendar.ics`
      );

      const body = await response.text();
      expect(body).toMatch(/UID:.*@uni-status/);
    });

    it("includes DTSTAMP, DTSTART, and DTEND", async () => {
      const response = await fetch(
        `${API_BASE_URL}/api/public/feeds/status-pages/${statusPageSlug}/calendar.ics`
      );

      const body = await response.text();
      expect(body).toContain("DTSTAMP:");
      expect(body).toContain("DTSTART:");
      expect(body).toContain("DTEND:");
    });

    it("includes event SUMMARY with [Maintenance] prefix", async () => {
      const response = await fetch(
        `${API_BASE_URL}/api/public/feeds/status-pages/${statusPageSlug}/calendar.ics`
      );

      const body = await response.text();
      expect(body).toContain("SUMMARY:");
      expect(body).toContain("[Maintenance]");
    });

    it("includes event DESCRIPTION", async () => {
      const response = await fetch(
        `${API_BASE_URL}/api/public/feeds/status-pages/${statusPageSlug}/calendar.ics`
      );

      const body = await response.text();
      expect(body).toContain("DESCRIPTION:");
    });

    it("includes CATEGORIES", async () => {
      const response = await fetch(
        `${API_BASE_URL}/api/public/feeds/status-pages/${statusPageSlug}/calendar.ics`
      );

      const body = await response.text();
      expect(body).toContain("CATEGORIES:MAINTENANCE");
    });

    it("sets Content-Disposition header with filename", async () => {
      const response = await fetch(
        `${API_BASE_URL}/api/public/feeds/status-pages/${statusPageSlug}/calendar.ics`
      );

      const disposition = response.headers.get("Content-Disposition");
      expect(disposition).toContain("attachment");
      expect(disposition).toContain("filename=");
      expect(disposition).toContain(".ics");
    });

    it("sets Cache-Control header", async () => {
      const response = await fetch(
        `${API_BASE_URL}/api/public/feeds/status-pages/${statusPageSlug}/calendar.ics`
      );

      expect(response.headers.get("Cache-Control")).toContain("public");
    });

    it("returns 404 for non-existent status page", async () => {
      const response = await fetch(
        `${API_BASE_URL}/api/public/feeds/status-pages/non-existent-slug/calendar.ics`
      );

      expect(response.status).toBe(404);
    });

    it("returns 404 for unpublished status page", async () => {
      const unpubSlug = `unpub-ics-${randomUUID().slice(0, 8)}`.toLowerCase();
      await insertStatusPage(ctx.organizationId, {
        name: "Unpublished ICS Page",
        slug: unpubSlug,
        published: false,
      });

      const response = await fetch(
        `${API_BASE_URL}/api/public/feeds/status-pages/${unpubSlug}/calendar.ics`
      );

      expect(response.status).toBe(404);
    });
  });

  // ==========================================
  // Feed Content
  // ==========================================

  describe("Feed Content", () => {
    it("includes latest incident update in RSS description", async () => {
      const response = await fetch(
        `${API_BASE_URL}/api/public/feeds/status-pages/${statusPageSlug}/rss`
      );

      const body = await response.text();
      expect(body).toContain("Root cause identified");
    });

    it("includes latest incident update in Atom content", async () => {
      const response = await fetch(
        `${API_BASE_URL}/api/public/feeds/status-pages/${statusPageSlug}/atom`
      );

      const body = await response.text();
      // Should contain the incident update message from beforeAll
      expect(body).toContain("Root cause identified");
    });

    it("sorts items by createdAt descending (newest first)", async () => {
      const response = await fetch(
        `${API_BASE_URL}/api/public/feeds/status-pages/${statusPageSlug}/json`
      );

      const body = await response.json();
      const items = body.items;

      // Check that items are sorted by date (newest first)
      for (let i = 1; i < items.length; i++) {
        const prevDate = new Date(items[i - 1].date_published);
        const currDate = new Date(items[i].date_published);
        expect(prevDate.getTime()).toBeGreaterThanOrEqual(currDate.getTime());
      }
    });

    it("properly escapes XML special characters", async () => {
      // Create an incident with special characters, linked to the status page monitor
      const specialTitle = 'Test & Issue "with" <special> chars';
      await insertIncident(ctx.organizationId, ctx.userId, {
        title: specialTitle,
        severity: "minor",
        status: "investigating",
        affectedMonitorIds: [monitorId],
      });

      const response = await fetch(
        `${API_BASE_URL}/api/public/feeds/status-pages/${statusPageSlug}/rss`
      );

      const body = await response.text();
      // Should be valid XML (no parsing errors)
      expect(body).toContain("&amp;");
      expect(body).toContain("&quot;");
      expect(body).toContain("&lt;");
      expect(body).toContain("&gt;");
    });
  });

  // ==========================================
  // Empty Feeds
  // ==========================================

  describe("Empty Feeds", () => {
    let emptyPageSlug: string;

    beforeAll(async () => {
      emptyPageSlug = `empty-feed-${randomUUID().slice(0, 8)}`.toLowerCase();
      await insertStatusPage(ctx.organizationId, {
        name: "Empty Feed Status Page",
        slug: emptyPageSlug,
        published: true,
      });
    });

    it("returns valid RSS feed with no items", async () => {
      const response = await fetch(
        `${API_BASE_URL}/api/public/feeds/status-pages/${emptyPageSlug}/rss`
      );

      expect(response.status).toBe(200);
      const body = await response.text();
      expect(body).toContain("<channel>");
      expect(body).toContain("</channel>");
    });

    it("returns valid Atom feed with no entries", async () => {
      const response = await fetch(
        `${API_BASE_URL}/api/public/feeds/status-pages/${emptyPageSlug}/atom`
      );

      expect(response.status).toBe(200);
      const body = await response.text();
      expect(body).toContain("<feed");
      expect(body).toContain("</feed>");
    });

    it("returns valid JSON feed with empty items array", async () => {
      const response = await fetch(
        `${API_BASE_URL}/api/public/feeds/status-pages/${emptyPageSlug}/json`
      );

      expect(response.status).toBe(200);
      const body = await response.json();
      expect(Array.isArray(body.items)).toBe(true);
      expect(body.items.length).toBe(0);
    });

    it("returns valid ICS calendar with no events", async () => {
      const response = await fetch(
        `${API_BASE_URL}/api/public/feeds/status-pages/${emptyPageSlug}/calendar.ics`
      );

      expect(response.status).toBe(200);
      const body = await response.text();
      expect(body).toContain("BEGIN:VCALENDAR");
      expect(body).toContain("END:VCALENDAR");
    });
  });

  // ==========================================
  // Multiple Severity Levels
  // ==========================================

  describe("Multiple Severity Levels", () => {
    let severityPageSlug: string;
    let severityPageId: string;
    let severityMonitorId: string;

    beforeAll(async () => {
      severityPageSlug = `severity-${randomUUID().slice(0, 8)}`.toLowerCase();
      severityPageId = await insertStatusPage(ctx.organizationId, {
        name: "Severity Test Page",
        slug: severityPageSlug,
        published: true,
      });

      // Create a monitor and link it to the status page
      severityMonitorId = await createMonitor(
        { organizationId: ctx.organizationId, headers },
        { name: "Severity Test Monitor" }
      );
      await linkMonitorToStatusPage(severityPageId, severityMonitorId);

      // Create incidents with different severities, linked to the monitor
      await insertIncident(ctx.organizationId, ctx.userId, {
        title: "Minor Issue",
        severity: "minor",
        status: "investigating",
        affectedMonitorIds: [severityMonitorId],
      });

      await insertIncident(ctx.organizationId, ctx.userId, {
        title: "Major Outage",
        severity: "major",
        status: "investigating",
        affectedMonitorIds: [severityMonitorId],
      });

      await insertIncident(ctx.organizationId, ctx.userId, {
        title: "Critical Emergency",
        severity: "critical",
        status: "investigating",
        affectedMonitorIds: [severityMonitorId],
      });
    });

    it("shows [MINOR] for minor incidents", async () => {
      const response = await fetch(
        `${API_BASE_URL}/api/public/feeds/status-pages/${severityPageSlug}/rss`
      );

      const body = await response.text();
      expect(body).toContain("[MINOR]");
    });

    it("shows [MAJOR] for major incidents", async () => {
      const response = await fetch(
        `${API_BASE_URL}/api/public/feeds/status-pages/${severityPageSlug}/rss`
      );

      const body = await response.text();
      expect(body).toContain("[MAJOR]");
    });

    it("shows [CRITICAL] for critical incidents", async () => {
      const response = await fetch(
        `${API_BASE_URL}/api/public/feeds/status-pages/${severityPageSlug}/rss`
      );

      const body = await response.text();
      expect(body).toContain("[CRITICAL]");
    });
  });

  // ==========================================
  // No Authentication Required
  // ==========================================

  describe("No Authentication Required", () => {
    it("RSS feed is accessible without authentication", async () => {
      const response = await fetch(
        `${API_BASE_URL}/api/public/feeds/status-pages/${statusPageSlug}/rss`
      );

      expect(response.status).toBe(200);
    });

    it("Atom feed is accessible without authentication", async () => {
      const response = await fetch(
        `${API_BASE_URL}/api/public/feeds/status-pages/${statusPageSlug}/atom`
      );

      expect(response.status).toBe(200);
    });

    it("JSON feed is accessible without authentication", async () => {
      const response = await fetch(
        `${API_BASE_URL}/api/public/feeds/status-pages/${statusPageSlug}/json`
      );

      expect(response.status).toBe(200);
    });

    it("ICS calendar is accessible without authentication", async () => {
      const response = await fetch(
        `${API_BASE_URL}/api/public/feeds/status-pages/${statusPageSlug}/calendar.ics`
      );

      expect(response.status).toBe(200);
    });
  });
});
