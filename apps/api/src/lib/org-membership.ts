/**
 * Organization Membership Helpers
 *
 * Provides functions to enforce the free org membership rule:
 * A user can only be a member of ONE free organization (any role) in hosted mode.
 *
 * This rule does not apply to self-hosted mode where users have unlimited orgs.
 */

import { eq, and } from "drizzle-orm";
import { db } from "@uni-status/database";
import { organizations, organizationMembers } from "@uni-status/database/schema";
import { isSelfHosted } from "@uni-status/shared/config";
import type { FreeOrgCheckResult } from "@uni-status/shared/types/organization";

/**
 * Check if a user can join a free organization.
 *
 * In hosted mode, users can only be a member of ONE free org total (any role).
 * This check ensures the rule is enforced when:
 * - Accepting an invitation to a free org
 * - Being added directly to a free org
 *
 * @param userId - The user's ID
 * @param targetOrgId - The organization ID the user wants to join
 * @returns FreeOrgCheckResult indicating if the operation can proceed
 */
export async function canUserJoinFreeOrg(
  userId: string,
  targetOrgId: string
): Promise<FreeOrgCheckResult> {
  // Self-hosted mode doesn't have this restriction
  if (isSelfHosted()) {
    return { canProceed: true };
  }

  // Get target org's subscription tier
  const targetOrg = await db.query.organizations.findFirst({
    where: eq(organizations.id, targetOrgId),
    columns: {
      id: true,
      name: true,
      subscriptionTier: true,
    },
  });

  // If target org doesn't exist, let the caller handle it
  if (!targetOrg) {
    return { canProceed: true };
  }

  // If target org is not free tier, allow joining
  if (targetOrg.subscriptionTier !== "free") {
    return { canProceed: true };
  }

  // Check if user is already a member of any free org
  const existingFreeOrg = await findUserFreeOrgMembership(userId);

  if (existingFreeOrg) {
    // Check if it's the same org they're trying to join
    if (existingFreeOrg.orgId === targetOrgId) {
      return { canProceed: true }; // Already a member
    }

    return {
      canProceed: false,
      existingFreeOrgId: existingFreeOrg.orgId,
      existingFreeOrgName: existingFreeOrg.orgName,
    };
  }

  return { canProceed: true };
}

/**
 * Check if a user can create a new free organization.
 *
 * In hosted mode, users can only be a member of ONE free org total.
 * Since creating an org makes you the owner, this checks if the user
 * is already a member of any free org.
 *
 * @param userId - The user's ID
 * @returns FreeOrgCheckResult indicating if the operation can proceed
 */
export async function canUserCreateFreeOrg(
  userId: string
): Promise<FreeOrgCheckResult> {
  // Self-hosted mode doesn't have this restriction
  if (isSelfHosted()) {
    return { canProceed: true };
  }

  // Check if user is already a member of any free org
  const existingFreeOrg = await findUserFreeOrgMembership(userId);

  if (existingFreeOrg) {
    return {
      canProceed: false,
      existingFreeOrgId: existingFreeOrg.orgId,
      existingFreeOrgName: existingFreeOrg.orgName,
    };
  }

  return { canProceed: true };
}

/**
 * Find if a user is a member of any free organization.
 *
 * @param userId - The user's ID
 * @returns The free org info if found, null otherwise
 */
async function findUserFreeOrgMembership(
  userId: string
): Promise<{ orgId: string; orgName: string } | null> {
  // Get all organizations the user is a member of
  const memberships = await db.query.organizationMembers.findMany({
    where: eq(organizationMembers.userId, userId),
    columns: {
      organizationId: true,
    },
  });

  if (memberships.length === 0) {
    return null;
  }

  // Check each org to see if it's a free tier
  for (const membership of memberships) {
    const org = await db.query.organizations.findFirst({
      where: eq(organizations.id, membership.organizationId),
      columns: {
        id: true,
        name: true,
        subscriptionTier: true,
      },
    });

    if (org?.subscriptionTier === "free") {
      return {
        orgId: org.id,
        orgName: org.name,
      };
    }
  }

  return null;
}

/**
 * Get all organizations a user is a member of, with their subscription tiers.
 *
 * Useful for displaying to the user which orgs they belong to and their tiers.
 *
 * @param userId - The user's ID
 * @returns Array of org info with subscription tiers
 */
export async function getUserOrganizationsWithTiers(
  userId: string
): Promise<Array<{ id: string; name: string; subscriptionTier: string | null; role: string }>> {
  const memberships = await db.query.organizationMembers.findMany({
    where: eq(organizationMembers.userId, userId),
    columns: {
      organizationId: true,
      role: true,
    },
  });

  const results: Array<{ id: string; name: string; subscriptionTier: string | null; role: string }> = [];

  for (const membership of memberships) {
    const org = await db.query.organizations.findFirst({
      where: eq(organizations.id, membership.organizationId),
      columns: {
        id: true,
        name: true,
        subscriptionTier: true,
      },
    });

    if (org) {
      results.push({
        id: org.id,
        name: org.name,
        subscriptionTier: org.subscriptionTier,
        role: membership.role,
      });
    }
  }

  return results;
}
