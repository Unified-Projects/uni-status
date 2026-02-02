import { OpenAPIHono } from "@hono/zod-openapi";
import { requireAuth, requireOrganization, requireScope } from "../middleware/auth";
import { validateFile, saveFile, deleteFile, fileExists } from "../lib/uploads";
import { createLogger } from "@uni-status/shared";

const log = createLogger({ module: "uploads-routes" });

export const uploadsRoutes = new OpenAPIHono();

// Upload a file
uploadsRoutes.post("/", async (c) => {
  requireAuth(c);
  const organizationId = await requireOrganization(c);
  requireScope(c, "write");

  // Parse multipart form data
  const formData = await c.req.formData();
  const file = formData.get("file");

  if (!file || !(file instanceof File)) {
    return c.json(
      {
        success: false,
        error: "No file provided. Please upload a file using the 'file' field.",
      },
      400
    );
  }

  // Validate file
  const validation = validateFile(file);
  if (!validation.valid) {
    return c.json(
      {
        success: false,
        error: validation.error,
      },
      400
    );
  }

  try {
    // Save file to storage (S3 or local)
    const result = await saveFile(file, organizationId);

    let absoluteUrl: string;
    let apiPath: string;

    if (result.isS3) {
      // S3 URL is already absolute
      absoluteUrl = result.urlPath;
      apiPath = result.urlPath;
    } else {
      // Local storage needs origin prefix
      const origin = new URL(c.req.url).origin;
      // Expose uploads under /api/uploads so they work behind the reverse proxy
      apiPath = `/api${result.urlPath}`;
      absoluteUrl = `${origin}${apiPath}`;
    }

    return c.json({
      success: true,
      data: {
        url: absoluteUrl,
        path: apiPath,
        filename: result.filename,
      },
    });
  } catch (error) {
    log.error({ err: error }, "Failed to save file");
    return c.json(
      {
        success: false,
        error: "Failed to save file. Please try again.",
      },
      500
    );
  }
});

// Delete a file
uploadsRoutes.delete("/:filename", async (c) => {
  requireAuth(c);
  const organizationId = await requireOrganization(c);
  requireScope(c, "write");

  const { filename } = c.req.param();

  // Security: validate filename doesn't contain path traversal
  if (filename.includes("/") || filename.includes("\\") || filename.includes("..")) {
    return c.json(
      {
        success: false,
        error: "Invalid filename",
      },
      400
    );
  }

  // Check if file exists
  const exists = await fileExists(organizationId, filename);
  if (!exists) {
    return c.json(
      {
        success: false,
        error: "File not found",
      },
      404
    );
  }

  // Delete file
  const deleted = await deleteFile(organizationId, filename);
  if (!deleted) {
    return c.json(
      {
        success: false,
        error: "Failed to delete file",
      },
      500
    );
  }

  return c.json({
    success: true,
    data: { deleted: true },
  });
});
