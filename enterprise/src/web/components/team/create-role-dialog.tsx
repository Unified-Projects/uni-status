"use client";

import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Button,
  Input,
  Label,
  Textarea,
  Checkbox,
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
  cn,
} from "@uni-status/ui";
import { Loader2 } from "lucide-react";
import { PERMISSIONS, PERMISSION_CATEGORIES, type Permission } from "@uni-status/shared/types/permissions";
import type { OrganizationRole } from "@/lib/api-client";

interface CreateRoleDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (data: {
    name: string;
    description?: string;
    permissions: string[];
    color?: string;
  }) => void;
  isLoading?: boolean;
  editingRole?: OrganizationRole | null;
}

const PRESET_COLORS = [
  "#ef4444", // red
  "#f97316", // orange
  "#f59e0b", // amber
  "#84cc16", // lime
  "#22c55e", // green
  "#14b8a6", // teal
  "#06b6d4", // cyan
  "#3b82f6", // blue
  "#6366f1", // indigo
  "#8b5cf6", // violet
  "#a855f7", // purple
  "#ec4899", // pink
];

export function CreateRoleDialog({
  open,
  onOpenChange,
  onSubmit,
  isLoading = false,
  editingRole = null,
}: CreateRoleDialogProps) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [selectedPermissions, setSelectedPermissions] = useState<Set<string>>(new Set());
  const [color, setColor] = useState<string>("#3b82f6");

  // Reset form when dialog opens or editing role changes
  useEffect(() => {
    if (open) {
      if (editingRole) {
        setName(editingRole.name);
        setDescription(editingRole.description || "");
        setSelectedPermissions(new Set(editingRole.permissions));
        setColor(editingRole.color || "#3b82f6");
      } else {
        setName("");
        setDescription("");
        setSelectedPermissions(new Set());
        setColor("#3b82f6");
      }
    }
  }, [open, editingRole]);

  const handlePermissionToggle = (permission: Permission) => {
    const newPermissions = new Set(selectedPermissions);
    if (newPermissions.has(permission)) {
      newPermissions.delete(permission);
    } else {
      newPermissions.add(permission);
    }
    setSelectedPermissions(newPermissions);
  };

  const handleCategoryToggle = (permissions: Permission[]) => {
    const allSelected = permissions.every((p) => selectedPermissions.has(p));
    const newPermissions = new Set(selectedPermissions);

    if (allSelected) {
      permissions.forEach((p) => newPermissions.delete(p));
    } else {
      permissions.forEach((p) => newPermissions.add(p));
    }
    setSelectedPermissions(newPermissions);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || selectedPermissions.size === 0) return;

    onSubmit({
      name: name.trim(),
      description: description.trim() || undefined,
      permissions: Array.from(selectedPermissions),
      color,
    });
  };

  const isEditing = !!editingRole;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>
              {isEditing ? "Edit Role" : "Create Custom Role"}
            </DialogTitle>
            <DialogDescription>
              {isEditing
                ? "Update the role's name, description, and permissions."
                : "Create a custom role with specific permissions for your organization."}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-6 py-4">
            {/* Name and Color */}
            <div className="grid grid-cols-[1fr_auto] gap-4">
              <div className="space-y-2">
                <Label htmlFor="name">Role Name</Label>
                <Input
                  id="name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g., Developer, QA Engineer"
                  required
                />
              </div>

              <div className="space-y-2">
                <Label>Color</Label>
                <div className="flex gap-1 flex-wrap">
                  {PRESET_COLORS.map((c) => (
                    <button
                      key={c}
                      type="button"
                      onClick={() => setColor(c)}
                      className={cn(
                        "w-6 h-6 rounded-full border-2 transition-transform",
                        color === c ? "border-foreground scale-110" : "border-transparent"
                      )}
                      style={{ backgroundColor: c }}
                    />
                  ))}
                </div>
              </div>
            </div>

            {/* Description */}
            <div className="space-y-2">
              <Label htmlFor="description">Description (optional)</Label>
              <Textarea
                id="description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Describe what this role is for..."
                rows={2}
              />
            </div>

            {/* Permissions */}
            <div className="space-y-2">
              <Label>
                Permissions ({selectedPermissions.size} selected)
              </Label>
              <div className="border rounded-lg">
                <Accordion type="multiple" className="w-full">
                  {Object.entries(PERMISSION_CATEGORIES).map(([key, category]) => {
                    const categoryPermissions = category.permissions;
                    const selectedCount = categoryPermissions.filter((p) =>
                      selectedPermissions.has(p)
                    ).length;
                    const allSelected = selectedCount === categoryPermissions.length;
                    const someSelected = selectedCount > 0 && !allSelected;

                    return (
                      <AccordionItem key={key} value={key} className="border-b last:border-b-0">
                        <AccordionTrigger className="px-4 py-3 hover:no-underline">
                          <div className="flex items-center gap-3">
                            <Checkbox
                              checked={allSelected}
                              ref={(el) => {
                                if (el) {
                                  (el as HTMLButtonElement & { indeterminate: boolean }).indeterminate = someSelected;
                                }
                              }}
                              onClick={(e) => {
                                e.stopPropagation();
                                handleCategoryToggle(categoryPermissions);
                              }}
                            />
                            <span className="font-medium">{category.label}</span>
                            <span className="text-muted-foreground text-sm">
                              ({selectedCount}/{categoryPermissions.length})
                            </span>
                          </div>
                        </AccordionTrigger>
                        <AccordionContent className="px-4 pb-4">
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pl-7">
                            {categoryPermissions.map((permission) => (
                              <label
                                key={permission}
                                className="flex items-start gap-2 cursor-pointer"
                              >
                                <Checkbox
                                  checked={selectedPermissions.has(permission)}
                                  onCheckedChange={() =>
                                    handlePermissionToggle(permission)
                                  }
                                />
                                <div className="space-y-0.5">
                                  <p className="text-sm font-medium leading-none">
                                    {permission}
                                  </p>
                                  <p className="text-xs text-muted-foreground">
                                    {PERMISSIONS[permission]}
                                  </p>
                                </div>
                              </label>
                            ))}
                          </div>
                        </AccordionContent>
                      </AccordionItem>
                    );
                  })}
                </Accordion>
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={isLoading}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={!name.trim() || selectedPermissions.size === 0 || isLoading}
            >
              {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {isEditing ? "Save Changes" : "Create Role"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
