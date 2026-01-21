/**
 * Centralized status color configuration
 *
 * This file provides a single source of truth for all status-related styling.
 * All colors use CSS variables defined in globals.css, enabling theme customization.
 *
 * The colors are organized into three main categories:
 * 1. Monitor Status - for active/degraded/down/paused/pending states
 * 2. Event Status - for investigating/identified/monitoring/resolved/scheduled states
 * 3. Severity - for minor/major/critical/maintenance levels
 */

import {
  AlertTriangle,
  Calendar,
  CheckCircle,
  Clock,
  Pause,
  Wrench,
  XCircle,
  type LucideIcon,
} from "lucide-react";

// ============================================================================
// Types
// ============================================================================

export type MonitorStatus = "active" | "degraded" | "down" | "paused" | "pending";

export type EventStatus =
  | "investigating"
  | "identified"
  | "monitoring"
  | "resolved"
  | "scheduled"
  | "active"
  | "completed";

export type Severity = "minor" | "major" | "critical" | "maintenance";

export type StatusColorKey = "success" | "warning" | "error" | "info" | "orange" | "gray" | "purple";

export interface StatusColorConfig {
  /** Solid background color (for dots, badges) - e.g., bg-status-success-solid */
  solid: string;
  /** Solid hover color */
  solidHover: string;
  /** Container background color - e.g., bg-status-success-bg */
  bg: string;
  /** Subtle background color - e.g., bg-status-success-bg-subtle */
  bgSubtle: string;
  /** Text color - e.g., text-status-success-text */
  text: string;
  /** Border color - e.g., border-status-success-border */
  border: string;
  /** Icon color - e.g., text-status-success-icon */
  icon: string;
}

export interface MonitorStatusConfig {
  label: string;
  icon: LucideIcon;
  colors: StatusColorConfig;
}

export interface EventStatusConfig {
  label: string;
  icon: LucideIcon;
  colors: StatusColorConfig;
}

export interface SeverityConfig {
  label: string;
  colors: StatusColorConfig;
}

// ============================================================================
// Color Definitions (using Tailwind classes that reference CSS variables)
// ============================================================================

/**
 * Base color configurations using Tailwind utility classes.
 * These classes are defined in tailwind.config.ts and reference CSS variables.
 */
export const statusColors: Record<StatusColorKey, StatusColorConfig> = {
  success: {
    solid: "bg-status-success-solid",
    solidHover: "hover:bg-status-success-solid-hover",
    bg: "bg-status-success-bg",
    bgSubtle: "bg-status-success-bg-subtle",
    text: "text-status-success-text",
    border: "border-status-success-border",
    icon: "text-status-success-icon",
  },
  warning: {
    solid: "bg-status-warning-solid",
    solidHover: "hover:bg-status-warning-solid-hover",
    bg: "bg-status-warning-bg",
    bgSubtle: "bg-status-warning-bg-subtle",
    text: "text-status-warning-text",
    border: "border-status-warning-border",
    icon: "text-status-warning-icon",
  },
  error: {
    solid: "bg-status-error-solid",
    solidHover: "hover:bg-status-error-solid-hover",
    bg: "bg-status-error-bg",
    bgSubtle: "bg-status-error-bg-subtle",
    text: "text-status-error-text",
    border: "border-status-error-border",
    icon: "text-status-error-icon",
  },
  info: {
    solid: "bg-status-info-solid",
    solidHover: "hover:bg-status-info-solid-hover",
    bg: "bg-status-info-bg",
    bgSubtle: "bg-status-info-bg-subtle",
    text: "text-status-info-text",
    border: "border-status-info-border",
    icon: "text-status-info-icon",
  },
  orange: {
    solid: "bg-status-orange-solid",
    solidHover: "hover:bg-status-orange-solid-hover",
    bg: "bg-status-orange-bg",
    bgSubtle: "bg-status-orange-bg-subtle",
    text: "text-status-orange-text",
    border: "border-status-orange-border",
    icon: "text-status-orange-icon",
  },
  gray: {
    solid: "bg-status-gray-solid",
    solidHover: "hover:bg-status-gray-solid-hover",
    bg: "bg-status-gray-bg",
    bgSubtle: "bg-status-gray-bg-subtle",
    text: "text-status-gray-text",
    border: "border-status-gray-border",
    icon: "text-status-gray-icon",
  },
  purple: {
    solid: "bg-status-purple-solid",
    solidHover: "hover:bg-status-purple-solid-hover",
    bg: "bg-status-purple-bg",
    bgSubtle: "bg-status-purple-bg-subtle",
    text: "text-status-purple-text",
    border: "border-status-purple-border",
    icon: "text-status-purple-icon",
  },
};

// ============================================================================
// Monitor Status Configuration
// ============================================================================

export const monitorStatusConfig: Record<MonitorStatus, MonitorStatusConfig> = {
  active: {
    label: "Operational",
    icon: CheckCircle,
    colors: statusColors.success,
  },
  degraded: {
    label: "Degraded",
    icon: AlertTriangle,
    colors: statusColors.warning,
  },
  down: {
    label: "Down",
    icon: XCircle,
    colors: statusColors.error,
  },
  paused: {
    label: "Paused",
    icon: Pause,
    colors: statusColors.gray,
  },
  pending: {
    label: "Pending",
    icon: Clock,
    colors: statusColors.gray,
  },
};

// ============================================================================
// Event Status Configuration
// ============================================================================

export const eventStatusConfig: Record<EventStatus, EventStatusConfig> = {
  investigating: {
    label: "Investigating",
    icon: AlertTriangle,
    colors: statusColors.warning,
  },
  identified: {
    label: "Identified",
    icon: AlertTriangle,
    colors: statusColors.orange,
  },
  monitoring: {
    label: "Monitoring",
    icon: Clock,
    colors: statusColors.info,
  },
  resolved: {
    label: "Resolved",
    icon: CheckCircle,
    colors: statusColors.success,
  },
  scheduled: {
    label: "Scheduled",
    icon: Calendar,
    colors: statusColors.purple,
  },
  active: {
    label: "In Progress",
    icon: Wrench,
    colors: statusColors.info,
  },
  completed: {
    label: "Completed",
    icon: CheckCircle,
    colors: statusColors.success,
  },
};

// ============================================================================
// Severity Configuration
// ============================================================================

export const severityConfig: Record<Severity, SeverityConfig> = {
  minor: {
    label: "Minor",
    colors: statusColors.warning,
  },
  major: {
    label: "Major",
    colors: statusColors.orange,
  },
  critical: {
    label: "Critical",
    colors: statusColors.error,
  },
  maintenance: {
    label: "Maintenance",
    colors: statusColors.purple,
  },
};

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Get monitor status configuration with fallback
 */
export function getMonitorStatusConfig(status: string): MonitorStatusConfig {
  return monitorStatusConfig[status as MonitorStatus] || monitorStatusConfig.pending;
}

/**
 * Get event status configuration with fallback
 */
export function getEventStatusConfig(status: string): EventStatusConfig {
  return eventStatusConfig[status as EventStatus] || eventStatusConfig.investigating;
}

/**
 * Get severity configuration with fallback
 */
export function getSeverityConfig(severity: string): SeverityConfig {
  return severityConfig[severity as Severity] || severityConfig.minor;
}

// ============================================================================
// CSS Variable Resolution (for runtime contexts like Canvas/Leaflet)
// ============================================================================

/**
 * CSS variable names for status colors (for runtime resolution)
 */
export const statusColorVariables: Record<StatusColorKey, Record<string, string>> = {
  success: {
    solid: "--status-success-solid",
    solidHover: "--status-success-solid-hover",
    bg: "--status-success-bg",
    bgSubtle: "--status-success-bg-subtle",
    text: "--status-success-text",
    border: "--status-success-border",
    icon: "--status-success-icon",
  },
  warning: {
    solid: "--status-warning-solid",
    solidHover: "--status-warning-solid-hover",
    bg: "--status-warning-bg",
    bgSubtle: "--status-warning-bg-subtle",
    text: "--status-warning-text",
    border: "--status-warning-border",
    icon: "--status-warning-icon",
  },
  error: {
    solid: "--status-error-solid",
    solidHover: "--status-error-solid-hover",
    bg: "--status-error-bg",
    bgSubtle: "--status-error-bg-subtle",
    text: "--status-error-text",
    border: "--status-error-border",
    icon: "--status-error-icon",
  },
  info: {
    solid: "--status-info-solid",
    solidHover: "--status-info-solid-hover",
    bg: "--status-info-bg",
    bgSubtle: "--status-info-bg-subtle",
    text: "--status-info-text",
    border: "--status-info-border",
    icon: "--status-info-icon",
  },
  orange: {
    solid: "--status-orange-solid",
    solidHover: "--status-orange-solid-hover",
    bg: "--status-orange-bg",
    bgSubtle: "--status-orange-bg-subtle",
    text: "--status-orange-text",
    border: "--status-orange-border",
    icon: "--status-orange-icon",
  },
  gray: {
    solid: "--status-gray-solid",
    solidHover: "--status-gray-solid-hover",
    bg: "--status-gray-bg",
    bgSubtle: "--status-gray-bg-subtle",
    text: "--status-gray-text",
    border: "--status-gray-border",
    icon: "--status-gray-icon",
  },
  purple: {
    solid: "--status-purple-solid",
    solidHover: "--status-purple-solid-hover",
    bg: "--status-purple-bg",
    bgSubtle: "--status-purple-bg-subtle",
    text: "--status-purple-text",
    border: "--status-purple-border",
    icon: "--status-purple-icon",
  },
};

/**
 * Get the resolved hex color value from a CSS variable at runtime.
 * Useful for Canvas, Leaflet markers, and other non-CSS contexts.
 *
 * @param colorKey - The status color key (success, warning, error, etc.)
 * @param variant - The color variant (solid, bg, text, etc.)
 * @returns The resolved hex color value
 */
export function getResolvedStatusColor(
  colorKey: StatusColorKey,
  variant: "solid" | "solidHover" | "bg" | "bgSubtle" | "text" | "border" | "icon" = "solid"
): string {
  if (typeof window === "undefined") {
    // Fallback colors for SSR
    const fallbacks: Record<StatusColorKey, string> = {
      success: "#22c55e",
      warning: "#eab308",
      error: "#ef4444",
      info: "#3b82f6",
      orange: "#f97316",
      gray: "#6b7280",
      purple: "#a855f7",
    };
    return fallbacks[colorKey];
  }

  const variableName = statusColorVariables[colorKey][variant];
  return getComputedStyle(document.documentElement).getPropertyValue(variableName).trim();
}

/**
 * Get the resolved hex color for a monitor status.
 * Useful for Canvas, Leaflet markers, and other non-CSS contexts.
 */
export function getMonitorStatusColor(
  status: MonitorStatus,
  variant: "solid" | "solidHover" | "bg" | "bgSubtle" | "text" | "border" | "icon" = "solid"
): string {
  const statusToColorKey: Record<MonitorStatus, StatusColorKey> = {
    active: "success",
    degraded: "warning",
    down: "error",
    paused: "gray",
    pending: "gray",
  };
  return getResolvedStatusColor(statusToColorKey[status], variant);
}

/**
 * Get the resolved hex color for an event status.
 * Useful for Canvas, Leaflet markers, and other non-CSS contexts.
 */
export function getEventStatusColor(
  status: EventStatus,
  variant: "solid" | "solidHover" | "bg" | "bgSubtle" | "text" | "border" | "icon" = "solid"
): string {
  const statusToColorKey: Record<EventStatus, StatusColorKey> = {
    investigating: "warning",
    identified: "orange",
    monitoring: "info",
    resolved: "success",
    scheduled: "purple",
    active: "info",
    completed: "success",
  };
  return getResolvedStatusColor(statusToColorKey[status], variant);
}

/**
 * Get the resolved hex color for a severity level.
 * Useful for Canvas, Leaflet markers, and other non-CSS contexts.
 */
export function getSeverityColor(
  severity: Severity,
  variant: "solid" | "solidHover" | "bg" | "bgSubtle" | "text" | "border" | "icon" = "solid"
): string {
  const severityToColorKey: Record<Severity, StatusColorKey> = {
    minor: "warning",
    major: "orange",
    critical: "error",
    maintenance: "purple",
  };
  return getResolvedStatusColor(severityToColorKey[severity], variant);
}

// ============================================================================
// Composite Class Helpers
// ============================================================================

/**
 * Get combined classes for a badge-style status indicator
 */
export function getStatusBadgeClasses(colors: StatusColorConfig): string {
  return `${colors.solid} ${colors.solidHover} text-white`;
}

/**
 * Get combined classes for a card-style container with status styling
 */
export function getStatusCardClasses(colors: StatusColorConfig): string {
  return `${colors.bgSubtle} border ${colors.border}`;
}

/**
 * Get combined classes for text with status styling
 */
export function getStatusTextClasses(colors: StatusColorConfig): string {
  return colors.text;
}

/**
 * Get combined classes for an icon with status styling
 */
export function getStatusIconClasses(colors: StatusColorConfig): string {
  return colors.icon;
}

// ============================================================================
// Legacy Compatibility - CSS Variable References
// ============================================================================

/**
 * Status colors using CSS variable syntax for direct use in className.
 * Maintained for backward compatibility with existing components.
 */
export const statusColorsCssVar = {
  active: "bg-[var(--status-success-text)]",
  degraded: "bg-[var(--status-warning-text)]",
  down: "bg-[var(--status-error-text)]",
  paused: "bg-[var(--status-gray-text)]",
  pending: "bg-[var(--status-gray-text)]/70",
} as const;

export const statusTextColorsCssVar = {
  active: "text-[var(--status-success-text)]",
  degraded: "text-[var(--status-warning-text)]",
  down: "text-[var(--status-error-text)]",
  paused: "text-[var(--status-gray-text)]",
  pending: "text-[var(--status-gray-text)]",
} as const;

export const statusBgColorsCssVar = {
  active: "bg-[var(--status-success-bg)]",
  degraded: "bg-[var(--status-warning-bg)]",
  down: "bg-[var(--status-error-bg)]",
  paused: "bg-[var(--status-gray-bg)]",
  pending: "bg-[var(--status-gray-bg)]",
} as const;

export const statusBorderColorsCssVar = {
  active: "border-[var(--status-success-text)]",
  degraded: "border-[var(--status-warning-text)]",
  down: "border-[var(--status-error-text)]",
  paused: "border-[var(--status-gray-text)]",
  pending: "border-[var(--status-gray-text)]/70",
} as const;
