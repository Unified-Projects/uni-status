"use client";

import { useEffect, useRef } from "react";
import { useI18n } from "@/contexts/i18n-context";
import { useTimezone, TIMEZONE_OPTIONS, type TimezoneValue } from "@/contexts/timezone-context";

interface StatusPageContainerProps {
  children: React.ReactNode;
  localization?: {
    defaultLocale?: string;
    supportedLocales?: string[];
    rtlLocales?: string[];
  };
  defaultTimezone?: string | null;
  initialLocale?: string;
}

export function StatusPageContainer({
  children,
  localization,
  defaultTimezone,
  initialLocale,
}: StatusPageContainerProps) {
  const { setLocale, direction, supportedLocales } = useI18n();
  const { setTimezone, timezone } = useTimezone();
  const hasAppliedDefaultTimezone = useRef(false);

  useEffect(() => {
    const availableLocales = localization?.supportedLocales || supportedLocales;
    const desiredLocale =
      (initialLocale && availableLocales.includes(initialLocale)) ||
      (localization?.defaultLocale && availableLocales.includes(localization.defaultLocale))
        ? (initialLocale || localization?.defaultLocale)!
        : availableLocales[0];
    setLocale(desiredLocale);
  }, [initialLocale, localization?.defaultLocale, localization?.supportedLocales, setLocale, supportedLocales]);

  useEffect(() => {
    if (hasAppliedDefaultTimezone.current) return;
    if (!defaultTimezone) return;
    const knownTimezone = TIMEZONE_OPTIONS.find((tz) => tz.value === defaultTimezone);
    if (knownTimezone) {
      hasAppliedDefaultTimezone.current = true;
      if (timezone !== knownTimezone.value) {
        setTimezone(knownTimezone.value as TimezoneValue);
      }
    }
  }, [defaultTimezone, setTimezone, timezone]);

  return (
    <div dir={direction} data-locale-container>
      {children}
    </div>
  );
}
