"use client";

import { useState, useMemo } from "react";
import { Users, UserPlus, Plus, Mail, Shield, Trash2 } from "lucide-react";
import {
  Button,
  Badge,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@uni-status/ui";
import { useSession } from "@uni-status/auth/client";
import {
  useOrganizationMembers,
  useOrganizationInvitations,
  useRemoveMember,
  useInviteMember,
  useCancelInvitation,
  useResendInvitation,
} from "@/hooks/use-organizations";
import {
  useOrganizationRoles,
  useCreateRole,
  useUpdateRole,
  useDeleteRole,
  useAssignMemberRole,
} from "@uni-status/enterprise/web/hooks";
import { useDashboardStore } from "@/stores/dashboard-store";
import {
  MemberCard,
  InvitationCard,
  InviteDialog,
  RoleCard,
  CreateRoleDialog,
  getRolePermissions,
  type MemberRole,
} from "@/components/team";
import { EmptyState } from "@/components/ui/empty-state";
import { LoadingState } from "@/components/ui/loading-state";
import { ErrorState } from "@/components/ui/error-state";
import { usePagination } from "@/hooks/use-pagination";
import { useLicenseStatus } from "@/hooks/use-license-status";
import { Pagination, getPaginationProps } from "@/components/ui/pagination";
import type { OrganizationRole } from "@/lib/api-client";

export default function TeamPage() {
  const { data: session } = useSession();
  const { currentOrganizationId } = useDashboardStore();
  const { hasFeature } = useLicenseStatus();

  // Dialog states
  const [inviteDialogOpen, setInviteDialogOpen] = useState(false);
  const [removeMemberDialogOpen, setRemoveMemberDialogOpen] = useState(false);
  const [memberToRemove, setMemberToRemove] = useState<string | null>(null);
  const [createRoleDialogOpen, setCreateRoleDialogOpen] = useState(false);
  const [editingRole, setEditingRole] = useState<OrganizationRole | null>(null);
  const [deleteRoleDialogOpen, setDeleteRoleDialogOpen] = useState(false);
  const [roleToDelete, setRoleToDelete] = useState<OrganizationRole | null>(null);

  // Mutations
  const removeMember = useRemoveMember();
  const inviteMember = useInviteMember();
  const cancelInvitation = useCancelInvitation();
  const resendInvitation = useResendInvitation();
  const assignMemberRole = useAssignMemberRole();
  const createRole = useCreateRole();
  const updateRole = useUpdateRole();
  const deleteRole = useDeleteRole();

  // Track action state
  const [actioningMemberId, setActioningMemberId] = useState<string | null>(null);
  const [actioningInvitationId, setActioningInvitationId] = useState<string | null>(null);

  // Pagination for each tab
  const membersPagination = usePagination();
  const invitationsPagination = usePagination();
  const canUseCustomRoles = hasFeature("customRoles");

  // Data fetching
  const {
    data: membersResponse,
    isLoading: membersLoading,
    error: membersError,
    refetch: refetchMembers,
  } = useOrganizationMembers(currentOrganizationId || "", membersPagination.paginationParams);

  const members = membersResponse?.data;
  const membersMeta = membersResponse?.meta;

  const {
    data: invitationsResponse,
    isLoading: invitationsLoading,
    error: invitationsError,
    refetch: refetchInvitations,
  } = useOrganizationInvitations(currentOrganizationId || "", invitationsPagination.paginationParams);

  const invitations = invitationsResponse?.data;
  const invitationsMeta = invitationsResponse?.meta;

  const {
    data: roles,
    isLoading: rolesLoading,
    error: rolesError,
    refetch: refetchRoles,
  } = useOrganizationRoles(currentOrganizationId || "", { enabled: canUseCustomRoles });

  // Determine current user's role
  const currentUserMember = useMemo(() => {
    if (!members || !session?.user?.id) return null;
    return members.find((m) => m.userId === session.user.id);
  }, [members, session?.user?.id]);

  const currentUserRole = currentUserMember?.role || "viewer";
  const permissions = getRolePermissions(currentUserRole as MemberRole);

  // Get all custom roles (non-system)
  const customRoles = roles?.custom || [];

  // Handlers
  const handleChangeRole = async (memberId: string, newRoleId: string) => {
    if (!currentOrganizationId) return;
    setActioningMemberId(memberId);
    try {
      await assignMemberRole.mutateAsync({
        orgId: currentOrganizationId,
        memberId,
        roleId: newRoleId,
      });
    } finally {
      setActioningMemberId(null);
    }
  };

  const handleRemoveClick = (memberId: string) => {
    setMemberToRemove(memberId);
    setRemoveMemberDialogOpen(true);
  };

  const confirmRemoveMember = async () => {
    if (!currentOrganizationId || !memberToRemove) return;
    setActioningMemberId(memberToRemove);
    try {
      await removeMember.mutateAsync({
        orgId: currentOrganizationId,
        memberId: memberToRemove,
      });
      setRemoveMemberDialogOpen(false);
      setMemberToRemove(null);
    } finally {
      setActioningMemberId(null);
    }
  };

  const handleInviteSubmit = async (data: { email: string; role: "admin" | "member" | "viewer" }) => {
    if (!currentOrganizationId) return;
    await inviteMember.mutateAsync({
      orgId: currentOrganizationId,
      data,
    });
    setInviteDialogOpen(false);
  };

  const handleResendInvitation = async (invitationId: string) => {
    if (!currentOrganizationId) return;
    setActioningInvitationId(invitationId);
    try {
      await resendInvitation.mutateAsync({
        orgId: currentOrganizationId,
        invitationId,
      });
    } finally {
      setActioningInvitationId(null);
    }
  };

  const handleCancelInvitation = async (invitationId: string) => {
    if (!currentOrganizationId) return;
    setActioningInvitationId(invitationId);
    try {
      await cancelInvitation.mutateAsync({
        orgId: currentOrganizationId,
        invitationId,
      });
    } finally {
      setActioningInvitationId(null);
    }
  };

  const handleCreateRole = async (data: {
    name: string;
    description?: string;
    permissions: string[];
    color?: string;
  }) => {
    if (!currentOrganizationId) return;
    await createRole.mutateAsync({
      orgId: currentOrganizationId,
      data,
    });
    setCreateRoleDialogOpen(false);
    setEditingRole(null);
  };

  const handleUpdateRole = async (data: {
    name: string;
    description?: string;
    permissions: string[];
    color?: string;
  }) => {
    if (!currentOrganizationId || !editingRole) return;
    await updateRole.mutateAsync({
      orgId: currentOrganizationId,
      roleId: editingRole.id,
      data,
    });
    setCreateRoleDialogOpen(false);
    setEditingRole(null);
  };

  const handleEditRole = (role: OrganizationRole) => {
    setEditingRole(role);
    setCreateRoleDialogOpen(true);
  };

  const handleDeleteRoleClick = (role: OrganizationRole) => {
    setRoleToDelete(role);
    setDeleteRoleDialogOpen(true);
  };

  const confirmDeleteRole = async () => {
    if (!currentOrganizationId || !roleToDelete) return;
    await deleteRole.mutateAsync({
      orgId: currentOrganizationId,
      roleId: roleToDelete.id,
    });
    setDeleteRoleDialogOpen(false);
    setRoleToDelete(null);
  };

  // Get member to remove for dialog
  const memberToRemoveData = memberToRemove
    ? members?.find((m) => m.id === memberToRemove)
    : null;

  // Count members per role
  const getMemberCountForRole = (roleId: string): number => {
    if (!members) return 0;
    return members.filter((m) => {
      if (m.customRoleId === roleId) return true;
      if (!m.customRoleId && m.role === roleId) return true;
      return false;
    }).length;
  };

  if (!currentOrganizationId) {
    return (
      <div className="space-y-6">
        <TeamHeader memberCount={0} canInvite={false} onInviteClick={() => {}} />
        <EmptyState
          icon={Users}
          title="No organisation selected"
          description="Please select an organisation from the sidebar to manage your team."
        />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <TeamHeader
        memberCount={members?.length || 0}
        canInvite={permissions.canManageMembers}
        onInviteClick={() => setInviteDialogOpen(true)}
      />

      <Tabs defaultValue="members" className="space-y-6">
        <TabsList>
          <TabsTrigger value="members">
            Members
            {membersMeta && membersMeta.total > 0 && (
              <Badge variant="secondary" className="ml-2">
                {membersMeta.total}
              </Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="invitations">
            Invitations
            {invitationsMeta && invitationsMeta.total > 0 && (
              <Badge variant="secondary" className="ml-2">
                {invitationsMeta.total}
              </Badge>
            )}
          </TabsTrigger>
          {canUseCustomRoles && (
            <TabsTrigger value="roles">
              Roles
              {roles && (
                <Badge variant="secondary" className="ml-2">
                  {(roles.predefined?.length || 0) + (roles.custom?.length || 0)}
                </Badge>
              )}
            </TabsTrigger>
          )}
        </TabsList>

        {/* Members Tab */}
        <TabsContent value="members" className="space-y-4">
          {membersLoading ? (
            <LoadingState variant="card" count={3} />
          ) : membersError ? (
            <ErrorState error={membersError} onRetry={() => refetchMembers()} />
          ) : members && members.length > 0 ? (
            <>
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                {members.map((member) => (
                  <MemberCard
                    key={member.id}
                    member={member}
                    isCurrentUser={member.userId === session?.user?.id}
                    currentUserRole={currentUserRole as MemberRole}
                    onChangeRole={handleChangeRole}
                    onRemove={handleRemoveClick}
                    isChangingRole={actioningMemberId === member.id && assignMemberRole.isPending}
                    isRemoving={actioningMemberId === member.id && removeMember.isPending}
                    customRoles={customRoles}
                    hasCustomRolesEntitlement={hasFeature("customRoles")}
                  />
                ))}
              </div>
              {membersMeta && (
                <Pagination
                  {...getPaginationProps(membersMeta, members.length, membersPagination.setPage, "members")}
                />
              )}
            </>
          ) : (
            <EmptyState
              icon={Users}
              title="No members"
              description="Your team doesn't have any members yet."
            />
          )}
        </TabsContent>

        {/* Invitations Tab */}
        <TabsContent value="invitations" className="space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-sm text-muted-foreground">
              Pending invitations that haven't been accepted yet
            </p>
            {permissions.canManageMembers && (
              <Button onClick={() => setInviteDialogOpen(true)}>
                <Plus className="mr-2 h-4 w-4" />
                Invite Member
              </Button>
            )}
          </div>

          {invitationsLoading ? (
            <LoadingState variant="card" count={2} />
          ) : invitationsError ? (
            <ErrorState error={invitationsError} onRetry={() => refetchInvitations()} />
          ) : invitations && invitations.length > 0 ? (
            <>
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                {invitations.map((invitation) => (
                  <InvitationCard
                    key={invitation.id}
                    invitation={invitation}
                    onResend={handleResendInvitation}
                    onCancel={handleCancelInvitation}
                    isResending={
                      actioningInvitationId === invitation.id && resendInvitation.isPending
                    }
                    isCanceling={
                      actioningInvitationId === invitation.id && cancelInvitation.isPending
                    }
                  />
                ))}
              </div>
              {invitationsMeta && (
                <Pagination
                  {...getPaginationProps(invitationsMeta, invitations.length, invitationsPagination.setPage, "invitations")}
                />
              )}
            </>
          ) : (
            <EmptyState
              icon={Mail}
              title="No pending invitations"
              description="Send invitations to add new members to your team."
              action={
                permissions.canManageMembers
                  ? {
                      label: "Invite Member",
                      onClick: () => setInviteDialogOpen(true),
                      icon: UserPlus,
                    }
                  : undefined
              }
            />
          )}
        </TabsContent>

        {/* Roles Tab */}
        {canUseCustomRoles && (
          <TabsContent value="roles" className="space-y-6">
            <div className="flex items-center justify-between">
              <p className="text-sm text-muted-foreground">
                Manage roles and permissions for your team members
              </p>
              {permissions.canManageMembers && (
                <Button onClick={() => {
                  setEditingRole(null);
                  setCreateRoleDialogOpen(true);
                }}>
                  <Plus className="mr-2 h-4 w-4" />
                  Create Role
                </Button>
              )}
            </div>

            {rolesLoading ? (
              <LoadingState variant="card" count={4} />
            ) : rolesError ? (
              <ErrorState error={rolesError} onRetry={() => refetchRoles()} />
            ) : roles ? (
              <div className="space-y-8">
                {/* Predefined Roles */}
                <div className="space-y-4">
                  <h3 className="text-lg font-semibold">Predefined Roles</h3>
                  <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                    {roles.predefined?.map((role) => (
                      <RoleCard
                        key={role.id}
                        role={role}
                        memberCount={getMemberCountForRole(role.id)}
                        canEdit={false}
                        canDelete={false}
                      />
                    ))}
                  </div>
                </div>

                {/* Custom Roles */}
                <div className="space-y-4">
                  <h3 className="text-lg font-semibold">Custom Roles</h3>
                  {customRoles.length > 0 ? (
                    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                      {customRoles.map((role) => (
                        <RoleCard
                          key={role.id}
                          role={role}
                          memberCount={getMemberCountForRole(role.id)}
                          onEdit={() => handleEditRole(role)}
                          onDelete={() => handleDeleteRoleClick(role)}
                          canEdit={permissions.canManageMembers}
                          canDelete={permissions.canManageMembers}
                        />
                      ))}
                    </div>
                  ) : (
                    <EmptyState
                      icon={Shield}
                      title="No custom roles"
                      description="Create custom roles to define specific permissions for your team."
                      action={
                        permissions.canManageMembers
                          ? {
                              label: "Create Role",
                              onClick: () => {
                                setEditingRole(null);
                                setCreateRoleDialogOpen(true);
                              },
                              icon: Plus,
                            }
                          : undefined
                      }
                    />
                  )}
                </div>
              </div>
            ) : null}
          </TabsContent>
        )}
      </Tabs>

      {/* Invite Dialog */}
      <InviteDialog
        open={inviteDialogOpen}
        onOpenChange={setInviteDialogOpen}
        onSubmit={handleInviteSubmit}
        isSubmitting={inviteMember.isPending}
      />

      {/* Remove Member Confirmation */}
      <Dialog open={removeMemberDialogOpen} onOpenChange={setRemoveMemberDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Remove Team Member</DialogTitle>
            <DialogDescription>
              Are you sure you want to remove{" "}
              <span className="font-medium">
                {memberToRemoveData?.user?.name || memberToRemoveData?.user?.email || "this member"}
              </span>{" "}
              from the team? They will lose access to all organisation resources.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setRemoveMemberDialogOpen(false)}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={confirmRemoveMember}
              disabled={removeMember.isPending}
            >
              {removeMember.isPending ? "Removing..." : "Remove"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {canUseCustomRoles && (
        <>
          {/* Create/Edit Role Dialog */}
          <CreateRoleDialog
            open={createRoleDialogOpen}
            onOpenChange={(open) => {
              setCreateRoleDialogOpen(open);
              if (!open) setEditingRole(null);
            }}
            onSubmit={editingRole ? handleUpdateRole : handleCreateRole}
            isLoading={createRole.isPending || updateRole.isPending}
            editingRole={editingRole}
          />

          {/* Delete Role Confirmation */}
          <Dialog open={deleteRoleDialogOpen} onOpenChange={setDeleteRoleDialogOpen}>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Delete Role</DialogTitle>
                <DialogDescription>
                  Are you sure you want to delete the role{" "}
                  <span className="font-medium">{roleToDelete?.name}</span>? Members
                  with this role will be reassigned to the default "Member" role.
                </DialogDescription>
              </DialogHeader>
              <DialogFooter>
                <Button
                  variant="outline"
                  onClick={() => setDeleteRoleDialogOpen(false)}
                >
                  Cancel
                </Button>
                <Button
                  variant="destructive"
                  onClick={confirmDeleteRole}
                  disabled={deleteRole.isPending}
                >
                  {deleteRole.isPending ? "Deleting..." : "Delete Role"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </>
      )}
    </div>
  );
}

interface TeamHeaderProps {
  memberCount: number;
  canInvite: boolean;
  onInviteClick: () => void;
}

function TeamHeader({ memberCount, canInvite, onInviteClick }: TeamHeaderProps) {
  return (
    <div className="flex items-center justify-between">
      <div>
        <h1 className="text-3xl font-bold">Team</h1>
        <p className="text-muted-foreground">
          Manage your organisation members, invitations, and roles
        </p>
      </div>
      {canInvite && (
        <Button onClick={onInviteClick}>
          <UserPlus className="mr-2 h-4 w-4" />
          Invite Member
        </Button>
      )}
    </div>
  );
}
