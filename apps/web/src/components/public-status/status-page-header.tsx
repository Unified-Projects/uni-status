"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Calendar, Server } from "lucide-react";
import { cn } from "@uni-status/ui";
import { useI18n } from "@/contexts/i18n-context";

interface StatusPageHeaderProps {
  name: string;
  logo?: string | null;
  orgLogo?: string | null;
  headerText?: string;
  slug?: string;
  basePath?: string;
  showNavigation?: boolean;
  showServicesPage?: boolean;
  className?: string;
}

export function StatusPageHeader({
  name,
  logo,
  orgLogo,
  headerText,
  slug,
  basePath = `/status/${slug}`,
  showNavigation = true,
  showServicesPage = false,
  className,
}: StatusPageHeaderProps) {
  const pathname = usePathname();
  const { t } = useI18n();
  // Fallback chain: status page logo -> org logo -> default app icon
  const displayLogo = logo || orgLogo || "/icon.svg";

  // Check if left-aligned (className contains text-left)
  const isLeftAligned = className?.includes("text-left");

  // Use basePath for links (empty string on custom domains, /status/{slug} on main domain)
  const linkBase = basePath || "";

  // Navigation items - Services only shown if enabled
  const navItems = [
    { href: `${linkBase}/` || "/", label: t("nav.status", "Status"), isActive: pathname === `${linkBase}/` || pathname === `${linkBase}` || pathname === "/" },
    { href: `${linkBase}/events`, label: t("nav.events", "Events"), icon: Calendar, isActive: pathname?.includes("/events") },
    ...(showServicesPage
      ? [
          {
            href: `${linkBase}/services`,
            label: t("nav.services", "Services"),
            icon: Server,
            isActive: pathname?.includes("/services"),
          },
        ]
      : []),
  ];

  return (
    <header className={cn("text-center", className)}>
      <img
        src={displayLogo}
        alt={name}
        className={cn(
          "h-16 w-auto object-contain",
          !isLeftAligned && "mx-auto"
        )}
        onError={(e) => {
          // Fallback to default icon if image fails to load
          const target = e.target as HTMLImageElement;
          if (target.src !== "/icon.svg") {
            target.src = "/icon.svg";
          }
        }}
      />
      <h1 className="mt-4 text-3xl font-bold tracking-tight text-[var(--status-text)]">{name}</h1>
      {headerText && (
        <p className="mt-2 text-[var(--status-muted-text)]">{headerText}</p>
      )}

      {/* Navigation */}
      {showNavigation && slug && (
        <nav className="mt-6 flex items-center justify-center gap-1">
          {navItems.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "inline-flex items-center gap-1.5 px-4 py-2 rounded-md text-sm font-medium transition-colors",
                item.isActive
                  ? "bg-primary text-primary-foreground"
                  : "text-[var(--status-muted-text)] hover:text-[var(--status-text)] hover:bg-[var(--status-muted)]"
              )}
            >
              {item.icon && <item.icon className="h-4 w-4" />}
              {item.label}
            </Link>
          ))}
        </nav>
      )}
    </header>
  );
}
