import { OpenAPIHono } from "@hono/zod-openapi";
import { nanoid } from "nanoid";
import { z } from "zod";
import { db } from "@uni-status/database";
import {
  statusPages,
  statusPageMonitors,
  monitors,
  checkResults,
  incidents,
  badgeTemplates,
} from "@uni-status/database/schema";
import { eq, and, desc, gte, ne, inArray, sql } from "drizzle-orm";
// Import auth middleware for badge template routes
import { requireOrganization } from "../middleware/auth";
import { getAuditUserId, createAuditLog } from "../lib/audit";
import { getAppUrl } from "@uni-status/shared/config";
import { getCanonicalStatusPageUrl } from "@uni-status/shared";
import {
  generateBadgeSvg,
  generateDotSvg,
  calculateOverallStatus,
  type OverallStatus,
  type MonitorStatus,
  type BadgeStyle,
} from "../lib/svg-generator";

export const embedsRoutes = new OpenAPIHono();

// CORS middleware for embed routes - allow all origins
embedsRoutes.use("*", async (c, next) => {
  await next();
  c.header("Access-Control-Allow-Origin", "*");
  c.header("Access-Control-Allow-Methods", "GET, OPTIONS");
  c.header("Access-Control-Allow-Headers", "Content-Type");
});

embedsRoutes.options("*", (c) => {
  return c.body(null, 204);
});

// Helper to get status page data for embeds
async function getStatusPageEmbedData(slug: string) {
  const page = await db.query.statusPages.findFirst({
    where: eq(statusPages.slug, slug),
  });

  if (!page || !page.published) {
    return null;
  }

  // Check if embeds are enabled (default to true if not set)
  const embedSettings = (page.settings as any)?.embedSettings;
  if (embedSettings?.enabled === false) {
    return null;
  }

  // Fetch linked monitors
  const linkedMonitors = await db.query.statusPageMonitors.findMany({
    where: eq(statusPageMonitors.statusPageId, page.id),
    with: {
      monitor: true,
    },
  });

  const monitorIds = linkedMonitors.map((lm) => lm.monitorId);

  // Get active incidents
  const activeIncidents = await db.query.incidents.findMany({
    where: and(
      eq(incidents.organizationId, page.organizationId),
      ne(incidents.status, "resolved")
    ),
  });

  // Filter to incidents affecting these monitors
  const relevantIncidents = activeIncidents.filter((incident) => {
    const affectedMonitors = incident.affectedMonitors || [];
    return affectedMonitors.some((mid: string) => monitorIds.includes(mid));
  });

  // Build monitor list
  const monitorList = linkedMonitors.map((lm) => ({
    id: lm.monitorId,
    name: lm.displayName || lm.monitor.name,
    status: lm.monitor.status as MonitorStatus,
  }));

  // Calculate overall status
  const monitorStatuses = monitorList.map((m) => ({
    status: m.status as MonitorStatus,
  }));

  const overallStatus = calculateOverallStatus(
    monitorStatuses,
    relevantIncidents.map((i) => ({ severity: i.severity as "minor" | "major" | "critical" }))
  );

  return {
    page,
    monitors: monitorList.map((m) => ({
      id: m.id,
      name: m.name,
      status: m.status as MonitorStatus,
    })),
    incidents: relevantIncidents.map((i) => ({
      id: i.id,
      title: i.title,
      status: i.status,
      severity: i.severity,
    })),
    overallStatus,
  };
}

// Helper to get single monitor data
async function getMonitorEmbedData(monitorId: string) {
  const monitor = await db.query.monitors.findFirst({
    where: eq(monitors.id, monitorId),
  });

  if (!monitor) {
    return null;
  }

  return {
    monitor: {
      id: monitor.id,
      name: monitor.name,
      status: monitor.status as MonitorStatus,
    },
  };
}

embedsRoutes.get("/status-pages/:slug/badge.svg", async (c) => {
  const { slug } = c.req.param();
  const label = c.req.query("label") || "status";
  const style = (c.req.query("style") || "flat") as BadgeStyle;

  // Parse optional template config params
  const labelColor = c.req.query("labelColor");
  const textColor = c.req.query("textColor");
  const statusTextColor = c.req.query("statusTextColor");
  const scaleParam = c.req.query("scale");
  const statusColorsParam = c.req.query("statusColors");

  // Build config object from query params
  const config: {
    labelColor?: string;
    textColor?: string;
    statusTextColor?: string;
    scale?: number;
    statusColors?: Record<string, string>;
  } = {};

  if (labelColor) config.labelColor = labelColor;
  if (textColor) config.textColor = textColor;
  if (statusTextColor) config.statusTextColor = statusTextColor;
  if (scaleParam) {
    const scale = parseFloat(scaleParam);
    if (!isNaN(scale) && scale >= 0.5 && scale <= 3) {
      config.scale = scale;
    }
  }
  if (statusColorsParam) {
    try {
      config.statusColors = JSON.parse(statusColorsParam);
    } catch {
      // Ignore invalid JSON
    }
  }

  const data = await getStatusPageEmbedData(slug);

  if (!data) {
    // Return a "not found" badge
    const svg = generateBadgeSvg(label, "maintenance" as OverallStatus, style, config);
    c.header("Content-Type", "image/svg+xml");
    c.header("Cache-Control", "public, max-age=60, s-maxage=60");
    return c.body(svg);
  }

  const svg = generateBadgeSvg(label, data.overallStatus, style, config);

  c.header("Content-Type", "image/svg+xml");
  c.header("Cache-Control", "public, max-age=60, s-maxage=60");
  return c.body(svg);
});

embedsRoutes.get("/status-pages/:slug/dot.svg", async (c) => {
  const { slug } = c.req.param();
  const size = parseInt(c.req.query("size") || "12", 10);
  const animate = c.req.query("animate") === "true";

  const data = await getStatusPageEmbedData(slug);

  if (!data) {
    const svg = generateDotSvg("maintenance" as OverallStatus, size, animate);
    c.header("Content-Type", "image/svg+xml");
    c.header("Cache-Control", "public, max-age=60, s-maxage=60");
    return c.body(svg);
  }

  const svg = generateDotSvg(data.overallStatus, size, animate);

  c.header("Content-Type", "image/svg+xml");
  c.header("Cache-Control", "public, max-age=60, s-maxage=60");
  return c.body(svg);
});

embedsRoutes.get("/status-pages/:slug/status.json", async (c) => {
  const { slug } = c.req.param();
  const showMonitors = c.req.query("showMonitors") === "true";
  const showIncidents = c.req.query("showIncidents") === "true";

  const data = await getStatusPageEmbedData(slug);

  if (!data) {
    c.header("Cache-Control", "public, max-age=30, s-maxage=30");
    return c.json(
      {
        success: false,
        error: {
          code: "NOT_FOUND",
          message: "Status page not found or embeds disabled",
        },
      },
      404
    );
  }

  const statusLabels: Record<OverallStatus, string> = {
    operational: "All Systems Operational",
    degraded: "Partial System Degradation",
    partial_outage: "Partial System Outage",
    major_outage: "Major System Outage",
    maintenance: "Under Maintenance",
  };

  const response: {
    status: OverallStatus;
    statusText: string;
    name: string;
    url: string;
    lastUpdatedAt: string;
    monitors?: Array<{ id: string; name: string; status: string }>;
    activeIncidents?: Array<{ id: string; title: string; status: string; severity: string }>;
  } = {
    status: data.overallStatus,
    statusText: statusLabels[data.overallStatus],
    name: data.page.name,
    url: getCanonicalStatusPageUrl({
      customDomain: data.page.customDomain,
      slug,
      systemUrl: getAppUrl(),
    }),
    lastUpdatedAt: new Date().toISOString(),
  };

  if (showMonitors) {
    response.monitors = data.monitors;
  }

  if (showIncidents) {
    response.activeIncidents = data.incidents;
  }

  c.header("Cache-Control", "public, max-age=30, s-maxage=30");
  return c.json({
    success: true,
    data: response,
  });
});

embedsRoutes.get("/status-pages/:slug/widget.js", async (c) => {
  const { slug } = c.req.param();
  // Normalize API URL - remove trailing /api if present to avoid double prefix
  const apiUrl = getAppUrl();

  // Self-contained JavaScript widget
  const widgetScript = `
(function() {
  'use strict';

  // Find the script tag that loaded this widget
  var currentScript = document.currentScript;
  if (!currentScript) return;

  // Configuration from data attributes
  var config = {
    slug: '${slug}',
    theme: currentScript.getAttribute('data-theme') || 'light',
    showMonitors: currentScript.getAttribute('data-show-monitors') === 'true',
    showIncidents: currentScript.getAttribute('data-show-incidents') === 'true',
    compact: currentScript.getAttribute('data-compact') === 'true',
    refreshInterval: parseInt(currentScript.getAttribute('data-refresh') || '60000', 10)
  };

  // Status colors
  var colors = {
    operational: { bg: '#dcfce7', text: '#166534', accent: '#22c55e' },
    degraded: { bg: '#fef9c3', text: '#854d0e', accent: '#eab308' },
    partial_outage: { bg: '#ffedd5', text: '#9a3412', accent: '#f97316' },
    major_outage: { bg: '#fecaca', text: '#991b1b', accent: '#ef4444' },
    maintenance: { bg: '#dbeafe', text: '#1e40af', accent: '#3b82f6' }
  };

  var darkColors = {
    operational: { bg: '#14532d', text: '#bbf7d0', accent: '#22c55e' },
    degraded: { bg: '#713f12', text: '#fef08a', accent: '#eab308' },
    partial_outage: { bg: '#7c2d12', text: '#fed7aa', accent: '#f97316' },
    major_outage: { bg: '#7f1d1d', text: '#fecaca', accent: '#ef4444' },
    maintenance: { bg: '#1e3a8a', text: '#bfdbfe', accent: '#3b82f6' }
  };

  var statusLabels = {
    operational: 'All Systems Operational',
    degraded: 'Partial System Degradation',
    partial_outage: 'Partial System Outage',
    major_outage: 'Major System Outage',
    maintenance: 'Under Maintenance'
  };

  var monitorStatusLabels = {
    active: 'Operational',
    degraded: 'Degraded',
    down: 'Down',
    paused: 'Paused',
    pending: 'Pending'
  };

  // Create container
  var container = document.createElement('div');
  container.id = 'uni-status-widget-' + config.slug;
  currentScript.parentNode.insertBefore(container, currentScript.nextSibling);

  // Create Shadow DOM for style isolation
  var shadow = container.attachShadow({ mode: 'open' });

  function getThemeColors(status) {
    var isDark = config.theme === 'dark' ||
      (config.theme === 'auto' && window.matchMedia('(prefers-color-scheme: dark)').matches);
    return isDark ? darkColors[status] : colors[status];
  }

  function render(data) {
    var theme = getThemeColors(data.status);
    var baseStyles = config.theme === 'dark' ||
      (config.theme === 'auto' && window.matchMedia('(prefers-color-scheme: dark)').matches)
      ? 'background: #1f2937; color: #f9fafb;'
      : 'background: #ffffff; color: #1f2937;';

    var html = '<style>';
    html += '.usw-container { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; ' + baseStyles + ' border-radius: 8px; border: 1px solid ' + (config.theme === 'dark' ? '#374151' : '#e5e7eb') + '; overflow: hidden; }';
    html += '.usw-header { padding: 12px 16px; display: flex; align-items: center; gap: 10px; background: ' + theme.bg + '; }';
    html += '.usw-dot { width: 10px; height: 10px; border-radius: 50%; background: ' + theme.accent + '; flex-shrink: 0; }';
    html += '.usw-status { font-weight: 600; font-size: 14px; color: ' + theme.text + '; }';
    html += '.usw-name { font-size: 12px; color: ' + theme.text + '; opacity: 0.8; margin-left: auto; }';
    html += '.usw-monitors { padding: 12px 16px; border-top: 1px solid ' + (config.theme === 'dark' ? '#374151' : '#e5e7eb') + '; }';
    html += '.usw-monitor { display: flex; align-items: center; gap: 8px; padding: 6px 0; font-size: 13px; }';
    html += '.usw-monitor-dot { width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0; }';
    html += '.usw-incidents { padding: 12px 16px; border-top: 1px solid ' + (config.theme === 'dark' ? '#374151' : '#e5e7eb') + '; }';
    html += '.usw-incident { padding: 8px 0; font-size: 13px; }';
    html += '.usw-incident-title { font-weight: 500; }';
    html += '.usw-incident-severity { font-size: 11px; padding: 2px 6px; border-radius: 4px; margin-left: 8px; }';
    html += '.usw-link { display: block; padding: 10px 16px; text-align: center; font-size: 12px; color: ' + theme.accent + '; text-decoration: none; border-top: 1px solid ' + (config.theme === 'dark' ? '#374151' : '#e5e7eb') + '; }';
    html += '.usw-link:hover { text-decoration: underline; }';
    html += '</style>';

    html += '<div class="usw-container">';
    html += '<div class="usw-header">';
    html += '<div class="usw-dot"></div>';
    html += '<span class="usw-status">' + statusLabels[data.status] + '</span>';
    if (!config.compact) {
      html += '<span class="usw-name">' + escapeHtml(data.name) + '</span>';
    }
    html += '</div>';

    if (config.showMonitors && data.monitors && data.monitors.length > 0) {
      html += '<div class="usw-monitors">';
      data.monitors.forEach(function(m) {
        var mColor = getMonitorColor(m.status);
        html += '<div class="usw-monitor">';
        html += '<div class="usw-monitor-dot" style="background: ' + mColor + ';"></div>';
        html += '<span>' + escapeHtml(m.name) + '</span>';
        html += '<span style="margin-left: auto; opacity: 0.7;">' + monitorStatusLabels[m.status] + '</span>';
        html += '</div>';
      });
      html += '</div>';
    }

    if (config.showIncidents && data.activeIncidents && data.activeIncidents.length > 0) {
      html += '<div class="usw-incidents">';
      data.activeIncidents.forEach(function(i) {
        var sevColor = getSeverityColor(i.severity);
        html += '<div class="usw-incident">';
        html += '<span class="usw-incident-title">' + escapeHtml(i.title) + '</span>';
        html += '<span class="usw-incident-severity" style="background: ' + sevColor.bg + '; color: ' + sevColor.text + ';">' + i.severity + '</span>';
        html += '</div>';
      });
      html += '</div>';
    }

    html += '<a class="usw-link" href="' + (data.url || '#') + '" target="_blank" rel="noopener">View Status Page</a>';
    html += '</div>';

    shadow.innerHTML = html;
  }

  function getMonitorColor(status) {
    var statusColors = {
      active: '#22c55e',
      degraded: '#eab308',
      down: '#ef4444',
      paused: '#6b7280',
      pending: '#9ca3af'
    };
    return statusColors[status] || '#6b7280';
  }

  function getSeverityColor(severity) {
    var severityColors = {
      minor: { bg: '#fef3c7', text: '#92400e' },
      major: { bg: '#fed7aa', text: '#9a3412' },
      critical: { bg: '#fecaca', text: '#991b1b' }
    };
    return severityColors[severity] || { bg: '#e5e7eb', text: '#374151' };
  }

  function escapeHtml(text) {
    var div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  function fetchStatus() {
    var url = '${apiUrl}/api/public/embeds/status-pages/${slug}/status.json';
    url += '?showMonitors=' + config.showMonitors;
    url += '&showIncidents=' + config.showIncidents;

    fetch(url)
      .then(function(res) { return res.json(); })
      .then(function(json) {
        if (json.success && json.data) {
          render(json.data);
        }
      })
      .catch(function(err) {
        console.error('Uni-Status widget error:', err);
      });
  }

  // Initial fetch
  fetchStatus();

  // Auto-refresh
  if (config.refreshInterval > 0) {
    setInterval(fetchStatus, config.refreshInterval);
  }

  // Listen for theme changes
  if (config.theme === 'auto') {
    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', function() {
      fetchStatus();
    });
  }
})();
`;

  c.header("Content-Type", "application/javascript");
  c.header("Cache-Control", "public, max-age=3600, s-maxage=3600");
  return c.body(widgetScript);
});

embedsRoutes.get("/monitors/:id/badge.svg", async (c) => {
  const { id } = c.req.param();
  const label = c.req.query("label") || "status";
  const style = (c.req.query("style") || "flat") as BadgeStyle;

  // Parse optional template config params
  const labelColor = c.req.query("labelColor");
  const textColor = c.req.query("textColor");
  const statusTextColor = c.req.query("statusTextColor");
  const scaleParam = c.req.query("scale");
  const statusColorsParam = c.req.query("statusColors");

  // Build config object from query params
  const config: {
    labelColor?: string;
    textColor?: string;
    statusTextColor?: string;
    scale?: number;
    statusColors?: Record<string, string>;
  } = {};

  if (labelColor) config.labelColor = labelColor;
  if (textColor) config.textColor = textColor;
  if (statusTextColor) config.statusTextColor = statusTextColor;
  if (scaleParam) {
    const scale = parseFloat(scaleParam);
    if (!isNaN(scale) && scale >= 0.5 && scale <= 3) {
      config.scale = scale;
    }
  }
  if (statusColorsParam) {
    try {
      config.statusColors = JSON.parse(statusColorsParam);
    } catch {
      // Ignore invalid JSON
    }
  }

  const data = await getMonitorEmbedData(id);

  if (!data) {
    const svg = generateBadgeSvg(label, "pending" as MonitorStatus, style, config);
    c.header("Content-Type", "image/svg+xml");
    c.header("Cache-Control", "public, max-age=60, s-maxage=60");
    return c.body(svg);
  }

  const svg = generateBadgeSvg(label, data.monitor.status, style, config);

  c.header("Content-Type", "image/svg+xml");
  c.header("Cache-Control", "public, max-age=60, s-maxage=60");
  return c.body(svg);
});

embedsRoutes.get("/monitors/:id/dot.svg", async (c) => {
  const { id } = c.req.param();
  const size = parseInt(c.req.query("size") || "12", 10);
  const animate = c.req.query("animate") === "true";

  const data = await getMonitorEmbedData(id);

  if (!data) {
    const svg = generateDotSvg("pending" as MonitorStatus, size, animate);
    c.header("Content-Type", "image/svg+xml");
    c.header("Cache-Control", "public, max-age=60, s-maxage=60");
    return c.body(svg);
  }

  const svg = generateDotSvg(data.monitor.status, size, animate);

  c.header("Content-Type", "image/svg+xml");
  c.header("Cache-Control", "public, max-age=60, s-maxage=60");
  return c.body(svg);
});

embedsRoutes.get("/monitors/:id/status.json", async (c) => {
  const { id } = c.req.param();

  const data = await getMonitorEmbedData(id);

  if (!data) {
    c.header("Cache-Control", "public, max-age=30, s-maxage=30");
    return c.json(
      {
        success: false,
        error: {
          code: "NOT_FOUND",
          message: "Monitor not found",
        },
      },
      404
    );
  }

  const statusLabels: Record<MonitorStatus, string> = {
    active: "Operational",
    degraded: "Degraded",
    down: "Down",
    paused: "Paused",
    pending: "Pending",
  };

  c.header("Cache-Control", "public, max-age=30, s-maxage=30");
  return c.json({
    success: true,
    data: {
      id: data.monitor.id,
      name: data.monitor.name,
      status: data.monitor.status,
      statusText: statusLabels[data.monitor.status],
      lastUpdatedAt: new Date().toISOString(),
    },
  });
});

// Validation schema for badge templates
const badgeTemplateSchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().max(500).optional(),
  type: z.enum(["badge", "dot"]).default("badge"),
  style: z.enum(["flat", "plastic", "flat-square", "for-the-badge", "modern"]).default("flat"),
  config: z.object({
    label: z.string().optional(),
    labelColor: z.string().optional(),
    statusColors: z.object({
      operational: z.string().optional(),
      degraded: z.string().optional(),
      partialOutage: z.string().optional(),
      majorOutage: z.string().optional(),
      maintenance: z.string().optional(),
      unknown: z.string().optional(),
    }).optional(),
    textColor: z.string().optional(),
    statusTextColor: z.string().optional(),
    scale: z.number().min(0.5).max(3).optional(),
    dot: z.object({
      size: z.number().min(8).max(64).optional(),
      animate: z.boolean().optional(),
      animationStyle: z.enum(["pulse", "blink"]).optional(),
    }).optional(),
    customData: z.object({
      enabled: z.boolean(),
      type: z.enum(["uptime", "response_time", "p50", "p90", "p99", "error_rate", "custom"]),
      customLabel: z.string().optional(),
      customValue: z.string().optional(),
      thresholds: z.array(z.object({
        value: z.number(),
        color: z.string(),
        comparison: z.enum(["lt", "lte", "gt", "gte", "eq"]),
      })).optional(),
    }).optional(),
    showIcon: z.boolean().optional(),
    rounded: z.boolean().optional(),
    customCss: z.string().max(10000).optional(),
  }).optional(),
  isDefault: z.boolean().default(false),
});

embedsRoutes.get("/badge-templates", async (c) => {
  const organizationId = await requireOrganization(c);

  const templates = await db.query.badgeTemplates.findMany({
    where: eq(badgeTemplates.organizationId, organizationId),
    orderBy: [desc(badgeTemplates.createdAt)],
  });

  return c.json({
    success: true,
    data: templates,
  });
});

embedsRoutes.get("/badge-templates/:id", async (c) => {
  const organizationId = await requireOrganization(c);
  const { id } = c.req.param();

  const template = await db.query.badgeTemplates.findFirst({
    where: and(
      eq(badgeTemplates.id, id),
      eq(badgeTemplates.organizationId, organizationId)
    ),
  });

  if (!template) {
    return c.json({ success: false, error: { code: "NOT_FOUND", message: "Template not found" } }, 404);
  }

  return c.json({
    success: true,
    data: template,
  });
});

embedsRoutes.post("/badge-templates", async (c) => {
  const organizationId = await requireOrganization(c);
  const userId = getAuditUserId(c);
  if (!userId) {
    return c.json({ success: false, error: { code: "UNAUTHORIZED", message: "User context required" } }, 401);
  }
  const body = await c.req.json();

  const parsed = badgeTemplateSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({
      success: false,
      error: {
        code: "VALIDATION_ERROR",
        message: "Invalid request body",
        details: parsed.error.flatten(),
      },
    }, 400);
  }

  const data = parsed.data;
  const id = nanoid();
  const now = new Date();

  // If this is being set as default, unset other defaults
  if (data.isDefault) {
    await db
      .update(badgeTemplates)
      .set({ isDefault: false, updatedAt: now })
      .where(and(
        eq(badgeTemplates.organizationId, organizationId),
        eq(badgeTemplates.type, data.type)
      ));
  }

  await db.insert(badgeTemplates).values({
    id,
    organizationId,
    name: data.name,
    description: data.description,
    type: data.type,
    style: data.style,
    config: data.config || {},
    isDefault: data.isDefault,
    createdBy: userId,
    createdAt: now,
    updatedAt: now,
  });

  await createAuditLog(c, {
    organizationId,
    userId: getAuditUserId(c),
    action: "badge_template.create",
    resourceType: "badge_template",
    resourceId: id,
    resourceName: data.name,
    metadata: {
      templateId: id,
      name: data.name,
    },
  });

  const template = await db.query.badgeTemplates.findFirst({
    where: eq(badgeTemplates.id, id),
  });

  return c.json({
    success: true,
    data: template,
  }, 201);
});

embedsRoutes.put("/badge-templates/:id", async (c) => {
  const organizationId = await requireOrganization(c);
  const { id } = c.req.param();
  const body = await c.req.json();

  const existing = await db.query.badgeTemplates.findFirst({
    where: and(
      eq(badgeTemplates.id, id),
      eq(badgeTemplates.organizationId, organizationId)
    ),
  });

  if (!existing) {
    return c.json({ success: false, error: { code: "NOT_FOUND", message: "Template not found" } }, 404);
  }

  const parsed = badgeTemplateSchema.partial().safeParse(body);
  if (!parsed.success) {
    return c.json({
      success: false,
      error: {
        code: "VALIDATION_ERROR",
        message: "Invalid request body",
        details: parsed.error.flatten(),
      },
    }, 400);
  }

  const data = parsed.data;
  const now = new Date();

  // If this is being set as default, unset other defaults
  if (data.isDefault) {
    await db
      .update(badgeTemplates)
      .set({ isDefault: false, updatedAt: now })
      .where(and(
        eq(badgeTemplates.organizationId, organizationId),
        eq(badgeTemplates.type, data.type || existing.type),
        ne(badgeTemplates.id, id)
      ));
  }

  // Merge config instead of replacing to preserve existing settings
  const mergedConfig = data.config
    ? { ...existing.config, ...data.config }
    : existing.config;

  await db
    .update(badgeTemplates)
    .set({ ...data, config: mergedConfig, updatedAt: now })
    .where(eq(badgeTemplates.id, id));

  await createAuditLog(c, {
    organizationId,
    userId: getAuditUserId(c),
    action: "badge_template.update",
    resourceType: "badge_template",
    resourceId: id,
    resourceName: existing.name,
    metadata: {
      templateId: id,
      updates: data,
    },
  });

  const template = await db.query.badgeTemplates.findFirst({
    where: eq(badgeTemplates.id, id),
  });

  return c.json({
    success: true,
    data: template,
  });
});

embedsRoutes.delete("/badge-templates/:id", async (c) => {
  const organizationId = await requireOrganization(c);
  const { id } = c.req.param();

  const existing = await db.query.badgeTemplates.findFirst({
    where: and(
      eq(badgeTemplates.id, id),
      eq(badgeTemplates.organizationId, organizationId)
    ),
  });

  if (!existing) {
    return c.json({ success: false, error: { code: "NOT_FOUND", message: "Template not found" } }, 404);
  }

  await db.delete(badgeTemplates).where(eq(badgeTemplates.id, id));

  await createAuditLog(c, {
    organizationId,
    userId: getAuditUserId(c),
    action: "badge_template.delete",
    resourceType: "badge_template",
    resourceId: id,
    resourceName: existing.name,
    metadata: {
      templateId: id,
      name: existing.name,
    },
  });

  return c.json({
    success: true,
    data: { deleted: true },
  });
});
