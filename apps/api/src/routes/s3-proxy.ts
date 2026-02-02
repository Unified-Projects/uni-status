import { OpenAPIHono } from "@hono/zod-openapi";
import { GetObjectCommand } from "@aws-sdk/client-s3";
import {
  isS3Enabled,
  getS3Client,
  getS3Bucket,
  buildS3KeyForFile,
  getUploadDir,
} from "../lib/uploads";
import { join } from "node:path";
import { createLogger } from "@uni-status/shared";

const log = createLogger({ module: "s3-proxy" });

export const s3ProxyRoutes = new OpenAPIHono();

// Content type mapping for common image extensions
const CONTENT_TYPES: Record<string, string> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".svg": "image/svg+xml",
  ".webp": "image/webp",
  ".ico": "image/x-icon",
};

/**
 * Validate filename to prevent path traversal attacks.
 * Returns true if filename is safe, false otherwise.
 */
function isValidFilename(filename: string): boolean {
  // Must not be empty
  if (!filename || filename.length === 0) {
    return false;
  }

  // Must not contain path traversal sequences
  if (filename.includes("..") || filename.includes("/") || filename.includes("\\")) {
    return false;
  }

  // Must not start with a dot (hidden files)
  if (filename.startsWith(".")) {
    return false;
  }

  // Must have an allowed extension
  const ext = filename.substring(filename.lastIndexOf(".")).toLowerCase();
  if (!CONTENT_TYPES[ext]) {
    return false;
  }

  return true;
}

/**
 * Validate organization ID format
 */
function isValidOrgId(orgId: string): boolean {
  // Must not be empty
  if (!orgId || orgId.length === 0) {
    return false;
  }

  // Must not contain path traversal sequences
  if (orgId.includes("..") || orgId.includes("/") || orgId.includes("\\")) {
    return false;
  }

  // Reasonable length check (nanoid is typically 21 chars)
  if (orgId.length > 50) {
    return false;
  }

  return true;
}

/**
 * GET /api/v1/assets/:organizationId/:filename
 *
 * Serves uploaded files from S3 (or local filesystem).
 * This proxy route is required because the S3 bucket is private.
 */
s3ProxyRoutes.get("/:organizationId/:filename", async (c) => {
  const { organizationId, filename } = c.req.param();

  // Validate parameters to prevent path traversal
  if (!isValidOrgId(organizationId)) {
    return c.json({ error: "Invalid organization ID" }, 400);
  }

  if (!isValidFilename(filename)) {
    return c.json({ error: "Invalid filename" }, 400);
  }

  // Determine content type from extension
  const ext = filename.substring(filename.lastIndexOf(".")).toLowerCase();
  const contentType = CONTENT_TYPES[ext] || "application/octet-stream";

  if (isS3Enabled()) {
    // Serve from S3
    const s3Client = getS3Client();
    const s3Bucket = getS3Bucket();

    if (!s3Client || !s3Bucket) {
      return c.json({ error: "S3 not configured" }, 500);
    }

    const s3Key = buildS3KeyForFile(organizationId, filename);

    try {
      const response = await s3Client.send(
        new GetObjectCommand({
          Bucket: s3Bucket,
          Key: s3Key,
        })
      );

      if (!response.Body) {
        return c.json({ error: "File not found" }, 404);
      }

      // Convert the readable stream to a web stream
      const stream = response.Body.transformToWebStream();

      return new Response(stream, {
        status: 200,
        headers: {
          "Content-Type": contentType,
          "Cache-Control": "public, max-age=31536000, immutable", // 1 year cache for immutable uploads
          "X-Content-Type-Options": "nosniff",
        },
      });
    } catch (error: unknown) {
      const err = error as { name?: string };
      if (err.name === "NoSuchKey") {
        return c.json({ error: "File not found" }, 404);
      }
      log.error({ err: error, s3Key }, "Error fetching S3 object");
      return c.json({ error: "Failed to fetch file" }, 500);
    }
  } else {
    // Serve from local filesystem
    const uploadDir = getUploadDir();
    const filepath = join(uploadDir, organizationId, filename);

    try {
      const file = Bun.file(filepath);
      const exists = await file.exists();

      if (!exists) {
        return c.json({ error: "File not found" }, 404);
      }

      const content = await file.arrayBuffer();

      return new Response(content, {
        status: 200,
        headers: {
          "Content-Type": contentType,
          "Cache-Control": "public, max-age=31536000, immutable", // 1 year cache for immutable uploads
          "X-Content-Type-Options": "nosniff",
        },
      });
    } catch (error) {
      log.error({ err: error, filepath }, "Error reading local file");
      return c.json({ error: "Failed to read file" }, 500);
    }
  }
});
