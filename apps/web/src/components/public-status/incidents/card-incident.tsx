"use client";

import { cn } from "@uni-status/ui";
import { ChevronRight } from "lucide-react";
import { useMemo } from "react";
import {
  type IncidentProps,
  localizeSeverityConfig,
  localizeStatusConfig,
} from "./types";
import { useI18n } from "@/contexts/i18n-context";
import { useLocalizedTime } from "@/hooks/use-localized-time";

export function CardIncident({ incident, className }: IncidentProps) {
  const { t } = useI18n();
  const { formatRelativeTime } = useLocalizedTime();
  const statusCopy = useMemo(() => localizeStatusConfig(t), [t]);
  const severityCopy = useMemo(() => localizeSeverityConfig(t), [t]);
  const config = statusCopy[incident.status] || statusCopy.investigating;
  const severity = severityCopy[incident.severity] || severityCopy.minor;
  const Icon = config.icon;

  return (
    <div
      className={cn(
        "rounded-xl border bg-[var(--status-card)] shadow-sm overflow-hidden",
        className
      )}
    >
      <div className={cn("px-4 py-3 border-b", config.bgClass, config.borderClass)}>
        <div className="flex items-center gap-2">
          <Icon className={cn("h-4 w-4", config.iconClass)} />
          <span className={cn("text-sm font-medium", config.textClass)}>
            {config.label}
          </span>
          <span
            className={cn(
              "text-xs px-2 py-0.5 rounded-full font-medium ml-auto",
              severity.className
            )}
          >
            {severity.label}
          </span>
        </div>
      </div>

      <div className="p-4">
        <h3 className="font-semibold text-lg">{incident.title}</h3>

        {incident.message && (
          <p className="mt-2 text-sm text-[var(--status-muted-text)]">
            {incident.message}
          </p>
        )}

        <div className="mt-4 flex items-center justify-between text-xs text-[var(--status-muted-text)]">
          <span>
            {t("incidents.started", "Started")} {formatRelativeTime(incident.startedAt)}
          </span>
          {incident.resolvedAt && (
            <span>
              {t("incidents.resolved", "Resolved")} {formatRelativeTime(incident.resolvedAt)}
            </span>
          )}
        </div>

        {incident.updates.length > 0 && (
          <div className="mt-4 pt-4 border-t">
            <div className="text-xs font-medium text-[var(--status-muted-text)] mb-2">
              {t("incidents.latestUpdate", "Latest Update")}
            </div>
            <div className="flex items-start gap-2">
              <ChevronRight className="h-4 w-4 mt-0.5 text-[var(--status-muted-text)]" />
              <div>
                <p className="text-sm">{incident.updates[0].message}</p>
                <span className="text-xs text-[var(--status-muted-text)]">
                  {formatRelativeTime(incident.updates[0].createdAt)}
                </span>
              </div>
            </div>
            {incident.updates.length > 1 && (
              <div className="mt-2 text-xs text-[var(--status-muted-text)]">
                +{incident.updates.length - 1} {t("incidents.moreUpdates", "more updates")}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
