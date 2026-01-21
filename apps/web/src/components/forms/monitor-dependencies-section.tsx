"use client";

import { useState } from "react";
import {
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Badge,
  cn,
} from "@uni-status/ui";
import { ArrowUpRight, ArrowDownRight, Trash2, Plus, Loader2, ChevronDown, ChevronUp } from "lucide-react";
import { useMonitorDependencies } from "@/hooks/use-dependencies";
import { useMonitors } from "@/hooks/use-monitors";
import { MonitorMultiSelect } from "./monitor-multi-select";
import type { MonitorDependencyWithMonitor, Monitor } from "@/lib/api-client";

interface MonitorDependenciesSectionProps {
  monitorId: string;
  monitorName?: string;
  // Pending changes (local state, not yet saved)
  pendingUpstreamIds: string[];
  removedDependencyIds: string[];
  onAddDependencies: (upstreamIds: string[]) => void;
  onRemoveDependency: (dependencyId: string, upstreamMonitorId: string) => void;
}

export function MonitorDependenciesSection({
  monitorId,
  monitorName,
  pendingUpstreamIds,
  removedDependencyIds,
  onAddDependencies,
  onRemoveDependency,
}: MonitorDependenciesSectionProps) {
  const [isExpanded, setIsExpanded] = useState(true);
  const { data: dependencies, isLoading } = useMonitorDependencies(monitorId);
  const { data: monitorsResponse } = useMonitors();
  const monitors = monitorsResponse?.data;

  // Filter out removed dependencies from the display
  const visibleUpstream = (dependencies?.upstream ?? []).filter(
    (dep) => !removedDependencyIds.includes(dep.id)
  );

  // Build pending dependency display items from monitor data
  const pendingDependencies: MonitorDependencyWithMonitor[] = pendingUpstreamIds
    .map((upstreamId) => {
      const monitor = monitors?.find((m) => m.id === upstreamId);
      return {
        id: `pending-${upstreamId}`,
        downstreamMonitorId: monitorId,
        upstreamMonitorId: upstreamId,
        description: null,
        createdAt: new Date().toISOString(),
        monitor: monitor
          ? {
              id: monitor.id,
              name: monitor.name,
              type: monitor.type,
              status: monitor.status,
            }
          : null,
      };
    });

  const handleAddDependencies = (upstreamIds: string[]) => {
    // Filter out any that are already existing or pending
    const existingIds = visibleUpstream.map((d) => d.upstreamMonitorId);
    const newIds = upstreamIds.filter(
      (id) => !existingIds.includes(id) && !pendingUpstreamIds.includes(id)
    );
    if (newIds.length > 0) {
      onAddDependencies(newIds);
    }
  };

  const handleRemoveDependency = (dependencyId: string, upstreamMonitorId: string) => {
    onRemoveDependency(dependencyId, upstreamMonitorId);
  };

  // Get IDs of monitors that are already dependencies or pending (to exclude from selector)
  const existingUpstreamIds = visibleUpstream.map((d) => d.upstreamMonitorId);
  const excludeIds = [monitorId, ...existingUpstreamIds, ...pendingUpstreamIds];

  // Total count includes existing (minus removed) plus pending
  const totalCount = visibleUpstream.length + pendingDependencies.length + (dependencies?.downstream?.length ?? 0);

  const getStatusColor = (status: string) => {
    switch (status) {
      case "active":
        return "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400";
      case "degraded":
        return "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400";
      case "down":
        return "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400";
      case "paused":
        return "bg-gray-100 text-gray-800 dark:bg-gray-800/50 dark:text-gray-400";
      default:
        return "bg-gray-100 text-gray-800 dark:bg-gray-800/50 dark:text-gray-400";
    }
  };

  const DependencyItem = ({
    dependency,
    type,
    isPending = false,
  }: {
    dependency: MonitorDependencyWithMonitor;
    type: "upstream" | "downstream";
    isPending?: boolean;
  }) => {
    const monitor = dependency.monitor;
    const isUpstream = type === "upstream";

    return (
      <div
        className={cn(
          "flex items-center gap-3 p-3 border rounded-lg",
          isUpstream ? "border-blue-200 bg-blue-50/50 dark:border-blue-900/50 dark:bg-blue-950/20" : "border-orange-200 bg-orange-50/50 dark:border-orange-900/50 dark:bg-orange-950/20",
          isPending && "border-dashed"
        )}
      >
        <div className={cn(
          "p-1.5 rounded-md",
          isUpstream ? "bg-blue-100 text-blue-700 dark:bg-blue-900/50 dark:text-blue-400" : "bg-orange-100 text-orange-700 dark:bg-orange-900/50 dark:text-orange-400"
        )}>
          {isUpstream ? (
            <ArrowUpRight className="h-4 w-4" />
          ) : (
            <ArrowDownRight className="h-4 w-4" />
          )}
        </div>
        <div className="flex-1 min-w-0">
          <div className="font-medium truncate flex items-center gap-2">
            {monitor?.name ?? (isUpstream ? dependency.upstreamMonitorId : dependency.downstreamMonitorId)}
            {isPending && (
              <Badge variant="outline" className="text-xs">
                Pending
              </Badge>
            )}
          </div>
          {dependency.description && (
            <div className="text-sm text-muted-foreground truncate">
              {dependency.description}
            </div>
          )}
        </div>
        {monitor && (
          <span
            className={cn(
              "text-xs px-2 py-0.5 rounded capitalize",
              getStatusColor(monitor.status)
            )}
          >
            {monitor.status}
          </span>
        )}
        {isUpstream && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => handleRemoveDependency(dependency.id, dependency.upstreamMonitorId)}
            className="h-8 w-8 p-0 text-muted-foreground hover:text-destructive"
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        )}
      </div>
    );
  };

  return (
    <Card>
      <CardHeader
        className="cursor-pointer"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              Dependencies
              {(dependencies || pendingDependencies.length > 0) && (
                <Badge variant="secondary">
                  {totalCount}
                </Badge>
              )}
            </CardTitle>
            <CardDescription>
              Configure which monitors this service depends on
            </CardDescription>
          </div>
          <Button type="button" variant="ghost" size="sm" className="h-8 w-8 p-0">
            {isExpanded ? (
              <ChevronUp className="h-4 w-4" />
            ) : (
              <ChevronDown className="h-4 w-4" />
            )}
          </Button>
        </div>
      </CardHeader>
      {isExpanded && (
        <CardContent className="space-y-6">
          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <>
              {/* Upstream Dependencies (What this monitor depends on) */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <h4 className="text-sm font-medium flex items-center gap-2">
                      <ArrowUpRight className="h-4 w-4 text-blue-600" />
                      Depends On (Upstream)
                    </h4>
                    <p className="text-xs text-muted-foreground">
                      Services that {monitorName || "this monitor"} relies on
                    </p>
                  </div>
                  <MonitorMultiSelect
                    selectedIds={[]}
                    onSelectionChange={handleAddDependencies}
                    excludeIds={excludeIds}
                    title="Add Upstream Dependencies"
                    description="Select monitors that this service depends on"
                    trigger={
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="gap-1"
                      >
                        <Plus className="h-4 w-4" />
                        Add
                      </Button>
                    }
                  />
                </div>

                {visibleUpstream.length > 0 || pendingDependencies.length > 0 ? (
                  <div className="space-y-2">
                    {/* Existing dependencies */}
                    {visibleUpstream.map((dep) => (
                      <DependencyItem key={dep.id} dependency={dep} type="upstream" />
                    ))}
                    {/* Pending dependencies (not yet saved) */}
                    {pendingDependencies.map((dep) => (
                      <DependencyItem key={dep.id} dependency={dep} type="upstream" isPending />
                    ))}
                  </div>
                ) : (
                  <div className="text-sm text-muted-foreground text-center py-4 border border-dashed rounded-lg">
                    No upstream dependencies configured
                  </div>
                )}
              </div>

              {/* Downstream Dependencies (What depends on this monitor) */}
              {dependencies?.downstream && dependencies.downstream.length > 0 && (
                <div className="space-y-3">
                  <div>
                    <h4 className="text-sm font-medium flex items-center gap-2">
                      <ArrowDownRight className="h-4 w-4 text-orange-600" />
                      Depended On By (Downstream)
                    </h4>
                    <p className="text-xs text-muted-foreground">
                      Services that depend on {monitorName || "this monitor"}
                    </p>
                  </div>

                  <div className="space-y-2">
                    {dependencies.downstream.map((dep) => (
                      <DependencyItem key={dep.id} dependency={dep} type="downstream" />
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </CardContent>
      )}
    </Card>
  );
}
