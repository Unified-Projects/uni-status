"use client";

import { cn } from "@uni-status/ui";
import { useMemo } from "react";
import { useI18n } from "@/contexts/i18n-context";
import { useLocalizedTime } from "@/hooks/use-localized-time";
import {
  eventStatusConfig as baseEventStatusConfig,
  severityConfig as baseSeverityConfig,
  type EventStatus,
  type Severity,
} from "@/lib/status-colors";

interface IncidentUpdate {
  id: string;
  status: string;
  message: string;
  createdAt: string;
}

interface Incident {
  id: string;
  title: string;
  status: string;
  severity: string;
  message?: string;
  affectedMonitors: string[];
  startedAt: string;
  resolvedAt?: string;
  updates: IncidentUpdate[];
}

interface IncidentSectionProps {
  title: string;
  incidents: Incident[];
  className?: string;
}

// Build status config from centralized colors
const statusConfig = Object.fromEntries(
  Object.entries(baseEventStatusConfig).map(([key, config]) => [
    key,
    {
      label: config.label,
      icon: config.icon,
      bgClass: `${config.colors.bgSubtle} border ${config.colors.border}`,
      textClass: config.colors.text,
      iconClass: config.colors.icon,
    },
  ])
) as Record<
  string,
  {
    label: string;
    icon: typeof baseEventStatusConfig.investigating.icon;
    bgClass: string;
    textClass: string;
    iconClass: string;
  }
>;

// Build severity config from centralized colors
const severityConfig = Object.fromEntries(
  Object.entries(baseSeverityConfig).map(([key, config]) => [
    key,
    {
      label: config.label,
      className: `${config.colors.bg} ${config.colors.text}`,
    },
  ])
) as Record<string, { label: string; className: string }>;

function IncidentCard({ incident }: { incident: Incident }) {
  const { t } = useI18n();
  const { formatDateTime, formatRelativeTime } = useLocalizedTime();
  const statusCopy = useMemo(
    () =>
      Object.fromEntries(
        Object.entries(statusConfig).map(([key, value]) => [
          key,
          { ...value, label: t(`incidents.status.${key}`, value.label) },
        ])
      ) as typeof statusConfig,
    [t]
  );
  const severityCopy = useMemo(
    () =>
      Object.fromEntries(
        Object.entries(severityConfig).map(([key, value]) => [
          key,
          { ...value, label: t(`incidents.severity.${key}`, value.label) },
        ])
      ) as typeof severityConfig,
    [t]
  );
  const config = statusCopy[incident.status] || statusCopy.investigating;
  const severity = severityCopy[incident.severity] || severityCopy.minor;
  const Icon = config.icon;

  return (
    <div className={cn("rounded-lg border p-4", config.bgClass)}>
      <div className="flex items-start gap-3">
        <Icon className={cn("h-5 w-5 mt-0.5 flex-shrink-0", config.iconClass)} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className={cn("font-medium", config.textClass)}>
              {incident.title}
            </h3>
            <span
              className={cn(
                "text-xs px-2 py-0.5 rounded-full font-medium",
                severity.className
              )}
            >
              {severity.label}
            </span>
          </div>

          {incident.message && (
            <p className={cn("mt-1 text-sm", config.textClass, "opacity-80")}>
              {incident.message}
            </p>
          )}

          <div
            className={cn(
              "mt-2 text-xs",
              config.textClass,
              "opacity-60"
            )}
          >
            {t("incidents.started", "Started")} {formatRelativeTime(incident.startedAt)}
            {incident.resolvedAt && (
              <> - {t("incidents.resolved", "Resolved")} {formatRelativeTime(incident.resolvedAt)}</>
            )}
          </div>

          {/* Updates timeline */}
          {incident.updates.length > 0 && (
            <div className="mt-4 space-y-3 border-l-2 border-current/20 pl-4">
              {incident.updates.map((update) => {
                const updateConfig =
                  statusConfig[update.status] || statusConfig.investigating;
                return (
                  <div key={update.id} className="relative">
                    <div
                      className={cn(
                        "absolute -left-[21px] top-1 h-2.5 w-2.5 rounded-full border-2",
                        "bg-[var(--status-bg)]",
                        updateConfig.textClass.replace("text-", "border-")
                      )}
                    />
                    <div className="text-xs font-medium opacity-70">
                      {updateConfig.label} - {formatDateTime(update.createdAt)}
                    </div>
                    <p className="mt-0.5 text-sm opacity-80">{update.message}</p>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export function IncidentSection({
  title,
  incidents,
  className,
}: IncidentSectionProps) {
  if (incidents.length === 0) {
    return null;
  }

  return (
    <div className={cn("space-y-4", className)}>
      <h2 className="text-lg font-semibold">{title}</h2>
      <div className="space-y-4">
        {incidents.map((incident) => (
          <IncidentCard key={incident.id} incident={incident} />
        ))}
      </div>
    </div>
  );
}
