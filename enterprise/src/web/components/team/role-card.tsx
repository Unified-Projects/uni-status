"use client";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Button,
  Badge,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  cn,
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@uni-status/ui";
import { MoreHorizontal, Pencil, Trash2, Lock, Shield, Users } from "lucide-react";
import type { OrganizationRole } from "@/lib/api-client";
import { PERMISSIONS, type Permission } from "@uni-status/shared/types/permissions";

interface RoleCardProps {
  role: OrganizationRole;
  memberCount?: number;
  onEdit?: () => void;
  onDelete?: () => void;
  canEdit?: boolean;
  canDelete?: boolean;
}

export function RoleCard({
  role,
  memberCount = 0,
  onEdit,
  onDelete,
  canEdit = true,
  canDelete = true,
}: RoleCardProps) {
  const isSystemRole = role.isSystem;
  const permissionCount = role.resolvedPermissions?.length || 0;

  return (
    <Card className={cn(isSystemRole && "border-muted")}>
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-2">
            <CardTitle className="text-base flex items-center gap-2">
              <Badge
                variant="outline"
                style={role.color ? {
                  backgroundColor: `${role.color}15`,
                  color: role.color,
                  borderColor: `${role.color}30`,
                } : undefined}
              >
                {role.name}
              </Badge>
              {isSystemRole && (
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger>
                      <Lock className="h-3.5 w-3.5 text-muted-foreground" />
                    </TooltipTrigger>
                    <TooltipContent>
                      <p>System role - cannot be modified</p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              )}
            </CardTitle>
          </div>

          {!isSystemRole && (canEdit || canDelete) && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="h-8 w-8">
                  <MoreHorizontal className="h-4 w-4" />
                  <span className="sr-only">Actions</span>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                {canEdit && (
                  <DropdownMenuItem onClick={onEdit}>
                    <Pencil className="mr-2 h-4 w-4" />
                    Edit Role
                  </DropdownMenuItem>
                )}
                {canDelete && (
                  <DropdownMenuItem
                    onClick={onDelete}
                    className="text-destructive focus:text-destructive"
                  >
                    <Trash2 className="mr-2 h-4 w-4" />
                    Delete Role
                  </DropdownMenuItem>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>

        {role.description && (
          <CardDescription className="mt-1.5">
            {role.description}
          </CardDescription>
        )}
      </CardHeader>

      <CardContent className="pt-0">
        <div className="flex items-center gap-4 text-sm text-muted-foreground">
          <div className="flex items-center gap-1.5">
            <Shield className="h-4 w-4" />
            <span>{permissionCount} permission{permissionCount !== 1 ? "s" : ""}</span>
          </div>
          {memberCount > 0 && (
            <div className="flex items-center gap-1.5">
              <Users className="h-4 w-4" />
              <span>{memberCount} member{memberCount !== 1 ? "s" : ""}</span>
            </div>
          )}
        </div>

        {/* Permission preview */}
        <div className="mt-3 flex flex-wrap gap-1.5">
          {role.resolvedPermissions?.slice(0, 5).map((perm) => (
            <Badge key={perm} variant="secondary" className="text-xs">
              {perm}
            </Badge>
          ))}
          {(role.resolvedPermissions?.length || 0) > 5 && (
            <Badge variant="secondary" className="text-xs">
              +{role.resolvedPermissions!.length - 5} more
            </Badge>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
