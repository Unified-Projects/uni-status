import { OpenAPIHono } from "@hono/zod-openapi";
import { nanoid } from "nanoid";
import { db } from "@uni-status/database";
import { statusPageThemes } from "@uni-status/database/schema";
import { createStatusPageThemeSchema, updateStatusPageThemeSchema } from "@uni-status/shared/validators";
import { requireOrganization, requireScope } from "../middleware/auth";
import { eq, and, desc } from "drizzle-orm";

export const statusPageThemesRoutes = new OpenAPIHono();

// List all themes for an organization
statusPageThemesRoutes.get("/", async (c) => {
  const organizationId = await requireOrganization(c);

  const themes = await db.query.statusPageThemes.findMany({
    where: eq(statusPageThemes.organizationId, organizationId),
    orderBy: [desc(statusPageThemes.createdAt)],
  });

  return c.json({
    success: true,
    data: themes,
  });
});

// Create a new theme
statusPageThemesRoutes.post("/", async (c) => {
  const organizationId = await requireOrganization(c);
  requireScope(c, "write");

  const body = await c.req.json();
  const validated = createStatusPageThemeSchema.parse(body);

  const id = nanoid();
  const now = new Date();

  // If this theme is set as default, unset other defaults
  if (validated.isDefault) {
    await db
      .update(statusPageThemes)
      .set({ isDefault: false, updatedAt: now })
      .where(
        and(
          eq(statusPageThemes.organizationId, organizationId),
          eq(statusPageThemes.isDefault, true)
        )
      );
  }

  const [theme] = await db
    .insert(statusPageThemes)
    .values({
      id,
      organizationId,
      name: validated.name,
      description: validated.description,
      colors: validated.colors,
      isDefault: validated.isDefault ?? false,
      createdAt: now,
      updatedAt: now,
    })
    .returning();

  if (!theme) {
    return c.json({ success: false, error: "Failed to create theme" }, 500);
  }

  return c.json(
    {
      success: true,
      data: theme,
    },
    201
  );
});

// Get a single theme by ID
statusPageThemesRoutes.get("/:id", async (c) => {
  const organizationId = await requireOrganization(c);
  const { id } = c.req.param();

  const theme = await db.query.statusPageThemes.findFirst({
    where: and(
      eq(statusPageThemes.id, id),
      eq(statusPageThemes.organizationId, organizationId)
    ),
  });

  if (!theme) {
    throw new Error("Not found");
  }

  return c.json({
    success: true,
    data: theme,
  });
});

// Update a theme
statusPageThemesRoutes.patch("/:id", async (c) => {
  const organizationId = await requireOrganization(c);
  requireScope(c, "write");
  const { id } = c.req.param();

  const body = await c.req.json();
  const validated = updateStatusPageThemeSchema.parse(body);

  // Verify theme exists and belongs to org
  const existingTheme = await db.query.statusPageThemes.findFirst({
    where: and(
      eq(statusPageThemes.id, id),
      eq(statusPageThemes.organizationId, organizationId)
    ),
  });

  if (!existingTheme) {
    throw new Error("Not found");
  }

  const now = new Date();

  // If this theme is being set as default, unset other defaults
  if (validated.isDefault === true) {
    await db
      .update(statusPageThemes)
      .set({ isDefault: false, updatedAt: now })
      .where(
        and(
          eq(statusPageThemes.organizationId, organizationId),
          eq(statusPageThemes.isDefault, true)
        )
      );
  }

  const [theme] = await db
    .update(statusPageThemes)
    .set({
      ...validated,
      updatedAt: now,
    })
    .where(
      and(
        eq(statusPageThemes.id, id),
        eq(statusPageThemes.organizationId, organizationId)
      )
    )
    .returning();

  if (!theme) {
    throw new Error("Not found");
  }

  return c.json({
    success: true,
    data: theme,
  });
});

// Delete a theme
statusPageThemesRoutes.delete("/:id", async (c) => {
  const organizationId = await requireOrganization(c);
  requireScope(c, "write");
  const { id } = c.req.param();

  // Verify theme exists and belongs to org
  const existingTheme = await db.query.statusPageThemes.findFirst({
    where: and(
      eq(statusPageThemes.id, id),
      eq(statusPageThemes.organizationId, organizationId)
    ),
  });

  if (!existingTheme) {
    throw new Error("Not found");
  }

  const result = await db
    .delete(statusPageThemes)
    .where(
      and(
        eq(statusPageThemes.id, id),
        eq(statusPageThemes.organizationId, organizationId)
      )
    )
    .returning();

  if (result.length === 0) {
    throw new Error("Not found");
  }

  return c.json({
    success: true,
    data: { deleted: true },
  });
});
