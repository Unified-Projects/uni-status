"use client";

import { useMemo } from "react";
import { CheckCircle, AlertTriangle, XCircle, Wrench } from "lucide-react";
import { cn } from "@uni-status/ui";
import { useI18n } from "@/contexts/i18n-context";
import { useLocalizedTime } from "@/hooks/use-localized-time";

type MonitorStatus = "active" | "degraded" | "down" | "paused" | "pending";
type OverallStatus = "operational" | "degraded" | "partial_outage" | "major_outage" | "maintenance";

interface Monitor {
  status: MonitorStatus;
}

interface Incident {
  severity: "minor" | "major" | "critical";
  status: string;
}

interface OverallStatusBannerProps {
  monitors: Monitor[];
  incidents?: Incident[];
  lastUpdatedAt?: string;
  className?: string;
}

function calculateOverallStatus(monitors: Monitor[], incidents: Incident[] = []): OverallStatus {
  if (monitors.length === 0) return "operational";

  const activeMonitors = monitors.filter((m) => m.status !== "paused");
  if (activeMonitors.length === 0) return "maintenance";

  const downCount = activeMonitors.filter((m) => m.status === "down").length;
  const degradedCount = activeMonitors.filter((m) => m.status === "degraded").length;

  // Derive monitor-based status
  let status: OverallStatus = "operational";
  if (downCount === activeMonitors.length) status = "major_outage";
  else if (downCount > 0) status = "partial_outage";
  else if (degradedCount > 0) status = "degraded";

  // Factor in active incidents (non-resolved)
  const activeIncidents = incidents.filter((i) => i.status !== "resolved");
  if (activeIncidents.length > 0) {
    const highestSeverity = activeIncidents.reduce<Incident["severity"]>((acc, incident) => {
      const order = { minor: 1, major: 2, critical: 3 };
      return order[incident.severity] > order[acc] ? incident.severity : acc;
    }, "minor");

    if (highestSeverity === "critical") status = "major_outage";
    else if (highestSeverity === "major") status = status === "major_outage" ? status : "partial_outage";
    else if (highestSeverity === "minor" && status === "operational") status = "degraded";
  }

  return status;
}

const statusConfig: Record<
  OverallStatus,
  {
    label: string;
    description: string;
    icon: typeof CheckCircle;
    bgClass: string;
    textClass: string;
    iconClass: string;
  }
> = {
  operational: {
    label: "All Systems Operational",
    description: "All services are running normally",
    icon: CheckCircle,
    bgClass: "bg-[var(--status-success-bg)] border-[var(--status-success-text)]/20",
    textClass: "text-[var(--status-success-text)]",
    iconClass: "text-[var(--status-success-text)]",
  },
  degraded: {
    label: "Partial System Degradation",
    description: "Some services are experiencing degraded performance",
    icon: AlertTriangle,
    bgClass: "bg-[var(--status-warning-bg)] border-[var(--status-warning-text)]/20",
    textClass: "text-[var(--status-warning-text)]",
    iconClass: "text-[var(--status-warning-text)]",
  },
  partial_outage: {
    label: "Partial System Outage",
    description: "Some services are currently unavailable",
    icon: AlertTriangle,
    bgClass: "bg-[var(--status-orange-bg)] border-[var(--status-orange-text)]/20",
    textClass: "text-[var(--status-orange-text)]",
    iconClass: "text-[var(--status-orange-text)]",
  },
  major_outage: {
    label: "Major System Outage",
    description: "All services are currently unavailable",
    icon: XCircle,
    bgClass: "bg-[var(--status-error-bg)] border-[var(--status-error-text)]/20",
    textClass: "text-[var(--status-error-text)]",
    iconClass: "text-[var(--status-error-text)]",
  },
  maintenance: {
    label: "Under Maintenance",
    description: "Services are undergoing scheduled maintenance",
    icon: Wrench,
    bgClass: "bg-[var(--status-info-bg)] border-[var(--status-info-text)]/20",
    textClass: "text-[var(--status-info-text)]",
    iconClass: "text-[var(--status-info-text)]",
  },
};

export function OverallStatusBanner({
  monitors,
  incidents,
  lastUpdatedAt,
  className,
}: OverallStatusBannerProps) {
  const { t } = useI18n();
  const { formatDateTime } = useLocalizedTime();
  const status = useMemo(() => calculateOverallStatus(monitors, incidents), [monitors, incidents]);
  const translatedConfig = useMemo(() => {
    const base = statusConfig[status];
    return {
      ...base,
      label: t(
        `overall.${status === "partial_outage" ? "partialOutage" : status}`,
        base.label
      ),
      description: t(
        `overall.${status === "partial_outage" ? "partialOutageDesc" : `${status}Desc`}`,
        base.description
      ),
    };
  }, [status, t]);
  const Icon = translatedConfig.icon;

  return (
    <div
      className={cn(
        "rounded-lg border p-6",
        translatedConfig.bgClass,
        className
      )}
    >
      <div className="flex items-center gap-4">
        <Icon className={cn("h-10 w-10", translatedConfig.iconClass)} />
        <div className="flex-1">
          <h2 className={cn("text-xl font-semibold", translatedConfig.textClass)}>
            {translatedConfig.label}
          </h2>
          <p className={cn("text-sm", translatedConfig.textClass, "opacity-80")}>
            {translatedConfig.description}
          </p>
        </div>
      </div>
      {lastUpdatedAt && (
        <div className={cn("mt-4 text-xs", translatedConfig.textClass, "opacity-60")}>
          {t("common.lastUpdated", "Last updated")}: {formatDateTime(lastUpdatedAt)}
        </div>
      )}
    </div>
  );
}

export type { OverallStatus, MonitorStatus };
