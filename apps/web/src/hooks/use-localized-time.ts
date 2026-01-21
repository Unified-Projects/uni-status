"use client";

import { useCallback } from "react";
import { useTimezone } from "@/contexts/timezone-context";
import { useI18n } from "@/contexts/i18n-context";

function interpolate(template: string, value: number) {
  return template.replace("{value}", String(value));
}

export function useLocalizedTime() {
  const { resolvedTimezone } = useTimezone();
  const { locale, t, direction } = useI18n();

  const formatDateTime = useCallback(
    (dateStr: string) => {
      const date = new Date(dateStr);
      return date.toLocaleString(locale || undefined, {
        timeZone: resolvedTimezone,
        month: "short",
        day: "numeric",
        year: "numeric",
        hour: "numeric",
        minute: "2-digit",
        hour12: true,
      });
    },
    [locale, resolvedTimezone]
  );

  const formatDate = useCallback(
    (dateStr: string) => {
      const date = new Date(dateStr);
      return date.toLocaleDateString(locale || undefined, {
        timeZone: resolvedTimezone,
        weekday: "long",
        month: "long",
        day: "numeric",
        year: "numeric",
      });
    },
    [locale, resolvedTimezone]
  );

  const formatTime = useCallback(
    (dateStr: string) => {
      const date = new Date(dateStr);
      return date.toLocaleTimeString(locale || undefined, {
        timeZone: resolvedTimezone,
        hour: "numeric",
        minute: "2-digit",
        hour12: true,
      });
    },
    [locale, resolvedTimezone]
  );

  const formatRelativeTime = useCallback(
    (dateStr: string) => {
      const date = new Date(dateStr);
      const now = new Date();
      const diffMs = now.getTime() - date.getTime();
      const diffMins = Math.floor(diffMs / 60000);
      const diffHours = Math.floor(diffMs / 3600000);
      const diffDays = Math.floor(diffMs / 86400000);

      if (diffMins < 0) {
        const futureMins = Math.abs(diffMins);
        const futureHours = Math.abs(diffHours);
        const futureDays = Math.abs(diffDays);

        if (futureMins < 60) return interpolate(t("time.inMinutes", "in {value}m"), futureMins);
        if (futureHours < 24) return interpolate(t("time.inHours", "in {value}h"), futureHours);
        if (futureDays < 7) return interpolate(t("time.inDays", "in {value}d"), futureDays);
        return formatDateTime(dateStr);
      }

      if (diffMins < 1) return t("time.justNow", "Just now");
      if (diffMins < 60) return interpolate(t("time.minutesAgo", "{value}m ago"), diffMins);
      if (diffHours < 24) return interpolate(t("time.hoursAgo", "{value}h ago"), diffHours);
      if (diffDays < 7) return interpolate(t("time.daysAgo", "{value}d ago"), diffDays);
      return formatDateTime(dateStr);
    },
    [formatDateTime, t]
  );

  return {
    formatDateTime,
    formatDate,
    formatTime,
    formatRelativeTime,
    locale,
    timezone: resolvedTimezone,
    direction,
  };
}
