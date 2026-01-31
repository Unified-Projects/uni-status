"use client";

import { useMemo } from "react";
import { Check, AlertTriangle, XCircle, Clock, Sun, Moon } from "lucide-react";
import { cn } from "@uni-status/ui";
import type { StatusPageThemeColors } from "@/lib/api-client";

interface ThemePreviewProps {
  colors: StatusPageThemeColors;
  mode: "light" | "dark";
  className?: string;
}

export function ThemePreview({ colors, mode, className }: ThemePreviewProps) {
  const resolvedColors = useMemo(() => {
    const isDark = mode === "dark";
    return {
      background: isDark ? colors.backgroundDark || colors.background : colors.background,
      text: isDark ? colors.textDark || colors.text : colors.text,
      surface: isDark ? colors.surfaceDark || colors.surface : colors.surface,
      border: isDark ? colors.borderDark || colors.border || "#374151" : colors.border || "#e5e7eb",
      primary: colors.primary,
      secondary: colors.secondary || colors.primary,
      success: colors.success,
      warning: colors.warning,
      error: colors.error,
      info: colors.info || colors.primary,
    };
  }, [colors, mode]);

  const mockMonitors = [
    { name: "API Server", status: "operational" as const },
    { name: "Web Application", status: "operational" as const },
    { name: "Database", status: "degraded" as const },
    { name: "CDN", status: "down" as const },
  ];

  const getStatusColor = (status: "operational" | "degraded" | "down") => {
    switch (status) {
      case "operational":
        return resolvedColors.success;
      case "degraded":
        return resolvedColors.warning;
      case "down":
        return resolvedColors.error;
    }
  };

  const getStatusIcon = (status: "operational" | "degraded" | "down") => {
    switch (status) {
      case "operational":
        return Check;
      case "degraded":
        return AlertTriangle;
      case "down":
        return XCircle;
    }
  };

  const getStatusText = (status: "operational" | "degraded" | "down") => {
    switch (status) {
      case "operational":
        return "Operational";
      case "degraded":
        return "Degraded";
      case "down":
        return "Down";
    }
  };

  return (
    <div
      className={cn("rounded-lg border overflow-hidden", className)}
      style={{
        backgroundColor: resolvedColors.background,
        borderColor: resolvedColors.border,
      }}
    >
      {/* Mode indicator */}
      <div
        className="flex items-center justify-between px-3 py-1.5 text-xs"
        style={{
          backgroundColor: resolvedColors.surface,
          borderBottom: `1px solid ${resolvedColors.border}`,
          color: resolvedColors.text,
        }}
      >
        <span className="flex items-center gap-1.5 opacity-60">
          {mode === "light" ? <Sun className="h-3 w-3" /> : <Moon className="h-3 w-3" />}
          {mode === "light" ? "Light Mode" : "Dark Mode"}
        </span>
        <span className="opacity-40">Preview</span>
      </div>

      {/* Header */}
      <div
        className="px-4 py-3"
        style={{ borderBottom: `1px solid ${resolvedColors.border}` }}
      >
        <h3
          className="font-semibold text-sm"
          style={{ color: resolvedColors.text }}
        >
          System Status
        </h3>
        <p
          className="text-xs mt-0.5 opacity-60"
          style={{ color: resolvedColors.text }}
        >
          Current status of all services
        </p>
      </div>

      {/* Overall Status Banner */}
      <div
        className="mx-4 mt-3 px-3 py-2 rounded-md flex items-center gap-2"
        style={{
          backgroundColor: `${resolvedColors.success}20`,
          border: `1px solid ${resolvedColors.success}40`,
        }}
      >
        <Check className="h-4 w-4" style={{ color: resolvedColors.success }} />
        <span className="text-xs font-medium" style={{ color: resolvedColors.success }}>
          All Systems Operational
        </span>
      </div>

      {/* Monitor List */}
      <div className="p-4 space-y-2">
        {mockMonitors.map((monitor) => {
          const StatusIcon = getStatusIcon(monitor.status);
          const statusColor = getStatusColor(monitor.status);

          return (
            <div
              key={monitor.name}
              className="flex items-center justify-between px-3 py-2 rounded-md"
              style={{
                backgroundColor: resolvedColors.surface,
                border: `1px solid ${resolvedColors.border}`,
              }}
            >
              <div className="flex items-center gap-2">
                <div
                  className="w-2 h-2 rounded-full"
                  style={{ backgroundColor: statusColor }}
                />
                <span
                  className="text-xs font-medium"
                  style={{ color: resolvedColors.text }}
                >
                  {monitor.name}
                </span>
              </div>
              <div className="flex items-center gap-1.5">
                <StatusIcon className="h-3.5 w-3.5" style={{ color: statusColor }} />
                <span className="text-xs" style={{ color: statusColor }}>
                  {getStatusText(monitor.status)}
                </span>
              </div>
            </div>
          );
        })}
      </div>

      {/* Uptime Bars Mock */}
      <div
        className="px-4 pb-4"
        style={{ borderTop: `1px solid ${resolvedColors.border}` }}
      >
        <p
          className="text-xs font-medium mt-3 mb-2"
          style={{ color: resolvedColors.text }}
        >
          Uptime History (45 days)
        </p>
        <div className="flex gap-0.5">
          {Array.from({ length: 45 }).map((_, i) => {
            // Create some mock uptime data
            const rand = Math.random();
            let color = resolvedColors.success;
            if (i === 30) color = resolvedColors.error;
            else if (i === 35 || i === 36) color = resolvedColors.warning;
            else if (rand < 0.05) color = resolvedColors.warning;

            return (
              <div
                key={i}
                className="flex-1 h-5 rounded-sm"
                style={{ backgroundColor: color }}
              />
            );
          })}
        </div>
      </div>

      {/* Button Sample */}
      <div
        className="px-4 pb-4 flex gap-2"
        style={{ borderTop: `1px solid ${resolvedColors.border}` }}
      >
        <button
          className="flex-1 px-3 py-1.5 rounded-md text-xs font-medium mt-3"
          style={{
            backgroundColor: resolvedColors.primary,
            color: "#ffffff",
          }}
        >
          Subscribe
        </button>
        <button
          className="flex-1 px-3 py-1.5 rounded-md text-xs font-medium mt-3"
          style={{
            backgroundColor: "transparent",
            color: resolvedColors.text,
            border: `1px solid ${resolvedColors.border}`,
          }}
        >
          View History
        </button>
      </div>

      {/* Footer */}
      <div
        className="px-4 py-2 flex items-center justify-between text-xs"
        style={{
          backgroundColor: resolvedColors.surface,
          borderTop: `1px solid ${resolvedColors.border}`,
          color: resolvedColors.text,
        }}
      >
        <span className="opacity-40">Powered by Uni-Status</span>
        <span className="flex items-center gap-1 opacity-40">
          <Clock className="h-3 w-3" />
          Updated 2m ago
        </span>
      </div>
    </div>
  );
}

interface ThemePreviewDualProps {
  colors: StatusPageThemeColors;
  className?: string;
}

export function ThemePreviewDual({ colors, className }: ThemePreviewDualProps) {
  return (
    <div className={cn("grid grid-cols-1 lg:grid-cols-2 gap-4", className)}>
      <ThemePreview colors={colors} mode="light" />
      <ThemePreview colors={colors} mode="dark" />
    </div>
  );
}
