import { OpenAPIHono } from "@hono/zod-openapi";
import { auth } from "@uni-status/auth/server";
import { db, organizationMembers, organizations, users, eq, and } from "@uni-status/database";
import { inArray, ne } from "drizzle-orm";
import { createLogger } from "@uni-status/shared";

const log = createLogger({ module: "session-verify" });

export const sessionVerifyRoutes = new OpenAPIHono();

/**
 * Public session verification endpoint for federated auth
 * Used by landing page to verify sessions without full auth middleware
 */
sessionVerifyRoutes.get("/", async (c) => {
  try {
    const session = await auth.api.getSession({
      headers: c.req.raw.headers,
    });

    if (!session?.user || !session?.session) {
      return c.json({
        user: null,
        session: null,
        organizations: [],
      });
    }

    // Fetch user's organizations
    const memberships = await db
      .select({
        organizationId: organizationMembers.organizationId,
        role: organizationMembers.role,
        organizationName: organizations.name,
        organizationSlug: organizations.slug,
      })
      .from(organizationMembers)
      .innerJoin(organizations, eq(organizationMembers.organizationId, organizations.id))
      .where(eq(organizationMembers.userId, session.user.id));

    // Fetch additional user data
    const userData = await db.query.users.findFirst({
      where: eq(users.id, session.user.id),
      columns: {
        id: true,
        email: true,
        name: true,
        emailVerified: true,
        image: true,
        portalOnly: true,
      },
    });

    return c.json({
      user: {
        id: session.user.id,
        email: session.user.email,
        name: session.user.name,
        emailVerified: userData?.emailVerified ?? false,
        image: userData?.image ?? null,
        portalOnly: userData?.portalOnly ?? false,
      },
      session: {
        id: session.session.id,
        userId: session.user.id,
        expiresAt: session.session.expiresAt,
      },
      organizations: memberships.map((m) => ({
        id: m.organizationId,
        name: m.organizationName,
        slug: m.organizationSlug,
        role: m.role,
      })),
    });
  } catch (error) {
    log.error({ err: error }, "Session verification error");
    return c.json({
      user: null,
      session: null,
      organizations: [],
    });
  }
});

/**
 * Mark the current user as portal-only
 * This removes their personal organization and sets the portalOnly flag
 * Used after registration from landing page
 */
sessionVerifyRoutes.post("/mark-portal-only", async (c) => {
  try {
    const session = await auth.api.getSession({
      headers: c.req.raw.headers,
    });

    if (!session?.user) {
      return c.json({
        success: false,
        error: { code: "UNAUTHORIZED", message: "Not authenticated" },
      }, 401);
    }

    const userId = session.user.id;
    const personalSlug = `personal-${userId.slice(0, 8)}`;

    const deletedOrgIds = await db.transaction(async (tx) => {
      // Find strict personal-org candidates for this user.
      const personalOrgs = await tx
        .select({
          orgId: organizations.id,
        })
        .from(organizationMembers)
        .innerJoin(organizations, eq(organizationMembers.organizationId, organizations.id))
        .where(
          and(
            eq(organizationMembers.userId, userId),
            eq(organizationMembers.role, "owner"),
            eq(organizations.slug, personalSlug),
            eq(organizations.name, "Personal")
          )
        );

      const candidateOrgIds = Array.from(new Set(personalOrgs.map((org) => org.orgId)));
      let orgIds = candidateOrgIds;

      if (candidateOrgIds.length > 0) {
        // Only delete if the org has no members other than this user.
        const sharedMemberships = await tx
          .select({
            orgId: organizationMembers.organizationId,
          })
          .from(organizationMembers)
          .where(
            and(
              inArray(organizationMembers.organizationId, candidateOrgIds),
              ne(organizationMembers.userId, userId)
            )
          );
        const sharedOrgIds = new Set(sharedMemberships.map((m) => m.orgId));
        orgIds = candidateOrgIds.filter((orgId) => !sharedOrgIds.has(orgId));
      }

      if (orgIds.length > 0) {
        await tx.delete(organizationMembers).where(inArray(organizationMembers.organizationId, orgIds));
        await tx.delete(organizations).where(inArray(organizations.id, orgIds));
      }

      await tx
        .update(users)
        .set({ portalOnly: true })
        .where(eq(users.id, userId));

      return orgIds;
    });

    for (const orgId of deletedOrgIds) {
      log.info({ orgId, userId }, "Deleted personal org for portal-only user");
    }

    log.info({ userId }, "Marked user as portal-only");

    return c.json({
      success: true,
      data: { portalOnly: true },
    });
  } catch (error) {
    log.error({ err: error }, "Portal-only setup error");
    return c.json({
      success: false,
      error: { code: "INTERNAL_ERROR", message: "Failed to mark as portal-only" },
    }, 500);
  }
});
