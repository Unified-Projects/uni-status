"use client";

import { cn } from "@uni-status/ui";
import { type IncidentProps, localizeSeverityConfig, localizeStatusConfig } from "./types";
import { useMemo } from "react";
import { useI18n } from "@/contexts/i18n-context";
import { useLocalizedTime } from "@/hooks/use-localized-time";

export function ExpandedIncident({ incident, className }: IncidentProps) {
  const { t } = useI18n();
  const { formatDateTime } = useLocalizedTime();
  const statusCopy = useMemo(() => localizeStatusConfig(t), [t]);
  const severityCopy = useMemo(() => localizeSeverityConfig(t), [t]);
  const config = statusCopy[incident.status] || statusCopy.investigating;
  const severity = severityCopy[incident.severity] || severityCopy.minor;
  const Icon = config.icon;

  return (
    <div
      className={cn(
        "rounded-lg border bg-[var(--status-card)] overflow-hidden",
        className
      )}
    >
      <div className={cn("px-6 py-4", config.bgClass, config.borderClass, "border-b")}>
        <div className="flex items-start gap-4">
          <div className={cn("p-2 rounded-lg", config.bgClass)}>
            <Icon className={cn("h-6 w-6", config.iconClass)} />
          </div>
          <div className="flex-1">
            <div className="flex items-center gap-3 flex-wrap">
              <h3 className="text-lg font-semibold">{incident.title}</h3>
              <span
                className={cn(
                  "text-xs px-2.5 py-1 rounded-full font-medium",
                  severity.className
                )}
              >
                {severity.label}
              </span>
              <span
                className={cn(
                  "text-xs px-2.5 py-1 rounded-full font-medium",
                  config.bgClass,
                  config.textClass
                )}
              >
                {config.label}
              </span>
            </div>
            <div className="mt-1 text-sm text-[var(--status-muted-text)]">
              {t("incidents.started", "Started")} {formatDateTime(incident.startedAt)}
              {incident.resolvedAt && (
                <> | {t("incidents.resolved", "Resolved")} {formatDateTime(incident.resolvedAt)}</>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="p-6">
        {incident.message && (
          <div className="mb-6">
            <h4 className="text-sm font-medium text-[var(--status-muted-text)] mb-2">
              {t("incidents.description", "Description")}
            </h4>
            <p className="text-sm">{incident.message}</p>
          </div>
        )}

        {incident.affectedMonitors.length > 0 && (
          <div className="mb-6">
            <h4 className="text-sm font-medium text-[var(--status-muted-text)] mb-2">
              {t("incidents.affectedServices", "Affected Services")}
            </h4>
            <div className="flex flex-wrap gap-2">
              {incident.affectedMonitors.map((monitor) => (
                <span
                  key={monitor}
                  className="text-xs px-2 py-1 rounded bg-[var(--status-muted)]"
                >
                  {monitor}
                </span>
              ))}
            </div>
          </div>
        )}

        {incident.updates.length > 0 && (
          <div>
            <h4 className="text-sm font-medium text-[var(--status-muted-text)] mb-4">
              {t("incidents.timeline", "Timeline")}
            </h4>
            <div className="space-y-4">
              {incident.updates.map((update, index) => {
                const updateConfig = statusCopy[update.status] || statusCopy.investigating;
                const UpdateIcon = updateConfig.icon;
                const isLast = index === incident.updates.length - 1;

                return (
                  <div key={update.id} className="flex gap-4">
                    <div className="flex flex-col items-center">
                      <div
                        className={cn(
                          "p-1.5 rounded-full",
                          updateConfig.bgClass
                        )}
                      >
                        <UpdateIcon className={cn("h-4 w-4", updateConfig.iconClass)} />
                      </div>
                      {!isLast && (
                        <div className="w-0.5 flex-1 bg-[var(--status-border)] mt-2" />
                      )}
                    </div>
                    <div className={cn("pb-4", isLast && "pb-0")}>
                      <div className="flex items-center gap-2 mb-1">
                        <span className={cn("text-sm font-medium", updateConfig.textClass)}>
                          {updateConfig.label}
                        </span>
                        <span className="text-xs text-[var(--status-muted-text)]">
                          {formatDateTime(update.createdAt)}
                        </span>
                      </div>
                      <p className="text-sm text-[var(--status-muted-text)]">
                        {update.message}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
