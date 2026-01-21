"use client";

import { useState } from "react";
import { Filter, X, ChevronDown, Calendar } from "lucide-react";
import {
  Button,
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  cn,
} from "@uni-status/ui";
import type {
  AuditAction,
  ResourceType,
  AuditLogsListParams,
  AuditActionCount,
  AuditUserCount,
} from "@/lib/api-client";

export interface AuditFiltersProps {
  filters: AuditLogsListParams;
  onFiltersChange: (filters: AuditLogsListParams) => void;
  actionCounts?: AuditActionCount[];
  userCounts?: AuditUserCount[];
  className?: string;
}

const actionOptions: Array<{ value: AuditAction; label: string; group: string }> = [
  // Auth
  { value: "user.login", label: "Login", group: "Authentication" },
  { value: "user.logout", label: "Logout", group: "Authentication" },
  { value: "user.password_change", label: "Password Change", group: "Authentication" },
  { value: "user.mfa_enable", label: "MFA Enable", group: "Authentication" },
  { value: "user.mfa_disable", label: "MFA Disable", group: "Authentication" },
  // Organisation
  { value: "organization.create", label: "Create Org", group: "Organisation" },
  { value: "organization.update", label: "Update Org", group: "Organisation" },
  { value: "organization.delete", label: "Delete Org", group: "Organisation" },
  { value: "organization.member_invite", label: "Invite Member", group: "Organisation" },
  { value: "organization.member_remove", label: "Remove Member", group: "Organisation" },
  { value: "organization.member_role_change", label: "Change Role", group: "Organisation" },
  // Monitor
  { value: "monitor.create", label: "Create Monitor", group: "Monitor" },
  { value: "monitor.update", label: "Update Monitor", group: "Monitor" },
  { value: "monitor.delete", label: "Delete Monitor", group: "Monitor" },
  { value: "monitor.pause", label: "Pause Monitor", group: "Monitor" },
  { value: "monitor.resume", label: "Resume Monitor", group: "Monitor" },
  // Incident
  { value: "incident.create", label: "Create Incident", group: "Incident" },
  { value: "incident.update", label: "Update Incident", group: "Incident" },
  { value: "incident.resolve", label: "Resolve Incident", group: "Incident" },
  // Status Page
  { value: "status_page.create", label: "Create Page", group: "Status Page" },
  { value: "status_page.update", label: "Update Page", group: "Status Page" },
  { value: "status_page.delete", label: "Delete Page", group: "Status Page" },
  { value: "status_page.publish", label: "Publish Page", group: "Status Page" },
  { value: "status_page.unpublish", label: "Unpublish Page", group: "Status Page" },
  // Alert
  { value: "alert_channel.create", label: "Create Channel", group: "Alert" },
  { value: "alert_channel.update", label: "Update Channel", group: "Alert" },
  { value: "alert_channel.delete", label: "Delete Channel", group: "Alert" },
  { value: "alert_policy.create", label: "Create Policy", group: "Alert" },
  { value: "alert_policy.update", label: "Update Policy", group: "Alert" },
  { value: "alert_policy.delete", label: "Delete Policy", group: "Alert" },
  // API Key
  { value: "api_key.create", label: "Create API Key", group: "API Key" },
  { value: "api_key.delete", label: "Delete API Key", group: "API Key" },
  { value: "api_key.use", label: "Use API Key", group: "API Key" },
  // Settings
  { value: "settings.update", label: "Update Settings", group: "Settings" },
];

const resourceTypeOptions: Array<{ value: ResourceType; label: string }> = [
  { value: "user", label: "User" },
  { value: "organization", label: "Organisation" },
  { value: "monitor", label: "Monitor" },
  { value: "incident", label: "Incident" },
  { value: "status_page", label: "Status Page" },
  { value: "alert_channel", label: "Alert Channel" },
  { value: "alert_policy", label: "Alert Policy" },
  { value: "api_key", label: "API Key" },
  { value: "maintenance_window", label: "Maintenance Window" },
  { value: "subscriber", label: "Subscriber" },
];

export function AuditFilters({
  filters,
  onFiltersChange,
  actionCounts,
  userCounts,
  className,
}: AuditFiltersProps) {
  const [expanded, setExpanded] = useState(false);

  const hasFilters = !!(
    filters.action ||
    filters.userId ||
    filters.resourceType ||
    filters.from ||
    filters.to
  );

  const clearFilters = () => {
    onFiltersChange({});
  };

  return (
    <div className={cn("space-y-3", className)}>
      {/* Toggle Button */}
      <div className="flex items-center gap-2">
        <Button
          variant="outline"
          size="sm"
          onClick={() => setExpanded(!expanded)}
          className={cn(hasFilters && "border-primary")}
        >
          <Filter className="h-4 w-4 mr-2" />
          Filters
          {hasFilters && (
            <span className="ml-2 rounded-full bg-primary text-primary-foreground text-xs px-1.5">
              {[filters.action, filters.userId, filters.resourceType, filters.from, filters.to].filter(Boolean).length}
            </span>
          )}
          <ChevronDown
            className={cn(
              "h-4 w-4 ml-2 transition-transform",
              expanded && "rotate-180"
            )}
          />
        </Button>
        {hasFilters && (
          <Button variant="ghost" size="sm" onClick={clearFilters}>
            <X className="h-4 w-4 mr-1" />
            Clear
          </Button>
        )}
      </div>

      {/* Filter Controls */}
      {expanded && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 p-4 border rounded-lg bg-muted/30">
          {/* Action Filter */}
          <div className="space-y-1.5">
            <label className="text-sm font-medium">Action</label>
            <Select
              value={filters.action || "__all__"}
              onValueChange={(value) =>
                onFiltersChange({
                  ...filters,
                  action: value === "__all__" ? undefined : value as AuditAction,
                })
              }
            >
              <SelectTrigger>
                <SelectValue placeholder="All actions" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">All actions</SelectItem>
                {actionOptions.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                    {actionCounts && (
                      <span className="ml-2 text-muted-foreground">
                        ({actionCounts.find((c) => c.action === option.value)?.count || 0})
                      </span>
                    )}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* User Filter */}
          <div className="space-y-1.5">
            <label className="text-sm font-medium">User</label>
            <Select
              value={filters.userId || "__all__"}
              onValueChange={(value) =>
                onFiltersChange({
                  ...filters,
                  userId: value === "__all__" ? undefined : value,
                })
              }
            >
              <SelectTrigger>
                <SelectValue placeholder="All users" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">All users</SelectItem>
                {userCounts?.map((user) => (
                  <SelectItem key={user.userId || "system"} value={user.userId || "system"}>
                    {user.name || user.email || "System"}
                    <span className="ml-2 text-muted-foreground">({user.count})</span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Resource Type Filter */}
          <div className="space-y-1.5">
            <label className="text-sm font-medium">Resource Type</label>
            <Select
              value={filters.resourceType || "__all__"}
              onValueChange={(value) =>
                onFiltersChange({
                  ...filters,
                  resourceType: value === "__all__" ? undefined : value as ResourceType,
                })
              }
            >
              <SelectTrigger>
                <SelectValue placeholder="All types" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">All types</SelectItem>
                {resourceTypeOptions.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Date Range */}
          <div className="space-y-1.5">
            <label className="text-sm font-medium">Date Range</label>
            <div className="flex gap-2">
              <Input
                type="date"
                placeholder="From"
                value={filters.from?.split("T")[0] || ""}
                onChange={(e) =>
                  onFiltersChange({
                    ...filters,
                    from: e.target.value ? `${e.target.value}T00:00:00Z` : undefined,
                  })
                }
                className="flex-1"
              />
              <Input
                type="date"
                placeholder="To"
                value={filters.to?.split("T")[0] || ""}
                onChange={(e) =>
                  onFiltersChange({
                    ...filters,
                    to: e.target.value ? `${e.target.value}T23:59:59Z` : undefined,
                  })
                }
                className="flex-1"
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
