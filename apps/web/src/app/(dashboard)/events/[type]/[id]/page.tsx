"use client";

import { useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft,
  Bell,
  BellOff,
  Download,
  Share2,
  ExternalLink,
  Activity,
  Clock,
  CalendarDays,
  CheckCircle,
  Copy,
  Check,
} from "lucide-react";
import {
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Badge,
  Separator,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
  cn,
  useToast,
} from "@uni-status/ui";
import {
  useEvent,
  useSubscribeToEvent,
  useUnsubscribeFromEvent,
  useExportEvent,
} from "@/hooks/use-events";
import { useDashboardStore } from "@/stores/dashboard-store";
import { apiClient } from "@/lib/api-client";
import {
  EventTypeBadge,
  EventSeverityBadge,
  EventStatusBadge,
  EventTimeline,
} from "@/components/events";
import { LoadingState } from "@/components/ui/loading-state";
import { ErrorState } from "@/components/ui/error-state";
import type { EventType } from "@/lib/api-client";

export default function EventDetailPage() {
  const params = useParams<{ type: string; id: string }>();
  const router = useRouter();
  const [copied, setCopied] = useState(false);
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const organizationId = useDashboardStore((state) => state.currentOrganizationId);

  const eventType = params.type as EventType;
  const eventId = params.id;

  const { data: event, isLoading, error, refetch } = useEvent(eventType, eventId);
  const subscribeToEvent = useSubscribeToEvent();
  const unsubscribeFromEvent = useUnsubscribeFromEvent();
  const { getExportUrl } = useExportEvent();

  const deploymentsQuery = useQuery({
    queryKey: ["deployments", "incident", eventId],
    queryFn: () => apiClient.deployments.byIncident(eventId, 24, organizationId ?? undefined),
    enabled: eventType === "incident" && !!organizationId,
  });

  const rollbackMutation = useMutation({
    mutationFn: (deploymentId: string) =>
      apiClient.deployments.events.rollback(deploymentId, organizationId ?? undefined),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["deployments", "incident", eventId] });
      toast({ title: "Rollback triggered", description: "Deployment marked as rolled back." });
    },
    onError: (err: unknown) => {
      const message = err instanceof Error ? err.message : "Failed to trigger rollback";
      toast({ title: "Rollback failed", description: message, variant: "destructive" });
    },
  });

  const handleSubscribe = async () => {
    if (event?.isSubscribed) {
      await unsubscribeFromEvent.mutateAsync({ type: eventType, id: eventId });
    } else {
      await subscribeToEvent.mutateAsync({ type: eventType, id: eventId });
    }
  };

  const handleCopyLink = () => {
    const url = window.location.href;
    navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleExport = (format: "ics" | "json") => {
    const url = getExportUrl(eventType, eventId, format);
    window.open(url);
  };

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="sm" onClick={() => router.back()}>
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back
          </Button>
        </div>
        <LoadingState variant="card" count={2} />
      </div>
    );
  }

  if (error || !event) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="sm" onClick={() => router.back()}>
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back
          </Button>
        </div>
        <ErrorState error={error || new Error("Event not found")} onRetry={() => refetch()} />
      </div>
    );
  }

  const isResolved =
    event.type === "incident"
      ? event.status === "resolved"
      : event.status === "completed";
  const isActive =
    event.type === "maintenance"
      ? event.status === "active"
      : !isResolved;
  const duration = calculateDuration(event.startedAt, event.endedAt);

  return (
    <TooltipProvider>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-start justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <Button variant="ghost" size="sm" onClick={() => router.push("/events")}>
                <ArrowLeft className="mr-2 h-4 w-4" />
                Back to Events
              </Button>
            </div>
            <h1 className="text-2xl font-bold">{event.title}</h1>
            <div className="flex items-center gap-2">
              <EventTypeBadge type={event.type} />
              <EventSeverityBadge severity={event.severity as any} />
              <EventStatusBadge
                type={event.type}
                status={event.status as any}
              />
            </div>
          </div>

          <div className="flex items-center gap-2">
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

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm">
                  <Download className="mr-2 h-4 w-4" />
                  Export
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => handleExport("ics")}>
                  Calendar (.ics)
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => handleExport("json")}>
                  JSON
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>

            <Button
              variant={event.isSubscribed ? "outline" : "default"}
              size="sm"
              onClick={handleSubscribe}
              disabled={subscribeToEvent.isPending || unsubscribeFromEvent.isPending}
            >
              {event.isSubscribed ? (
                <>
                  <BellOff className="mr-2 h-4 w-4" />
                  Unsubscribe
                </>
              ) : (
                <>
                  <Bell className="mr-2 h-4 w-4" />
                  Subscribe
                </>
              )}
            </Button>

            {event.type === "incident" && !isResolved && (
              <Link href={`/incidents/${event.id}`}>
                <Button>
                  <ExternalLink className="mr-2 h-4 w-4" />
                  Manage Incident
                </Button>
              </Link>
            )}
            {event.type === "maintenance" && !isResolved && (
              <Link href={`/maintenance-windows/${event.id}`}>
                <Button>
                  <ExternalLink className="mr-2 h-4 w-4" />
                  Manage Maintenance
                </Button>
              </Link>
            )}
          </div>
        </div>

        <div className="grid gap-6 lg:grid-cols-3">
          {/* Main Content */}
          <div className="lg:col-span-2 space-y-6">
            {/* Description */}
            {event.description && (
              <Card>
                <CardHeader>
                  <CardTitle>Description</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="whitespace-pre-wrap">{event.description}</p>
                </CardContent>
              </Card>
            )}

            {/* Timeline */}
            <Card>
              <CardHeader>
                <CardTitle>Timeline</CardTitle>
              </CardHeader>
              <CardContent>
                <EventTimeline
                  type={event.type}
                  updates={event.updates}
                  eventStartedAt={event.startedAt}
                  eventTitle={event.description || undefined}
                />
              </CardContent>
            </Card>

            {event.type === "incident" && (
              <Card>
                <CardHeader>
                  <CardTitle>Deployment Timeline</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  {deploymentsQuery.isLoading && <LoadingState variant="card" count={1} />}
                  {deploymentsQuery.data?.length === 0 && !deploymentsQuery.isLoading && (
                    <p className="text-sm text-muted-foreground">No deployments near this incident.</p>
                  )}
                  {deploymentsQuery.data?.map((deployment) => (
                    <div
                      key={deployment.id}
                      className="flex flex-col gap-1 rounded border p-3 md:flex-row md:items-center md:justify-between"
                    >
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-semibold">{deployment.service}</span>
                          {deployment.version && (
                            <Badge variant="outline" className="text-xs">
                              {deployment.version}
                            </Badge>
                          )}
                          <Badge variant="secondary" className="text-xs capitalize">
                            {deployment.environment}
                          </Badge>
                        </div>
                        <p className="text-xs text-muted-foreground">
                          {deployment.status.replace("_", " ")} • {formatDateTime(deployment.deployedAt)}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge
                          variant={
                            deployment.status === "failed"
                              ? "destructive"
                              : deployment.status === "rolled_back"
                              ? "outline"
                              : "default"
                          }
                        >
                          {deployment.status.replace("_", " ")}
                        </Badge>
                        {deployment.status !== "rolled_back" && (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => rollbackMutation.mutate(deployment.id)}
                            disabled={rollbackMutation.isPending}
                          >
                            <ArrowLeft className="mr-2 h-4 w-4 rotate-180" />
                            Trigger Rollback
                          </Button>
                        )}
                      </div>
                    </div>
                  ))}
                </CardContent>
              </Card>
            )}
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
                  <EventStatusBadge
                    type={event.type}
                    status={event.status as any}
                  />
                </div>

                <Separator />

                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">Duration</span>
                  <div className="flex items-center gap-1">
                    <Clock className="h-4 w-4 text-muted-foreground" />
                    <span className="text-sm font-medium">{duration}</span>
                  </div>
                </div>

                <Separator />

                <div className="space-y-2">
                  <span className="text-sm text-muted-foreground">Started</span>
                  <div className="flex items-center gap-1">
                    <CalendarDays className="h-4 w-4 text-muted-foreground" />
                    <span className="text-sm">{formatDateTime(event.startedAt)}</span>
                  </div>
                </div>

                {event.endedAt && (
                  <>
                    <Separator />
                    <div className="space-y-2">
                      <span className="text-sm text-muted-foreground">
                        {event.type === "incident" ? "Resolved" : "Ended"}
                      </span>
                      <div className="flex items-center gap-1">
                        <CheckCircle className="h-4 w-4 text-green-500" />
                        <span className="text-sm">{formatDateTime(event.endedAt)}</span>
                      </div>
                    </div>
                  </>
                )}

                {event.createdBy && (
                  <>
                    <Separator />
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-muted-foreground">Created by</span>
                      <span className="text-sm font-medium">{event.createdBy.name}</span>
                    </div>
                  </>
                )}

                {event.subscriberCount !== undefined && (
                  <>
                    <Separator />
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-muted-foreground">Subscribers</span>
                      <div className="flex items-center gap-1">
                        <Bell className="h-4 w-4 text-muted-foreground" />
                        <span className="text-sm font-medium">{event.subscriberCount}</span>
                      </div>
                    </div>
                  </>
                )}
              </CardContent>
            </Card>

            {/* Affected Monitors */}
            {event.affectedMonitorDetails && event.affectedMonitorDetails.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle>Affected Monitors</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    {event.affectedMonitorDetails.map((monitor) => (
                      <Link
                        key={monitor.id}
                        href={`/monitors/${monitor.id}`}
                        className="flex items-center gap-2 p-2 rounded-md hover:bg-muted transition-colors"
                      >
                        <Activity className="h-4 w-4 text-muted-foreground" />
                        <span className="text-sm">{monitor.name}</span>
                      </Link>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}
          </div>
        </div>
      </div>
    </TooltipProvider>
  );
}

// Helper functions
function calculateDuration(startedAt: string, endedAt: string | null): string {
  const start = new Date(startedAt);
  const end = endedAt ? new Date(endedAt) : new Date();
  const diffMs = end.getTime() - start.getTime();
  const diffMins = Math.floor(diffMs / (1000 * 60));
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffMins < 60) {
    return `${diffMins}m ${endedAt ? "" : "(ongoing)"}`;
  }
  if (diffHours < 24) {
    const mins = diffMins % 60;
    return `${diffHours}h ${mins > 0 ? `${mins}m` : ""} ${endedAt ? "" : "(ongoing)"}`;
  }
  const hours = diffHours % 24;
  return `${diffDays}d ${hours > 0 ? `${hours}h` : ""} ${endedAt ? "" : "(ongoing)"}`;
}

function formatDateTime(dateString: string): string {
  const date = new Date(dateString);
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).format(date);
}
