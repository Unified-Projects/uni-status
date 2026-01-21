import { Job } from "bullmq";
import { nanoid } from "nanoid";
import puppeteer from "puppeteer";
import {
  monitors,
  incidents,
  checkResults,
  maintenanceWindows,
} from "@uni-status/database/schema";
import { enterpriseDb as db } from "../../database";
import {
  slaReports,
  sloTargets,
  errorBudgets,
  reportTemplates,
} from "../../database/schema";
import { eq, and, gte, lte, sql, inArray, desc } from "drizzle-orm";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";

interface ReportGenerateJobData {
  reportId: string;
  organizationId: string;
  reportType: "sla" | "uptime" | "incident" | "performance" | "executive";
  periodStart: string;
  periodEnd: string;
  includedMonitors: string[];
  includedStatusPages: string[];
  settings: {
    includeCharts: boolean;
    includeIncidents: boolean;
    includeMaintenanceWindows: boolean;
    includeResponseTimes: boolean;
    includeSloStatus: boolean;
    customBranding: Record<string, unknown>;
  };
}

interface ReportData {
  reportType: string;
  periodStart: Date;
  periodEnd: Date;
  generatedAt: Date;
  monitors: MonitorReportData[];
  incidents: IncidentReportData[];
  maintenanceWindows: MaintenanceReportData[];
  slos: SloReportData[];
  summary: ReportSummary;
  branding: BrandingData;
}

interface MonitorReportData {
  id: string;
  name: string;
  type: string;
  url: string;
  uptimePercentage: number;
  avgResponseTime: number;
  totalChecks: number;
  successfulChecks: number;
  failedChecks: number;
  downtimeMinutes: number;
  incidentCount: number;
}

interface IncidentReportData {
  id: string;
  title: string;
  severity: string;
  status: string;
  startedAt: Date;
  resolvedAt: Date | null;
  durationMinutes: number;
  affectedMonitors: string[];
}

interface MaintenanceReportData {
  id: string;
  name: string;
  startsAt: Date;
  endsAt: Date;
  durationMinutes: number;
  affectedMonitors: string[];
}

interface SloReportData {
  id: string;
  name: string;
  monitorName: string;
  targetPercentage: number;
  actualPercentage: number;
  budgetMinutes: number;
  consumedMinutes: number;
  remainingMinutes: number;
  breached: boolean;
}

interface ReportSummary {
  totalMonitors: number;
  overallUptime: number;
  avgResponseTime: number;
  totalIncidents: number;
  criticalIncidents: number;
  majorIncidents: number;
  minorIncidents: number;
  totalDowntimeMinutes: number;
  slosMet: number;
  slosBreached: number;
  maintenanceWindowCount: number;
}

interface BrandingData {
  logoUrl?: string;
  primaryColor: string;
  secondaryColor: string;
  companyName?: string;
  footerText?: string;
}

import { getS3Config, getAwsConfig, getStorageConfig } from "@uni-status/shared/config";

// Get S3 configuration (new S3-compatible config takes priority over legacy AWS config)
const s3Config = getS3Config();
const awsConfig = getAwsConfig();

// Initialize S3 client - Priority: New S3 config > Legacy AWS config
const s3Client = (() => {
  // Check new S3-compatible config first
  if (s3Config.accessKey && s3Config.secretKey && s3Config.bucket) {
    return new S3Client({
      region: s3Config.region,
      endpoint: s3Config.endpoint,
      forcePathStyle: s3Config.forcePathStyle,
      credentials: {
        accessKeyId: s3Config.accessKey,
        secretAccessKey: s3Config.secretKey,
      },
    });
  }
  // Fall back to legacy AWS config
  if (awsConfig.accessKeyId && awsConfig.secretAccessKey && awsConfig.s3Bucket) {
    return new S3Client({
      region: awsConfig.region,
      credentials: {
        accessKeyId: awsConfig.accessKeyId,
        secretAccessKey: awsConfig.secretAccessKey,
      },
    });
  }
  return null;
})();

// Determine which bucket to use
const s3Bucket = s3Config.bucket || awsConfig.s3Bucket;

/**
 * Build the public URL for an S3 object
 */
function buildS3PublicUrl(key: string): string {
  // If a public URL is configured (e.g., CDN or R2 public bucket), use it
  if (s3Config.publicUrl) {
    return `${s3Config.publicUrl.replace(/\/$/, "")}/${key}`;
  }
  // If using custom endpoint, construct URL based on path style
  if (s3Config.endpoint) {
    if (s3Config.forcePathStyle) {
      // Path-style: endpoint/bucket/key (MinIO style)
      return `${s3Config.endpoint.replace(/\/$/, "")}/${s3Bucket}/${key}`;
    } else {
      // Virtual-hosted style: bucket.endpoint/key
      const endpointUrl = new URL(s3Config.endpoint);
      return `${endpointUrl.protocol}//${s3Bucket}.${endpointUrl.host}/${key}`;
    }
  }
  // Default AWS S3 URL format
  const region = s3Config.region || awsConfig.region || "us-east-1";
  return `https://${s3Bucket}.s3.${region}.amazonaws.com/${key}`;
}

function buildStubPdf(reportData: ReportData): Buffer {
  const header = `%PDF-1.4\n% Stub report for ${reportData.reportType}\n`;
  const body = JSON.stringify({
    summary: reportData.summary,
    generatedAt: reportData.generatedAt,
  });
  const padding = Buffer.alloc(Math.max(1024, body.length), 0);
  return Buffer.concat([Buffer.from(header), Buffer.from(body), padding]);
}

// Gather report data from database
async function gatherReportData(
  jobData: ReportGenerateJobData
): Promise<ReportData> {
  const periodStart = new Date(jobData.periodStart);
  const periodEnd = new Date(jobData.periodEnd);
  const now = new Date();

  // Get monitors
  const monitorsList = await db.query.monitors.findMany({
    where: inArray(monitors.id, jobData.includedMonitors),
  });

  // Gather monitor stats
  const monitorData: MonitorReportData[] = await Promise.all(
    monitorsList.map(async (monitor) => {
      // Get check results stats
      const stats = await db
        .select({
          totalChecks: sql<number>`COUNT(*)`,
          successfulChecks: sql<number>`COUNT(*) FILTER (WHERE ${checkResults.status} = 'success')`,
          failedChecks: sql<number>`COUNT(*) FILTER (WHERE ${checkResults.status} != 'success')`,
          avgResponseTime: sql<number>`AVG(${checkResults.responseTimeMs})`,
        })
        .from(checkResults)
        .where(
          and(
            eq(checkResults.monitorId, monitor.id),
            gte(checkResults.createdAt, periodStart),
            lte(checkResults.createdAt, periodEnd)
          )
        );

      const s = stats[0] || { totalChecks: 0, successfulChecks: 0, failedChecks: 0, avgResponseTime: 0 };
      const totalChecks = Number(s.totalChecks || 0);
      const successfulChecks = Number(s.successfulChecks || 0);
      const failedChecks = Number(s.failedChecks || 0);
      const avgResponseTime = Number(s.avgResponseTime || 0);
      const uptimePercentage = totalChecks > 0 ? (successfulChecks / totalChecks) * 100 : 100;

      // Estimate downtime (failed checks * check interval)
      const intervalSeconds = monitor.intervalSeconds ?? 60;
      const downtimeMinutes = failedChecks * (intervalSeconds / 60);

      // Count incidents
      const incidentCount = await db
        .select({ count: sql<number>`COUNT(DISTINCT ${incidents.id})` })
        .from(incidents)
        .where(
          and(
            gte(incidents.startedAt, periodStart),
            lte(incidents.startedAt, periodEnd)
            // Would join with incidentAffectedMonitors here
          )
        );

      return {
        id: monitor.id,
        name: monitor.name,
        type: monitor.type,
        url: monitor.url,
        uptimePercentage,
        avgResponseTime,
        totalChecks,
        successfulChecks,
        failedChecks,
        downtimeMinutes,
        incidentCount: incidentCount[0]?.count || 0,
      };
    })
  );

  // Get incidents
  const incidentsList = await db.query.incidents.findMany({
    where: and(
      eq(incidents.organizationId, jobData.organizationId),
      gte(incidents.startedAt, periodStart),
      lte(incidents.startedAt, periodEnd)
    ),
    orderBy: [desc(incidents.startedAt)],
    with: {},
  });

  const incidentData: IncidentReportData[] = incidentsList.map((incident) => {
    const resolvedAt = incident.resolvedAt;
    const durationMinutes = resolvedAt
      ? (resolvedAt.getTime() - incident.startedAt.getTime()) / (1000 * 60)
      : (now.getTime() - incident.startedAt.getTime()) / (1000 * 60);

    return {
      id: incident.id,
      title: incident.title,
      severity: incident.severity,
      status: incident.status,
      startedAt: incident.startedAt,
      resolvedAt,
      durationMinutes,
      affectedMonitors: incident.affectedMonitors ?? [],
    };
  });

  // Get maintenance windows
  let maintenanceData: MaintenanceReportData[] = [];
  if (jobData.settings.includeMaintenanceWindows) {
    const maintenanceList = await db.query.maintenanceWindows.findMany({
      where: and(
        eq(maintenanceWindows.organizationId, jobData.organizationId),
        gte(maintenanceWindows.startsAt, periodStart),
        lte(maintenanceWindows.startsAt, periodEnd)
      ),
    });

    maintenanceData = maintenanceList.map((mw) => ({
      id: mw.id,
      name: mw.name,
      startsAt: mw.startsAt,
      endsAt: mw.endsAt,
      durationMinutes: (mw.endsAt.getTime() - mw.startsAt.getTime()) / (1000 * 60),
      affectedMonitors: (mw.affectedMonitors as string[]) || [],
    }));
  }

  // Get SLO data
  let sloData: SloReportData[] = [];
  if (jobData.settings.includeSloStatus) {
    const sloList = await db.query.sloTargets.findMany({
      where: and(
        eq(sloTargets.organizationId, jobData.organizationId),
        eq(sloTargets.active, true)
      ),
      with: {
        monitor: {
          columns: {
            id: true,
            name: true,
          },
        },
      },
    });

    sloData = await Promise.all(
      sloList.map(async (slo) => {
        // Get error budget for the period
        const budget = await db.query.errorBudgets.findFirst({
          where: and(
            eq(errorBudgets.sloTargetId, slo.id),
            lte(errorBudgets.periodStart, periodEnd),
            gte(errorBudgets.periodEnd, periodStart)
          ),
          orderBy: [desc(errorBudgets.periodStart)],
        });

        return {
          id: slo.id,
          name: slo.name,
          monitorName: slo.monitor.name,
          targetPercentage: parseFloat(slo.targetPercentage),
          actualPercentage: budget
            ? 100 - parseFloat(budget.percentConsumed || "0")
            : 100,
          budgetMinutes: budget ? parseFloat(budget.budgetMinutes) : 0,
          consumedMinutes: budget ? parseFloat(budget.consumedMinutes || "0") : 0,
          remainingMinutes: budget ? parseFloat(budget.remainingMinutes) : 0,
          breached: budget?.breached || false,
        };
      })
    );
  }

  // Calculate summary
  const summary: ReportSummary = {
    totalMonitors: monitorData.length,
    overallUptime:
      monitorData.length > 0
        ? monitorData.reduce((acc, m) => acc + m.uptimePercentage, 0) / monitorData.length
        : 100,
    avgResponseTime:
      monitorData.length > 0
        ? monitorData.reduce((acc, m) => acc + (Number.isFinite(m.avgResponseTime) ? m.avgResponseTime : 0), 0) /
          monitorData.length
        : 0,
    totalIncidents: incidentData.length,
    criticalIncidents: incidentData.filter((i) => i.severity === "critical").length,
    majorIncidents: incidentData.filter((i) => i.severity === "major").length,
    minorIncidents: incidentData.filter((i) => i.severity === "minor").length,
    totalDowntimeMinutes: monitorData.reduce(
      (acc, m) => acc + (Number.isFinite(m.downtimeMinutes) ? m.downtimeMinutes : 0),
      0
    ),
    slosMet: sloData.filter((s) => !s.breached).length,
    slosBreached: sloData.filter((s) => s.breached).length,
    maintenanceWindowCount: maintenanceData.length,
  };

  // Build branding
  const branding: BrandingData = {
    logoUrl: (jobData.settings.customBranding?.logoUrl as string) || undefined,
    primaryColor: (jobData.settings.customBranding?.primaryColor as string) || "#10b981",
    secondaryColor: (jobData.settings.customBranding?.secondaryColor as string) || "#1f2937",
    companyName: (jobData.settings.customBranding?.companyName as string) || undefined,
    footerText: (jobData.settings.customBranding?.footerText as string) || "Generated by Uni-Status",
  };

  return {
    reportType: jobData.reportType,
    periodStart,
    periodEnd,
    generatedAt: now,
    monitors: monitorData,
    incidents: incidentData,
    maintenanceWindows: maintenanceData,
    slos: sloData,
    summary,
    branding,
  };
}

// Get report type display name
function getReportTypeName(reportType: string): string {
  const names: Record<string, string> = {
    sla: "SLA Report",
    uptime: "Uptime Report",
    incident: "Incident Report",
    performance: "Performance Report",
    executive: "Executive Summary",
  };
  return names[reportType] || "Report";
}

// Generate HTML for the report - dispatches to type-specific generators
function generateReportHtml(data: ReportData): string {
  switch (data.reportType) {
    case "uptime":
      return generateUptimeReportHtml(data);
    case "incident":
      return generateIncidentReportHtml(data);
    case "performance":
      return generatePerformanceReportHtml(data);
    case "executive":
      return generateExecutiveReportHtml(data);
    case "sla":
    default:
      return generateSlaReportHtml(data);
  }
}

// Common styles shared across all report types
function getCommonStyles(branding: BrandingData): string {
  return `
    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
      font-size: 14px;
      line-height: 1.5;
      color: #1f2937;
      background: #ffffff;
    }
    .container {
      max-width: 800px;
      margin: 0 auto;
      padding: 40px;
    }
    .header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding-bottom: 24px;
      border-bottom: 2px solid ${branding.primaryColor};
      margin-bottom: 32px;
    }
    .header-title {
      font-size: 28px;
      font-weight: 700;
      color: ${branding.secondaryColor};
    }
    .header-subtitle {
      font-size: 14px;
      color: #6b7280;
      margin-top: 4px;
    }
    .logo {
      height: 48px;
    }
    .section {
      margin-bottom: 32px;
    }
    .section-title {
      font-size: 18px;
      font-weight: 600;
      color: ${branding.secondaryColor};
      margin-bottom: 16px;
      padding-bottom: 8px;
      border-bottom: 1px solid #e5e7eb;
    }
    .summary-grid {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 16px;
      margin-bottom: 24px;
    }
    .summary-card {
      background: #f9fafb;
      border-radius: 8px;
      padding: 16px;
      text-align: center;
    }
    .summary-value {
      font-size: 24px;
      font-weight: 700;
      color: ${branding.primaryColor};
    }
    .summary-value.warning {
      color: #f59e0b;
    }
    .summary-value.danger {
      color: #ef4444;
    }
    .summary-label {
      font-size: 12px;
      color: #6b7280;
      margin-top: 4px;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      margin-bottom: 16px;
    }
    th, td {
      padding: 10px 12px;
      text-align: left;
      border-bottom: 1px solid #e5e7eb;
    }
    th {
      background: #f9fafb;
      font-weight: 600;
      font-size: 12px;
      text-transform: uppercase;
      color: #6b7280;
    }
    tr:last-child td {
      border-bottom: none;
    }
    .status-badge {
      display: inline-block;
      padding: 2px 8px;
      border-radius: 12px;
      font-size: 12px;
      font-weight: 500;
    }
    .status-healthy {
      background: #d1fae5;
      color: #065f46;
    }
    .status-warning {
      background: #fef3c7;
      color: #92400e;
    }
    .status-danger {
      background: #fecaca;
      color: #991b1b;
    }
    .uptime-bar {
      width: 100px;
      height: 8px;
      background: #e5e7eb;
      border-radius: 4px;
      overflow: hidden;
      display: inline-block;
      vertical-align: middle;
      margin-right: 8px;
    }
    .uptime-fill {
      height: 100%;
      background: ${branding.primaryColor};
      border-radius: 4px;
    }
    .footer {
      margin-top: 48px;
      padding-top: 24px;
      border-top: 1px solid #e5e7eb;
      text-align: center;
      color: #9ca3af;
      font-size: 12px;
    }
    .page-break {
      page-break-before: always;
    }
    .highlight-box {
      background: linear-gradient(135deg, ${branding.primaryColor}15, ${branding.primaryColor}05);
      border-left: 4px solid ${branding.primaryColor};
      padding: 16px;
      margin: 16px 0;
      border-radius: 0 8px 8px 0;
    }
    .incident-timeline {
      position: relative;
      padding-left: 24px;
    }
    .incident-timeline::before {
      content: '';
      position: absolute;
      left: 8px;
      top: 0;
      bottom: 0;
      width: 2px;
      background: #e5e7eb;
    }
    .timeline-item {
      position: relative;
      margin-bottom: 16px;
      padding-left: 16px;
    }
    .timeline-item::before {
      content: '';
      position: absolute;
      left: -20px;
      top: 6px;
      width: 12px;
      height: 12px;
      border-radius: 50%;
      background: ${branding.primaryColor};
    }
    .timeline-item.critical::before {
      background: #ef4444;
    }
    .timeline-item.major::before {
      background: #f59e0b;
    }
    .chart-placeholder {
      background: #f9fafb;
      border: 2px dashed #e5e7eb;
      border-radius: 8px;
      padding: 40px;
      text-align: center;
      color: #9ca3af;
    }
  `;
}

// Helper functions for formatting
function formatDate(date: Date): string {
  return date.toLocaleDateString("en-GB", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

function formatDuration(minutes: number): string {
  if (minutes < 60) return `${Math.round(minutes)}m`;
  const hours = Math.floor(minutes / 60);
  const mins = Math.round(minutes % 60);
  return `${hours}h ${mins}m`;
}

function formatDateTime(date: Date): string {
  return date.toLocaleString("en-GB", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

// Generate SLA Report HTML
function generateSlaReportHtml(data: ReportData): string {
  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>SLA Report - ${formatDate(data.periodStart)} to ${formatDate(data.periodEnd)}</title>
  <style>
    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
      font-size: 14px;
      line-height: 1.5;
      color: #1f2937;
      background: #ffffff;
    }
    .container {
      max-width: 800px;
      margin: 0 auto;
      padding: 40px;
    }
    .header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding-bottom: 24px;
      border-bottom: 2px solid ${data.branding.primaryColor};
      margin-bottom: 32px;
    }
    .header-title {
      font-size: 28px;
      font-weight: 700;
      color: ${data.branding.secondaryColor};
    }
    .header-subtitle {
      font-size: 14px;
      color: #6b7280;
      margin-top: 4px;
    }
    .logo {
      height: 48px;
    }
    .section {
      margin-bottom: 32px;
    }
    .section-title {
      font-size: 18px;
      font-weight: 600;
      color: ${data.branding.secondaryColor};
      margin-bottom: 16px;
      padding-bottom: 8px;
      border-bottom: 1px solid #e5e7eb;
    }
    .summary-grid {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 16px;
      margin-bottom: 24px;
    }
    .summary-card {
      background: #f9fafb;
      border-radius: 8px;
      padding: 16px;
      text-align: center;
    }
    .summary-value {
      font-size: 24px;
      font-weight: 700;
      color: ${data.branding.primaryColor};
    }
    .summary-value.warning {
      color: #f59e0b;
    }
    .summary-value.danger {
      color: #ef4444;
    }
    .summary-label {
      font-size: 12px;
      color: #6b7280;
      margin-top: 4px;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      margin-bottom: 16px;
    }
    th, td {
      padding: 10px 12px;
      text-align: left;
      border-bottom: 1px solid #e5e7eb;
    }
    th {
      background: #f9fafb;
      font-weight: 600;
      font-size: 12px;
      text-transform: uppercase;
      color: #6b7280;
    }
    tr:last-child td {
      border-bottom: none;
    }
    .status-badge {
      display: inline-block;
      padding: 2px 8px;
      border-radius: 12px;
      font-size: 12px;
      font-weight: 500;
    }
    .status-healthy {
      background: #d1fae5;
      color: #065f46;
    }
    .status-warning {
      background: #fef3c7;
      color: #92400e;
    }
    .status-danger {
      background: #fecaca;
      color: #991b1b;
    }
    .uptime-bar {
      width: 100px;
      height: 8px;
      background: #e5e7eb;
      border-radius: 4px;
      overflow: hidden;
      display: inline-block;
      vertical-align: middle;
      margin-right: 8px;
    }
    .uptime-fill {
      height: 100%;
      background: ${data.branding.primaryColor};
      border-radius: 4px;
    }
    .footer {
      margin-top: 48px;
      padding-top: 24px;
      border-top: 1px solid #e5e7eb;
      text-align: center;
      color: #9ca3af;
      font-size: 12px;
    }
    .page-break {
      page-break-before: always;
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <div>
        <div class="header-title">${data.branding.companyName || "SLA Report"}</div>
        <div class="header-subtitle">${formatDate(data.periodStart)} - ${formatDate(data.periodEnd)}</div>
      </div>
      ${data.branding.logoUrl ? `<img src="${data.branding.logoUrl}" class="logo" alt="Logo">` : ""}
    </div>

    <div class="section">
      <div class="section-title">Executive Summary</div>
      <div class="summary-grid">
        <div class="summary-card">
          <div class="summary-value${data.summary.overallUptime < 99 ? " warning" : ""}${data.summary.overallUptime < 95 ? " danger" : ""}">${data.summary.overallUptime.toFixed(2)}%</div>
          <div class="summary-label">Overall Uptime</div>
        </div>
        <div class="summary-card">
          <div class="summary-value">${Math.round(data.summary.avgResponseTime)}ms</div>
          <div class="summary-label">Avg Response Time</div>
        </div>
        <div class="summary-card">
          <div class="summary-value${data.summary.totalIncidents > 5 ? " warning" : ""}${data.summary.totalIncidents > 10 ? " danger" : ""}">${data.summary.totalIncidents}</div>
          <div class="summary-label">Total Incidents</div>
        </div>
        <div class="summary-card">
          <div class="summary-value">${data.summary.totalMonitors}</div>
          <div class="summary-label">Monitors</div>
        </div>
        <div class="summary-card">
          <div class="summary-value">${formatDuration(data.summary.totalDowntimeMinutes)}</div>
          <div class="summary-label">Total Downtime</div>
        </div>
        <div class="summary-card">
          <div class="summary-value${data.summary.slosBreached > 0 ? " danger" : ""}">${data.summary.slosMet}/${data.summary.slosMet + data.summary.slosBreached}</div>
          <div class="summary-label">SLOs Met</div>
        </div>
      </div>
    </div>

    <div class="section">
      <div class="section-title">Monitor Performance</div>
      <table>
        <thead>
          <tr>
            <th>Monitor</th>
            <th>Type</th>
            <th>Uptime</th>
            <th>Avg Response</th>
            <th>Checks</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          ${data.monitors
            .map(
              (m) => `
          <tr>
            <td><strong>${m.name}</strong></td>
            <td>${m.type.toUpperCase()}</td>
            <td>
              <div class="uptime-bar"><div class="uptime-fill" style="width: ${m.uptimePercentage}%"></div></div>
              ${m.uptimePercentage.toFixed(2)}%
            </td>
            <td>${Math.round(m.avgResponseTime)}ms</td>
            <td>${m.totalChecks.toLocaleString()}</td>
            <td>
              <span class="status-badge ${m.uptimePercentage >= 99.9 ? "status-healthy" : m.uptimePercentage >= 99 ? "status-warning" : "status-danger"}">
                ${m.uptimePercentage >= 99.9 ? "Healthy" : m.uptimePercentage >= 99 ? "Degraded" : "Poor"}
              </span>
            </td>
          </tr>
          `
            )
            .join("")}
        </tbody>
      </table>
    </div>

    ${
      data.slos.length > 0
        ? `
    <div class="section page-break">
      <div class="section-title">SLO Status</div>
      <table>
        <thead>
          <tr>
            <th>SLO</th>
            <th>Monitor</th>
            <th>Target</th>
            <th>Actual</th>
            <th>Budget Used</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          ${data.slos
            .map(
              (s) => `
          <tr>
            <td><strong>${s.name}</strong></td>
            <td>${s.monitorName}</td>
            <td>${s.targetPercentage.toFixed(2)}%</td>
            <td>${s.actualPercentage.toFixed(2)}%</td>
            <td>
              <div class="uptime-bar"><div class="uptime-fill" style="width: ${Math.min(100, (s.consumedMinutes / s.budgetMinutes) * 100)}%; background: ${s.breached ? "#ef4444" : data.branding.primaryColor}"></div></div>
              ${((s.consumedMinutes / s.budgetMinutes) * 100).toFixed(1)}%
            </td>
            <td>
              <span class="status-badge ${s.breached ? "status-danger" : "status-healthy"}">
                ${s.breached ? "Breached" : "Met"}
              </span>
            </td>
          </tr>
          `
            )
            .join("")}
        </tbody>
      </table>
    </div>
    `
        : ""
    }

    ${
      data.incidents.length > 0
        ? `
    <div class="section">
      <div class="section-title">Incidents (${data.incidents.length})</div>
      <table>
        <thead>
          <tr>
            <th>Incident</th>
            <th>Severity</th>
            <th>Started</th>
            <th>Duration</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          ${data.incidents
            .slice(0, 20)
            .map(
              (i) => `
          <tr>
            <td><strong>${i.title}</strong></td>
            <td>
              <span class="status-badge ${i.severity === "critical" ? "status-danger" : i.severity === "major" ? "status-warning" : "status-healthy"}">
                ${i.severity.charAt(0).toUpperCase() + i.severity.slice(1)}
              </span>
            </td>
            <td>${formatDate(i.startedAt)}</td>
            <td>${formatDuration(i.durationMinutes)}</td>
            <td>${i.status.charAt(0).toUpperCase() + i.status.slice(1)}</td>
          </tr>
          `
            )
            .join("")}
        </tbody>
      </table>
      ${data.incidents.length > 20 ? `<p style="color: #6b7280; font-size: 12px;">... and ${data.incidents.length - 20} more incidents</p>` : ""}
    </div>
    `
        : ""
    }

    <div class="footer">
      <p>${data.branding.footerText}</p>
      <p>Generated on ${formatDate(data.generatedAt)} at ${data.generatedAt.toLocaleTimeString()}</p>
    </div>
  </div>
</body>
</html>
  `;
}

// Generate Uptime Report HTML - Focuses on availability metrics
function generateUptimeReportHtml(data: ReportData): string {
  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Uptime Report - ${formatDate(data.periodStart)} to ${formatDate(data.periodEnd)}</title>
  <style>${getCommonStyles(data.branding)}</style>
</head>
<body>
  <div class="container">
    <div class="header">
      <div>
        <div class="header-title">${data.branding.companyName || "Uptime Report"}</div>
        <div class="header-subtitle">${formatDate(data.periodStart)} - ${formatDate(data.periodEnd)}</div>
      </div>
      ${data.branding.logoUrl ? `<img src="${data.branding.logoUrl}" class="logo" alt="Logo">` : ""}
    </div>

    <div class="section">
      <div class="section-title">Availability Overview</div>
      <div class="summary-grid">
        <div class="summary-card">
          <div class="summary-value${data.summary.overallUptime < 99 ? " warning" : ""}${data.summary.overallUptime < 95 ? " danger" : ""}">${data.summary.overallUptime.toFixed(3)}%</div>
          <div class="summary-label">Overall Uptime</div>
        </div>
        <div class="summary-card">
          <div class="summary-value">${data.summary.totalMonitors}</div>
          <div class="summary-label">Total Monitors</div>
        </div>
        <div class="summary-card">
          <div class="summary-value${data.summary.totalDowntimeMinutes > 60 ? " warning" : ""}${data.summary.totalDowntimeMinutes > 480 ? " danger" : ""}">${formatDuration(data.summary.totalDowntimeMinutes)}</div>
          <div class="summary-label">Total Downtime</div>
        </div>
      </div>

      <div class="highlight-box">
        <strong>Uptime Summary:</strong> During this period, your services maintained an overall uptime of
        <strong>${data.summary.overallUptime.toFixed(3)}%</strong>, with a total of
        <strong>${formatDuration(data.summary.totalDowntimeMinutes)}</strong> of downtime across all monitors.
      </div>
    </div>

    <div class="section">
      <div class="section-title">Monitor Availability</div>
      <table>
        <thead>
          <tr>
            <th>Monitor</th>
            <th>Type</th>
            <th>Uptime</th>
            <th>Downtime</th>
            <th>Total Checks</th>
            <th>Failed Checks</th>
          </tr>
        </thead>
        <tbody>
          ${data.monitors
            .sort((a, b) => a.uptimePercentage - b.uptimePercentage)
            .map(
              (m) => `
          <tr>
            <td><strong>${m.name}</strong></td>
            <td>${m.type.toUpperCase()}</td>
            <td>
              <div class="uptime-bar"><div class="uptime-fill" style="width: ${m.uptimePercentage}%"></div></div>
              ${m.uptimePercentage.toFixed(3)}%
            </td>
            <td>${formatDuration(m.downtimeMinutes)}</td>
            <td>${m.totalChecks.toLocaleString()}</td>
            <td class="${m.failedChecks > 0 ? "status-danger" : ""}">${m.failedChecks.toLocaleString()}</td>
          </tr>
          `
            )
            .join("")}
        </tbody>
      </table>
    </div>

    ${data.maintenanceWindows.length > 0 ? `
    <div class="section">
      <div class="section-title">Scheduled Maintenance</div>
      <p style="color: #6b7280; margin-bottom: 16px;">The following maintenance windows occurred during this period and may have affected uptime metrics:</p>
      <table>
        <thead>
          <tr>
            <th>Maintenance</th>
            <th>Start</th>
            <th>End</th>
            <th>Duration</th>
          </tr>
        </thead>
        <tbody>
          ${data.maintenanceWindows.map(
            (mw) => `
          <tr>
            <td><strong>${mw.name}</strong></td>
            <td>${formatDateTime(mw.startsAt)}</td>
            <td>${formatDateTime(mw.endsAt)}</td>
            <td>${formatDuration(mw.durationMinutes)}</td>
          </tr>
          `
          ).join("")}
        </tbody>
      </table>
    </div>
    ` : ""}

    <div class="footer">
      <p>${data.branding.footerText}</p>
      <p>Generated on ${formatDate(data.generatedAt)} at ${data.generatedAt.toLocaleTimeString()}</p>
    </div>
  </div>
</body>
</html>
  `;
}

// Generate Incident Report HTML - Focuses on incidents and outages
function generateIncidentReportHtml(data: ReportData): string {
  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Incident Report - ${formatDate(data.periodStart)} to ${formatDate(data.periodEnd)}</title>
  <style>${getCommonStyles(data.branding)}</style>
</head>
<body>
  <div class="container">
    <div class="header">
      <div>
        <div class="header-title">${data.branding.companyName || "Incident Report"}</div>
        <div class="header-subtitle">${formatDate(data.periodStart)} - ${formatDate(data.periodEnd)}</div>
      </div>
      ${data.branding.logoUrl ? `<img src="${data.branding.logoUrl}" class="logo" alt="Logo">` : ""}
    </div>

    <div class="section">
      <div class="section-title">Incident Summary</div>
      <div class="summary-grid">
        <div class="summary-card">
          <div class="summary-value${data.summary.totalIncidents > 10 ? " danger" : data.summary.totalIncidents > 5 ? " warning" : ""}">${data.summary.totalIncidents}</div>
          <div class="summary-label">Total Incidents</div>
        </div>
        <div class="summary-card">
          <div class="summary-value danger">${data.summary.criticalIncidents}</div>
          <div class="summary-label">Critical</div>
        </div>
        <div class="summary-card">
          <div class="summary-value warning">${data.summary.majorIncidents}</div>
          <div class="summary-label">Major</div>
        </div>
        <div class="summary-card">
          <div class="summary-value">${data.summary.minorIncidents}</div>
          <div class="summary-label">Minor</div>
        </div>
        <div class="summary-card">
          <div class="summary-value">${formatDuration(data.summary.totalDowntimeMinutes)}</div>
          <div class="summary-label">Total Impact</div>
        </div>
        <div class="summary-card">
          <div class="summary-value">${data.incidents.filter(i => i.status === "resolved").length}</div>
          <div class="summary-label">Resolved</div>
        </div>
      </div>
    </div>

    ${data.incidents.length > 0 ? `
    <div class="section">
      <div class="section-title">Incident Timeline</div>
      <div class="incident-timeline">
        ${data.incidents
          .slice(0, 30)
          .map(
            (i) => `
        <div class="timeline-item ${i.severity}">
          <div style="margin-bottom: 4px;">
            <strong>${i.title}</strong>
            <span class="status-badge ${i.severity === "critical" ? "status-danger" : i.severity === "major" ? "status-warning" : "status-healthy"}" style="margin-left: 8px;">
              ${i.severity.charAt(0).toUpperCase() + i.severity.slice(1)}
            </span>
          </div>
          <div style="color: #6b7280; font-size: 12px;">
            Started: ${formatDateTime(i.startedAt)} |
            Duration: ${formatDuration(i.durationMinutes)} |
            Status: ${i.status.charAt(0).toUpperCase() + i.status.slice(1)}
          </div>
        </div>
        `
          )
          .join("")}
      </div>
      ${data.incidents.length > 30 ? `<p style="color: #6b7280; font-size: 12px; margin-top: 16px;">... and ${data.incidents.length - 30} more incidents</p>` : ""}
    </div>

    <div class="section page-break">
      <div class="section-title">Incident Details</div>
      <table>
        <thead>
          <tr>
            <th>Incident</th>
            <th>Severity</th>
            <th>Started</th>
            <th>Resolved</th>
            <th>Duration</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          ${data.incidents
            .slice(0, 50)
            .map(
              (i) => `
          <tr>
            <td><strong>${i.title}</strong></td>
            <td>
              <span class="status-badge ${i.severity === "critical" ? "status-danger" : i.severity === "major" ? "status-warning" : "status-healthy"}">
                ${i.severity.charAt(0).toUpperCase() + i.severity.slice(1)}
              </span>
            </td>
            <td>${formatDateTime(i.startedAt)}</td>
            <td>${i.resolvedAt ? formatDateTime(i.resolvedAt) : "Ongoing"}</td>
            <td>${formatDuration(i.durationMinutes)}</td>
            <td>${i.status.charAt(0).toUpperCase() + i.status.slice(1)}</td>
          </tr>
          `
            )
            .join("")}
        </tbody>
      </table>
    </div>
    ` : `
    <div class="section">
      <div class="highlight-box" style="background: #d1fae5; border-color: #10b981;">
        <strong>No Incidents!</strong> There were no incidents recorded during this reporting period.
      </div>
    </div>
    `}

    <div class="footer">
      <p>${data.branding.footerText}</p>
      <p>Generated on ${formatDate(data.generatedAt)} at ${data.generatedAt.toLocaleTimeString()}</p>
    </div>
  </div>
</body>
</html>
  `;
}

// Generate Performance Report HTML - Focuses on response times and performance metrics
function generatePerformanceReportHtml(data: ReportData): string {
  const avgResponseTime = data.summary.avgResponseTime;
  const fastestMonitor = data.monitors.length > 0
    ? data.monitors.reduce((a, b) => a.avgResponseTime < b.avgResponseTime ? a : b)
    : null;
  const slowestMonitor = data.monitors.length > 0
    ? data.monitors.reduce((a, b) => a.avgResponseTime > b.avgResponseTime ? a : b)
    : null;

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Performance Report - ${formatDate(data.periodStart)} to ${formatDate(data.periodEnd)}</title>
  <style>${getCommonStyles(data.branding)}</style>
</head>
<body>
  <div class="container">
    <div class="header">
      <div>
        <div class="header-title">${data.branding.companyName || "Performance Report"}</div>
        <div class="header-subtitle">${formatDate(data.periodStart)} - ${formatDate(data.periodEnd)}</div>
      </div>
      ${data.branding.logoUrl ? `<img src="${data.branding.logoUrl}" class="logo" alt="Logo">` : ""}
    </div>

    <div class="section">
      <div class="section-title">Performance Overview</div>
      <div class="summary-grid">
        <div class="summary-card">
          <div class="summary-value${avgResponseTime > 1000 ? " warning" : ""}${avgResponseTime > 3000 ? " danger" : ""}">${Math.round(avgResponseTime)}ms</div>
          <div class="summary-label">Avg Response Time</div>
        </div>
        <div class="summary-card">
          <div class="summary-value">${fastestMonitor ? Math.round(fastestMonitor.avgResponseTime) : 0}ms</div>
          <div class="summary-label">Fastest Response</div>
        </div>
        <div class="summary-card">
          <div class="summary-value${slowestMonitor && slowestMonitor.avgResponseTime > 2000 ? " warning" : ""}">${slowestMonitor ? Math.round(slowestMonitor.avgResponseTime) : 0}ms</div>
          <div class="summary-label">Slowest Response</div>
        </div>
        <div class="summary-card">
          <div class="summary-value">${data.summary.totalMonitors}</div>
          <div class="summary-label">Monitors</div>
        </div>
        <div class="summary-card">
          <div class="summary-value">${data.monitors.reduce((acc, m) => acc + m.totalChecks, 0).toLocaleString()}</div>
          <div class="summary-label">Total Checks</div>
        </div>
        <div class="summary-card">
          <div class="summary-value">${data.summary.overallUptime.toFixed(2)}%</div>
          <div class="summary-label">Availability</div>
        </div>
      </div>

      ${fastestMonitor && slowestMonitor ? `
      <div class="highlight-box">
        <strong>Performance Highlights:</strong><br>
        Fastest: <strong>${fastestMonitor.name}</strong> (${Math.round(fastestMonitor.avgResponseTime)}ms avg)<br>
        Slowest: <strong>${slowestMonitor.name}</strong> (${Math.round(slowestMonitor.avgResponseTime)}ms avg)
      </div>
      ` : ""}
    </div>

    <div class="section">
      <div class="section-title">Response Time by Monitor</div>
      <table>
        <thead>
          <tr>
            <th>Monitor</th>
            <th>Type</th>
            <th>Avg Response</th>
            <th>Total Checks</th>
            <th>Success Rate</th>
            <th>Performance</th>
          </tr>
        </thead>
        <tbody>
          ${data.monitors
            .sort((a, b) => a.avgResponseTime - b.avgResponseTime)
            .map(
              (m) => {
                const perfScore = m.avgResponseTime <= 200 ? "Excellent" :
                                  m.avgResponseTime <= 500 ? "Good" :
                                  m.avgResponseTime <= 1000 ? "Fair" :
                                  m.avgResponseTime <= 2000 ? "Slow" : "Poor";
                const perfClass = m.avgResponseTime <= 500 ? "status-healthy" :
                                  m.avgResponseTime <= 1000 ? "status-warning" : "status-danger";
                return `
          <tr>
            <td><strong>${m.name}</strong></td>
            <td>${m.type.toUpperCase()}</td>
            <td>${Math.round(m.avgResponseTime)}ms</td>
            <td>${m.totalChecks.toLocaleString()}</td>
            <td>${m.uptimePercentage.toFixed(2)}%</td>
            <td>
              <span class="status-badge ${perfClass}">
                ${perfScore}
              </span>
            </td>
          </tr>
          `;
              }
            )
            .join("")}
        </tbody>
      </table>
    </div>

    <div class="footer">
      <p>${data.branding.footerText}</p>
      <p>Generated on ${formatDate(data.generatedAt)} at ${data.generatedAt.toLocaleTimeString()}</p>
    </div>
  </div>
</body>
</html>
  `;
}

// Generate Executive Report HTML - High-level summary for stakeholders
function generateExecutiveReportHtml(data: ReportData): string {
  const uptimeStatus = data.summary.overallUptime >= 99.9 ? "Excellent" :
                       data.summary.overallUptime >= 99.5 ? "Good" :
                       data.summary.overallUptime >= 99 ? "Fair" : "Needs Attention";
  const uptimeClass = data.summary.overallUptime >= 99.5 ? "status-healthy" :
                      data.summary.overallUptime >= 99 ? "status-warning" : "status-danger";

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Executive Summary - ${formatDate(data.periodStart)} to ${formatDate(data.periodEnd)}</title>
  <style>${getCommonStyles(data.branding)}</style>
</head>
<body>
  <div class="container">
    <div class="header">
      <div>
        <div class="header-title">${data.branding.companyName || "Executive Summary"}</div>
        <div class="header-subtitle">${formatDate(data.periodStart)} - ${formatDate(data.periodEnd)}</div>
      </div>
      ${data.branding.logoUrl ? `<img src="${data.branding.logoUrl}" class="logo" alt="Logo">` : ""}
    </div>

    <div class="section">
      <div class="section-title">Service Health at a Glance</div>
      <div class="highlight-box" style="text-align: center; padding: 32px;">
        <div style="font-size: 48px; font-weight: 700; color: ${data.branding.primaryColor};">${data.summary.overallUptime.toFixed(2)}%</div>
        <div style="font-size: 16px; color: #6b7280; margin-top: 8px;">Overall Service Availability</div>
        <div style="margin-top: 16px;">
          <span class="status-badge ${uptimeClass}" style="font-size: 14px; padding: 6px 16px;">
            ${uptimeStatus}
          </span>
        </div>
      </div>
    </div>

    <div class="section">
      <div class="section-title">Key Metrics</div>
      <div class="summary-grid">
        <div class="summary-card">
          <div class="summary-value">${data.summary.totalMonitors}</div>
          <div class="summary-label">Services Monitored</div>
        </div>
        <div class="summary-card">
          <div class="summary-value">${Math.round(data.summary.avgResponseTime)}ms</div>
          <div class="summary-label">Avg Response Time</div>
        </div>
        <div class="summary-card">
          <div class="summary-value${data.summary.totalIncidents > 5 ? " warning" : ""}${data.summary.totalIncidents > 10 ? " danger" : ""}">${data.summary.totalIncidents}</div>
          <div class="summary-label">Incidents</div>
        </div>
        <div class="summary-card">
          <div class="summary-value">${formatDuration(data.summary.totalDowntimeMinutes)}</div>
          <div class="summary-label">Total Downtime</div>
        </div>
        <div class="summary-card">
          <div class="summary-value${data.summary.slosBreached > 0 ? " danger" : ""}">${data.summary.slosMet}/${data.summary.slosMet + data.summary.slosBreached}</div>
          <div class="summary-label">SLOs Met</div>
        </div>
        <div class="summary-card">
          <div class="summary-value">${data.summary.maintenanceWindowCount}</div>
          <div class="summary-label">Maintenance Windows</div>
        </div>
      </div>
    </div>

    ${data.summary.criticalIncidents > 0 || data.summary.majorIncidents > 0 ? `
    <div class="section">
      <div class="section-title">Incident Breakdown</div>
      <div class="summary-grid">
        <div class="summary-card">
          <div class="summary-value danger">${data.summary.criticalIncidents}</div>
          <div class="summary-label">Critical Incidents</div>
        </div>
        <div class="summary-card">
          <div class="summary-value warning">${data.summary.majorIncidents}</div>
          <div class="summary-label">Major Incidents</div>
        </div>
        <div class="summary-card">
          <div class="summary-value">${data.summary.minorIncidents}</div>
          <div class="summary-label">Minor Incidents</div>
        </div>
      </div>
    </div>
    ` : ""}

    ${data.monitors.length > 0 ? `
    <div class="section">
      <div class="section-title">Top 5 Services by Availability</div>
      <table>
        <thead>
          <tr>
            <th>Service</th>
            <th>Availability</th>
            <th>Response Time</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          ${data.monitors
            .sort((a, b) => b.uptimePercentage - a.uptimePercentage)
            .slice(0, 5)
            .map(
              (m) => `
          <tr>
            <td><strong>${m.name}</strong></td>
            <td>
              <div class="uptime-bar"><div class="uptime-fill" style="width: ${m.uptimePercentage}%"></div></div>
              ${m.uptimePercentage.toFixed(2)}%
            </td>
            <td>${Math.round(m.avgResponseTime)}ms</td>
            <td>
              <span class="status-badge ${m.uptimePercentage >= 99.9 ? "status-healthy" : m.uptimePercentage >= 99 ? "status-warning" : "status-danger"}">
                ${m.uptimePercentage >= 99.9 ? "Healthy" : m.uptimePercentage >= 99 ? "Degraded" : "Issues"}
              </span>
            </td>
          </tr>
          `
            )
            .join("")}
        </tbody>
      </table>
    </div>

    ${data.monitors.filter(m => m.uptimePercentage < 99).length > 0 ? `
    <div class="section">
      <div class="section-title">Services Requiring Attention</div>
      <table>
        <thead>
          <tr>
            <th>Service</th>
            <th>Availability</th>
            <th>Downtime</th>
            <th>Failed Checks</th>
          </tr>
        </thead>
        <tbody>
          ${data.monitors
            .filter(m => m.uptimePercentage < 99)
            .sort((a, b) => a.uptimePercentage - b.uptimePercentage)
            .map(
              (m) => `
          <tr>
            <td><strong>${m.name}</strong></td>
            <td>
              <span class="status-badge status-danger">${m.uptimePercentage.toFixed(2)}%</span>
            </td>
            <td>${formatDuration(m.downtimeMinutes)}</td>
            <td>${m.failedChecks.toLocaleString()}</td>
          </tr>
          `
            )
            .join("")}
        </tbody>
      </table>
    </div>
    ` : ""}
    ` : ""}

    <div class="footer">
      <p>${data.branding.footerText}</p>
      <p>Generated on ${formatDate(data.generatedAt)} at ${data.generatedAt.toLocaleTimeString()}</p>
    </div>
  </div>
</body>
</html>
  `;
}

// Upload PDF to storage
async function uploadPdf(
  pdfBuffer: Buffer,
  organizationId: string,
  reportId: string,
  reportType: string
): Promise<{ url: string; size: number }> {
  const s3Key = `reports/${organizationId}/${reportId}.pdf`;

  if (s3Client && s3Bucket) {
    // Upload to S3-compatible storage
    await s3Client.send(
      new PutObjectCommand({
        Bucket: s3Bucket,
        Key: s3Key,
        Body: pdfBuffer,
        ContentType: "application/pdf",
        ContentDisposition: `attachment; filename="${reportType}-report-${reportId}.pdf"`,
      })
    );

    const url = buildS3PublicUrl(s3Key);
    return { url, size: pdfBuffer.length };
  } else {
    // For local development, write to filesystem
    // Use /app/reports which is the shared Docker volume between workers and API
    const fs = await import("fs").then((m) => m.promises);
    const path = await import("path");
    const storageConf = getStorageConfig();
    const reportsBaseDir = storageConf.reportsDir;
    const outputDir = path.join(reportsBaseDir, organizationId);
    await fs.mkdir(outputDir, { recursive: true });
    const filePath = path.join(outputDir, `${reportId}.pdf`);
    await fs.writeFile(filePath, pdfBuffer);

    // Expose via API static route (/reports/*)
    const relativeUrl = `/reports/${organizationId}/${reportId}.pdf`;
    return { url: relativeUrl, size: pdfBuffer.length };
  }
}

// Upload PDF with retry logic
async function uploadPdfWithRetry(
  pdfBuffer: Buffer,
  organizationId: string,
  reportId: string,
  reportType: string,
  maxRetries: number = 3
): Promise<{ url: string; size: number }> {
  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await uploadPdf(pdfBuffer, organizationId, reportId, reportType);
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      console.warn(`[Report ${reportId}] Upload attempt ${attempt}/${maxRetries} failed:`, lastError.message);

      if (attempt < maxRetries) {
        // Exponential backoff: 1s, 2s, 4s
        const delay = Math.pow(2, attempt - 1) * 1000;
        console.log(`[Report ${reportId}] Retrying upload in ${delay}ms...`);
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }
  }

  throw new Error(`Upload failed after ${maxRetries} attempts: ${lastError?.message || "Unknown error"}`);
}

// Main processor for report generation
export async function processReportGeneration(
  job: Job<ReportGenerateJobData>
): Promise<void> {
  const { reportId, organizationId, reportType } = job.data;

  console.log(`Generating ${reportType.toUpperCase()} report ${reportId} for org ${organizationId}`);

  const startTime = Date.now();

  try {
    // Update status to generating
    await db
      .update(slaReports)
      .set({ status: "generating" })
      .where(eq(slaReports.id, reportId));

    // Step 1: Gather report data
    console.log(`[Report ${reportId}] Step 1: Gathering data...`);
    const dataStart = Date.now();
    const reportData = await gatherReportData(job.data);
    console.log(`[Report ${reportId}] Step 1 complete in ${Date.now() - dataStart}ms - Found ${reportData.monitors.length} monitors, ${reportData.incidents.length} incidents`);

    // Step 2: Generate HTML
    console.log(`[Report ${reportId}] Step 2: Generating HTML...`);
    const htmlStart = Date.now();
    const html = generateReportHtml(reportData);
    console.log(`[Report ${reportId}] Step 2 complete in ${Date.now() - htmlStart}ms - HTML size: ${html.length} bytes`);

    // Step 3: Launch Puppeteer and generate PDF
    console.log(`[Report ${reportId}] Step 3: Launching Puppeteer...`);
    const pdfStart = Date.now();
    let browser: Awaited<ReturnType<typeof puppeteer.launch>> | null = null;
    let pdfBuffer: Uint8Array | Buffer;
    try {
      const executablePath = process.env.PUPPETEER_EXECUTABLE_PATH;
      console.log(`[Report ${reportId}] Using Chromium at: ${executablePath || 'default'}`);

      browser = await puppeteer.launch({
        headless: true,
        executablePath: executablePath || undefined,
        args: [
          "--no-sandbox",
          "--disable-setuid-sandbox",
          "--disable-dev-shm-usage",
          "--disable-gpu",
          "--no-first-run",
          "--no-zygote",
          "--disable-extensions",
          "--disable-software-rasterizer",
          "--disable-background-networking",
          "--disable-default-apps",
          "--disable-sync",
          "--disable-translate",
          "--hide-scrollbars",
          "--metrics-recording-only",
          "--mute-audio",
          "--safebrowsing-disable-auto-update",
          "--headless=new",
        ],
        timeout: 60000,
      });

      const page = await browser.newPage();
      page.setDefaultTimeout(30000);
      page.setDefaultNavigationTimeout(30000);

      await page.setContent(html, { waitUntil: "networkidle0", timeout: 30000 });

      pdfBuffer = await page.pdf({
        format: "A4",
        printBackground: true,
        margin: {
          top: "20mm",
          right: "15mm",
          bottom: "20mm",
          left: "15mm",
        },
        timeout: 30000,
      });
    } catch (browserError) {
      // Use indirect access to prevent Bun bundler from inlining env vars at build time
      const env = process.env;
      if (env["NODE_ENV"] === "test") {
        console.warn(`[Report ${reportId}] Puppeteer unavailable in tests, using stub PDF:`, browserError);
        pdfBuffer = buildStubPdf(reportData);
      } else {
        console.error(`[Report ${reportId}] Failed to launch Puppeteer:`, browserError);
        throw new Error(`Puppeteer launch failed: ${browserError instanceof Error ? browserError.message : "Unknown error"}`);
      }
    } finally {
      if (browser) {
        await browser.close();
      }
    }
    if (!pdfBuffer) {
      throw new Error("Failed to generate report PDF buffer");
    }

    console.log(
      `[Report ${reportId}] Step 3 complete in ${Date.now() - pdfStart}ms - PDF size: ${pdfBuffer.length} bytes`
    );

    // Step 4: Upload PDF with retry
    console.log(`[Report ${reportId}] Step 4: Uploading PDF...`);
    const uploadStart = Date.now();
    const { url, size } = await uploadPdfWithRetry(
      Buffer.from(pdfBuffer),
      organizationId,
      reportId,
      job.data.reportType,
      3
    );
    console.log(`[Report ${reportId}] Step 4 complete in ${Date.now() - uploadStart}ms - URL: ${url}`);

    const generationDuration = Date.now() - startTime;

    // Update report record
    await db
      .update(slaReports)
      .set({
        status: "completed",
        fileUrl: url,
        fileName: `${job.data.reportType}-report-${reportId}.pdf`,
        fileSize: size,
        mimeType: "application/pdf",
        generatedAt: new Date(),
        generationDurationMs: generationDuration,
        summary: {
          monitorCount: reportData.summary.totalMonitors,
          incidentCount: reportData.summary.totalIncidents,
          uptimePercentage: reportData.summary.overallUptime,
          avgResponseTime: reportData.summary.avgResponseTime,
          slosMet: reportData.summary.slosMet,
          slosBreached: reportData.summary.slosBreached,
          maintenanceWindows: reportData.summary.maintenanceWindowCount,
        },
      })
      .where(eq(slaReports.id, reportId));

    console.log(`Report ${reportId} generated successfully in ${generationDuration}ms`);
  } catch (error) {
    console.error(`Error generating report ${reportId}:`, error);

    await db
      .update(slaReports)
      .set({
        status: "failed",
        errorMessage: error instanceof Error ? error.message : "Unknown error",
      })
      .where(eq(slaReports.id, reportId));

    throw error;
  }
}
