"use client";

import { useEffect, useState } from "react";
import { CheckCircle, AlertTriangle, XCircle, Wrench, Clock } from "lucide-react";
import { cn } from "@uni-status/ui/lib/utils";

// Normalize API URL - remove trailing /api if present to avoid double prefix
const RAW_API_URL = process.env.NEXT_PUBLIC_API_URL || "/api";
const API_URL = RAW_API_URL.replace(/\/api\/?$/, '');

type OverallStatus = "operational" | "degraded" | "partial_outage" | "major_outage" | "maintenance";
type MonitorStatus = "active" | "degraded" | "down" | "paused" | "pending";

interface StatusData {
  status: OverallStatus;
  statusText: string;
  name: string;
  url: string;
  lastUpdatedAt: string;
  monitors?: Array<{ id: string; name: string; status: MonitorStatus }>;
  activeIncidents?: Array<{ id: string; title: string; status: string; severity: string }>;
}

const statusConfig: Record<OverallStatus, { icon: typeof CheckCircle; color: string; bg: string; text: string }> = {
  operational: {
    icon: CheckCircle,
    color: "text-[var(--status-success-text)]",
    bg: "bg-[var(--status-success-bg)]",
    text: "All Systems Operational",
  },
  degraded: {
    icon: AlertTriangle,
    color: "text-[var(--status-warning-text)]",
    bg: "bg-[var(--status-warning-bg)]",
    text: "Partial System Degradation",
  },
  partial_outage: {
    icon: AlertTriangle,
    color: "text-[var(--status-orange-text)]",
    bg: "bg-[var(--status-orange-bg)]",
    text: "Partial System Outage",
  },
  major_outage: {
    icon: XCircle,
    color: "text-[var(--status-error-text)]",
    bg: "bg-[var(--status-error-bg)]",
    text: "Major System Outage",
  },
  maintenance: {
    icon: Wrench,
    color: "text-[var(--status-info-text)]",
    bg: "bg-[var(--status-info-bg)]",
    text: "Under Maintenance",
  },
};

const monitorStatusColors: Record<MonitorStatus, string> = {
  active: "bg-[var(--status-success-text)]",
  degraded: "bg-[var(--status-warning-text)]",
  down: "bg-[var(--status-error-text)]",
  paused: "bg-muted-foreground",
  pending: "bg-muted-foreground/60",
};

const severityColors: Record<string, { bg: string; text: string }> = {
  minor: { bg: "bg-[var(--status-warning-bg)]", text: "text-[var(--status-warning-text)]" },
  major: { bg: "bg-[var(--status-orange-bg)]", text: "text-[var(--status-orange-text)]" },
  critical: { bg: "bg-[var(--status-error-bg)]", text: "text-[var(--status-error-text)]" },
};

interface PageProps {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{
    theme?: "light" | "dark" | "auto";
    showMonitors?: string;
    showIncidents?: string;
    transparent?: string;
  }>;
}

export default function EmbedCardPage({ params, searchParams }: PageProps) {
  const [slug, setSlug] = useState<string>("");
  const [options, setOptions] = useState<{
    theme: "light" | "dark" | "auto";
    showMonitors: boolean;
    showIncidents: boolean;
    transparent: boolean;
  }>({
    theme: "light",
    showMonitors: true,
    showIncidents: true,
    transparent: false,
  });
  const [data, setData] = useState<StatusData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([params, searchParams]).then(([p, sp]) => {
      setSlug(p.slug);
      setOptions({
        theme: sp.theme || "light",
        showMonitors: sp.showMonitors !== "false",
        showIncidents: sp.showIncidents !== "false",
        transparent: sp.transparent === "true",
      });
    });
  }, [params, searchParams]);

  useEffect(() => {
    if (!slug) return;

    async function fetchStatus() {
      try {
        const url = `${API_URL}/api/public/embeds/status-pages/${slug}/status.json?showMonitors=${options.showMonitors}&showIncidents=${options.showIncidents}`;
        const response = await fetch(url);
        const json = await response.json();

        if (json.success && json.data) {
          setData(json.data);
        } else {
          setError(json.error?.message || "Failed to load status");
        }
      } catch {
        setError("Failed to load status");
      } finally {
        setLoading(false);
      }
    }

    fetchStatus();
    const interval = setInterval(fetchStatus, 60000);
    return () => clearInterval(interval);
  }, [slug, options.showMonitors, options.showIncidents]);

  // Apply theme
  useEffect(() => {
    if (options.theme === "dark") {
      document.documentElement.classList.add("dark");
    } else if (options.theme === "light") {
      document.documentElement.classList.remove("dark");
    } else {
      // auto - check system preference
      if (window.matchMedia("(prefers-color-scheme: dark)").matches) {
        document.documentElement.classList.add("dark");
      }
    }
  }, [options.theme]);

  if (loading) {
    return (
      <div className={cn(
        "p-4 rounded-lg border animate-pulse",
        options.transparent ? "bg-transparent" : "bg-white dark:bg-gray-900"
      )}>
        <div className="h-6 bg-gray-200 dark:bg-gray-700 rounded w-3/4 mb-2" />
        <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-1/2" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className={cn(
        "p-4 rounded-lg border text-gray-500 dark:text-gray-400",
        options.transparent ? "bg-transparent" : "bg-white dark:bg-gray-900"
      )}>
        {error || "Status unavailable"}
      </div>
    );
  }

  const config = statusConfig[data.status];
  const StatusIcon = config.icon;

  return (
    <div className={cn(
      "rounded-lg border overflow-hidden",
      options.transparent ? "bg-transparent border-transparent" : "bg-white dark:bg-gray-900 border-gray-200 dark:border-gray-800"
    )}>
      {/* Header */}
      <div className={cn("px-4 py-3 flex items-center gap-3", config.bg)}>
        <StatusIcon className={cn("h-5 w-5", config.color)} />
        <div className="flex-1 min-w-0">
          <p className={cn("text-sm font-medium", config.color)}>
            {data.statusText}
          </p>
          <p className="text-xs text-gray-500 dark:text-gray-400 truncate">
            {data.name}
          </p>
        </div>
      </div>

      {/* Monitors */}
      {options.showMonitors && data.monitors && data.monitors.length > 0 && (
        <div className="px-4 py-3 border-t border-gray-100 dark:border-gray-800">
          <p className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-2">
            Services
          </p>
          <div className="space-y-1.5">
            {data.monitors.slice(0, 5).map((monitor) => (
              <div key={monitor.id} className="flex items-center gap-2 text-sm">
                <span
                  className={cn(
                    "w-2 h-2 rounded-full flex-shrink-0",
                    monitorStatusColors[monitor.status]
                  )}
                />
                <span className="text-gray-700 dark:text-gray-300 truncate">
                  {monitor.name}
                </span>
              </div>
            ))}
            {data.monitors.length > 5 && (
              <p className="text-xs text-gray-400">
                +{data.monitors.length - 5} more
              </p>
            )}
          </div>
        </div>
      )}

      {/* Active Incidents */}
      {options.showIncidents && data.activeIncidents && data.activeIncidents.length > 0 && (
        <div className="px-4 py-3 border-t border-gray-100 dark:border-gray-800">
          <p className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-2">
            Active Incidents
          </p>
          <div className="space-y-2">
            {data.activeIncidents.slice(0, 3).map((incident) => (
              <div key={incident.id} className="text-sm">
                <span className="text-gray-700 dark:text-gray-300">
                  {incident.title}
                </span>
                <span
                  className={cn(
                    "ml-2 px-1.5 py-0.5 rounded text-xs",
                    severityColors[incident.severity]?.bg,
                    severityColors[incident.severity]?.text
                  )}
                >
                  {incident.severity}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Footer */}
      <a
        href={data.url}
        target="_blank"
        rel="noopener noreferrer"
        className="block px-4 py-2 border-t border-gray-100 dark:border-gray-800 text-xs text-center text-blue-600 dark:text-blue-400 hover:underline"
      >
        View Status Page
      </a>
    </div>
  );
}
