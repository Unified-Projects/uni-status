"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  CheckCircle,
  Clock,
  ChevronDown,
  ChevronUp,
  Bell,
  Activity,
  Download,
  FileJson,
  CalendarPlus,
  FileText,
  ExternalLink,
} from "lucide-react";
import {
  cn,
  Button,
  Badge,
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from "@uni-status/ui";
import type { UnifiedEvent } from "@uni-status/shared";
import { PublicEventSubscribeDialog } from "./public-event-subscribe-dialog";
import { ImpactScopeBadge, ImpactScopeView } from "./impact-scope-view";
import { useI18n } from "@/contexts/i18n-context";
import { useLocalizedTime } from "@/hooks/use-localized-time";
import {
  eventStatusConfig as centralEventStatusConfig,
  severityConfig as centralSeverityConfig,
} from "@/lib/status-colors";

interface PublicEventCardProps {
  event: UnifiedEvent;
  slug: string;
  basePath?: string;
  variant?: "default" | "compact";
  showUpdates?: boolean;
}

// Build status config from centralized colors
const baseStatusConfig = Object.fromEntries(
  Object.entries(centralEventStatusConfig).map(([key, config]) => [
    key,
    {
      label: config.label,
      icon: config.icon,
      bgClass: `${config.colors.bgSubtle} border ${config.colors.border}`,
      textClass: config.colors.text,
      iconClass: config.colors.icon,
      badgeClass: `${config.colors.bg} ${config.colors.text}`,
    },
  ])
) as Record<
  string,
  {
    label: string;
    icon: typeof centralEventStatusConfig.investigating.icon;
    bgClass: string;
    textClass: string;
    iconClass: string;
    badgeClass: string;
  }
>;

// Build severity config from centralized colors
const severityConfigBase = Object.fromEntries(
  Object.entries(centralSeverityConfig).map(([key, config]) => [
    key,
    {
      label: config.label,
      className: `${config.colors.bg} ${config.colors.text}`,
    },
  ])
) as Record<string, { label: string; className: string }>;

function calculateDuration(startedAt: string, endedAt: string | null, ongoingLabel: string): string {
  const start = new Date(startedAt);
  const end = endedAt ? new Date(endedAt) : new Date();
  const diffMs = end.getTime() - start.getTime();
  const diffMins = Math.floor(diffMs / (1000 * 60));
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffMins < 60) {
    return `${diffMins}m ${endedAt ? "" : `(${ongoingLabel})`}`.trim();
  }
  if (diffHours < 24) {
    const mins = diffMins % 60;
    return `${diffHours}h ${mins > 0 ? `${mins}m` : ""} ${endedAt ? "" : `(${ongoingLabel})`}`.trim();
  }
  const hours = diffHours % 24;
  return `${diffDays}d ${hours > 0 ? `${hours}h` : ""} ${endedAt ? "" : `(${ongoingLabel})`}`.trim();
}

export function PublicEventCard({
  event,
  slug,
  basePath,
  variant = "default",
  showUpdates: initialShowUpdates = false,
}: PublicEventCardProps) {
  const [showUpdates, setShowUpdates] = useState(initialShowUpdates);
  const [subscribeDialogOpen, setSubscribeDialogOpen] = useState(false);
  const { t } = useI18n();
  const { formatDateTime, formatRelativeTime } = useLocalizedTime();
  // Use basePath for links (empty string on custom domains, /status/{slug} on main domain)
  const linkBase = basePath ?? `/status/${slug}`;

  const statusConfig = useMemo(
    () =>
      Object.fromEntries(
        Object.entries(baseStatusConfig).map(([key, value]) => [
          key,
          {
            ...value,
            label:
              key === "active"
                ? t("events.inProgress", value.label)
                : key === "completed"
                  ? t("events.completed", value.label)
                  : t(`incidents.status.${key}`, value.label),
          },
        ])
      ) as typeof baseStatusConfig,
    [t]
  );

  const severityConfig = useMemo(
    () =>
      Object.fromEntries(
        Object.entries(severityConfigBase).map(([key, value]) => [
          key,
          { ...value, label: t(`incidents.severity.${key}`, value.label) },
        ])
      ) as typeof severityConfigBase,
    [t]
  );

  const config = statusConfig[event.status] || statusConfig.investigating;
  const severity = severityConfig[event.severity] || severityConfig.minor;
  const Icon = config.icon;
  const isIncident = event.type === "incident";
  const isResolved = event.status === "resolved" || event.status === "completed";
  const maintenanceLabel = severityConfig.maintenance.label;
  const hasUpdates = event.updates && event.updates.length > 0;

  if (variant === "compact") {
    return (
      <Link
        href={`${linkBase}/events/${event.type}/${event.id}`}
        className={cn(
          "flex items-center gap-3 p-3 rounded-lg border transition-colors",
          "hover:bg-[var(--status-muted)]/50",
          config.bgClass
        )}
      >
        <Icon className={cn("h-5 w-5 flex-shrink-0", config.iconClass)} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className={cn("font-medium truncate", config.textClass)}>
              {event.title}
            </span>
            <Badge className={cn("text-xs shrink-0", severity.className)}>
              {isIncident ? severity.label : maintenanceLabel}
            </Badge>
          </div>
          <div className={cn("text-xs mt-0.5", config.textClass, "opacity-60")}>
            {formatRelativeTime(event.startedAt)}
          </div>
        </div>
        <Badge variant="outline" className={cn("shrink-0", config.badgeClass)}>
          {config.label}
        </Badge>
      </Link>
    );
  }

  return (
    <>
      <div className={cn("rounded-lg border p-4", config.bgClass)}>
        <div className="flex items-start gap-3">
          <Icon className={cn("h-5 w-5 mt-0.5 flex-shrink-0", config.iconClass)} />
          <div className="flex-1 min-w-0">
            {/* Header */}
            <div className="flex items-start justify-between gap-2">
              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <Link
                    href={`${linkBase}/events/${event.type}/${event.id}`}
                    className={cn("font-medium hover:underline", config.textClass)}
                  >
                    {event.title}
                  </Link>
                  <Badge className={cn("text-xs", severity.className)}>
                    {isIncident ? severity.label : maintenanceLabel}
                  </Badge>
                  <Badge variant="outline" className={cn("text-xs", config.badgeClass)}>
                    {config.label}
                  </Badge>
                </div>

                {event.description && (
                  <p className={cn("mt-1 text-sm", config.textClass, "opacity-80")}>
                    {event.description}
                  </p>
                )}
              </div>

              {/* Action buttons */}
              <div className="flex items-center gap-1 shrink-0">
                {/* Export dropdown */}
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      variant="ghost"
                      size="sm"
                      className={cn(config.textClass)}
                    >
                      <Download className="h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem asChild>
                      <a
                        href={`/api/public/status-pages/${slug}/events/${event.type}/${event.id}/export?format=ics`}
                        download
                        className="flex items-center gap-2"
                      >
                        <CalendarPlus className="h-4 w-4" />
                        <span>Add to Calendar (ICS)</span>
                      </a>
                    </DropdownMenuItem>
                    <DropdownMenuItem asChild>
                      <a
                        href={`/api/public/status-pages/${slug}/events/${event.type}/${event.id}/export?format=json`}
                        download
                        className="flex items-center gap-2"
                      >
                        <FileJson className="h-4 w-4" />
                        <span>{t("events.downloadJson", "Download JSON")}</span>
                      </a>
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>

                {/* Subscribe button */}
                {!isResolved && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setSubscribeDialogOpen(true)}
                    className={cn(config.textClass)}
                  >
                    <Bell className="h-4 w-4" />
                  </Button>
                )}
              </div>
            </div>

            {/* Meta info */}
            <div className={cn("mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs", config.textClass, "opacity-60")}>
              <div className="flex items-center gap-1">
                <Clock className="h-3.5 w-3.5" />
                <span>
                  {isIncident ? t("incidents.started", "Started") : t("incidents.status.scheduled", "Scheduled")}{" "}
                  {formatRelativeTime(event.startedAt)}
                </span>
              </div>
              {(isResolved || event.endedAt) && (
                <div className="flex items-center gap-1">
                  <CheckCircle className="h-3.5 w-3.5" />
                  <span>
                    {t("events.duration", "Duration")}: {calculateDuration(event.startedAt, event.endedAt, t("events.ongoing", "ongoing"))}
                  </span>
                </div>
              )}
              {event.affectedMonitorDetails && event.affectedMonitorDetails.length > 0 && (
                <div className="flex items-center gap-1">
                  <Activity className="h-3.5 w-3.5" />
                  <span>
                    {event.affectedMonitorDetails.length} {t("events.affected", "affected")}{" "}
                    {event.affectedMonitorDetails.length === 1
                      ? t("events.service", "service")
                      : t("events.services", "services")}
                  </span>
                </div>
              )}
            </div>

            {/* Impact scope badge */}
            {event.impactScope && event.impactScope.impactScore > 0 && (
              <div className="mt-3">
                <ImpactScopeBadge impactScope={event.impactScope} />
              </div>
            )}

            {/* Affected services */}
            {event.affectedMonitorDetails && event.affectedMonitorDetails.length > 0 && (
              <div className="mt-3 flex flex-wrap gap-1">
                {event.affectedMonitorDetails.map((monitor) => (
                  <Badge
                    key={monitor.id}
                    variant="secondary"
                    className="text-xs"
                  >
                    {monitor.name}
                  </Badge>
                ))}
              </div>
            )}

            {/* Impact scope detailed view */}
            {event.impactScope && (event.impactScope.affectedRegions.length > 0 ||
              event.impactScope.dependencies.upstream.length > 0 ||
              event.impactScope.dependencies.downstream.length > 0) && (
              <div className="mt-4">
                <ImpactScopeView impactScope={event.impactScope} variant="detailed" />
              </div>
            )}

            {/* Updates toggle */}
            {hasUpdates && (
              <button
                onClick={() => setShowUpdates(!showUpdates)}
                className={cn(
                  "mt-3 inline-flex items-center gap-1 text-xs font-medium",
                  config.textClass,
                  "hover:opacity-80"
                )}
              >
                {showUpdates ? (
                  <ChevronUp className="h-3.5 w-3.5" />
                ) : (
                  <ChevronDown className="h-3.5 w-3.5" />
                )}
                {event.updates!.length} {t("incidents.updatesLabel", "updates")}
              </button>
            )}

            {/* Updates timeline */}
            {showUpdates && hasUpdates && (
              <div className="mt-4 space-y-3 border-l-2 border-current/20 pl-4">
                {event.updates!.map((update) => {
                  const updateConfig = statusConfig[update.status] || statusConfig.investigating;
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

            {/* RCA/Post-Mortem Documents */}
            {event.documents && event.documents.length > 0 && (
              <div className="mt-4 pt-3 border-t border-current/10">
                <div className="text-xs font-medium opacity-70 mb-2 flex items-center gap-1.5">
                  <FileText className="h-3.5 w-3.5" />
                  {t("events.relatedDocuments", "Related Documents")}
                </div>
                <div className="space-y-2">
                  {event.documents.map((doc) => (
                    <a
                      key={doc.id}
                      href={doc.documentUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className={cn(
                        "flex items-center justify-between p-2 rounded-md",
                        "bg-[var(--status-bg)]/50 hover:bg-[var(--status-bg)]/80",
                        "border border-current/10 hover:border-current/20",
                        "transition-colors group"
                      )}
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <Badge
                          variant="outline"
                          className="text-[10px] px-1.5 py-0 shrink-0 capitalize"
                        >
                          {doc.documentType.replace("_", " ")}
                        </Badge>
                        <span className="text-sm truncate">{doc.title}</span>
                      </div>
                      <ExternalLink className="h-3.5 w-3.5 opacity-50 group-hover:opacity-100 shrink-0 ml-2" />
                    </a>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      <PublicEventSubscribeDialog
        open={subscribeDialogOpen}
        onOpenChange={setSubscribeDialogOpen}
        event={event}
        slug={slug}
      />
    </>
  );
}
