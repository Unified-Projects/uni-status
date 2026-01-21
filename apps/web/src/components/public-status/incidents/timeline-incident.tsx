"use client";

import { cn } from "@uni-status/ui";
import {
  type IncidentProps,
  localizeSeverityConfig,
  localizeStatusConfig,
} from "./types";
import { useMemo } from "react";
import { useI18n } from "@/contexts/i18n-context";
import { useLocalizedTime } from "@/hooks/use-localized-time";

export function TimelineIncident({ incident, className }: IncidentProps) {
  const { t } = useI18n();
  const { formatDateTime, formatRelativeTime } = useLocalizedTime();
  const statusCopy = useMemo(() => localizeStatusConfig(t), [t]);
  const severityCopy = useMemo(() => localizeSeverityConfig(t), [t]);
  const config = statusCopy[incident.status] || statusCopy.investigating;
  const severity = severityCopy[incident.severity] || severityCopy.minor;
  const Icon = config.icon;

  return (
    <div className={cn("rounded-lg border p-4", config.bgClass, config.borderClass, className)}>
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

          <div className={cn("mt-2 text-xs", config.textClass, "opacity-60")}>
            {t("incidents.started", "Started")} {formatRelativeTime(incident.startedAt)}
            {incident.resolvedAt && (
              <> - {t("incidents.resolved", "Resolved")} {formatRelativeTime(incident.resolvedAt)}</>
            )}
          </div>

          {incident.updates.length > 0 && (
            <div className="mt-4 space-y-3 border-l-2 border-current/20 pl-4">
              {incident.updates.map((update) => {
                const updateConfig = statusCopy[update.status] || statusCopy.investigating;
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
