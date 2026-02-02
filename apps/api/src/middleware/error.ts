import { Context } from "hono";
import { HTTPException } from "hono/http-exception";
import { ZodError } from "zod";
import { createLogger } from "@uni-status/shared";

const log = createLogger({ module: "error-handler" });

export function errorHandler(err: Error, c: Context) {
  log.error({ err, path: c.req.path, method: c.req.method, errorName: err.name, errorConstructor: err.constructor.name }, "Request error");

  // Normalize HTTPExceptions (e.g., thrown by license/validation guards) to JSON
  if (err instanceof HTTPException) {
    return c.json(
      {
        success: false,
        error: err.message,
      },
      err.status
    );
  }

  // Zod validation error - check both instanceof and error name for cross-version compatibility
  if (err instanceof ZodError || err.name === "ZodError" || (err as any).issues) {
    const zodError = err as ZodError;
    return c.json(
      {
        success: false,
        error: {
          code: "VALIDATION_ERROR",
          message: "Invalid request data",
          details: zodError.errors?.map((e) => ({
            path: e.path.join("."),
            message: e.message,
          })) || (zodError as any).issues?.map((e: any) => ({
            path: e.path.join("."),
            message: e.message,
          })) || [],
        },
      },
      400
    );
  }

  // Known error types
  if (err.message === "Unauthorized") {
    return c.json(
      {
        success: false,
        error: {
          code: "UNAUTHORIZED",
          message: "Authentication required",
        },
      },
      401
    );
  }

  if (err.message === "Organization context required") {
    return c.json(
      {
        success: false,
        error: {
          code: "ORGANIZATION_REQUIRED",
          message: "X-Organization-Id header is required",
        },
      },
      400
    );
  }

  if (err.message.startsWith("Insufficient permissions:") ||
      err.message.startsWith("Insufficient API key scope") ||
      err.message === "Not a member of this organization" ||
      err.message === "User authentication required") {
    return c.json(
      {
        success: false,
        error: {
          code: "FORBIDDEN",
          message: err.message,
        },
      },
      403
    );
  }

  if (err.message === "Not found" ||
      err.message === "Member not found" ||
      err.message === "Organization not found" ||
      err.message.startsWith("Organization not found")) {
    return c.json(
      {
        success: false,
        error: {
          code: "NOT_FOUND",
          message: err.message === "Not found" ? "Resource not found" : err.message,
        },
      },
      404
    );
  }

  // Generic server error
  const showDetails = process.env.NODE_ENV === "development" || process.env.NODE_ENV === "test";
  return c.json(
    {
      success: false,
      error: {
        code: "INTERNAL_ERROR",
        message: showDetails ? err.message : "An unexpected error occurred",
      },
    },
    500
  );
}
