"use client";

import { useState } from "react";
import {
  Button,
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Popover,
  PopoverContent,
  PopoverTrigger,
  Calendar,
  cn,
} from "@uni-status/ui";
import {
  Search,
  Filter,
  X,
  Calendar as CalendarIcon,
  Download,
} from "lucide-react";
import { EventTypeBadge, EventSeverityBadge, EventStatusBadge } from "./event-badges";
import type { EventType, EventFilters as EventFiltersType, IncidentSeverity, IncidentStatus, MaintenanceStatus } from "@uni-status/shared";

export interface EventFiltersProps {
  filters: EventFiltersType;
  onFiltersChange: (filters: EventFiltersType) => void;
  monitors?: Array<{ id: string; name: string }>;
  showExport?: boolean;
  onExport?: (format: "ics" | "json") => void;
  className?: string;
}

export function EventFilters({
  filters,
  onFiltersChange,
  monitors = [],
  showExport = false,
  onExport,
  className,
}: EventFiltersProps) {
  const [isFiltersOpen, setIsFiltersOpen] = useState(false);
  const [startDateOpen, setStartDateOpen] = useState(false);
  const [endDateOpen, setEndDateOpen] = useState(false);

  const hasActiveFilters =
    (filters.types && filters.types.length > 0) ||
    (filters.status && filters.status.length > 0) ||
    (filters.severity && filters.severity.length > 0) ||
    (filters.monitors && filters.monitors.length > 0) ||
    filters.search ||
    filters.startDate ||
    filters.endDate;

  const clearFilters = () => {
    onFiltersChange({});
  };

  const updateFilter = <K extends keyof EventFiltersType>(
    key: K,
    value: EventFiltersType[K]
  ) => {
    onFiltersChange({ ...filters, [key]: value });
  };

  const toggleArrayFilter = <K extends keyof EventFiltersType>(
    key: K,
    value: string
  ) => {
    const current = (filters[key] as string[]) || [];
    const updated = current.includes(value)
      ? current.filter((v) => v !== value)
      : [...current, value];
    updateFilter(key, updated.length > 0 ? (updated as EventFiltersType[K]) : undefined);
  };

  return (
    <div className={cn("space-y-4", className)}>
      {/* Search bar */}
      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search events..."
            value={filters.search || ""}
            onChange={(e) => updateFilter("search", e.target.value || undefined)}
            className="pl-9"
          />
        </div>
        <Popover open={isFiltersOpen} onOpenChange={setIsFiltersOpen}>
          <PopoverTrigger asChild>
            <Button variant="outline" className="gap-2">
              <Filter className="h-4 w-4" />
              Filters
              {hasActiveFilters && (
                <span className="ml-1 h-5 w-5 rounded-full bg-primary text-primary-foreground text-xs flex items-center justify-center">
                  !
                </span>
              )}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-80" align="end">
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h4 className="font-medium">Filters</h4>
                {hasActiveFilters && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={clearFilters}
                    className="h-auto p-1 text-xs"
                  >
                    Clear all
                  </Button>
                )}
              </div>

              {/* Event Type */}
              <div className="space-y-2">
                <label className="text-sm font-medium">Event Type</label>
                <div className="flex flex-wrap gap-2">
                  {(["incident", "maintenance"] as EventType[]).map((type) => (
                    <Button
                      key={type}
                      variant={filters.types?.includes(type) ? "default" : "outline"}
                      size="sm"
                      onClick={() => toggleArrayFilter("types", type)}
                    >
                      <EventTypeBadge type={type} showIcon={false} size="sm" className="bg-transparent border-0 p-0" />
                    </Button>
                  ))}
                </div>
              </div>

              {/* Severity */}
              <div className="space-y-2">
                <label className="text-sm font-medium">Severity</label>
                <div className="flex flex-wrap gap-2">
                  {(["minor", "major", "critical", "maintenance"] as Array<IncidentSeverity | "maintenance">).map((severity) => (
                    <Button
                      key={severity}
                      variant={filters.severity?.includes(severity) ? "default" : "outline"}
                      size="sm"
                      onClick={() => toggleArrayFilter("severity", severity)}
                      className={filters.severity?.includes(severity) ? "" : "text-foreground"}
                    >
                      {severity.charAt(0).toUpperCase() + severity.slice(1)}
                    </Button>
                  ))}
                </div>
              </div>

              {/* Status */}
              <div className="space-y-2">
                <label className="text-sm font-medium">Status</label>
                <div className="flex flex-wrap gap-2">
                  {[
                    "investigating",
                    "identified",
                    "monitoring",
                    "resolved",
                    "scheduled",
                    "active",
                    "completed",
                  ].map((status) => (
                    <Button
                      key={status}
                      variant={filters.status?.includes(status) ? "default" : "outline"}
                      size="sm"
                      onClick={() => toggleArrayFilter("status", status)}
                      className={filters.status?.includes(status) ? "" : "text-foreground"}
                    >
                      {status.charAt(0).toUpperCase() + status.slice(1)}
                    </Button>
                  ))}
                </div>
              </div>

              {/* Monitors */}
              {monitors.length > 0 && (
                <div className="space-y-2">
                  <label className="text-sm font-medium">Affected Monitors</label>
                  <Select
                    value={filters.monitors?.[0] || ""}
                    onValueChange={(value) => {
                      if (value) {
                        toggleArrayFilter("monitors", value);
                      }
                    }}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select monitor..." />
                    </SelectTrigger>
                    <SelectContent>
                      {monitors.map((monitor) => (
                        <SelectItem key={monitor.id} value={monitor.id}>
                          {monitor.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {filters.monitors && filters.monitors.length > 0 && (
                    <div className="flex flex-wrap gap-1">
                      {filters.monitors.map((monitorId) => {
                        const monitor = monitors.find((m) => m.id === monitorId);
                        return (
                          <span
                            key={monitorId}
                            className="inline-flex items-center gap-1 text-xs bg-muted px-2 py-1 rounded"
                          >
                            {monitor?.name || monitorId}
                            <button
                              onClick={() => toggleArrayFilter("monitors", monitorId)}
                              className="hover:text-destructive"
                            >
                              <X className="h-3 w-3" />
                            </button>
                          </span>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}

              {/* Date Range */}
              <div className="space-y-2">
                <label className="text-sm font-medium">Date Range</label>
                <div className="grid grid-cols-2 gap-2">
                  <Popover open={startDateOpen} onOpenChange={setStartDateOpen}>
                    <PopoverTrigger asChild>
                      <Button variant="outline" className="justify-start text-left font-normal">
                        <CalendarIcon className="mr-2 h-4 w-4" />
                        {filters.startDate
                          ? new Date(filters.startDate).toLocaleDateString()
                          : "Start date"}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="start">
                      <Calendar
                        mode="single"
                        selected={filters.startDate ? new Date(filters.startDate) : undefined}
                        onSelect={(date) => {
                          updateFilter("startDate", date?.toISOString());
                          setStartDateOpen(false);
                        }}
                        initialFocus
                      />
                    </PopoverContent>
                  </Popover>
                  <Popover open={endDateOpen} onOpenChange={setEndDateOpen}>
                    <PopoverTrigger asChild>
                      <Button variant="outline" className="justify-start text-left font-normal">
                        <CalendarIcon className="mr-2 h-4 w-4" />
                        {filters.endDate
                          ? new Date(filters.endDate).toLocaleDateString()
                          : "End date"}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="start">
                      <Calendar
                        mode="single"
                        selected={filters.endDate ? new Date(filters.endDate) : undefined}
                        onSelect={(date) => {
                          updateFilter("endDate", date?.toISOString());
                          setEndDateOpen(false);
                        }}
                        initialFocus
                      />
                    </PopoverContent>
                  </Popover>
                </div>
              </div>
            </div>
          </PopoverContent>
        </Popover>

        {showExport && onExport && (
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" className="gap-2">
                <Download className="h-4 w-4" />
                Export
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-40" align="end">
              <div className="space-y-1">
                <Button
                  variant="ghost"
                  className="w-full justify-start"
                  onClick={() => onExport("ics")}
                >
                  Calendar (.ics)
                </Button>
                <Button
                  variant="ghost"
                  className="w-full justify-start"
                  onClick={() => onExport("json")}
                >
                  JSON
                </Button>
              </div>
            </PopoverContent>
          </Popover>
        )}
      </div>

      {/* Active filters display */}
      {hasActiveFilters && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm text-muted-foreground">Active filters:</span>
          {filters.types?.map((type) => (
            <Button
              key={`type-${type}`}
              variant="secondary"
              size="sm"
              onClick={() => toggleArrayFilter("types", type)}
              className="gap-1 h-7"
            >
              {type}
              <X className="h-3 w-3" />
            </Button>
          ))}
          {filters.severity?.map((severity) => (
            <Button
              key={`severity-${severity}`}
              variant="secondary"
              size="sm"
              onClick={() => toggleArrayFilter("severity", severity)}
              className="gap-1 h-7"
            >
              {severity}
              <X className="h-3 w-3" />
            </Button>
          ))}
          {filters.status?.map((status) => (
            <Button
              key={`status-${status}`}
              variant="secondary"
              size="sm"
              onClick={() => toggleArrayFilter("status", status)}
              className="gap-1 h-7"
            >
              {status}
              <X className="h-3 w-3" />
            </Button>
          ))}
          {filters.startDate && (
            <Button
              variant="secondary"
              size="sm"
              onClick={() => updateFilter("startDate", undefined)}
              className="gap-1 h-7"
            >
              From: {new Date(filters.startDate).toLocaleDateString()}
              <X className="h-3 w-3" />
            </Button>
          )}
          {filters.endDate && (
            <Button
              variant="secondary"
              size="sm"
              onClick={() => updateFilter("endDate", undefined)}
              className="gap-1 h-7"
            >
              To: {new Date(filters.endDate).toLocaleDateString()}
              <X className="h-3 w-3" />
            </Button>
          )}
          <Button
            variant="ghost"
            size="sm"
            onClick={clearFilters}
            className="h-7 text-muted-foreground"
          >
            Clear all
          </Button>
        </div>
      )}
    </div>
  );
}

// Quick filter tabs for common views
export interface EventQuickFiltersProps {
  activeView: "all" | "active" | "resolved" | "incidents" | "maintenance";
  onViewChange: (view: "all" | "active" | "resolved" | "incidents" | "maintenance") => void;
  className?: string;
}

export function EventQuickFilters({
  activeView,
  onViewChange,
  className,
}: EventQuickFiltersProps) {
  const views = [
    { id: "all" as const, label: "All Events" },
    { id: "active" as const, label: "Active" },
    { id: "resolved" as const, label: "Resolved" },
    { id: "incidents" as const, label: "Incidents" },
    { id: "maintenance" as const, label: "Maintenance" },
  ];

  return (
    <div className={cn("flex items-center gap-1 p-1 bg-muted rounded-lg", className)}>
      {views.map((view) => (
        <Button
          key={view.id}
          variant={activeView === view.id ? "default" : "ghost"}
          size="sm"
          onClick={() => onViewChange(view.id)}
          className={cn(
            "flex-1",
            activeView !== view.id && "hover:bg-background/50"
          )}
        >
          {view.label}
        </Button>
      ))}
    </div>
  );
}
