"use client";

import { useState } from "react";
import {
  Card,
  CardContent,
  Button,
  Avatar,
  AvatarFallback,
  AvatarImage,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
  DropdownMenuLabel,
  cn,
} from "@uni-status/ui";
import { MoreHorizontal, UserMinus, ChevronDown } from "lucide-react";
import { MemberRoleBadge, type MemberRole, type AnyRole, getRolePermissions } from "./member-role-badge";
import type { OrganizationMember, OrganizationRole } from "@/lib/api-client";
import { PREDEFINED_ROLES, BASE_ROLES } from "@uni-status/shared/constants/roles";
import { EXTENDED_ROLES, EXTENDED_PREDEFINED_ROLES } from "@uni-status/enterprise/shared/roles";

export interface MemberCardProps {
  member: OrganizationMember;
  isCurrentUser: boolean;
  currentUserRole: MemberRole;
  onChangeRole: (memberId: string, newRoleId: string) => void;
  onRemove: (memberId: string) => void;
  isChangingRole?: boolean;
  isRemoving?: boolean;
  customRoles?: OrganizationRole[];
  hasCustomRolesEntitlement?: boolean;
}

// Base roles that can be assigned (excluding owner)
const ASSIGNABLE_BASE_ROLES: MemberRole[] = ["admin", "member", "viewer"];

function getInitials(name: string): string {
  return name
    .split(" ")
    .map((part) => part[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
}

function formatDate(dateString: string): string {
  return new Date(dateString).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

// Get the effective role ID for a member (handles custom roles)
function getEffectiveRoleId(member: OrganizationMember): string {
  // If there's a custom role ID, that takes precedence
  if (member.customRoleId) {
    return member.customRoleId;
  }
  // Otherwise use the base role
  return member.role;
}

export function MemberCard({
  member,
  isCurrentUser,
  currentUserRole,
  onChangeRole,
  onRemove,
  isChangingRole = false,
  isRemoving = false,
  customRoles = [],
  hasCustomRolesEntitlement = false,
}: MemberCardProps) {
  const [roleDropdownOpen, setRoleDropdownOpen] = useState(false);

  const permissions = getRolePermissions(currentUserRole);
  const canManage = permissions.canManageMembers && !isCurrentUser;
  const canChangeRole = canManage && member.role !== "owner";
  const canRemove = canManage && member.role !== "owner";

  const userName = member.user?.name || "Unknown User";
  const userEmail = member.user?.email || "";
  const userImage = member.user?.image;

  const effectiveRoleId = getEffectiveRoleId(member);

  return (
    <Card className={cn(isCurrentUser && "ring-2 ring-primary/20")}>
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0 flex-1">
            <Avatar className="h-10 w-10">
              {userImage && <AvatarImage src={userImage} alt={userName} />}
              <AvatarFallback>{getInitials(userName)}</AvatarFallback>
            </Avatar>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <p className="font-medium truncate">{userName}</p>
                {isCurrentUser && (
                  <span className="text-xs text-muted-foreground">(you)</span>
                )}
              </div>
              <p className="text-sm text-muted-foreground truncate">{userEmail}</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {canChangeRole ? (
              <DropdownMenu open={roleDropdownOpen} onOpenChange={setRoleDropdownOpen}>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-auto py-1 px-2"
                    disabled={isChangingRole}
                  >
                    <MemberRoleBadge
                      role={effectiveRoleId}
                      customRole={member.customRole}
                    />
                    <ChevronDown className="ml-1 h-3 w-3" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-56">
                  <DropdownMenuLabel>Base Roles</DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  {ASSIGNABLE_BASE_ROLES.map((role) => (
                    <DropdownMenuItem
                      key={role}
                      onClick={() => {
                        onChangeRole(member.id, role);
                        setRoleDropdownOpen(false);
                      }}
                      className={cn(effectiveRoleId === role && "bg-accent")}
                    >
                      <MemberRoleBadge role={role} showIcon />
                    </DropdownMenuItem>
                  ))}

                  <DropdownMenuSeparator />
                  <DropdownMenuLabel>Specialized Roles</DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  {EXTENDED_ROLES.map((roleId) => {
                    const role = EXTENDED_PREDEFINED_ROLES[roleId];
                    const isDisabled = !hasCustomRolesEntitlement;
                    return (
                      <DropdownMenuItem
                        key={roleId}
                        disabled={isDisabled}
                        onClick={() => {
                          if (!isDisabled) {
                            onChangeRole(member.id, roleId);
                            setRoleDropdownOpen(false);
                          }
                        }}
                        className={cn(
                          effectiveRoleId === roleId && "bg-accent",
                          isDisabled && "opacity-50 cursor-not-allowed"
                        )}
                      >
                        <MemberRoleBadge role={roleId} showIcon />
                      </DropdownMenuItem>
                    );
                  })}

                  {customRoles.length > 0 && (
                    <>
                      <DropdownMenuSeparator />
                      <DropdownMenuLabel>Custom Roles</DropdownMenuLabel>
                      <DropdownMenuSeparator />
                      {customRoles.map((role) => {
                        const isDisabled = !hasCustomRolesEntitlement;
                        return (
                          <DropdownMenuItem
                            key={role.id}
                            disabled={isDisabled}
                            onClick={() => {
                              if (!isDisabled) {
                                onChangeRole(member.id, role.id);
                                setRoleDropdownOpen(false);
                              }
                            }}
                            className={cn(
                              effectiveRoleId === role.id && "bg-accent",
                              isDisabled && "opacity-50 cursor-not-allowed"
                            )}
                          >
                            <MemberRoleBadge role={role.id} customRole={role} showIcon />
                          </DropdownMenuItem>
                        );
                      })}
                    </>
                  )}
                </DropdownMenuContent>
              </DropdownMenu>
            ) : (
              <MemberRoleBadge
                role={effectiveRoleId}
                customRole={member.customRole}
              />
            )}

            {canRemove && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon" className="h-8 w-8">
                    <MoreHorizontal className="h-4 w-4" />
                    <span className="sr-only">Actions</span>
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem
                    onClick={() => onRemove(member.id)}
                    className="text-destructive focus:text-destructive"
                    disabled={isRemoving}
                  >
                    <UserMinus className="mr-2 h-4 w-4" />
                    Remove from team
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          </div>
        </div>

        <div className="mt-3 flex items-center justify-between text-xs text-muted-foreground">
          <span>Joined {formatDate(member.createdAt)}</span>
        </div>
      </CardContent>
    </Card>
  );
}
