import {
  db,
  systemSettings,
  users,
  organizations,
  organizationMembers,
  pendingApprovals,
  organizationDomains,
  organizationInvitations,
  eq,
  and,
} from "@uni-status/database";
import { isSelfHosted as checkIsSelfHosted, getDeploymentType } from "@uni-status/shared/config/env";

export { checkIsSelfHosted as isSelfHosted };

export type SignupMode = "invite_only" | "domain_auto_join" | "open_with_approval";

export interface SystemSettingsData {
  setupCompleted: boolean;
  primaryOrganizationId: string | null;
  signupMode: SignupMode;
}

/**
 * Get system settings for self-hosted mode
 */
export async function getSystemSettings(): Promise<SystemSettingsData | null> {
  const settings = await db.query.systemSettings.findFirst();
  if (!settings) return null;

  return {
    setupCompleted: settings.setupCompleted,
    primaryOrganizationId: settings.primaryOrganizationId,
    signupMode: settings.signupMode as SignupMode,
  };
}

/**
 * Check if initial setup is complete
 */
export async function isSetupComplete(): Promise<boolean> {
  if (!checkIsSelfHosted()) return true;

  const settings = await getSystemSettings();
  return settings?.setupCompleted ?? false;
}

/**
 * Get the current signup mode for self-hosted deployments
 */
export async function getSignupMode(): Promise<SignupMode> {
  const settings = await getSystemSettings();
  return settings?.signupMode ?? "invite_only";
}

/**
 * Check if a user has a pending invitation for the primary organization
 */
export async function checkExistingInvitation(email: string, organizationId: string): Promise<{ id: string; role: string } | null> {
  const invitation = await db.query.organizationInvitations.findFirst({
    where: and(
      eq(organizationInvitations.email, email.toLowerCase()),
      eq(organizationInvitations.organizationId, organizationId),
      eq(organizationInvitations.status, "pending")
    ),
  });

  if (!invitation) return null;

  // Check if invitation is expired
  if (invitation.expiresAt && new Date(invitation.expiresAt) < new Date()) {
    return null;
  }

  return {
    id: invitation.id,
    role: invitation.role,
  };
}

/**
 * Check if user's email domain allows auto-join to the organization
 */
export async function checkDomainAutoJoin(email: string, organizationId: string): Promise<{ role: string } | null> {
  const emailDomain = email.split("@")[1]?.toLowerCase();
  if (!emailDomain) return null;

  const domainConfig = await db.query.organizationDomains.findFirst({
    where: and(
      eq(organizationDomains.domain, emailDomain),
      eq(organizationDomains.organizationId, organizationId),
      eq(organizationDomains.verified, true),
      eq(organizationDomains.autoJoinEnabled, true)
    ),
  });

  if (!domainConfig) return null;

  return {
    role: domainConfig.autoJoinRole,
  };
}

/**
 * Add user to organization with specified role
 */
export async function addUserToOrganization(userId: string, organizationId: string, role: string, invitedBy?: string): Promise<void> {
  const memberId = crypto.randomUUID();
  await db.insert(organizationMembers).values({
    id: memberId,
    organizationId,
    userId,
    role: role as "owner" | "admin" | "member" | "viewer",
    invitedBy: invitedBy || null,
  });
}

/**
 * Create a pending approval request for a user
 */
export async function createPendingApproval(userId: string, organizationId: string): Promise<void> {
  const approvalId = crypto.randomUUID();
  await db.insert(pendingApprovals).values({
    id: approvalId,
    userId,
    organizationId,
    status: "pending",
  });
}

/**
 * Mark a user as super admin
 */
export async function markAsSuperAdmin(userId: string): Promise<void> {
  await db.update(users).set({ systemRole: "super_admin" }).where(eq(users.id, userId));
}

/**
 * Handle user creation in self-hosted mode
 * This function is called after a user is created to handle self-hosted specific logic
 */
export async function handleSelfHostedUserCreation(user: { id: string; email: string }): Promise<{
  handled: boolean;
  createPersonalOrg: boolean;
  message?: string;
}> {
  if (!checkIsSelfHosted()) {
    return { handled: false, createPersonalOrg: true };
  }

  const settings = await getSystemSettings();

  // If setup is not completed, this is the first user - they're completing setup
  // The setup endpoint will handle making them super admin and creating the org
  if (!settings?.setupCompleted) {
    console.log(`[Auth] Self-hosted setup not complete - user ${user.id} will complete setup`);
    return { handled: true, createPersonalOrg: false };
  }

  const primaryOrgId = settings.primaryOrganizationId;
  if (!primaryOrgId) {
    console.error(`[Auth] Self-hosted mode misconfigured: no primary organization`);
    return { handled: false, createPersonalOrg: true };
  }

  const signupMode = settings.signupMode;
  const email = user.email.toLowerCase();

  switch (signupMode) {
    case "invite_only": {
      // Check for pending invitation
      const invitation = await checkExistingInvitation(email, primaryOrgId);
      if (invitation) {
        // Accept invitation - add user to org
        await addUserToOrganization(user.id, primaryOrgId, invitation.role);

        // Mark invitation as accepted
        await db.update(organizationInvitations)
          .set({ status: "accepted", updatedAt: new Date() })
          .where(eq(organizationInvitations.id, invitation.id));

        console.log(`[Auth] Self-hosted: User ${user.id} joined via invitation with role ${invitation.role}`);
        return { handled: true, createPersonalOrg: false };
      }

      // No invitation - user shouldn't have been able to sign up
      // But since they already have an account, create pending approval
      console.log(`[Auth] Self-hosted: User ${user.id} registered without invitation in invite_only mode`);
      await createPendingApproval(user.id, primaryOrgId);
      return {
        handled: true,
        createPersonalOrg: false,
        message: "Registration requires an invitation. Your request is pending admin approval."
      };
    }

    case "domain_auto_join": {
      // First check for invitation
      const invitation = await checkExistingInvitation(email, primaryOrgId);
      if (invitation) {
        await addUserToOrganization(user.id, primaryOrgId, invitation.role);
        await db.update(organizationInvitations)
          .set({ status: "accepted", updatedAt: new Date() })
          .where(eq(organizationInvitations.id, invitation.id));
        console.log(`[Auth] Self-hosted: User ${user.id} joined via invitation with role ${invitation.role}`);
        return { handled: true, createPersonalOrg: false };
      }

      // Check domain auto-join
      const domainJoin = await checkDomainAutoJoin(email, primaryOrgId);
      if (domainJoin) {
        await addUserToOrganization(user.id, primaryOrgId, domainJoin.role);
        console.log(`[Auth] Self-hosted: User ${user.id} auto-joined via domain with role ${domainJoin.role}`);
        return { handled: true, createPersonalOrg: false };
      }

      // Domain not configured - create pending approval
      console.log(`[Auth] Self-hosted: User ${user.id} domain not configured for auto-join`);
      await createPendingApproval(user.id, primaryOrgId);
      return {
        handled: true,
        createPersonalOrg: false,
        message: "Your email domain is not configured for automatic access. Your request is pending admin approval."
      };
    }

    case "open_with_approval": {
      // First check for invitation (invited users skip approval)
      const invitation = await checkExistingInvitation(email, primaryOrgId);
      if (invitation) {
        await addUserToOrganization(user.id, primaryOrgId, invitation.role);
        await db.update(organizationInvitations)
          .set({ status: "accepted", updatedAt: new Date() })
          .where(eq(organizationInvitations.id, invitation.id));
        console.log(`[Auth] Self-hosted: User ${user.id} joined via invitation with role ${invitation.role}`);
        return { handled: true, createPersonalOrg: false };
      }

      // Check domain auto-join (domain users also skip approval)
      const domainJoin = await checkDomainAutoJoin(email, primaryOrgId);
      if (domainJoin) {
        await addUserToOrganization(user.id, primaryOrgId, domainJoin.role);
        console.log(`[Auth] Self-hosted: User ${user.id} auto-joined via domain with role ${domainJoin.role}`);
        return { handled: true, createPersonalOrg: false };
      }

      // Create pending approval
      await createPendingApproval(user.id, primaryOrgId);
      console.log(`[Auth] Self-hosted: User ${user.id} created pending approval request`);
      return {
        handled: true,
        createPersonalOrg: false,
        message: "Your account is pending admin approval."
      };
    }

    default:
      console.error(`[Auth] Unknown signup mode: ${signupMode}`);
      return { handled: false, createPersonalOrg: true };
  }
}
