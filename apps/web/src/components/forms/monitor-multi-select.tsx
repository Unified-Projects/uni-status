"use client";

import { useState, useMemo } from "react";
import {
  Button,
  Checkbox,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  cn,
} from "@uni-status/ui";
import { useMonitors } from "@/hooks/use-monitors";
import { Search, Check, Plus } from "lucide-react";
import type { Monitor } from "@/lib/api-client";

interface MonitorMultiSelectProps {
  selectedIds: string[];
  onSelectionChange: (ids: string[]) => void;
  excludeIds?: string[];
  title?: string;
  description?: string;
  trigger?: React.ReactNode;
}

export function MonitorMultiSelect({
  selectedIds,
  onSelectionChange,
  excludeIds = [],
  title = "Select Monitors",
  description = "Select one or more monitors",
  trigger,
}: MonitorMultiSelectProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [tempSelectedIds, setTempSelectedIds] = useState<string[]>(selectedIds);
  const { data: monitorsResponse, isLoading } = useMonitors();
  const monitors = monitorsResponse?.data;

  // Filter monitors based on search and exclusions
  const filteredMonitors = useMemo(() => {
    if (!monitors) return [];
    return monitors.filter((m) => {
      // Exclude specific monitors
      if (excludeIds.includes(m.id)) return false;
      // Filter by search
      if (search) {
        const searchLower = search.toLowerCase();
        return (
          m.name.toLowerCase().includes(searchLower) ||
          m.url.toLowerCase().includes(searchLower)
        );
      }
      return true;
    });
  }, [monitors, excludeIds, search]);

  const toggleMonitor = (monitorId: string) => {
    setTempSelectedIds((current) =>
      current.includes(monitorId)
        ? current.filter((id) => id !== monitorId)
        : [...current, monitorId]
    );
  };

  const handleOpen = () => {
    setTempSelectedIds(selectedIds);
    setSearch("");
    setOpen(true);
  };

  const handleConfirm = () => {
    onSelectionChange(tempSelectedIds);
    setOpen(false);
  };

  const handleCancel = () => {
    setTempSelectedIds(selectedIds);
    setOpen(false);
  };

  const getStatusColor = (status: Monitor["status"]) => {
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

  return (
    <>
      <div onClick={(e) => { e.preventDefault(); e.stopPropagation(); handleOpen(); }}>
        {trigger || (
          <Button variant="outline" type="button" className="gap-2">
            <Plus className="h-4 w-4" />
            Add Dependencies
          </Button>
        )}
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg max-h-[80vh] flex flex-col">
          <DialogHeader>
            <DialogTitle>{title}</DialogTitle>
            <DialogDescription>{description}</DialogDescription>
          </DialogHeader>

          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search monitors..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>

          <div className="flex-1 overflow-y-auto min-h-[200px] max-h-[400px] space-y-2 py-2">
            {isLoading ? (
              <div className="text-sm text-muted-foreground text-center py-8">
                Loading monitors...
              </div>
            ) : filteredMonitors.length === 0 ? (
              <div className="text-sm text-muted-foreground text-center py-8">
                {search ? "No monitors match your search" : "No monitors available"}
              </div>
            ) : (
              filteredMonitors.map((monitor) => (
                <label
                  key={monitor.id}
                  className={cn(
                    "flex items-center gap-3 p-3 border rounded-lg cursor-pointer transition-colors",
                    tempSelectedIds.includes(monitor.id)
                      ? "border-primary bg-primary/5"
                      : "hover:bg-muted/50"
                  )}
                >
                  <Checkbox
                    checked={tempSelectedIds.includes(monitor.id)}
                    onCheckedChange={() => toggleMonitor(monitor.id)}
                  />
                  <div className="flex-1 min-w-0">
                    <div className="font-medium truncate">{monitor.name}</div>
                    <div className="text-sm text-muted-foreground truncate">
                      {monitor.url}
                    </div>
                  </div>
                  <span
                    className={cn(
                      "text-xs px-2 py-0.5 rounded capitalize",
                      getStatusColor(monitor.status)
                    )}
                  >
                    {monitor.status}
                  </span>
                </label>
              ))
            )}
          </div>

          <DialogFooter className="gap-2 sm:gap-0">
            <div className="text-sm text-muted-foreground mr-auto">
              {tempSelectedIds.length} selected
            </div>
            <Button variant="outline" type="button" onClick={handleCancel}>
              Cancel
            </Button>
            <Button type="button" onClick={handleConfirm}>
              <Check className="h-4 w-4 mr-2" />
              Confirm
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

interface MonitorSingleSelectProps {
  selectedId: string | null;
  onSelect: (id: string) => void;
  excludeIds?: string[];
  title?: string;
  description?: string;
  trigger?: React.ReactNode;
}

export function MonitorSingleSelect({
  selectedId,
  onSelect,
  excludeIds = [],
  title = "Select Monitor",
  description = "Select a monitor",
  trigger,
}: MonitorSingleSelectProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const { data: monitorsResponse, isLoading } = useMonitors();
  const monitors = monitorsResponse?.data;

  const filteredMonitors = useMemo(() => {
    if (!monitors) return [];
    return monitors.filter((m) => {
      if (excludeIds.includes(m.id)) return false;
      if (search) {
        const searchLower = search.toLowerCase();
        return (
          m.name.toLowerCase().includes(searchLower) ||
          m.url.toLowerCase().includes(searchLower)
        );
      }
      return true;
    });
  }, [monitors, excludeIds, search]);

  const handleSelect = (monitorId: string) => {
    onSelect(monitorId);
    setOpen(false);
    setSearch("");
  };

  const getStatusColor = (status: Monitor["status"]) => {
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

  return (
    <>
      <div onClick={(e) => { e.preventDefault(); e.stopPropagation(); setSearch(""); setOpen(true); }}>
        {trigger || (
          <Button variant="outline" type="button" className="gap-2">
            <Plus className="h-4 w-4" />
            Select Monitor
          </Button>
        )}
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg max-h-[80vh] flex flex-col">
          <DialogHeader>
            <DialogTitle>{title}</DialogTitle>
            <DialogDescription>{description}</DialogDescription>
          </DialogHeader>

          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search monitors..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>

          <div className="flex-1 overflow-y-auto min-h-[200px] max-h-[400px] space-y-2 py-2">
            {isLoading ? (
              <div className="text-sm text-muted-foreground text-center py-8">
                Loading monitors...
              </div>
            ) : filteredMonitors.length === 0 ? (
              <div className="text-sm text-muted-foreground text-center py-8">
                {search ? "No monitors match your search" : "No monitors available"}
              </div>
            ) : (
              filteredMonitors.map((monitor) => (
                <button
                  key={monitor.id}
                  type="button"
                  onClick={() => handleSelect(monitor.id)}
                  className={cn(
                    "flex items-center gap-3 p-3 border rounded-lg cursor-pointer transition-colors w-full text-left",
                    selectedId === monitor.id
                      ? "border-primary bg-primary/5"
                      : "hover:bg-muted/50"
                  )}
                >
                  <div className="flex-1 min-w-0">
                    <div className="font-medium truncate">{monitor.name}</div>
                    <div className="text-sm text-muted-foreground truncate">
                      {monitor.url}
                    </div>
                  </div>
                  <span
                    className={cn(
                      "text-xs px-2 py-0.5 rounded capitalize",
                      getStatusColor(monitor.status)
                    )}
                  >
                    {monitor.status}
                  </span>
                </button>
              ))
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" type="button" onClick={() => setOpen(false)}>
              Cancel
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
