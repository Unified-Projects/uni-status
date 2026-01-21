"use client";

import { useState } from "react";
import {
  Button,
  Popover,
  PopoverContent,
  PopoverTrigger,
  cn,
  Checkbox,
  Label,
  Badge,
} from "@uni-status/ui";
import { Filter, X, ChevronDown } from "lucide-react";

export interface PublicEventFiltersState {
  severity: string[];
  monitors: string[];
  regions: string[];
}

export interface PublicEventFiltersProps {
  filters: PublicEventFiltersState;
  onFiltersChange: (filters: PublicEventFiltersState) => void;
  availableMonitors: Array<{ id: string; name: string }>;
  availableRegions: string[];
  className?: string;
}

const SEVERITY_OPTIONS = [
  { value: "critical", label: "Critical", color: "bg-status-error-solid" },
  { value: "major", label: "Major", color: "bg-status-orange-solid" },
  { value: "minor", label: "Minor", color: "bg-status-warning-solid" },
  { value: "maintenance", label: "Maintenance", color: "bg-status-purple-solid" },
];

const REGION_LABELS: Record<string, string> = {
  uk: "UK",
  us: "US",
  eu: "EU",
  "us-east": "US East",
  "us-west": "US West",
  "eu-west": "EU West",
  "eu-central": "EU Central",
  "ap-south": "Asia Pacific South",
  "ap-southeast": "Asia Pacific Southeast",
  "ap-northeast": "Asia Pacific Northeast",
};

export function PublicEventFilters({
  filters,
  onFiltersChange,
  availableMonitors,
  availableRegions,
  className,
}: PublicEventFiltersProps) {
  const [isOpen, setIsOpen] = useState(false);

  const activeFilterCount =
    filters.severity.length + filters.monitors.length + filters.regions.length;

  const hasActiveFilters = activeFilterCount > 0;

  const clearFilters = () => {
    onFiltersChange({ severity: [], monitors: [], regions: [] });
  };

  const toggleSeverity = (value: string) => {
    const updated = filters.severity.includes(value)
      ? filters.severity.filter((s) => s !== value)
      : [...filters.severity, value];
    onFiltersChange({ ...filters, severity: updated });
  };

  const toggleMonitor = (id: string) => {
    const updated = filters.monitors.includes(id)
      ? filters.monitors.filter((m) => m !== id)
      : [...filters.monitors, id];
    onFiltersChange({ ...filters, monitors: updated });
  };

  const toggleRegion = (region: string) => {
    const updated = filters.regions.includes(region)
      ? filters.regions.filter((r) => r !== region)
      : [...filters.regions, region];
    onFiltersChange({ ...filters, regions: updated });
  };

  const getRegionLabel = (region: string) => {
    return REGION_LABELS[region] || region.toUpperCase();
  };

  return (
    <div className={cn("flex flex-col gap-2", className)}>
      <div className="flex items-center gap-2">
        <Popover open={isOpen} onOpenChange={setIsOpen}>
          <PopoverTrigger asChild>
            <Button variant="outline" className="gap-2">
              <Filter className="h-4 w-4" />
              Filters
              {hasActiveFilters && (
                <Badge variant="secondary" className="h-5 px-1.5 text-xs">
                  {activeFilterCount}
                </Badge>
              )}
              <ChevronDown className="h-4 w-4 opacity-50" />
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-80" align="start">
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h4 className="font-medium">Filter Events</h4>
                {hasActiveFilters && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={clearFilters}
                    className="h-auto p-1 text-xs text-[var(--status-muted-text)] hover:text-[var(--status-text)]"
                  >
                    Clear all
                  </Button>
                )}
              </div>

              {/* Severity Filter */}
              <div className="space-y-2">
                <Label className="text-sm font-medium">Severity</Label>
                <div className="grid grid-cols-2 gap-2">
                  {SEVERITY_OPTIONS.map((option) => (
                    <label
                      key={option.value}
                      className={cn(
                        "flex items-center gap-2 rounded-md border p-2 cursor-pointer transition-colors",
                        filters.severity.includes(option.value)
                          ? "border-primary bg-primary/5"
                          : "border-[var(--status-border)] hover:bg-[var(--status-muted)]/50"
                      )}
                    >
                      <Checkbox
                        checked={filters.severity.includes(option.value)}
                        onCheckedChange={() => toggleSeverity(option.value)}
                      />
                      <span
                        className={cn(
                          "h-2 w-2 rounded-full",
                          option.color
                        )}
                      />
                      <span className="text-sm">{option.label}</span>
                    </label>
                  ))}
                </div>
              </div>

              {/* Components/Monitors Filter */}
              {availableMonitors.length > 0 && (
                <div className="space-y-2">
                  <Label className="text-sm font-medium">Components</Label>
                  <div className="max-h-32 overflow-y-auto space-y-1">
                    {availableMonitors.map((monitor) => (
                      <label
                        key={monitor.id}
                        className={cn(
                          "flex items-center gap-2 rounded-md border p-2 cursor-pointer transition-colors",
                          filters.monitors.includes(monitor.id)
                            ? "border-primary bg-primary/5"
                            : "border-[var(--status-border)] hover:bg-[var(--status-muted)]/50"
                        )}
                      >
                        <Checkbox
                          checked={filters.monitors.includes(monitor.id)}
                          onCheckedChange={() => toggleMonitor(monitor.id)}
                        />
                        <span className="text-sm truncate">{monitor.name}</span>
                      </label>
                    ))}
                  </div>
                </div>
              )}

              {/* Regions Filter */}
              {availableRegions.length > 0 && (
                <div className="space-y-2">
                  <Label className="text-sm font-medium">Regions</Label>
                  <div className="flex flex-wrap gap-2">
                    {availableRegions.map((region) => (
                      <Button
                        key={region}
                        variant={
                          filters.regions.includes(region)
                            ? "default"
                            : "outline"
                        }
                        size="sm"
                        onClick={() => toggleRegion(region)}
                        className="h-7 text-xs"
                      >
                        {getRegionLabel(region)}
                      </Button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </PopoverContent>
        </Popover>
      </div>

      {/* Active Filters Display */}
      {hasActiveFilters && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm text-[var(--status-muted-text)]">Active:</span>
          {filters.severity.map((severity) => {
            const option = SEVERITY_OPTIONS.find((o) => o.value === severity);
            return (
              <Button
                key={`severity-${severity}`}
                variant="secondary"
                size="sm"
                onClick={() => toggleSeverity(severity)}
                className="gap-1 h-7 text-xs"
              >
                <span
                  className={cn("h-2 w-2 rounded-full", option?.color || "bg-status-gray-solid")}
                />
                {option?.label || severity}
                <X className="h-3 w-3" />
              </Button>
            );
          })}
          {filters.monitors.map((monitorId) => {
            const monitor = availableMonitors.find((m) => m.id === monitorId);
            return (
              <Button
                key={`monitor-${monitorId}`}
                variant="secondary"
                size="sm"
                onClick={() => toggleMonitor(monitorId)}
                className="gap-1 h-7 text-xs"
              >
                {monitor?.name || monitorId}
                <X className="h-3 w-3" />
              </Button>
            );
          })}
          {filters.regions.map((region) => (
            <Button
              key={`region-${region}`}
              variant="secondary"
              size="sm"
              onClick={() => toggleRegion(region)}
              className="gap-1 h-7 text-xs"
            >
              {getRegionLabel(region)}
              <X className="h-3 w-3" />
            </Button>
          ))}
          <Button
            variant="ghost"
            size="sm"
            onClick={clearFilters}
            className="h-7 text-xs text-[var(--status-muted-text)]"
          >
            Clear all
          </Button>
        </div>
      )}
    </div>
  );
}
