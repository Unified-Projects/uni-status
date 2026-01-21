import { nanoid } from "nanoid";
import { mkdir, unlink } from "node:fs/promises";
import { join, extname } from "node:path";
import {
  S3Client,
  PutObjectCommand,
  DeleteObjectCommand,
  HeadObjectCommand,
} from "@aws-sdk/client-s3";
import { getS3Config, getAwsConfig, getStorageConfig } from "@uni-status/shared/config";

// Supported image types
const ALLOWED_MIME_TYPES = [
  "image/png",
  "image/jpeg",
  "image/jpg",
  "image/gif",
  "image/svg+xml",
  "image/webp",
  "image/x-icon",
  "image/vnd.microsoft.icon",
];

const ALLOWED_EXTENSIONS = [".png", ".jpg", ".jpeg", ".gif", ".svg", ".webp", ".ico"];

// Max file size: 5MB
const MAX_FILE_SIZE = 5 * 1024 * 1024;

// Get storage configuration
const storageConfig = getStorageConfig();
const s3Config = getS3Config();
const awsConfig = getAwsConfig();

// Upload directory (from config or default)
const UPLOAD_DIR = storageConfig.uploadsDir.startsWith("/")
  ? storageConfig.uploadsDir
  : join(process.cwd(), storageConfig.uploadsDir);

// Initialize S3 client if configured
// Priority: New S3 config > Legacy AWS config
const s3Client = (() => {
  // Check new S3-compatible config first
  if (s3Config.accessKey && s3Config.secretKey && s3Config.bucket) {
    return new S3Client({
      region: s3Config.region,
      endpoint: s3Config.endpoint,
      forcePathStyle: s3Config.forcePathStyle,
      credentials: {
        accessKeyId: s3Config.accessKey,
        secretAccessKey: s3Config.secretKey,
      },
    });
  }
  // Fall back to legacy AWS config
  if (awsConfig.accessKeyId && awsConfig.secretAccessKey && awsConfig.s3Bucket) {
    return new S3Client({
      region: awsConfig.region,
      credentials: {
        accessKeyId: awsConfig.accessKeyId,
        secretAccessKey: awsConfig.secretAccessKey,
      },
    });
  }
  return null;
})();

// Determine which bucket to use
const s3Bucket = s3Config.bucket || awsConfig.s3Bucket;

// S3 sub-folder prefix (optional, for shared buckets)
const s3SubFolder = s3Config.subFolder?.replace(/^\/|\/$/g, ""); // Strip leading/trailing slashes

/**
 * Build an S3 key with optional sub-folder prefix
 */
function buildS3Key(path: string): string {
  if (s3SubFolder) {
    return `${s3SubFolder}/${path}`;
  }
  return path;
}

/**
 * Check if S3 storage is enabled
 */
export function isS3Enabled(): boolean {
  return s3Client !== null && !!s3Bucket;
}

/**
 * Build the public URL for an S3 object.
 * Returns a proxy URL that routes through our API to serve private bucket files.
 */
function buildS3PublicUrl(key: string, organizationId: string, filename: string): string {
  // Always return proxy URL - bucket is private, must serve through API
  return `/api/v1/assets/${organizationId}/${filename}`;
}

/**
 * Build the direct S3 URL for internal use (e.g., fetching in proxy).
 * This is the actual S3 URL, not intended for public consumption.
 */
export function buildDirectS3Url(key: string): string {
  // If a public URL is configured (e.g., CDN or R2 public bucket), use it
  if (s3Config.publicUrl) {
    return `${s3Config.publicUrl.replace(/\/$/, "")}/${key}`;
  }
  // If using custom endpoint, construct URL based on path style
  if (s3Config.endpoint) {
    if (s3Config.forcePathStyle) {
      // Path-style: endpoint/bucket/key (MinIO style)
      return `${s3Config.endpoint.replace(/\/$/, "")}/${s3Bucket}/${key}`;
    } else {
      // Virtual-hosted style: bucket.endpoint/key
      const endpointUrl = new URL(s3Config.endpoint);
      return `${endpointUrl.protocol}//${s3Bucket}.${endpointUrl.host}/${key}`;
    }
  }
  // Default AWS S3 URL format
  const region = s3Config.region || awsConfig.region || "us-east-1";
  return `https://${s3Bucket}.s3.${region}.amazonaws.com/${key}`;
}

/**
 * Ensure the upload directory exists
 */
export async function ensureUploadDir(): Promise<void> {
  try {
    await mkdir(UPLOAD_DIR, { recursive: true });
  } catch (error) {
    // Directory already exists
  }
}

/**
 * Validate uploaded file
 */
export function validateFile(file: File): { valid: boolean; error?: string } {
  // Check file size
  if (file.size > MAX_FILE_SIZE) {
    return { valid: false, error: `File too large. Maximum size is ${MAX_FILE_SIZE / 1024 / 1024}MB` };
  }

  // Check MIME type
  if (!ALLOWED_MIME_TYPES.includes(file.type)) {
    return { valid: false, error: `Invalid file type: ${file.type}. Allowed types: PNG, JPG, GIF, SVG, WebP, ICO` };
  }

  // Check extension
  const ext = extname(file.name).toLowerCase();
  if (!ALLOWED_EXTENSIONS.includes(ext)) {
    return { valid: false, error: `Invalid file extension: ${ext}` };
  }

  return { valid: true };
}

/**
 * Save uploaded file to storage (S3 or local filesystem)
 */
export async function saveFile(
  file: File,
  organizationId: string
): Promise<{ filename: string; path: string; urlPath: string; isS3: boolean }> {
  // Generate unique filename
  const ext = extname(file.name).toLowerCase();
  const filename = `${nanoid()}${ext}`;
  const arrayBuffer = await file.arrayBuffer();

  if (isS3Enabled()) {
    // Upload to S3
    const s3Key = buildS3Key(`uploads/${organizationId}/${filename}`);
    const buffer = Buffer.from(arrayBuffer);

    await s3Client!.send(
      new PutObjectCommand({
        Bucket: s3Bucket!,
        Key: s3Key,
        Body: buffer,
        ContentType: file.type,
        CacheControl: "public, max-age=31536000", // 1 year cache for immutable files
      })
    );

    const publicUrl = buildS3PublicUrl(s3Key, organizationId, filename);

    return {
      filename,
      path: s3Key,
      urlPath: publicUrl, // Proxy URL for serving private S3 files
      isS3: true,
    };
  } else {
    // Local filesystem storage
    await ensureUploadDir();

    // Create organization subdirectory
    const orgDir = join(UPLOAD_DIR, organizationId);
    await mkdir(orgDir, { recursive: true });

    const filepath = join(orgDir, filename);

    // Write file to disk
    await Bun.write(filepath, arrayBuffer);

    // Return the public URL path (relative, to be combined with the API origin)
    const urlPath = `/uploads/${organizationId}/${filename}`;

    return {
      filename,
      path: filepath,
      urlPath,
      isS3: false,
    };
  }
}

/**
 * Delete a file from storage (S3 or local filesystem)
 */
export async function deleteFile(organizationId: string, filename: string): Promise<boolean> {
  // Security check - prevent path traversal
  if (filename.includes("/") || filename.includes("\\") || filename.includes("..")) {
    console.error(`[Uploads] Invalid filename rejected: ${filename}`);
    return false;
  }

  if (isS3Enabled()) {
    // Delete from S3
    const s3Key = buildS3Key(`uploads/${organizationId}/${filename}`);
    try {
      await s3Client!.send(
        new DeleteObjectCommand({
          Bucket: s3Bucket!,
          Key: s3Key,
        })
      );
      return true;
    } catch (error) {
      console.error(`[Uploads] Failed to delete S3 object ${s3Key}:`, error);
      return false;
    }
  } else {
    // Delete from local filesystem
    const filepath = join(UPLOAD_DIR, organizationId, filename);

    try {
      // Verify file exists
      const exists = await Bun.file(filepath).exists();
      if (!exists) {
        return false;
      }

      await unlink(filepath);
      return true;
    } catch (error) {
      console.error(`[Uploads] Failed to delete file ${filepath}:`, error);
      return false;
    }
  }
}

/**
 * Get the upload directory path
 */
export function getUploadDir(): string {
  return UPLOAD_DIR;
}

/**
 * Check if a file exists (S3 or local filesystem)
 */
export async function fileExists(organizationId: string, filename: string): Promise<boolean> {
  // Security check - prevent path traversal
  if (filename.includes("/") || filename.includes("\\") || filename.includes("..")) {
    return false;
  }

  if (isS3Enabled()) {
    // Check S3
    const s3Key = buildS3Key(`uploads/${organizationId}/${filename}`);
    try {
      await s3Client!.send(
        new HeadObjectCommand({
          Bucket: s3Bucket!,
          Key: s3Key,
        })
      );
      return true;
    } catch {
      return false;
    }
  } else {
    // Check local filesystem
    const filepath = join(UPLOAD_DIR, organizationId, filename);
    return await Bun.file(filepath).exists();
  }
}

/**
 * Parse upload URL to extract organizationId and filename.
 * Returns null for external URLs or unrecognized formats.
 *
 * Recognized URL patterns:
 * - Proxy URL: /api/v1/assets/{orgId}/{filename}
 * - Local URL: /api/uploads/{orgId}/{filename} or /uploads/{orgId}/{filename}
 * - Direct S3 URL: ...uploads/{orgId}/{filename} (legacy)
 */
export function parseUploadUrl(url: string | null | undefined): { organizationId: string; filename: string } | null {
  if (!url) {
    return null;
  }

  // Try to parse as URL or path
  let pathname: string;
  try {
    // Handle both absolute URLs and relative paths
    if (url.startsWith("http://") || url.startsWith("https://")) {
      pathname = new URL(url).pathname;
    } else {
      pathname = url;
    }
  } catch {
    return null;
  }

  // Match patterns:
  // /api/v1/assets/{orgId}/{filename}
  // /api/uploads/{orgId}/{filename}
  // /uploads/{orgId}/{filename}
  // .../uploads/{orgId}/{filename} (S3 URLs)

  const patterns = [
    /^\/api\/v1\/assets\/([^\/]+)\/([^\/]+)$/,
    /^\/api\/uploads\/([^\/]+)\/([^\/]+)$/,
    /^\/uploads\/([^\/]+)\/([^\/]+)$/,
    /\/uploads\/([^\/]+)\/([^\/]+)$/,  // Matches S3 URLs like ...bucket/uploads/orgId/file
  ];

  for (const pattern of patterns) {
    const match = pathname.match(pattern);
    if (match) {
      const [, organizationId, filename] = match;
      // Security check - prevent path traversal
      if (
        organizationId &&
        filename &&
        !organizationId.includes("..") &&
        !filename.includes("..") &&
        !filename.includes("/") &&
        !filename.includes("\\")
      ) {
        return { organizationId, filename };
      }
    }
  }

  return null;
}

/**
 * Delete an uploaded file by its URL.
 * Handles external URLs gracefully (no-op).
 * Returns true if file was deleted or URL was external/unrecognized.
 * Returns false only on actual deletion failure.
 */
export async function deleteFileByUrl(url: string | null | undefined): Promise<boolean> {
  const parsed = parseUploadUrl(url);

  // If we can't parse the URL, treat it as external - not our file to delete
  if (!parsed) {
    return true;
  }

  const { organizationId, filename } = parsed;

  try {
    const deleted = await deleteFile(organizationId, filename);
    if (!deleted) {
      // File didn't exist or couldn't be deleted - log but don't fail
      console.warn(`[Uploads] Could not delete file: ${organizationId}/${filename} (may not exist)`);
    }
    return true;
  } catch (error) {
    console.error(`[Uploads] Error deleting file by URL ${url}:`, error);
    return false;
  }
}

/**
 * Get S3 client for proxy route usage
 */
export function getS3Client() {
  return s3Client;
}

/**
 * Get S3 bucket name for proxy route usage
 */
export function getS3Bucket() {
  return s3Bucket;
}

/**
 * Build S3 key for a given organization and filename
 */
export function buildS3KeyForFile(organizationId: string, filename: string): string {
  return buildS3Key(`uploads/${organizationId}/${filename}`);
}
