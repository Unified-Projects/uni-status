const RAW_API_URL = process.env.NEXT_PUBLIC_API_URL || "/api";
// Normalize base URL by stripping trailing slashes
const API_URL = RAW_API_URL.replace(/\/+$/, "");
// Detect if the base already includes "/api" (with or without trailing slash)
const BASE_INCLUDES_API = /\/api$/i.test(API_URL);

function normalizeEndpoint(endpoint: string): string {
  // Ensure a single leading slash
  let path = `/${endpoint.replace(/^\/+/, "")}`;

  // If base already includes /api, strip any leading /api from the endpoint
  if (BASE_INCLUDES_API) {
    path = path.replace(/^\/api(\/|$)/i, "/");
  }

  // Collapse any duplicate slashes
  path = path.replace(/\/{2,}/g, "/");

  return path;
}

interface ApiOptions {
  method?: string;
  body?: unknown;
  headers?: Record<string, string>;
  organizationId?: string;
}

type ApiError = {
  success: false;
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
};

type ApiSuccess<T, E extends object> = { success: true; data?: T } & E;

export type ApiResponse<T, E extends object = {}> = ApiSuccess<T, E> | ApiError;

export async function api<T, E extends object = {}>(
  endpoint: string,
  options: ApiOptions = {}
): Promise<ApiResponse<T, E>> {
  const { method = "GET", body, headers = {}, organizationId } = options;

  const requestHeaders: Record<string, string> = {
    "Content-Type": "application/json",
    ...headers,
  };

  if (organizationId) {
    requestHeaders["X-Organization-Id"] = organizationId;
  }

  const normalizedEndpoint = normalizeEndpoint(endpoint);

  const response = await fetch(`${API_URL}${normalizedEndpoint}`, {
    method,
    headers: requestHeaders,
    body: body ? JSON.stringify(body) : undefined,
    credentials: "include",
  });

  const data = await response.json();

  if (response.status === 401 && typeof window !== "undefined") {
    // Check if this is a status page AUTH_REQUIRED error (should NOT redirect to /login)
    const errorData = data?.error;
    if (errorData?.code === "AUTH_REQUIRED") {
      // Let the calling code handle this - don't redirect
      return {
        success: false,
        error: errorData,
      };
    }
    // Session likely expired; redirect to login and preserve intended path.
    const redirectUrl = `/login?redirect=${encodeURIComponent(window.location.pathname + window.location.search)}`;
    window.location.href = redirectUrl;
  }

  if (!response.ok) {
    return {
      success: false,
      error: data.error || {
        code: "UNKNOWN_ERROR",
        message: "An unknown error occurred",
      },
    };
  }

  return data as ApiResponse<T, E>;
}

// Convenience methods
export const apiGet = <T, E extends object = {}>(endpoint: string, options?: Omit<ApiOptions, "method">) =>
  api<T, E>(endpoint, { ...options, method: "GET" });

export const apiPost = <T, E extends object = {}>(endpoint: string, body: unknown, options?: Omit<ApiOptions, "method" | "body">) =>
  api<T, E>(endpoint, { ...options, method: "POST", body });

export const apiPatch = <T, E extends object = {}>(endpoint: string, body: unknown, options?: Omit<ApiOptions, "method" | "body">) =>
  api<T, E>(endpoint, { ...options, method: "PATCH", body });

export const apiDelete = <T, E extends object = {}>(endpoint: string, options?: Omit<ApiOptions, "method">) =>
  api<T, E>(endpoint, { ...options, method: "DELETE" });

export const apiPut = <T, E extends object = {}>(endpoint: string, body: unknown, options?: Omit<ApiOptions, "method" | "body">) =>
  api<T, E>(endpoint, { ...options, method: "PUT", body });

// Get the full URL for an uploaded asset (handles relative paths from API)
export function getAssetUrl(path: string | null | undefined): string {
  if (!path) return "";
  if (path.startsWith("http://") || path.startsWith("https://")) {
    return path;
  }

  // Normalize known upload paths so they route through the API (reverse proxy forwards /api/*)
  const normalizedPath = path.startsWith("/api/")
    ? path
    : path.startsWith("/uploads/")
      ? `/api${path}`
      : path.startsWith("uploads/")
        ? `/api/${path}`
        : path.startsWith("//")
          ? `/api${path.replace(/^\/+/, "/")}`
          : path.startsWith("/")
            ? path
            : `/${path}`;

  // For relative URLs (uploaded files), prepend API URL without duplicating /api
  return `${API_URL.replace(/\/api$/, "")}${normalizedPath}`;
}

// File upload function (uses FormData instead of JSON)
export async function apiUpload<T>(
  endpoint: string,
  file: File,
  options: { organizationId?: string } = {}
): Promise<ApiResponse<T>> {
  const { organizationId } = options;

  // Require organization context for uploads
  if (!organizationId) {
    return {
      success: false,
      error: {
        code: "ORGANIZATION_REQUIRED",
        message: "Organization context required. Please refresh the page.",
      },
    };
  }

  const formData = new FormData();
  formData.append("file", file);

  const headers: Record<string, string> = {};
  if (organizationId) {
    headers["X-Organization-Id"] = organizationId;
  }

  const normalizedEndpoint = normalizeEndpoint(endpoint);

  const response = await fetch(`${API_URL}${normalizedEndpoint}`, {
    method: "POST",
    headers,
    body: formData,
    credentials: "include",
  });

  const data = await response.json();

  if (response.status === 401 && typeof window !== "undefined") {
    // Check if this is a status page AUTH_REQUIRED error (should NOT redirect to /login)
    const errorData = data?.error;
    if (errorData?.code === "AUTH_REQUIRED") {
      // Let the calling code handle this - don't redirect
      return {
        success: false,
        error: errorData,
      };
    }
    const redirectUrl = `/login?redirect=${encodeURIComponent(window.location.pathname + window.location.search)}`;
    window.location.href = redirectUrl;
  }

  if (!response.ok) {
    return {
      success: false,
      error: data.error || {
        code: "UNKNOWN_ERROR",
        message: "An unknown error occurred",
      },
    };
  }

  return data;
}
