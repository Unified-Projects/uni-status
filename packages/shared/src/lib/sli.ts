import type { CheckStatus } from "../types";

export interface SliThresholds {
  degraded?: number;
  down?: number;
  comparison?: "gte" | "lte";
  normalizePercent?: boolean;
}

// Evaluate an SLI value against thresholds/SLOs to derive a check status
export function evaluateSliStatus(
  value: number | null | undefined,
  thresholds?: SliThresholds | null,
  sloTargetPercent?: number | null
): CheckStatus {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return "error";
  }

  const comparison: "gte" | "lte" = thresholds?.comparison ?? "gte";

  // Auto-normalize ratios to percentages when requested
  let measurement = value;
  if (thresholds?.normalizePercent && measurement <= 1) {
    measurement = measurement * 100;
  }

  // Prefer explicit thresholds; fall back to SLO target (with a 5% buffer for "down")
  const degradedThreshold =
    thresholds?.degraded ?? (sloTargetPercent !== null && sloTargetPercent !== undefined ? sloTargetPercent : undefined);
  const downThreshold =
    thresholds?.down ??
    (sloTargetPercent !== null && sloTargetPercent !== undefined ? Math.max(sloTargetPercent - 5, 0) : undefined);

  if (comparison === "gte") {
    if (downThreshold !== undefined && measurement < downThreshold) {
      return "failure";
    }
    if (degradedThreshold !== undefined && measurement < degradedThreshold) {
      return "degraded";
    }
  } else {
    if (downThreshold !== undefined && measurement > downThreshold) {
      return "failure";
    }
    if (degradedThreshold !== undefined && measurement > degradedThreshold) {
      return "degraded";
    }
  }

  return "success";
}
