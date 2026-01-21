"use client";

import { useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import {
  ArrowLeft,
  Calendar,
  AlertTriangle,
  CheckCircle,
  Clock,
  Bell,
  Activity,
  Share2,
  Copy,
  Check,
  Download,
  CalendarPlus,
  FileJson,
} from "lucide-react";
import {
  cn,
  Button,
  Badge,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Separator,
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from "@uni-status/ui";
import type { UnifiedEvent, EventType } from "@uni-status/shared";
import { PublicEventSubscribeDialog } from "@/components/public-status/events/public-event-subscribe-dialog";
import {
  eventStatusConfig as centralEventStatusConfig,
  severityConfig as centralSeverityConfig,
} from "@/lib/status-colors";

// Always use relative URL for public status page API calls to avoid CORS issues on custom domains
const API_URL = "/api";

interface EventResponse {
  success: boolean;
  data?: UnifiedEvent;
  error?: {
    code: string;
    message: string;
  };
}

async function fetchPublicEvent(
  slug: string,
  type: string,
  id: string
): Promise<EventResponse> {
  const response = await fetch(
    `${API_URL}/public/status-pages/${slug}/events/${type}/${id}`,
    {
      credentials: "include",
    }
  );
  return response.json();
}

// Build status config from centralized colors
const statusConfig = Object.fromEntries(
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
    icon: typeof AlertTriangle;
    bgClass: string;
    textClass: string;
    iconClass: string;
    badgeClass: string;
  }
>;

// Build severity config from centralized colors
const severityConfig = Object.fromEntries(
  Object.entries(centralSeverityConfig).map(([key, config]) => [
    key,
    {
      label: config.label,
      className: `${config.colors.bg} ${config.colors.text}`,
    },
  ])
) as Record<string, { label: string; className: string }>;

function formatDateTime(dateStr: string) {
  const date = new Date(dateStr);
  return date.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}

function formatRelativeTime(dateStr: string) {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 0) {
    const futureMins = Math.abs(diffMins);
    const futureHours = Math.abs(diffHours);
    const futureDays = Math.abs(diffDays);

    if (futureMins < 60) return `in ${futureMins}m`;
    if (futureHours < 24) return `in ${futureHours}h`;
    if (futureDays < 7) return `in ${futureDays}d`;
    return formatDateTime(dateStr);
  }

  if (diffMins < 1) return "Just now";
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  return formatDateTime(dateStr);
}

function calculateDuration(startedAt: string, endedAt: string | null): string {
  const start = new Date(startedAt);
  const end = endedAt ? new Date(endedAt) : new Date();
  const diffMs = end.getTime() - start.getTime();
  const diffMins = Math.floor(diffMs / (1000 * 60));
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffMins < 60) {
    return `${diffMins}m ${endedAt ? "" : "(ongoing)"}`.trim();
  }
  if (diffHours < 24) {
    const mins = diffMins % 60;
    return `${diffHours}h ${mins > 0 ? `${mins}m` : ""} ${endedAt ? "" : "(ongoing)"}`.trim();
  }
  const hours = diffHours % 24;
  return `${diffDays}d ${hours > 0 ? `${hours}h` : ""} ${endedAt ? "" : "(ongoing)"}`.trim();
}

export default function PublicEventDetailPage() {
  const params = useParams<{ slug: string; type: string; id: string }>();
  const { slug, type, id } = params;

  const [subscribeDialogOpen, setSubscribeDialogOpen] = useState(false);
  const [copied, setCopied] = useState(false);

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["public-event", slug, type, id],
    queryFn: () => fetchPublicEvent(slug, type, id),
    enabled: !!slug && !!type && !!id,
    refetchInterval: 30000,
  });

  const event = data?.data;

  const handleCopyLink = () => {
    navigator.clipboard.writeText(window.location.href);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background">
        <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6 lg:px-8">
          <div className="mb-8">
            <Link
              href={`/status/${slug}/events`}
              className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors mb-4"
            >
              <ArrowLeft className="h-4 w-4" />
              Back to Events
            </Link>
          </div>
          <div className="space-y-4">
            <div className="h-32 animate-pulse rounded-lg bg-muted" />
            <div className="h-64 animate-pulse rounded-lg bg-muted" />
          </div>
        </div>
      </div>
    );
  }

  if (error || !event) {
    return (
      <div className="min-h-screen bg-background">
        <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6 lg:px-8">
          <div className="mb-8">
            <Link
              href={`/status/${slug}/events`}
              className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors mb-4"
            >
              <ArrowLeft className="h-4 w-4" />
              Back to Events
            </Link>
          </div>
          <div className="text-center py-12 border rounded-lg bg-muted/30">
            <AlertTriangle className="mx-auto h-12 w-12 text-destructive" />
            <h2 className="mt-4 text-lg font-semibold">Event not found</h2>
            <p className="mt-2 text-muted-foreground">
              {data?.error?.message || "This event may have been removed or doesn't exist."}
            </p>
            <Button onClick={() => refetch()} className="mt-4">
              Try Again
            </Button>
          </div>
        </div>
      </div>
    );
  }

  const config = statusConfig[event.status] || statusConfig.investigating;
  const severity = severityConfig[event.severity] || severityConfig.minor;
  const Icon = config.icon;
  const isIncident = event.type === "incident";
  const isResolved = event.status === "resolved" || event.status === "completed";

  return (
    <TooltipProvider>
      <div className="min-h-screen bg-background">
        <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6 lg:px-8">
          {/* Header */}
          <div className="mb-8">
            <Link
              href={`/status/${slug}/events`}
              className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors mb-4"
            >
              <ArrowLeft className="h-4 w-4" />
              Back to Events
            </Link>

            <div className="flex items-start justify-between gap-4">
              <div className="space-y-2">
                <h1 className="text-2xl font-bold">{event.title}</h1>
                <div className="flex flex-wrap items-center gap-2">
                  <Badge
                    variant="outline"
                    className={cn("text-xs", isIncident ? "border-red-500" : "border-purple-500")}
                  >
                    {isIncident ? (
                      <AlertTriangle className="h-3 w-3 mr-1" />
                    ) : (
                      <Calendar className="h-3 w-3 mr-1" />
                    )}
                    {isIncident ? "Incident" : "Maintenance"}
                  </Badge>
                  <Badge className={cn("text-xs", severity.className)}>
                    {isIncident ? severity.label : "Scheduled"}
                  </Badge>
                  <Badge variant="outline" className={cn("text-xs", config.badgeClass)}>
                    {config.label}
                  </Badge>
                </div>
              </div>

              <div className="flex items-center gap-2">
                {/* Export dropdown */}
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="outline" size="sm">
                      <Download className="h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem asChild>
                      <a
                        href={`/api/public/status-pages/${slug}/events/${type}/${id}/export?format=ics`}
                        download
                        className="flex items-center gap-2"
                      >
                        <CalendarPlus className="h-4 w-4" />
                        <span>Add to Calendar (ICS)</span>
                      </a>
                    </DropdownMenuItem>
                    <DropdownMenuItem asChild>
                      <a
                        href={`/api/public/status-pages/${slug}/events/${type}/${id}/export?format=json`}
                        download
                        className="flex items-center gap-2"
                      >
                        <FileJson className="h-4 w-4" />
                        <span>Download JSON</span>
                      </a>
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>

                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button variant="outline" size="sm" onClick={handleCopyLink}>
                      {copied ? (
                        <Check className="h-4 w-4" />
                      ) : (
                        <Copy className="h-4 w-4" />
                      )}
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>
                    {copied ? "Copied!" : "Copy link"}
                  </TooltipContent>
                </Tooltip>

                {!isResolved && (
                  <Button onClick={() => setSubscribeDialogOpen(true)}>
                    <Bell className="h-4 w-4 mr-2" />
                    Subscribe
                  </Button>
                )}
              </div>
            </div>
          </div>

          <div className="grid gap-6 lg:grid-cols-3">
            {/* Main Content */}
            <div className="lg:col-span-2 space-y-6">
              {/* Status Banner */}
              <div className={cn("rounded-lg border p-4", config.bgClass)}>
                <div className="flex items-center gap-3">
                  <Icon className={cn("h-6 w-6", config.iconClass)} />
                  <div>
                    <p className={cn("font-semibold", config.textClass)}>
                      {config.label}
                    </p>
                    {event.description && (
                      <p className={cn("text-sm mt-1", config.textClass, "opacity-80")}>
                        {event.description}
                      </p>
                    )}
                  </div>
                </div>
              </div>

              {/* Timeline */}
              <Card>
                <CardHeader>
                  <CardTitle>Timeline</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-6">
                    {/* Event start */}
                    <div className="relative pl-8">
                      <div className="absolute left-0 top-1 h-5 w-5 rounded-full bg-primary flex items-center justify-center">
                        {isIncident ? (
                          <AlertTriangle className="h-3 w-3 text-primary-foreground" />
                        ) : (
                          <Calendar className="h-3 w-3 text-primary-foreground" />
                        )}
                      </div>
                      <div className="absolute left-2.5 top-6 bottom-0 w-0.5 bg-border" />
                      <div>
                        <p className="font-medium">
                          {isIncident ? "Incident started" : "Maintenance scheduled"}
                        </p>
                        <p className="text-sm text-muted-foreground">
                          {formatDateTime(event.startedAt)}
                        </p>
                        {event.description && (
                          <p className="mt-2 text-sm">{event.description}</p>
                        )}
                      </div>
                    </div>

                    {/* Updates */}
                    {event.updates?.map((update, index) => {
                      const updateConfig = statusConfig[update.status] || statusConfig.investigating;
                      const UpdateIcon = updateConfig.icon;
                      const isLastUpdate = index === event.updates!.length - 1 && isResolved;

                      return (
                        <div key={update.id} className="relative pl-8">
                          <div
                            className={cn(
                              "absolute left-0 top-1 h-5 w-5 rounded-full flex items-center justify-center",
                              updateConfig.textClass.replace("text-", "bg-").replace("-800", "-500").replace("-200", "-500")
                            )}
                          >
                            <UpdateIcon className="h-3 w-3 text-white" />
                          </div>
                          {!isLastUpdate && (
                            <div className="absolute left-2.5 top-6 bottom-0 w-0.5 bg-border" />
                          )}
                          <div>
                            <div className="flex items-center gap-2">
                              <p className="font-medium">{updateConfig.label}</p>
                              <span className="text-sm text-muted-foreground">
                                {formatRelativeTime(update.createdAt)}
                              </span>
                            </div>
                            <p className="text-sm text-muted-foreground">
                              {formatDateTime(update.createdAt)}
                            </p>
                            {update.message && (
                              <p className="mt-2 text-sm whitespace-pre-wrap">
                                {update.message}
                              </p>
                            )}
                          </div>
                        </div>
                      );
                    })}

                    {/* Event end (if resolved) */}
                    {isResolved && event.endedAt && (
                      <div className="relative pl-8">
                        <div className="absolute left-0 top-1 h-5 w-5 rounded-full bg-status-success-solid flex items-center justify-center">
                          <CheckCircle className="h-3 w-3 text-white" />
                        </div>
                        <div>
                          <p className="font-medium text-status-success-icon">
                            {isIncident ? "Incident resolved" : "Maintenance completed"}
                          </p>
                          <p className="text-sm text-muted-foreground">
                            {formatDateTime(event.endedAt)}
                          </p>
                        </div>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Sidebar */}
            <div className="space-y-6">
              {/* Details Card */}
              <Card>
                <CardHeader>
                  <CardTitle>Details</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-muted-foreground">Status</span>
                    <Badge variant="outline" className={cn("text-xs", config.badgeClass)}>
                      {config.label}
                    </Badge>
                  </div>

                  <Separator />

                  <div className="flex items-center justify-between">
                    <span className="text-sm text-muted-foreground">Duration</span>
                    <div className="flex items-center gap-1">
                      <Clock className="h-4 w-4 text-muted-foreground" />
                      <span className="text-sm font-medium">
                        {calculateDuration(event.startedAt, event.endedAt)}
                      </span>
                    </div>
                  </div>

                  <Separator />

                  <div className="space-y-2">
                    <span className="text-sm text-muted-foreground">
                      {isIncident ? "Started" : "Scheduled start"}
                    </span>
                    <div className="flex items-center gap-1">
                      <Calendar className="h-4 w-4 text-muted-foreground" />
                      <span className="text-sm">{formatDateTime(event.startedAt)}</span>
                    </div>
                  </div>

                  {event.endedAt && (
                    <>
                      <Separator />
                      <div className="space-y-2">
                        <span className="text-sm text-muted-foreground">
                          {isIncident ? "Resolved" : "Ended"}
                        </span>
                        <div className="flex items-center gap-1">
                          <CheckCircle className="h-4 w-4 text-status-success-solid" />
                          <span className="text-sm">{formatDateTime(event.endedAt)}</span>
                        </div>
                      </div>
                    </>
                  )}

                  {event.timezone && (
                    <>
                      <Separator />
                      <div className="flex items-center justify-between">
                        <span className="text-sm text-muted-foreground">Timezone</span>
                        <span className="text-sm font-medium">{event.timezone}</span>
                      </div>
                    </>
                  )}
                </CardContent>
              </Card>

              {/* Affected Services */}
              {event.affectedMonitorDetails && event.affectedMonitorDetails.length > 0 && (
                <Card>
                  <CardHeader>
                    <CardTitle>Affected Services</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-2">
                      {event.affectedMonitorDetails.map((monitor) => (
                        <div
                          key={monitor.id}
                          className="flex items-center gap-2 p-2 rounded-md bg-muted/50"
                        >
                          <Activity className="h-4 w-4 text-muted-foreground" />
                          <span className="text-sm">{monitor.name}</span>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* Subscribe CTA */}
              {!isResolved && (
                <Card>
                  <CardContent className="pt-6">
                    <div className="text-center">
                      <Bell className="mx-auto h-8 w-8 text-muted-foreground" />
                      <h3 className="mt-2 font-semibold">Stay updated</h3>
                      <p className="mt-1 text-sm text-muted-foreground">
                        Get notified when this {isIncident ? "incident" : "maintenance"} is updated.
                      </p>
                      <Button
                        onClick={() => setSubscribeDialogOpen(true)}
                        className="mt-4 w-full"
                      >
                        <Bell className="h-4 w-4 mr-2" />
                        Subscribe to updates
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              )}
            </div>
          </div>
        </div>
      </div>

      <PublicEventSubscribeDialog
        open={subscribeDialogOpen}
        onOpenChange={setSubscribeDialogOpen}
        event={event}
        slug={slug}
      />
    </TooltipProvider>
  );
}
