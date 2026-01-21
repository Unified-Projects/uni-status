"use client";

import { useMemo, useState } from "react";
import { cn } from "@uni-status/ui";
import { ChevronDown, ChevronUp } from "lucide-react";
import {
  type IncidentProps,
  localizeSeverityConfig,
  localizeStatusConfig,
} from "./types";
import { useI18n } from "@/contexts/i18n-context";
import { useLocalizedTime } from "@/hooks/use-localized-time";

export function CompactIncident({ incident, className }: IncidentProps) {
  const [expanded, setExpanded] = useState(false);
  const { t } = useI18n();
  const { formatDateTime, formatRelativeTime } = useLocalizedTime();
  const statusCopy = useMemo(() => localizeStatusConfig(t), [t]);
  const severityCopy = useMemo(() => localizeSeverityConfig(t), [t]);
  const config = statusCopy[incident.status] || statusCopy.investigating;
  const severity = severityCopy[incident.severity] || severityCopy.minor;
  const Icon = config.icon;

  return (
    <div className={cn("rounded-lg border bg-[var(--status-card)]", className)}>
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full px-4 py-3 flex items-center gap-3 hover:bg-[var(--status-muted)]/50 transition-colors"
      >
        <Icon className={cn("h-4 w-4 flex-shrink-0", config.iconClass)} />
        <span className="font-medium flex-1 text-left truncate">
          {incident.title}
        </span>
        <span
          className={cn(
            "text-xs px-2 py-0.5 rounded font-medium",
            severity.className
          )}
        >
          {severity.label}
        </span>
        <span className="text-xs text-[var(--status-muted-text)]">
          {formatRelativeTime(incident.startedAt)}
        </span>
        {expanded ? (
          <ChevronUp className="h-4 w-4 text-[var(--status-muted-text)]" />
        ) : (
          <ChevronDown className="h-4 w-4 text-[var(--status-muted-text)]" />
        )}
      </button>

      {expanded && (
        <div className="px-4 pb-4 border-t">
          {incident.message && (
            <p className="mt-3 text-sm text-[var(--status-muted-text)]">
              {incident.message}
            </p>
          )}

          {incident.updates.length > 0 && (
            <div className="mt-4 space-y-2">
              <div className="text-xs font-medium text-[var(--status-muted-text)]">
                {t("incidents.timeline", "Updates")}
              </div>
              {incident.updates.map((update) => {
                const updateConfig = statusCopy[update.status] || statusCopy.investigating;
                return (
                  <div
                    key={update.id}
                    className="flex items-start gap-2 text-sm"
                  >
                    <span className={cn("text-xs font-medium", updateConfig.textClass)}>
                      {updateConfig.label}
                    </span>
                    <span className="text-[var(--status-muted-text)]">-</span>
                    <span className="flex-1">{update.message}</span>
                    <span className="text-xs text-[var(--status-muted-text)] whitespace-nowrap">
                      {formatDateTime(update.createdAt)}
                    </span>
                  </div>
                );
              })}
            </div>
          )}

          {incident.resolvedAt && (
            <div className="mt-3 text-xs text-[var(--status-muted-text)]">
              {t("incidents.resolved", "Resolved")} {formatRelativeTime(incident.resolvedAt)}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
