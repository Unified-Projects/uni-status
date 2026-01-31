"use client";

import { useState, useMemo } from "react";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical, X, Activity, Pencil, FolderOpen, Plus, Check } from "lucide-react";
import {
  Button,
  Input,
  cn,
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@uni-status/ui";
import type { Monitor, StatusPageMonitor } from "@/lib/api-client";

export interface MonitorListItem {
  id: string;
  monitorId: string;
  displayName: string | null;
  order: number;
  group?: string | null;
  monitor?: Monitor;
}

export interface MonitorListProps {
  items: MonitorListItem[];
  onChange: (items: MonitorListItem[]) => void;
  onRemove: (monitorId: string) => void;
  onDisplayNameChange?: (monitorId: string, displayName: string) => void;
  onGroupChange?: (monitorId: string, group: string | null) => void;
  availableGroups?: string[];
  className?: string;
}

export function MonitorList({
  items,
  onChange,
  onRemove,
  onDisplayNameChange,
  onGroupChange,
  availableGroups = [],
  className,
}: MonitorListProps) {
  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;

    if (over && active.id !== over.id) {
      const oldIndex = items.findIndex((item) => item.id === active.id);
      const newIndex = items.findIndex((item) => item.id === over.id);

      const newItems = arrayMove(items, oldIndex, newIndex).map(
        (item, index) => ({
          ...item,
          order: index,
        })
      );

      onChange(newItems);
    }
  };

  if (items.length === 0) {
    return (
      <div className={cn("py-8 text-center border rounded-lg border-dashed", className)}>
        <Activity className="mx-auto h-8 w-8 text-muted-foreground" />
        <p className="mt-2 text-sm text-muted-foreground">
          No monitors added yet
        </p>
        <p className="mt-1 text-xs text-muted-foreground">
          Add monitors to display on your status page
        </p>
      </div>
    );
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragEnd={handleDragEnd}
    >
      <SortableContext items={items} strategy={verticalListSortingStrategy}>
        <div className={cn("space-y-2", className)}>
          {items.map((item) => (
            <SortableMonitorItem
              key={item.id}
              item={item}
              onRemove={() => onRemove(item.monitorId)}
              onDisplayNameChange={
                onDisplayNameChange
                  ? (name) => onDisplayNameChange(item.monitorId, name)
                  : undefined
              }
              onGroupChange={
                onGroupChange
                  ? (group) => onGroupChange(item.monitorId, group)
                  : undefined
              }
              availableGroups={availableGroups}
            />
          ))}
        </div>
      </SortableContext>
    </DndContext>
  );
}

interface SortableMonitorItemProps {
  item: MonitorListItem;
  onRemove: () => void;
  onDisplayNameChange?: (displayName: string) => void;
  onGroupChange?: (group: string | null) => void;
  availableGroups?: string[];
}

function SortableMonitorItem({
  item,
  onRemove,
  onDisplayNameChange,
  onGroupChange,
  availableGroups = [],
}: SortableMonitorItemProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [displayName, setDisplayName] = useState(item.displayName || "");
  const [groupPopoverOpen, setGroupPopoverOpen] = useState(false);
  const [newGroupName, setNewGroupName] = useState("");

  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: item.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  const handleSaveDisplayName = () => {
    onDisplayNameChange?.(displayName);
    setIsEditing(false);
  };

  const handleGroupSelect = (group: string | null) => {
    onGroupChange?.(group);
    setGroupPopoverOpen(false);
    setNewGroupName("");
  };

  const handleCreateGroup = () => {
    if (newGroupName.trim()) {
      onGroupChange?.(newGroupName.trim());
      setGroupPopoverOpen(false);
      setNewGroupName("");
    }
  };

  const monitorName = item.monitor?.name || "Unknown Monitor";
  const monitorUrl = item.monitor?.url || "";
  const monitorStatus = item.monitor?.status || "unknown";

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        "flex items-center gap-3 p-3 border rounded-lg bg-background",
        isDragging && "opacity-50 shadow-lg"
      )}
    >
      {/* Drag Handle */}
      <button
        {...attributes}
        {...listeners}
        className="cursor-grab active:cursor-grabbing p-1 text-muted-foreground hover:text-foreground"
      >
        <GripVertical className="h-4 w-4" />
      </button>

      {/* Status Indicator */}
      <span
        className={cn(
          "h-2.5 w-2.5 rounded-full shrink-0",
          monitorStatus === "active"
            ? "bg-[var(--status-success-solid)]"
            : monitorStatus === "degraded"
              ? "bg-[var(--status-warning-solid)]"
              : monitorStatus === "down"
                ? "bg-[var(--status-error-solid)]"
                : "bg-gray-400 dark:bg-gray-500"
        )}
      />

      {/* Monitor Info */}
      <div className="flex-1 min-w-0">
        {isEditing ? (
          <div className="flex items-center gap-2">
            <Input
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder={monitorName}
              className="h-8"
              onKeyDown={(e) => {
                if (e.key === "Enter") handleSaveDisplayName();
                if (e.key === "Escape") setIsEditing(false);
              }}
              autoFocus
            />
            <Button size="sm" onClick={handleSaveDisplayName}>
              Save
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setIsEditing(false)}
            >
              Cancel
            </Button>
          </div>
        ) : (
          <>
            <div className="flex items-center gap-2">
              <span className="font-medium truncate">
                {item.displayName || monitorName}
              </span>
              {item.displayName && (
                <span className="text-xs text-muted-foreground">
                  ({monitorName})
                </span>
              )}
            </div>
            <div className="text-sm text-muted-foreground truncate">
              {monitorUrl}
            </div>
          </>
        )}
      </div>

      {/* Group Selector */}
      {onGroupChange && !isEditing && (
        <Popover open={groupPopoverOpen} onOpenChange={setGroupPopoverOpen}>
          <PopoverTrigger asChild>
            <Button
              variant="outline"
              size="sm"
              className={cn(
                "h-8 gap-1.5 text-xs shrink-0",
                item.group ? "text-foreground" : "text-muted-foreground"
              )}
            >
              <FolderOpen className="h-3.5 w-3.5" />
              <span className="max-w-[100px] truncate">
                {item.group || "No group"}
              </span>
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-56 p-2" align="end">
            <div className="space-y-2">
              <div className="text-xs font-medium text-muted-foreground px-2">
                Assign to group
              </div>

              {/* No group option */}
              <button
                onClick={() => handleGroupSelect(null)}
                className={cn(
                  "flex items-center gap-2 w-full px-2 py-1.5 text-sm rounded-md hover:bg-muted transition-colors text-left",
                  !item.group && "bg-muted"
                )}
              >
                {!item.group && <Check className="h-3.5 w-3.5" />}
                <span className={cn(!item.group ? "ml-0" : "ml-5.5")}>
                  No group
                </span>
              </button>

              {/* Existing groups */}
              {availableGroups.length > 0 && (
                <div className="border-t pt-2 mt-2">
                  {availableGroups.map((group) => (
                    <button
                      key={group}
                      onClick={() => handleGroupSelect(group)}
                      className={cn(
                        "flex items-center gap-2 w-full px-2 py-1.5 text-sm rounded-md hover:bg-muted transition-colors text-left",
                        item.group === group && "bg-muted"
                      )}
                    >
                      {item.group === group && <Check className="h-3.5 w-3.5" />}
                      <span className={cn(item.group === group ? "ml-0" : "ml-5.5")}>
                        {group}
                      </span>
                    </button>
                  ))}
                </div>
              )}

              {/* Create new group */}
              <div className="border-t pt-2 mt-2">
                <div className="flex items-center gap-1">
                  <Input
                    value={newGroupName}
                    onChange={(e) => setNewGroupName(e.target.value)}
                    placeholder="New group name"
                    className="h-8 text-sm"
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        handleCreateGroup();
                      }
                    }}
                  />
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-8 w-8 p-0 shrink-0"
                    onClick={handleCreateGroup}
                    disabled={!newGroupName.trim()}
                  >
                    <Plus className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </div>
          </PopoverContent>
        </Popover>
      )}

      {/* Actions */}
      {!isEditing && (
        <div className="flex items-center gap-1 shrink-0">
          {onDisplayNameChange && (
            <Button
              variant="ghost"
              size="sm"
              className="h-8 w-8 p-0"
              onClick={() => setIsEditing(true)}
            >
              <Pencil className="h-4 w-4" />
              <span className="sr-only">Edit display name</span>
            </Button>
          )}
          <Button
            variant="ghost"
            size="sm"
            className="h-8 w-8 p-0 text-muted-foreground hover:text-destructive"
            onClick={onRemove}
          >
            <X className="h-4 w-4" />
            <span className="sr-only">Remove</span>
          </Button>
        </div>
      )}
    </div>
  );
}

// Simple monitor picker for adding monitors
export interface MonitorPickerProps {
  availableMonitors: Monitor[];
  selectedMonitorIds: string[];
  onSelect: (monitorId: string) => void;
  className?: string;
}

export function MonitorPicker({
  availableMonitors,
  selectedMonitorIds,
  onSelect,
  className,
}: MonitorPickerProps) {
  const unselectedMonitors = availableMonitors.filter(
    (m) => !selectedMonitorIds.includes(m.id)
  );

  if (unselectedMonitors.length === 0) {
    return (
      <div className={cn("py-4 text-center text-sm text-muted-foreground", className)}>
        All monitors have been added
      </div>
    );
  }

  return (
    <div className={cn("space-y-1", className)}>
      {unselectedMonitors.map((monitor) => (
        <button
          key={monitor.id}
          onClick={() => onSelect(monitor.id)}
          className="flex items-center gap-3 w-full p-2 rounded-md hover:bg-muted transition-colors text-left"
        >
          <span
            className={cn(
              "h-2 w-2 rounded-full shrink-0",
              monitor.status === "active"
                ? "bg-[var(--status-success-solid)]"
                : monitor.status === "degraded"
                  ? "bg-[var(--status-warning-solid)]"
                  : monitor.status === "down"
                    ? "bg-[var(--status-error-solid)]"
                    : "bg-gray-400 dark:bg-gray-500"
            )}
          />
          <div className="flex-1 min-w-0">
            <div className="font-medium truncate text-sm">{monitor.name}</div>
            <div className="text-xs text-muted-foreground truncate">
              {monitor.url}
            </div>
          </div>
        </button>
      ))}
    </div>
  );
}
