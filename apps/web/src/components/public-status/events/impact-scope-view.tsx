"use client";

import { useState } from "react";
import type { ComponentType } from "react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Badge,
  Progress,
  Button,
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
  cn,
} from "@uni-status/ui";
import {
  ChevronDown,
  ChevronUp,
  Globe,
  GitBranch,
  ArrowUp,
  ArrowDown,
  AlertTriangle,
  CheckCircle,
  XCircle,
} from "lucide-react";
import type { ImpactLevel, ImpactScopeData } from "@uni-status/shared";

export interface ImpactScopeViewProps {
  impactScope: ImpactScopeData;
  variant?: "summary" | "detailed" | "both";
  className?: string;
}

const impactLevelConfig: Record<
  ImpactLevel,
  {
    label: string;
    color: string;
    bgColor: string;
    progressColor: string;
    icon: ComponentType<any>;
  }
> = {
  none: {
    label: "No Impact",
    color: "text-status-gray-text",
    bgColor: "bg-status-gray-bg",
    progressColor: "bg-status-gray-solid",
    icon: CheckCircle,
  },
  low: {
    label: "Low Impact",
    color: "text-status-success-icon",
    bgColor: "bg-status-success-bg",
    progressColor: "bg-status-success-solid",
    icon: CheckCircle,
  },
  medium: {
    label: "Medium Impact",
    color: "text-status-warning-icon",
    bgColor: "bg-status-warning-bg",
    progressColor: "bg-status-warning-solid",
    icon: AlertTriangle,
  },
  high: {
    label: "High Impact",
    color: "text-status-orange-icon",
    bgColor: "bg-status-orange-bg",
    progressColor: "bg-status-orange-solid",
    icon: AlertTriangle,
  },
  critical: {
    label: "Critical Impact",
    color: "text-status-error-icon",
    bgColor: "bg-status-error-bg",
    progressColor: "bg-status-error-solid",
    icon: XCircle,
  },
};

function ImpactSummary({ impactScope }: { impactScope: ImpactScopeData }) {
  const levelConfig = impactLevelConfig[impactScope.impactLevel];
  const Icon = levelConfig.icon;

  return (
    <div className="flex items-center gap-4 p-4 rounded-lg border bg-[var(--status-card)]">
      <div
        className={cn(
          "flex items-center justify-center h-12 w-12 rounded-full",
          levelConfig.bgColor
        )}
      >
        <Icon className={cn("h-6 w-6", levelConfig.color)} />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1">
          <span className={cn("font-semibold", levelConfig.color)}>
            {levelConfig.label}
          </span>
          <Badge variant="outline" className="text-xs">
            Score: {impactScope.impactScore}/100
          </Badge>
        </div>
        <div className="flex items-center gap-4 text-sm text-[var(--status-muted-text)]">
          <span>
            {impactScope.affectedMonitorCount} of {impactScope.totalMonitorCount} services affected
          </span>
          <span>{impactScope.impactPercentage}% impact</span>
          {impactScope.affectedRegions.length > 0 && (
            <span>{impactScope.affectedRegions.length} regions</span>
          )}
        </div>
        <Progress
          value={impactScope.impactScore}
          className="h-2 mt-2"
        />
      </div>
    </div>
  );
}

function RegionsSection({ impactScope }: { impactScope: ImpactScopeData }) {
  const [isOpen, setIsOpen] = useState(false);

  if (impactScope.affectedRegions.length === 0) {
    return null;
  }

  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen}>
      <CollapsibleTrigger asChild>
        <Button variant="ghost" className="w-full justify-between p-4 h-auto">
          <div className="flex items-center gap-2">
            <Globe className="h-4 w-4" />
            <span className="font-medium">
              Affected Regions ({impactScope.affectedRegions.length})
            </span>
          </div>
          {isOpen ? (
            <ChevronUp className="h-4 w-4" />
          ) : (
            <ChevronDown className="h-4 w-4" />
          )}
        </Button>
      </CollapsibleTrigger>
      <CollapsibleContent className="px-4 pb-4">
        <div className="grid gap-3">
          {impactScope.affectedRegions.map((regionData) => (
            <div
              key={regionData.region}
              className="p-3 rounded-lg border bg-[var(--status-muted)]/50"
            >
              <div className="flex items-center justify-between mb-2">
                <span className="font-medium">{regionData.region}</span>
                <Badge variant="secondary">
                  {regionData.affectedMonitors.length} service
                  {regionData.affectedMonitors.length !== 1 ? "s" : ""}
                </Badge>
              </div>
              <div className="flex flex-wrap gap-2">
                {regionData.affectedMonitors.map((monitor) => (
                  <Badge
                    key={monitor.id}
                    variant={
                      monitor.status === "active"
                        ? "success"
                        : monitor.status === "down"
                        ? "destructive"
                        : "secondary"
                    }
                    className="text-xs"
                  >
                    {monitor.name}
                  </Badge>
                ))}
              </div>
            </div>
          ))}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}

function DependenciesSection({ impactScope }: { impactScope: ImpactScopeData }) {
  const [isOpen, setIsOpen] = useState(false);
  const hasUpstream = impactScope.dependencies.upstream.length > 0;
  const hasDownstream = impactScope.dependencies.downstream.length > 0;

  if (!hasUpstream && !hasDownstream) {
    return null;
  }

  const totalDeps =
    impactScope.dependencies.upstream.length +
    impactScope.dependencies.downstream.length;

  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen}>
      <CollapsibleTrigger asChild>
        <Button variant="ghost" className="w-full justify-between p-4 h-auto">
          <div className="flex items-center gap-2">
            <GitBranch className="h-4 w-4" />
            <span className="font-medium">
              Service Dependencies ({totalDeps})
            </span>
          </div>
          {isOpen ? (
            <ChevronUp className="h-4 w-4" />
          ) : (
            <ChevronDown className="h-4 w-4" />
          )}
        </Button>
      </CollapsibleTrigger>
      <CollapsibleContent className="px-4 pb-4">
        <div className="space-y-4">
          {/* Upstream Dependencies */}
          {hasUpstream && (
            <div>
              <div className="flex items-center gap-2 mb-2 text-sm text-[var(--status-muted-text)]">
                <ArrowUp className="h-3 w-3" />
                <span>Dependencies (services these rely on)</span>
              </div>
              <div className="grid gap-2">
                {impactScope.dependencies.upstream.map((dep) => (
                  <div
                    key={dep.monitorId}
                    className="flex items-center justify-between p-2 rounded-lg border bg-[var(--status-muted)]/50"
                  >
                    <div className="flex items-center gap-2">
                      <Badge
                        variant={
                          dep.status === "active"
                            ? "success"
                            : dep.status === "down"
                            ? "destructive"
                            : "secondary"
                        }
                        className="h-2 w-2 p-0 rounded-full"
                      />
                      <span className="font-medium text-sm">
                        {dep.monitorName}
                      </span>
                    </div>
                    {dep.description && (
                      <span className="text-xs text-[var(--status-muted-text)]">
                        {dep.description}
                      </span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Downstream Dependencies */}
          {hasDownstream && (
            <div>
              <div className="flex items-center gap-2 mb-2 text-sm text-[var(--status-muted-text)]">
                <ArrowDown className="h-3 w-3" />
                <span>Dependents (services that may be affected)</span>
              </div>
              <div className="grid gap-2">
                {impactScope.dependencies.downstream.map((dep) => (
                  <div
                    key={dep.monitorId}
                    className="flex items-center justify-between p-2 rounded-lg border bg-[var(--status-muted)]/50"
                  >
                    <div className="flex items-center gap-2">
                      <Badge
                        variant={
                          dep.status === "active"
                            ? "success"
                            : dep.status === "down"
                            ? "destructive"
                            : "secondary"
                        }
                        className="h-2 w-2 p-0 rounded-full"
                      />
                      <span className="font-medium text-sm">
                        {dep.monitorName}
                      </span>
                    </div>
                    {dep.description && (
                      <span className="text-xs text-[var(--status-muted-text)]">
                        {dep.description}
                      </span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}

export function ImpactScopeView({
  impactScope,
  variant = "both",
  className,
}: ImpactScopeViewProps) {
  const showSummary = variant === "summary" || variant === "both";
  const showDetailed = variant === "detailed" || variant === "both";

  if (impactScope.impactScore === 0 && variant === "summary") {
    return null;
  }

  return (
    <div className={cn("space-y-2", className)}>
      {showSummary && <ImpactSummary impactScope={impactScope} />}

      {showDetailed && (
        <Card>
          <CardContent className="p-0 divide-y">
            <RegionsSection impactScope={impactScope} />
            <DependenciesSection impactScope={impactScope} />
            {impactScope.affectedRegions.length === 0 &&
              impactScope.dependencies.upstream.length === 0 &&
              impactScope.dependencies.downstream.length === 0 && (
                <div className="p-4 text-center text-sm text-[var(--status-muted-text)]">
                  No regional or dependency information available
                </div>
              )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// Compact inline version for event cards
export function ImpactScopeBadge({
  impactScope,
  className,
}: {
  impactScope: ImpactScopeData;
  className?: string;
}) {
  const levelConfig = impactLevelConfig[impactScope.impactLevel];
  const Icon = levelConfig.icon;

  return (
    <Badge variant="outline" className={cn("gap-1", levelConfig.bgColor, className)}>
      <Icon className={cn("h-3 w-3", levelConfig.color)} />
      <span className={levelConfig.color}>{levelConfig.label}</span>
      <span className="text-[var(--status-muted-text)]">
        ({impactScope.impactPercentage}% affected)
      </span>
    </Badge>
  );
}
