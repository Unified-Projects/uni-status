"use client";

import Link from "next/link";
import {
  cn,
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@uni-status/ui";
import { ExternalLink, CalendarClock, Rss, Globe, Languages } from "lucide-react";
import {
  useTimezone,
  TIMEZONE_OPTIONS,
  type TimezoneValue,
} from "@/contexts/timezone-context";
import { useI18n } from "@/contexts/i18n-context";

interface StatusPageFooterProps {
  footerText?: string;
  supportUrl?: string;
  hideBranding?: boolean;
  className?: string;
  slug?: string;
  basePath?: string;
  localization?: {
    defaultLocale?: string;
    supportedLocales?: string[];
  };
}

export function StatusPageFooter({
  footerText,
  supportUrl,
  hideBranding = false,
  className,
  slug,
  basePath,
  localization,
}: StatusPageFooterProps) {
  // Use basePath for links (empty string on custom domains, /status/{slug} on main domain)
  const linkBase = basePath ?? (slug ? `/status/${slug}` : "");
  const { timezone, setTimezone, resolvedTimezone, isHydrated } = useTimezone();
  const { locale, setLocale, supportedLocales, t } = useI18n();

  // Get timezone abbreviation for display
  const getTimezoneAbbreviation = (): string => {
    try {
      const date = new Date();
      const formatted = date.toLocaleTimeString("en-US", {
        timeZone: resolvedTimezone,
        timeZoneName: "short",
      });
      const parts = formatted.split(" ");
      return parts[parts.length - 1];
    } catch {
      return timezone === "local" ? "Local" : timezone;
    }
  };

  const timezoneAbbr = getTimezoneAbbreviation();

  // Group timezones by region for better UX
  const americasTimezones = TIMEZONE_OPTIONS.filter(
    (tz) =>
      tz.value.startsWith("America/") || tz.value.startsWith("Pacific/Honolulu")
  );
  const europeTimezones = TIMEZONE_OPTIONS.filter((tz) =>
    tz.value.startsWith("Europe/")
  );
  const asiaTimezones = TIMEZONE_OPTIONS.filter(
    (tz) =>
      tz.value.startsWith("Asia/") ||
      tz.value.startsWith("Australia/") ||
      tz.value === "Pacific/Auckland"
  );
  const otherTimezones = TIMEZONE_OPTIONS.filter(
    (tz) => tz.value === "local" || tz.value === "UTC"
  );

  const availableLocales = (localization?.supportedLocales || supportedLocales).filter(Boolean);
  // Only English translations exist currently - add more labels when translations are implemented
  const localeLabels: Record<string, string> = {
    en: "English",
  };
  // Only show language selector if multiple languages are available
  const showLanguageSelector = availableLocales.length > 1 && availableLocales.some(code => code !== "en");

  return (
    <footer
      className={cn(
        "border-t pt-6 pb-4 text-center text-sm text-[var(--status-muted-text)]",
        className
      )}
    >
      {footerText && <p className="mb-4">{footerText}</p>}

      <div className="flex items-center justify-center gap-4 flex-wrap">
        {/* Language selector - only show if multiple languages with translations are available */}
        {showLanguageSelector && (
          <div className="inline-flex items-center gap-1.5">
            <Languages className="h-3 w-3" />
            <Select value={locale} onValueChange={(value) => setLocale(value)}>
              <SelectTrigger className="h-7 w-auto min-w-[140px] border-none bg-transparent px-2 text-xs hover:bg-[var(--status-muted)]/50 focus:ring-0 focus:ring-offset-0">
                <SelectValue placeholder={t("common.language", "Language")}>
                  {localeLabels[locale] || locale}
                </SelectValue>
              </SelectTrigger>
              <SelectContent align="center" className="max-h-[260px]">
                <SelectGroup>
                  <SelectLabel className="text-xs">{t("common.language", "Language")}</SelectLabel>
                  {availableLocales.map((code) => (
                    <SelectItem key={code} value={code} className="text-xs">
                      {localeLabels[code] || code}
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
          </div>
        )}

        {/* Timezone selector */}
        <div className="inline-flex items-center gap-1.5">
          <Globe className="h-3 w-3" />
          <Select
            value={timezone}
            onValueChange={(value) => setTimezone(value as TimezoneValue)}
          >
            <SelectTrigger className="h-7 w-auto min-w-[140px] border-none bg-transparent px-2 text-xs hover:bg-[var(--status-muted)]/50 focus:ring-0 focus:ring-offset-0">
              <SelectValue>
                {!isHydrated
                  ? "Loading..."
                  : timezone === "local"
                    ? `Browser (${timezoneAbbr})`
                    : timezoneAbbr}
              </SelectValue>
            </SelectTrigger>
            <SelectContent align="center" className="max-h-[300px]">
              <SelectGroup>
                <SelectLabel className="text-xs">Common</SelectLabel>
                {otherTimezones.map((tz) => (
                  <SelectItem key={tz.value} value={tz.value} className="text-xs">
                    {tz.label}
                  </SelectItem>
                ))}
              </SelectGroup>
              <SelectGroup>
                <SelectLabel className="text-xs">Americas</SelectLabel>
                {americasTimezones.map((tz) => (
                  <SelectItem key={tz.value} value={tz.value} className="text-xs">
                    {tz.label}
                  </SelectItem>
                ))}
              </SelectGroup>
              <SelectGroup>
                <SelectLabel className="text-xs">Europe</SelectLabel>
                {europeTimezones.map((tz) => (
                  <SelectItem key={tz.value} value={tz.value} className="text-xs">
                    {tz.label}
                  </SelectItem>
                ))}
              </SelectGroup>
              <SelectGroup>
                <SelectLabel className="text-xs">Asia / Pacific</SelectLabel>
                {asiaTimezones.map((tz) => (
                  <SelectItem key={tz.value} value={tz.value} className="text-xs">
                    {tz.label}
                  </SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>
        </div>

        {slug && (
          <>
            <span className="text-[var(--status-muted-text)]/50">|</span>
            <Link
              href={`${linkBase}/events`}
              className="inline-flex items-center gap-1 hover:text-[var(--status-text)] transition-colors"
            >
              <CalendarClock className="h-3 w-3" />
              {t("common.viewAllEvents", "View all events")}
            </Link>
            <span className="text-[var(--status-muted-text)]/50">|</span>
            <a
              href={`/api/public/feeds/status-pages/${slug}/rss`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 hover:text-[var(--status-text)] transition-colors"
              title="RSS Feed"
            >
              <Rss className="h-3 w-3" />
              {t("common.rss", "RSS")}
            </a>
          </>
        )}

        {supportUrl && (
          <>
            {slug && <span className="text-[var(--status-muted-text)]/50">|</span>}
            <a
              href={supportUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 hover:text-[var(--status-text)] transition-colors"
            >
              {t("common.getSupport", "Get Support")}
              <ExternalLink className="h-3 w-3" />
            </a>
          </>
        )}

        {!hideBranding && (
          <>
            {(supportUrl || slug) && (
              <span className="text-[var(--status-muted-text)]/50">|</span>
            )}
            <a
              href="https://status.unified.sh"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 hover:text-[var(--status-text)] transition-colors"
            >
              <span>{t("common.poweredBy", "Powered by")}</span>
              <span className="font-semibold text-primary">Uni-Status</span>
            </a>
          </>
        )}
      </div>
    </footer>
  );
}
