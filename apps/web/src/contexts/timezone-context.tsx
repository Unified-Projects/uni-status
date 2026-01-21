"use client";

import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  type ReactNode,
} from "react";

// Common timezone options with readable labels
export const TIMEZONE_OPTIONS = [
  { value: "local", label: "Browser Timezone", offset: "" },
  { value: "UTC", label: "UTC", offset: "+00:00" },
  { value: "America/New_York", label: "Eastern Time (ET)", offset: "-05:00" },
  { value: "America/Chicago", label: "Central Time (CT)", offset: "-06:00" },
  { value: "America/Denver", label: "Mountain Time (MT)", offset: "-07:00" },
  { value: "America/Los_Angeles", label: "Pacific Time (PT)", offset: "-08:00" },
  { value: "America/Anchorage", label: "Alaska Time (AKT)", offset: "-09:00" },
  { value: "Pacific/Honolulu", label: "Hawaii Time (HST)", offset: "-10:00" },
  { value: "Europe/London", label: "London (GMT/BST)", offset: "+00:00" },
  { value: "Europe/Paris", label: "Paris (CET/CEST)", offset: "+01:00" },
  { value: "Europe/Berlin", label: "Berlin (CET/CEST)", offset: "+01:00" },
  { value: "Europe/Moscow", label: "Moscow (MSK)", offset: "+03:00" },
  { value: "Asia/Dubai", label: "Dubai (GST)", offset: "+04:00" },
  { value: "Asia/Kolkata", label: "India (IST)", offset: "+05:30" },
  { value: "Asia/Singapore", label: "Singapore (SGT)", offset: "+08:00" },
  { value: "Asia/Shanghai", label: "Shanghai (CST)", offset: "+08:00" },
  { value: "Asia/Tokyo", label: "Tokyo (JST)", offset: "+09:00" },
  { value: "Australia/Sydney", label: "Sydney (AEST/AEDT)", offset: "+10:00" },
  { value: "Pacific/Auckland", label: "Auckland (NZST/NZDT)", offset: "+12:00" },
] as const;

export type TimezoneValue = (typeof TIMEZONE_OPTIONS)[number]["value"];

const STORAGE_KEY = "uni-status-timezone";

interface TimezoneContextValue {
  timezone: TimezoneValue;
  setTimezone: (tz: TimezoneValue) => void;
  resolvedTimezone: string; // The actual IANA timezone string (resolves "local" to browser TZ)
  isHydrated: boolean; // Whether the component has hydrated on the client
  formatDateTime: (dateStr: string) => string;
  formatDate: (dateStr: string) => string;
  formatTime: (dateStr: string) => string;
  formatRelativeTime: (dateStr: string) => string;
}

const TimezoneContext = createContext<TimezoneContextValue | null>(null);

function getBrowserTimezone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone;
  } catch {
    return "UTC";
  }
}

function resolveTimezone(tz: TimezoneValue): string {
  if (tz === "local") {
    return getBrowserTimezone();
  }
  return tz;
}

interface TimezoneProviderProps {
  children: ReactNode;
}

export function TimezoneProvider({ children }: TimezoneProviderProps) {
  const [timezone, setTimezoneState] = useState<TimezoneValue>("local");
  const [isHydrated, setIsHydrated] = useState(false);

  // Load from localStorage on mount
  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored && TIMEZONE_OPTIONS.some((opt) => opt.value === stored)) {
      setTimezoneState(stored as TimezoneValue);
    }
    setIsHydrated(true);
  }, []);

  const setTimezone = useCallback((tz: TimezoneValue) => {
    setTimezoneState(tz);
    localStorage.setItem(STORAGE_KEY, tz);
  }, []);

  const resolvedTimezone = resolveTimezone(timezone);

  // Formatting functions that use the selected timezone
  const formatDateTime = useCallback(
    (dateStr: string) => {
      const date = new Date(dateStr);
      return date.toLocaleString(undefined, {
        timeZone: resolvedTimezone,
        month: "short",
        day: "numeric",
        year: "numeric",
        hour: "numeric",
        minute: "2-digit",
        hour12: true,
      });
    },
    [resolvedTimezone]
  );

  const formatDate = useCallback(
    (dateStr: string) => {
      const date = new Date(dateStr);
      return date.toLocaleDateString(undefined, {
        timeZone: resolvedTimezone,
        weekday: "long",
        month: "long",
        day: "numeric",
        year: "numeric",
      });
    },
    [resolvedTimezone]
  );

  const formatTime = useCallback(
    (dateStr: string) => {
      const date = new Date(dateStr);
      return date.toLocaleTimeString(undefined, {
        timeZone: resolvedTimezone,
        hour: "numeric",
        minute: "2-digit",
        hour12: true,
      });
    },
    [resolvedTimezone]
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
        // Future date
        const futureMins = Math.abs(diffMins);
        const futureHours = Math.abs(diffHours);
        const futureDays = Math.abs(diffDays);

        if (futureMins < 60) return `in ${futureMins}m`;
        if (futureHours < 24) return `in ${futureHours}h`;
        if (futureDays < 7) return `in ${futureDays}d`;
        return formatDateTime(dateStr);
      }

      if (diffMins < 1) return "Just now";
      if (diffMins < 60) return `${diffMins}m ago`;
      if (diffHours < 24) return `${diffHours}h ago`;
      if (diffDays < 7) return `${diffDays}d ago`;
      return formatDateTime(dateStr);
    },
    [formatDateTime]
  );

  const value: TimezoneContextValue = {
    timezone,
    setTimezone,
    resolvedTimezone,
    isHydrated,
    formatDateTime,
    formatDate,
    formatTime,
    formatRelativeTime,
  };

  // During SSR, render with default timezone to avoid hydration mismatch
  if (!isHydrated) {
    return (
      <TimezoneContext.Provider value={value}>
        {children}
      </TimezoneContext.Provider>
    );
  }

  return (
    <TimezoneContext.Provider value={value}>
      {children}
    </TimezoneContext.Provider>
  );
}

export function useTimezone(): TimezoneContextValue {
  const context = useContext(TimezoneContext);
  if (!context) {
    throw new Error("useTimezone must be used within a TimezoneProvider");
  }
  return context;
}

// Hook for getting formatted date display with timezone indicator
export function useTimezoneDisplay(): {
  timezone: TimezoneValue;
  label: string;
  abbreviation: string;
} {
  const { timezone, resolvedTimezone } = useTimezone();

  const option = TIMEZONE_OPTIONS.find((opt) => opt.value === timezone);
  const label = option?.label || "Browser Timezone";

  // Get timezone abbreviation
  let abbreviation = "";
  try {
    const date = new Date();
    const formatted = date.toLocaleTimeString("en-US", {
      timeZone: resolvedTimezone,
      timeZoneName: "short",
    });
    const parts = formatted.split(" ");
    abbreviation = parts[parts.length - 1];
  } catch {
    abbreviation = timezone === "local" ? "Local" : timezone;
  }

  return { timezone, label, abbreviation };
}
