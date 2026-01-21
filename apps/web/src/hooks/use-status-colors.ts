"use client";

import { useState, useEffect } from "react";
import { useTheme } from "next-themes";

/**
 * CSS variable names for status colors
 */
const STATUS_COLOR_VARS = {
  success: "--status-success-solid",
  warning: "--status-warning-solid",
  error: "--status-error-solid",
  info: "--status-info-solid",
  orange: "--status-orange-solid",
  gray: "--status-gray-solid",
  purple: "--status-purple-solid",
} as const;

/**
 * Default fallback colors (used during SSR or if resolution fails)
 */
const DEFAULT_COLORS = {
  success: "#22c55e",
  warning: "#eab308",
  error: "#ef4444",
  info: "#3b82f6",
  orange: "#f97316",
  gray: "#6b7280",
  purple: "#a855f7",
} as const;

type StatusColorKey = keyof typeof STATUS_COLOR_VARS;

export interface ResolvedStatusColors {
  success: string;
  warning: string;
  error: string;
  info: string;
  orange: string;
  gray: string;
  purple: string;
  // Monitor status colors
  active: string;
  degraded: string;
  down: string;
  paused: string;
  pending: string;
  offline: string;
  disabled: string;
  // Severity colors
  minor: string;
  major: string;
  critical: string;
  maintenance: string;
}

/**
 * Hook that resolves CSS variable status colors at runtime.
 * Useful for Leaflet markers, Canvas rendering, and other contexts
 * where Tailwind classes cannot be used.
 *
 * Returns resolved hex colors that update when the theme changes.
 */
export function useStatusColors(): ResolvedStatusColors {
  const { resolvedTheme } = useTheme();
  const [colors, setColors] = useState<ResolvedStatusColors>(getDefaultColors());

  useEffect(() => {
    // Resolve colors from CSS variables
    const resolveColor = (varName: string, fallback: string): string => {
      if (typeof window === "undefined") return fallback;
      const value = getComputedStyle(document.documentElement)
        .getPropertyValue(varName)
        .trim();
      return value || fallback;
    };

    const resolved: ResolvedStatusColors = {
      // Base colors
      success: resolveColor(STATUS_COLOR_VARS.success, DEFAULT_COLORS.success),
      warning: resolveColor(STATUS_COLOR_VARS.warning, DEFAULT_COLORS.warning),
      error: resolveColor(STATUS_COLOR_VARS.error, DEFAULT_COLORS.error),
      info: resolveColor(STATUS_COLOR_VARS.info, DEFAULT_COLORS.info),
      orange: resolveColor(STATUS_COLOR_VARS.orange, DEFAULT_COLORS.orange),
      gray: resolveColor(STATUS_COLOR_VARS.gray, DEFAULT_COLORS.gray),
      purple: resolveColor(STATUS_COLOR_VARS.purple, DEFAULT_COLORS.purple),
      // Monitor status colors (mapped from base colors)
      active: resolveColor(STATUS_COLOR_VARS.success, DEFAULT_COLORS.success),
      degraded: resolveColor(STATUS_COLOR_VARS.warning, DEFAULT_COLORS.warning),
      down: resolveColor(STATUS_COLOR_VARS.error, DEFAULT_COLORS.error),
      paused: resolveColor(STATUS_COLOR_VARS.gray, DEFAULT_COLORS.gray),
      pending: resolveColor(STATUS_COLOR_VARS.gray, DEFAULT_COLORS.gray),
      offline: resolveColor(STATUS_COLOR_VARS.gray, DEFAULT_COLORS.gray),
      disabled: resolveColor("--status-gray-border", "#e5e7eb"),
      // Severity colors
      minor: resolveColor(STATUS_COLOR_VARS.warning, DEFAULT_COLORS.warning),
      major: resolveColor(STATUS_COLOR_VARS.orange, DEFAULT_COLORS.orange),
      critical: resolveColor(STATUS_COLOR_VARS.error, DEFAULT_COLORS.error),
      maintenance: resolveColor(STATUS_COLOR_VARS.purple, DEFAULT_COLORS.purple),
    };

    setColors(resolved);
  }, [resolvedTheme]);

  return colors;
}

/**
 * Get default colors (used for SSR and initial render)
 */
function getDefaultColors(): ResolvedStatusColors {
  return {
    success: DEFAULT_COLORS.success,
    warning: DEFAULT_COLORS.warning,
    error: DEFAULT_COLORS.error,
    info: DEFAULT_COLORS.info,
    orange: DEFAULT_COLORS.orange,
    gray: DEFAULT_COLORS.gray,
    purple: DEFAULT_COLORS.purple,
    active: DEFAULT_COLORS.success,
    degraded: DEFAULT_COLORS.warning,
    down: DEFAULT_COLORS.error,
    paused: DEFAULT_COLORS.gray,
    pending: DEFAULT_COLORS.gray,
    offline: DEFAULT_COLORS.gray,
    disabled: "#e5e7eb",
    minor: DEFAULT_COLORS.warning,
    major: DEFAULT_COLORS.orange,
    critical: DEFAULT_COLORS.error,
    maintenance: DEFAULT_COLORS.purple,
  };
}

/**
 * Get a resolved status color for a given monitor status.
 * For use outside of React components.
 */
export function getResolvedMonitorStatusColor(status: string): string {
  if (typeof window === "undefined") {
    const statusMap: Record<string, string> = {
      active: DEFAULT_COLORS.success,
      degraded: DEFAULT_COLORS.warning,
      down: DEFAULT_COLORS.error,
      paused: DEFAULT_COLORS.gray,
      pending: DEFAULT_COLORS.gray,
      offline: DEFAULT_COLORS.gray,
      disabled: "#e5e7eb",
    };
    return statusMap[status] || DEFAULT_COLORS.gray;
  }

  const varMap: Record<string, string> = {
    active: STATUS_COLOR_VARS.success,
    degraded: STATUS_COLOR_VARS.warning,
    down: STATUS_COLOR_VARS.error,
    paused: STATUS_COLOR_VARS.gray,
    pending: STATUS_COLOR_VARS.gray,
    offline: STATUS_COLOR_VARS.gray,
    disabled: "--status-gray-border",
  };

  const varName = varMap[status] || STATUS_COLOR_VARS.gray;
  const value = getComputedStyle(document.documentElement)
    .getPropertyValue(varName)
    .trim();
  return value || DEFAULT_COLORS.gray;
}

/**
 * Get a resolved severity color.
 * For use outside of React components.
 */
export function getResolvedSeverityColor(severity: string): string {
  if (typeof window === "undefined") {
    const severityMap: Record<string, string> = {
      minor: DEFAULT_COLORS.warning,
      major: DEFAULT_COLORS.orange,
      critical: DEFAULT_COLORS.error,
      maintenance: DEFAULT_COLORS.purple,
    };
    return severityMap[severity] || DEFAULT_COLORS.warning;
  }

  const varMap: Record<string, string> = {
    minor: STATUS_COLOR_VARS.warning,
    major: STATUS_COLOR_VARS.orange,
    critical: STATUS_COLOR_VARS.error,
    maintenance: STATUS_COLOR_VARS.purple,
  };

  const varName = varMap[severity] || STATUS_COLOR_VARS.warning;
  const value = getComputedStyle(document.documentElement)
    .getPropertyValue(varName)
    .trim();
  return value || DEFAULT_COLORS.warning;
}
