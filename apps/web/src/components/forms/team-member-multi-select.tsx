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
  Badge,
  cn,
} from "@uni-status/ui";
import { useOrganizationMembers } from "@/hooks/use-organizations";
import { useDashboardStore } from "@/stores/dashboard-store";
import { Search, Check, Users, X } from "lucide-react";
import type { OrganizationMember } from "@/lib/api-client";

interface TeamMemberMultiSelectProps {
  selectedIds: string[];
  onSelectionChange: (ids: string[]) => void;
  title?: string;
  description?: string;
}

export function TeamMemberMultiSelect({
  selectedIds,
  onSelectionChange,
  title = "Select Team Members",
  description = "Select one or more team members",
}: TeamMemberMultiSelectProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [tempSelectedIds, setTempSelectedIds] = useState<string[]>(selectedIds);
  const organizationId = useDashboardStore((state) => state.currentOrganizationId);
  const { data: membersResponse, isLoading } = useOrganizationMembers(organizationId || "");
  const members = membersResponse?.data;

  // Filter members based on search
  const filteredMembers = useMemo(() => {
    if (!members) return [];
    return members.filter((m) => {
      if (search) {
        const searchLower = search.toLowerCase();
        return (
          m.user?.name?.toLowerCase().includes(searchLower) ||
          m.user?.email?.toLowerCase().includes(searchLower)
        );
      }
      return true;
    });
  }, [members, search]);

  // Get selected members for display
  const selectedMembers = useMemo(() => {
    if (!members) return [];
    return members.filter((m) => selectedIds.includes(m.userId));
  }, [members, selectedIds]);

  const toggleMember = (userId: string) => {
    setTempSelectedIds((current) =>
      current.includes(userId)
        ? current.filter((id) => id !== userId)
        : [...current, userId]
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

  const handleRemove = (userId: string) => {
    onSelectionChange(selectedIds.filter((id) => id !== userId));
  };

  const getRoleColor = (role: OrganizationMember["role"]) => {
    switch (role) {
      case "owner":
        return "bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400";
      case "admin":
        return "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400";
      case "member":
        return "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400";
      case "viewer":
        return "bg-gray-100 text-gray-800 dark:bg-gray-800/50 dark:text-gray-400";
      default:
        return "bg-gray-100 text-gray-800 dark:bg-gray-800/50 dark:text-gray-400";
    }
  };

  return (
    <div className="space-y-2">
      {/* Selected Members Display */}
      <div className="flex flex-wrap gap-2">
        {selectedMembers.map((member) => (
          <Badge
            key={member.userId}
            variant="secondary"
            className="gap-1 pr-1"
          >
            {member.user?.name || member.user?.email || member.userId}
            <button
              type="button"
              onClick={() => handleRemove(member.userId)}
              className="ml-1 rounded-full hover:bg-muted p-0.5"
            >
              <X className="h-3 w-3" />
            </button>
          </Badge>
        ))}
      </div>

      {/* Add Button */}
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={(e) => { e.preventDefault(); e.stopPropagation(); handleOpen(); }}
        className="gap-2"
      >
        <Users className="h-4 w-4" />
        {selectedIds.length === 0 ? "Select Participants" : "Add More"}
      </Button>

      {/* Selection Dialog */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg max-h-[80vh] flex flex-col">
          <DialogHeader>
            <DialogTitle>{title}</DialogTitle>
            <DialogDescription>{description}</DialogDescription>
          </DialogHeader>

          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search team members..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>

          <div className="flex-1 overflow-y-auto min-h-[200px] max-h-[400px] space-y-2 py-2">
            {isLoading ? (
              <div className="text-sm text-muted-foreground text-center py-8">
                Loading team members...
              </div>
            ) : filteredMembers.length === 0 ? (
              <div className="text-sm text-muted-foreground text-center py-8">
                {search ? "No team members match your search" : "No team members available"}
              </div>
            ) : (
              filteredMembers.map((member) => (
                <label
                  key={member.userId}
                  className={cn(
                    "flex items-center gap-3 p-3 border rounded-lg cursor-pointer transition-colors",
                    tempSelectedIds.includes(member.userId)
                      ? "border-primary bg-primary/5"
                      : "hover:bg-muted/50"
                  )}
                >
                  <Checkbox
                    checked={tempSelectedIds.includes(member.userId)}
                    onCheckedChange={() => toggleMember(member.userId)}
                  />
                  <div className="flex h-8 w-8 items-center justify-center rounded-full bg-muted text-sm font-medium overflow-hidden flex-shrink-0">
                    {member.user?.image ? (
                      <img
                        src={member.user.image}
                        alt={member.user.name || ""}
                        className="h-8 w-8 object-cover"
                      />
                    ) : (
                      (member.user?.name?.[0] || member.user?.email?.[0] || "?").toUpperCase()
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="font-medium truncate">
                      {member.user?.name || "Unknown"}
                    </div>
                    <div className="text-sm text-muted-foreground truncate">
                      {member.user?.email}
                    </div>
                  </div>
                  <span
                    className={cn(
                      "text-xs px-2 py-0.5 rounded capitalize",
                      getRoleColor(member.role)
                    )}
                  >
                    {member.role}
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
    </div>
  );
}
