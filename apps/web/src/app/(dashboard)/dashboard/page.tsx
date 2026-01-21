"use client";

import Link from "next/link";
import { Activity, AlertTriangle, CheckCircle, Clock, ArrowRight, Plus } from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Button,
} from "@uni-status/ui";
import { useMonitors } from "@/hooks/use-monitors";
import { useIncidents } from "@/hooks/use-incidents";
import { useDashboardAnalytics } from "@/hooks/use-analytics";
import { useSSE } from "@/hooks/use-sse";
import { StatusIndicator, type MonitorStatus } from "@/components/monitors";
import { LoadingState } from "@/components/ui/loading-state";
import { ErrorState } from "@/components/ui/error-state";

export default function DashboardPage() {
  // Real-time connection for live updates
  useSSE({ enabled: true });

  // Data fetching
  const { data: monitorsResponse, isLoading: monitorsLoading, error: monitorsError } = useMonitors();
  const { data: incidentsResponse, isLoading: incidentsLoading } = useIncidents();
  const { data: analytics, isLoading: analyticsLoading } = useDashboardAnalytics();

  const monitors = monitorsResponse?.data;
  const incidents = incidentsResponse?.data;

  const isLoading = monitorsLoading || incidentsLoading || analyticsLoading;

  if (monitorsError) {
    return (
      <div className="space-y-6">
        <DashboardHeader />
        <ErrorState error={monitorsError} />
      </div>
    );
  }

  // Calculate stats
  const totalMonitors = monitors?.length || 0;
  const operationalCount = monitors?.filter((m) => m.status === "active").length || 0;
  const degradedCount = monitors?.filter((m) => m.status === "degraded").length || 0;
  const downCount = monitors?.filter((m) => m.status === "down").length || 0;
  const activeIncidents = incidents?.filter(
    (i) => i.status !== "resolved"
  ).length || 0;

  // Get recent incidents (last 5)
  const recentIncidents = incidents?.slice(0, 5) || [];

  // Get monitors with issues (degraded or down)
  const monitorsWithIssues = monitors
    ?.filter((m) => m.status === "degraded" || m.status === "down")
    .slice(0, 5) || [];

  if (isLoading) {
    return (
      <div className="space-y-6">
        <DashboardHeader />
        <LoadingState variant="stats" />
        <div className="grid gap-6 md:grid-cols-2">
          <LoadingState variant="card" count={1} />
          <LoadingState variant="card" count={1} />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <DashboardHeader />

      {/* Stats Grid */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <StatCard
          title="Total Monitors"
          value={totalMonitors}
          description="Active monitors"
          icon={Activity}
          iconColor="text-muted-foreground"
        />
        <StatCard
          title="Operational"
          value={operationalCount}
          description={`${degradedCount} degraded, ${downCount} down`}
          icon={CheckCircle}
          iconColor="text-green-500"
        />
        <StatCard
          title="Active Incidents"
          value={activeIncidents}
          description="Ongoing incidents"
          icon={AlertTriangle}
          iconColor={activeIncidents > 0 ? "text-yellow-500" : "text-muted-foreground"}
        />
        <StatCard
          title="Uptime (30d)"
          value={
            analytics?.uptime?.average != null
              ? `${analytics.uptime.average.toFixed(2)}%`
              : "--%"
          }
          description="Average uptime"
          icon={Clock}
          iconColor="text-muted-foreground"
        />
      </div>

      {/* Recent Activity */}
      <div className="grid gap-6 md:grid-cols-2">
        {/* Recent Incidents */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle>Recent Incidents</CardTitle>
              <CardDescription>Latest incidents across all monitors</CardDescription>
            </div>
            <Link href="/incidents">
              <Button variant="ghost" size="sm">
                View all
                <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </Link>
          </CardHeader>
          <CardContent>
            {recentIncidents.length > 0 ? (
              <div className="space-y-4">
                {recentIncidents.map((incident) => (
                  <Link
                    key={incident.id}
                    href={`/incidents/${incident.id}`}
                    className="flex items-start gap-3 rounded-lg p-2 hover:bg-muted transition-colors"
                  >
                    <div
                      className={`mt-1 h-2 w-2 rounded-full ${
                        incident.status === "resolved"
                          ? "bg-green-500"
                          : incident.severity === "critical"
                            ? "bg-red-500"
                            : incident.severity === "major"
                              ? "bg-orange-500"
                              : "bg-yellow-500"
                      }`}
                    />
                    <div className="flex-1 min-w-0">
                      <p className="font-medium truncate">{incident.title}</p>
                      <p className="text-sm text-muted-foreground">
                        {incident.status} - {formatRelativeTime(incident.createdAt)}
                      </p>
                    </div>
                  </Link>
                ))}
              </div>
            ) : (
              <div className="py-8 text-center">
                <CheckCircle className="mx-auto h-8 w-8 text-green-500" />
                <p className="mt-2 text-sm text-muted-foreground">
                  No incidents to display
                </p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Monitor Status */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle>Monitor Status</CardTitle>
              <CardDescription>Quick overview of monitor health</CardDescription>
            </div>
            <Link href="/monitors">
              <Button variant="ghost" size="sm">
                View all
                <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </Link>
          </CardHeader>
          <CardContent>
            {totalMonitors > 0 ? (
              <div className="space-y-4">
                {monitorsWithIssues.length > 0 ? (
                  monitorsWithIssues.map((monitor) => (
                    <Link
                      key={monitor.id}
                      href={`/monitors/${monitor.id}`}
                      className="flex items-center gap-3 rounded-lg p-2 hover:bg-muted transition-colors"
                    >
                      <StatusIndicator
                        status={monitor.status as MonitorStatus}
                        pulse
                      />
                      <div className="flex-1 min-w-0">
                        <p className="font-medium truncate">{monitor.name}</p>
                        <p className="text-sm text-muted-foreground truncate">
                          {monitor.url}
                        </p>
                      </div>
                      <span
                        className={`text-xs font-medium ${
                          monitor.status === "down"
                            ? "text-red-500"
                            : "text-yellow-500"
                        }`}
                      >
                        {monitor.status === "down" ? "Down" : "Degraded"}
                      </span>
                    </Link>
                  ))
                ) : (
                  <div className="py-8 text-center">
                    <CheckCircle className="mx-auto h-8 w-8 text-green-500" />
                    <p className="mt-2 font-medium">All systems operational</p>
                    <p className="text-sm text-muted-foreground">
                      {operationalCount} monitors running normally
                    </p>
                  </div>
                )}
              </div>
            ) : (
              <div className="py-8 text-center">
                <Activity className="mx-auto h-8 w-8 text-muted-foreground" />
                <p className="mt-2 text-sm text-muted-foreground">
                  No monitors configured
                </p>
                <Link href="/monitors/new" className="mt-4 inline-block">
                  <Button size="sm">
                    <Plus className="mr-2 h-4 w-4" />
                    Create Monitor
                  </Button>
                </Link>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function DashboardHeader() {
  return (
    <div>
      <h1 className="text-3xl font-bold">Dashboard</h1>
      <p className="text-muted-foreground">
        Overview of your monitors and incidents
      </p>
    </div>
  );
}

interface StatCardProps {
  title: string;
  value: string | number;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
  iconColor?: string;
}

function StatCard({ title, value, description, icon: Icon, iconColor }: StatCardProps) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium">{title}</CardTitle>
        <Icon className={`h-4 w-4 ${iconColor || "text-muted-foreground"}`} />
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold">{value}</div>
        <p className="text-xs text-muted-foreground">{description}</p>
      </CardContent>
    </Card>
  );
}

function formatRelativeTime(dateString: string): string {
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffSecs = Math.floor(diffMs / 1000);
  const diffMins = Math.floor(diffSecs / 60);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffSecs < 60) return "just now";
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;

  return date.toLocaleDateString();
}
