"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { Eye, EyeOff, Lock, Unlock, Shield, Users, Mail } from "lucide-react";
import {
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Input,
  Label,
  Switch,
  Separator,
  Slider,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  cn,
} from "@uni-status/ui";
import { useCreateStatusPage, useUpdateStatusPage } from "@/hooks/use-status-pages";
import { useStatusPageThemes } from "@/hooks/use-status-page-themes";
import { useLicenseStatus } from "@/hooks/use-license-status";
import type { StatusPage } from "@/lib/api-client";
import { getAssetUrl } from "@/lib/api";
import { TemplateSelector } from "./template-selector";
import { ImageUpload } from "@/components/ui/image-upload";
import {
  getDefaultTemplateConfig,
  type StatusPageTemplate,
  type LayoutType,
  type IndicatorStyle,
  type IncidentStyle,
  type MonitorStyle,
  type BorderRadius,
  type Shadow,
  type Spacing,
  OG_TEMPLATES,
  type OGTemplateId,
} from "@uni-status/shared";

// Color manipulation helpers for generating status color variants
function hexToHsl(hex: string): { h: number; s: number; l: number } | null {
  const normalized = hex.replace("#", "");
  if (![3, 6].includes(normalized.length)) return null;
  const full = normalized.length === 3 ? normalized.split("").map((c) => c + c).join("") : normalized;
  const num = Number.parseInt(full, 16);
  if (Number.isNaN(num)) return null;
  const r = ((num >> 16) & 255) / 255;
  const g = ((num >> 8) & 255) / 255;
  const b = (num & 255) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  let h = 0;
  let s = 0;
  const l = (max + min) / 2;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r: h = (g - b) / d + (g < b ? 6 : 0); break;
      case g: h = (b - r) / d + 2; break;
      default: h = (r - g) / d + 4; break;
    }
    h /= 6;
  }
  return { h: h * 360, s: s * 100, l: l * 100 };
}

function hslToHex(h: number, s: number, l: number): string {
  s /= 100;
  l /= 100;
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => {
    const k = (n + h / 30) % 12;
    const color = l - a * Math.max(Math.min(k - 3, 9 - k, 1), -1);
    return Math.round(255 * color).toString(16).padStart(2, "0");
  };
  return `#${f(0)}${f(8)}${f(4)}`;
}

function generateStatusColorVariants(baseHex: string): {
  light: { solid: string; solidHover: string; bg: string; bgSubtle: string; text: string; border: string; icon: string };
  dark: { solid: string; solidHover: string; bg: string; bgSubtle: string; text: string; border: string; icon: string };
} {
  const hsl = hexToHsl(baseHex);
  if (!hsl) {
    // Fallback if color parsing fails
    return {
      light: { solid: baseHex, solidHover: baseHex, bg: baseHex, bgSubtle: baseHex, text: baseHex, border: baseHex, icon: baseHex },
      dark: { solid: baseHex, solidHover: baseHex, bg: baseHex, bgSubtle: baseHex, text: baseHex, border: baseHex, icon: baseHex },
    };
  }
  const { h, s } = hsl;
  return {
    light: {
      solid: baseHex,
      solidHover: hslToHex(h, s, 40),
      bg: hslToHex(h, Math.min(s, 80), 90),
      bgSubtle: hslToHex(h, Math.min(s, 60), 96),
      text: hslToHex(h, Math.min(s, 70), 25),
      border: hslToHex(h, Math.min(s, 70), 80),
      icon: hslToHex(h, s, 40),
    },
    dark: {
      solid: baseHex,
      solidHover: hslToHex(h, s, 65),
      bg: hslToHex(h, Math.min(s, 60), 18),
      bgSubtle: hslToHex(h, Math.min(s, 50), 8),
      text: hslToHex(h, Math.min(s, 70), 75),
      border: hslToHex(h, Math.min(s, 60), 25),
      icon: hslToHex(h, s, 65),
    },
  };
}

function generateThemeCustomCss(themeName: string, colors: { success: string; warning: string; error: string; info?: string; primary?: string }): string {
  const success = generateStatusColorVariants(colors.success);
  const warning = generateStatusColorVariants(colors.warning);
  const error = generateStatusColorVariants(colors.error);
  const info = generateStatusColorVariants(colors.info || colors.primary || "#3b82f6");

  // Using html selector for higher specificity to override globals.css @layer base
  return `/* Theme: ${themeName} */
html {
  --status-success-solid: ${success.light.solid} !important;
  --status-success-solid-hover: ${success.light.solidHover} !important;
  --status-success-bg: ${success.light.bg} !important;
  --status-success-bg-subtle: ${success.light.bgSubtle} !important;
  --status-success-text: ${success.light.text} !important;
  --status-success-border: ${success.light.border} !important;
  --status-success-icon: ${success.light.icon} !important;
  --status-warning-solid: ${warning.light.solid} !important;
  --status-warning-solid-hover: ${warning.light.solidHover} !important;
  --status-warning-bg: ${warning.light.bg} !important;
  --status-warning-bg-subtle: ${warning.light.bgSubtle} !important;
  --status-warning-text: ${warning.light.text} !important;
  --status-warning-border: ${warning.light.border} !important;
  --status-warning-icon: ${warning.light.icon} !important;
  --status-error-solid: ${error.light.solid} !important;
  --status-error-solid-hover: ${error.light.solidHover} !important;
  --status-error-bg: ${error.light.bg} !important;
  --status-error-bg-subtle: ${error.light.bgSubtle} !important;
  --status-error-text: ${error.light.text} !important;
  --status-error-border: ${error.light.border} !important;
  --status-error-icon: ${error.light.icon} !important;
  --status-info-solid: ${info.light.solid} !important;
  --status-info-solid-hover: ${info.light.solidHover} !important;
  --status-info-bg: ${info.light.bg} !important;
  --status-info-bg-subtle: ${info.light.bgSubtle} !important;
  --status-info-text: ${info.light.text} !important;
  --status-info-border: ${info.light.border} !important;
  --status-info-icon: ${info.light.icon} !important;
}
html.dark {
  --status-success-solid: ${success.dark.solid} !important;
  --status-success-solid-hover: ${success.dark.solidHover} !important;
  --status-success-bg: ${success.dark.bg} !important;
  --status-success-bg-subtle: ${success.dark.bgSubtle} !important;
  --status-success-text: ${success.dark.text} !important;
  --status-success-border: ${success.dark.border} !important;
  --status-success-icon: ${success.dark.icon} !important;
  --status-warning-solid: ${warning.dark.solid} !important;
  --status-warning-solid-hover: ${warning.dark.solidHover} !important;
  --status-warning-bg: ${warning.dark.bg} !important;
  --status-warning-bg-subtle: ${warning.dark.bgSubtle} !important;
  --status-warning-text: ${warning.dark.text} !important;
  --status-warning-border: ${warning.dark.border} !important;
  --status-warning-icon: ${warning.dark.icon} !important;
  --status-error-solid: ${error.dark.solid} !important;
  --status-error-solid-hover: ${error.dark.solidHover} !important;
  --status-error-bg: ${error.dark.bg} !important;
  --status-error-bg-subtle: ${error.dark.bgSubtle} !important;
  --status-error-text: ${error.dark.text} !important;
  --status-error-border: ${error.dark.border} !important;
  --status-error-icon: ${error.dark.icon} !important;
  --status-info-solid: ${info.dark.solid} !important;
  --status-info-solid-hover: ${info.dark.solidHover} !important;
  --status-info-bg: ${info.dark.bg} !important;
  --status-info-bg-subtle: ${info.dark.bgSubtle} !important;
  --status-info-text: ${info.dark.text} !important;
  --status-info-border: ${info.dark.border} !important;
  --status-info-icon: ${info.dark.icon} !important;
}`;
}

const statusPageFormSchema = z.object({
  name: z.string().min(1, "Name is required").max(100),
  slug: z
    .string()
    .min(3, "Slug must be at least 3 characters")
    .max(50)
    .regex(
      /^[a-z0-9]+(?:-[a-z0-9]+)*$/,
      "Slug must be lowercase letters, numbers, and hyphens"
    ),
  customDomain: z.string().optional(),
  published: z.boolean(),
  logo: z.string().optional().or(z.literal("")),
  favicon: z.string().optional().or(z.literal("")),
  password: z.string().min(6, "Password must be at least 6 characters").optional().or(z.literal("")),
  authConfig: z.object({
    protectionMode: z.enum(["none", "password", "oauth", "both"]),
    oauthMode: z.enum(["org_members", "allowlist", "any_authenticated"]).optional(),
    allowedEmails: z.array(z.string().email()).optional(),
    allowedDomains: z.array(z.string()).optional(),
    allowedRoles: z.array(z.enum(["owner", "admin", "member", "viewer"])).optional(),
  }),
  theme: z.object({
    name: z.string(),
    primaryColor: z.string().regex(/^#[0-9A-Fa-f]{6}$/).optional().or(z.literal("")),
    customCss: z.string().max(10000).optional(),
    colorMode: z.enum(["system", "light", "dark"]).optional(),
  }),
  settings: z.object({
    showUptimePercentage: z.boolean(),
    showResponseTime: z.boolean(),
    showIncidentHistory: z.boolean(),
    showServicesPage: z.boolean(),
    showGeoMap: z.boolean(),
    uptimeDays: z.number().min(7).max(90),
    headerText: z.string().max(500).optional(),
    footerText: z.string().max(500).optional(),
    supportUrl: z.string().url().optional().or(z.literal("")),
    hideBranding: z.boolean(),
    displayMode: z.enum(["bars", "graph", "both"]).optional(),
    graphTooltipMetrics: z.object({
      avg: z.boolean().optional(),
      min: z.boolean().optional(),
      max: z.boolean().optional(),
      p50: z.boolean().optional(),
      p90: z.boolean().optional(),
      p99: z.boolean().optional(),
    }).optional(),
  }),
  template: z.object({
    id: z.string(),
    layout: z.enum(["list", "cards", "sidebar", "single-page"]),
    indicatorStyle: z.enum(["dot", "badge", "pill", "bar"]),
    incidentStyle: z.enum(["timeline", "cards", "compact", "expanded"]),
    monitorStyle: z.enum(["minimal", "detailed", "card", "row"]),
    borderRadius: z.enum(["none", "sm", "md", "lg", "xl"]),
    shadow: z.enum(["none", "sm", "md", "lg"]),
    spacing: z.enum(["compact", "normal", "relaxed"]),
  }),
  seoTitle: z.string().max(60).optional(),
  seoDescription: z.string().max(160).optional(),
  ogImageUrl: z.string().optional().or(z.literal("")),
  ogTemplate: z.enum(["classic", "modern", "minimal", "dashboard", "hero", "compact"]).optional(),
  useOgTemplate: z.boolean(),
});

type StatusPageFormData = z.infer<typeof statusPageFormSchema>;

interface StatusPageFormProps {
  statusPage?: StatusPage;
  mode: "create" | "edit";
}

function generateSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .substring(0, 50);
}

export function StatusPageForm({ statusPage, mode }: StatusPageFormProps) {
  const router = useRouter();
  const [slugManuallyEdited, setSlugManuallyEdited] = useState(false);
  const [allowedEmailsText, setAllowedEmailsText] = useState(
    statusPage?.authConfig?.allowedEmails?.join("\n") ?? ""
  );
  const [allowedDomainsText, setAllowedDomainsText] = useState(
    statusPage?.authConfig?.allowedDomains?.join("\n") ?? ""
  );
  const { isPaidPlan } = useLicenseStatus();

  const createStatusPage = useCreateStatusPage();
  const updateStatusPage = useUpdateStatusPage();

  const defaultTemplate = getDefaultTemplateConfig();

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<StatusPageFormData>({
    resolver: zodResolver(statusPageFormSchema),
    defaultValues: {
      name: statusPage?.name ?? "",
      slug: statusPage?.slug ?? "",
      customDomain: statusPage?.customDomain ?? "",
      published: statusPage?.published ?? false,
      logo: statusPage?.logoUrl ? getAssetUrl(statusPage.logoUrl) : "",
      favicon: statusPage?.faviconUrl ? getAssetUrl(statusPage.faviconUrl) : "",
      password: "",
      authConfig: {
        protectionMode: statusPage?.authConfig?.protectionMode ?? "none",
        oauthMode: statusPage?.authConfig?.oauthMode ?? "org_members",
        allowedEmails: statusPage?.authConfig?.allowedEmails ?? [],
        allowedDomains: statusPage?.authConfig?.allowedDomains ?? [],
        allowedRoles: statusPage?.authConfig?.allowedRoles ?? ["owner", "admin", "member"],
      },
      theme: {
        name: statusPage?.theme?.name ?? "default",
        primaryColor: statusPage?.theme?.primaryColor ?? "",
        customCss: statusPage?.theme?.customCss ?? "",
        colorMode: statusPage?.theme?.colorMode ?? "system",
      },
      settings: {
        showUptimePercentage: statusPage?.settings?.showUptimePercentage ?? true,
        showResponseTime: statusPage?.settings?.showResponseTime ?? true,
        showIncidentHistory: statusPage?.settings?.showIncidentHistory ?? true,
        showServicesPage: statusPage?.settings?.showServicesPage ?? false,
        showGeoMap: statusPage?.settings?.showGeoMap ?? true,
        uptimeDays: statusPage?.settings?.uptimeDays ?? 45,
        headerText: statusPage?.settings?.headerText ?? "",
        footerText: statusPage?.settings?.footerText ?? "",
        supportUrl: statusPage?.settings?.supportUrl ?? "",
        hideBranding: statusPage?.settings?.hideBranding ?? false,
        displayMode: statusPage?.settings?.displayMode ?? "bars",
        graphTooltipMetrics: statusPage?.settings?.graphTooltipMetrics ?? {
          avg: true,
          min: false,
          max: false,
          p50: false,
          p90: false,
          p99: false,
        },
      },
      template: statusPage?.template ?? defaultTemplate,
      seoTitle: statusPage?.seo?.title ?? "",
      seoDescription: statusPage?.seo?.description ?? "",
      ogImageUrl: statusPage?.seo?.ogImage ? getAssetUrl(statusPage.seo.ogImage) : "",
      ogTemplate: statusPage?.seo?.ogTemplate ?? "classic",
      useOgTemplate: !statusPage?.seo?.ogImage,
    },
  });

  const watchedName = watch("name");
  const watchedPublished = watch("published");
  const watchedLogo = watch("logo");
  const watchedFavicon = watch("favicon");
  const watchedUptimeDays = watch("settings.uptimeDays");
  const watchedTemplate = watch("template");
  const watchedDisplayMode = watch("settings.displayMode");
  const watchedGraphTooltipMetrics = watch("settings.graphTooltipMetrics");
  const watchedProtectionMode = watch("authConfig.protectionMode");
  const watchedOAuthMode = watch("authConfig.oauthMode");
  const watchedAllowedRoles = watch("authConfig.allowedRoles");

  // Auto-generate slug from name (only in create mode and if not manually edited)
  useEffect(() => {
    if (mode === "create" && !slugManuallyEdited && watchedName) {
      setValue("slug", generateSlug(watchedName));
    }
  }, [watchedName, mode, slugManuallyEdited, setValue]);

  const handleTemplateSelect = (template: StatusPageTemplate) => {
    setValue("template", template.config);
  };

  const normalizeAssetForSubmit = (input?: string | null, originalValue?: string | null) => {
    // If input is empty string and there was an original value, return "" to signal deletion
    if (input === "" && originalValue) return "";
    // If input is empty/null, return undefined (don't include in update)
    if (!input) return undefined;

    // Extract relative path from absolute URLs - we should store relative paths in the database
    // so they work correctly on custom domains (which will add their own base URL)
    let relativePath = input;

    // If it's an absolute URL, extract just the path portion
    if (input.startsWith("http://") || input.startsWith("https://")) {
      try {
        const url = new URL(input);
        relativePath = url.pathname;
      } catch {
        // If URL parsing fails, use input as-is
        relativePath = input;
      }
    }

    // Normalize the path to a standard format
    // /api/v1/assets/{orgId}/{filename} -> keep as-is
    // /api/uploads/{orgId}/{filename} -> keep as-is
    // /uploads/{orgId}/{filename} -> keep as-is
    if (relativePath.startsWith("/api/v1/assets/") ||
        relativePath.startsWith("/api/uploads/") ||
        relativePath.startsWith("/uploads/")) {
      return relativePath;
    }

    // For other paths, return as-is (could be external URL that didn't parse)
    return input || undefined;
  };

  const onSubmit = async (data: StatusPageFormData) => {
    // Parse emails and domains from text areas
    const allowedEmails = allowedEmailsText
      .split("\n")
      .map((e) => e.trim())
      .filter((e) => e && e.includes("@"));
    const allowedDomains = allowedDomainsText
      .split("\n")
      .map((d) => d.trim())
      .filter((d) => d);

    const needsPassword = data.authConfig.protectionMode === "password" || data.authConfig.protectionMode === "both";

    const payload = {
      name: data.name,
      slug: data.slug,
      customDomain: data.customDomain || undefined,
      published: data.published,
      logo: normalizeAssetForSubmit(data.logo, statusPage?.logoUrl),
      favicon: normalizeAssetForSubmit(data.favicon, statusPage?.faviconUrl),
      passwordProtected: needsPassword,
      password: needsPassword && data.password ? data.password : undefined,
      authConfig: {
        protectionMode: data.authConfig.protectionMode,
        oauthMode: data.authConfig.oauthMode,
        allowedEmails: allowedEmails.length > 0 ? allowedEmails : undefined,
        allowedDomains: allowedDomains.length > 0 ? allowedDomains : undefined,
        allowedRoles: data.authConfig.allowedRoles,
      },
      theme: {
        name: data.theme.name,
        primaryColor: data.theme.primaryColor || undefined,
        customCss: data.theme.customCss || undefined,
        colorMode: data.theme.colorMode || "system",
      },
      settings: {
        showUptimePercentage: data.settings.showUptimePercentage,
        showResponseTime: data.settings.showResponseTime,
        showIncidentHistory: data.settings.showIncidentHistory,
        showServicesPage: data.settings.showServicesPage,
        showGeoMap: data.settings.showGeoMap,
        uptimeDays: data.settings.uptimeDays,
        headerText: data.settings.headerText || undefined,
        footerText: data.settings.footerText || undefined,
        supportUrl: data.settings.supportUrl || undefined,
        hideBranding: data.settings.hideBranding,
        displayMode: data.settings.displayMode,
        graphTooltipMetrics: data.settings.graphTooltipMetrics,
      },
      template: data.template,
      seo: {
        title: data.seoTitle || undefined,
        description: data.seoDescription || undefined,
        ogImage: data.useOgTemplate ? undefined : (normalizeAssetForSubmit(data.ogImageUrl, statusPage?.seo?.ogImage) || undefined),
        ogTemplate: data.useOgTemplate ? data.ogTemplate : undefined,
      },
    };

    if (mode === "create") {
      const newStatusPage = await createStatusPage.mutateAsync(payload);
      router.push(`/status-pages/${newStatusPage.id}`);
    } else if (statusPage) {
      await updateStatusPage.mutateAsync({ id: statusPage.id, data: payload });
      router.push(`/status-pages/${statusPage.id}`);
    }
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
      {/* Basic Information */}
      <Card>
        <CardHeader>
          <CardTitle>Basic Information</CardTitle>
          <CardDescription>
            Configure the basic settings for your status page
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="name">Name *</Label>
              <Input
                id="name"
                placeholder="My Status Page"
                {...register("name")}
              />
              {errors.name && (
                <p className="text-sm text-destructive">{errors.name.message}</p>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="slug">Slug *</Label>
              <div className="flex items-center gap-2">
                <span className="text-sm text-muted-foreground">/status/</span>
                <Input
                  id="slug"
                  placeholder="my-status-page"
                  {...register("slug")}
                  onChange={(e) => {
                    setSlugManuallyEdited(true);
                    register("slug").onChange(e);
                  }}
                />
              </div>
              {errors.slug && (
                <p className="text-sm text-destructive">{errors.slug.message}</p>
              )}
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="customDomain">Custom Domain</Label>
            <Input
              id="customDomain"
              placeholder="status.example.com"
              {...register("customDomain")}
            />
            <p className="text-xs text-muted-foreground">
              Point your domain&apos;s CNAME record to{" "}
              {(() => {
                try {
                  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
                  return new URL(appUrl).hostname;
                } catch {
                  return "your-app-domain.com";
                }
              })()}
            </p>
          </div>

          <Separator />

          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label>Published</Label>
              <p className="text-sm text-muted-foreground">
                Make this status page publicly visible
              </p>
            </div>
            <div className="flex items-center gap-2">
              {watchedPublished ? (
                <Eye className="h-4 w-4 text-green-500" />
              ) : (
                <EyeOff className="h-4 w-4 text-muted-foreground" />
              )}
              <Switch
                checked={watchedPublished}
                onCheckedChange={(checked) => setValue("published", checked)}
              />
            </div>
          </div>

          <Separator />

          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <Shield className="h-5 w-5" />
              <div>
                <Label className="text-base">Access Control</Label>
                <p className="text-sm text-muted-foreground">
                  Configure how visitors can access this status page
                </p>
              </div>
            </div>

            <div className="space-y-2">
              <Label>Protection Mode</Label>
              <Select
                value={watchedProtectionMode}
                onValueChange={(value: "none" | "password" | "oauth" | "both") =>
                  setValue("authConfig.protectionMode", value)
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">
                    <div className="flex items-center gap-2">
                      <Unlock className="h-4 w-4" />
                      <span>Public (No Protection)</span>
                    </div>
                  </SelectItem>
                  <SelectItem value="password">
                    <div className="flex items-center gap-2">
                      <Lock className="h-4 w-4" />
                      <span>Password Only</span>
                    </div>
                  </SelectItem>
                  <SelectItem value="oauth">
                    <div className="flex items-center gap-2">
                      <Users className="h-4 w-4" />
                      <span>OAuth / SSO Only</span>
                    </div>
                  </SelectItem>
                  <SelectItem value="both">
                    <div className="flex items-center gap-2">
                      <Shield className="h-4 w-4" />
                      <span>Password OR OAuth (Either works)</span>
                    </div>
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>

            {(watchedProtectionMode === "password" || watchedProtectionMode === "both") && (
              <div className="space-y-2 pl-4 border-l-2 border-muted">
                <Label htmlFor="password">Password</Label>
                <Input
                  id="password"
                  type="password"
                  placeholder={mode === "edit" ? "Leave blank to keep current" : "Enter password"}
                  {...register("password")}
                />
                {errors.password && (
                  <p className="text-sm text-destructive">{errors.password.message}</p>
                )}
              </div>
            )}

            {(watchedProtectionMode === "oauth" || watchedProtectionMode === "both") && (
              <div className="space-y-4 pl-4 border-l-2 border-muted">
                <div className="space-y-2">
                  <Label>Who can access via OAuth?</Label>
                  <Select
                    value={watchedOAuthMode}
                    onValueChange={(value: "org_members" | "allowlist" | "any_authenticated") =>
                      setValue("authConfig.oauthMode", value)
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="org_members">Organisation Members Only</SelectItem>
                      <SelectItem value="allowlist">Email/Domain Allowlist</SelectItem>
                      <SelectItem value="any_authenticated">Any Authenticated User</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {watchedOAuthMode === "org_members" && (
                  <div className="space-y-2">
                    <Label>Allowed Roles</Label>
                    <p className="text-xs text-muted-foreground">
                      Select which organisation roles can view this page
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {(["owner", "admin", "member", "viewer"] as const).map((role) => (
                        <Button
                          key={role}
                          type="button"
                          variant={watchedAllowedRoles?.includes(role) ? "default" : "outline"}
                          size="sm"
                          onClick={() => {
                            const current = watchedAllowedRoles || [];
                            const updated = current.includes(role)
                              ? current.filter((r) => r !== role)
                              : [...current, role];
                            setValue("authConfig.allowedRoles", updated);
                          }}
                        >
                          {role.charAt(0).toUpperCase() + role.slice(1)}
                        </Button>
                      ))}
                    </div>
                  </div>
                )}

                {watchedOAuthMode === "allowlist" && (
                  <div className="space-y-4">
                    <div className="space-y-2">
                      <Label htmlFor="allowedEmails">
                        <div className="flex items-center gap-2">
                          <Mail className="h-4 w-4" />
                          Allowed Emails
                        </div>
                      </Label>
                      <textarea
                        id="allowedEmails"
                        placeholder="user@example.com&#10;another@example.com"
                        value={allowedEmailsText}
                        onChange={(e) => setAllowedEmailsText(e.target.value)}
                        className="min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm font-mono"
                      />
                      <p className="text-xs text-muted-foreground">
                        One email per line
                      </p>
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="allowedDomains">Allowed Domains</Label>
                      <textarea
                        id="allowedDomains"
                        placeholder="example.com&#10;company.org"
                        value={allowedDomainsText}
                        onChange={(e) => setAllowedDomainsText(e.target.value)}
                        className="min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm font-mono"
                      />
                      <p className="text-xs text-muted-foreground">
                        One domain per line. Users with email addresses from these domains can access.
                      </p>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Branding */}
      <Card>
        <CardHeader>
          <CardTitle>Branding</CardTitle>
          <CardDescription>
            Customize the logo and favicon for this status page
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-6 md:grid-cols-2">
            <ImageUpload
              label="Logo"
              description="Upload a custom logo for this status page. Overrides the organisation logo."
              value={watchedLogo}
              onChange={(url) => setValue("logo", url, { shouldDirty: true })}
              disabled={isSubmitting}
            />
            <ImageUpload
              label="Favicon"
              description="Upload a favicon (browser tab icon) for this status page."
              value={watchedFavicon}
              onChange={(url) => setValue("favicon", url, { shouldDirty: true })}
              disabled={isSubmitting}
            />
          </div>
        </CardContent>
      </Card>

      {/* Design Template */}
      <Card>
        <CardHeader>
          <CardTitle>Design Template</CardTitle>
          <CardDescription>
            Choose a template to define the layout and style of your status page
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <TemplateSelector
            selectedTemplateId={watchedTemplate.id}
            onSelect={handleTemplateSelect}
          />

          <Separator />

          <div className="space-y-4">
            <h4 className="font-medium">Customize Template Settings</h4>
            <p className="text-sm text-muted-foreground">
              Fine-tune individual template options after selecting a template
            </p>

            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
              <div className="space-y-2">
                <Label>Layout</Label>
                <Select
                  value={watchedTemplate.layout}
                  onValueChange={(value: LayoutType) =>
                    setValue("template.layout", value)
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="list">List</SelectItem>
                    <SelectItem value="cards">Cards</SelectItem>
                    <SelectItem value="sidebar">Sidebar</SelectItem>
                    <SelectItem value="single-page">Single Page</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Status Indicators</Label>
                <Select
                  value={watchedTemplate.indicatorStyle}
                  onValueChange={(value: IndicatorStyle) =>
                    setValue("template.indicatorStyle", value)
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="dot">Dot</SelectItem>
                    <SelectItem value="badge">Badge</SelectItem>
                    <SelectItem value="pill">Pill</SelectItem>
                    <SelectItem value="bar">Bar</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Incidents Display</Label>
                <Select
                  value={watchedTemplate.incidentStyle}
                  onValueChange={(value: IncidentStyle) =>
                    setValue("template.incidentStyle", value)
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="timeline">Timeline</SelectItem>
                    <SelectItem value="cards">Cards</SelectItem>
                    <SelectItem value="compact">Compact</SelectItem>
                    <SelectItem value="expanded">Expanded</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Monitor Display</Label>
                <Select
                  value={watchedTemplate.monitorStyle}
                  onValueChange={(value: MonitorStyle) =>
                    setValue("template.monitorStyle", value)
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="minimal">Minimal</SelectItem>
                    <SelectItem value="row">Row</SelectItem>
                    <SelectItem value="card">Card</SelectItem>
                    <SelectItem value="detailed">Detailed</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-3">
              <div className="space-y-2">
                <Label>Border Radius</Label>
                <Select
                  value={watchedTemplate.borderRadius}
                  onValueChange={(value: BorderRadius) =>
                    setValue("template.borderRadius", value)
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">None</SelectItem>
                    <SelectItem value="sm">Small</SelectItem>
                    <SelectItem value="md">Medium</SelectItem>
                    <SelectItem value="lg">Large</SelectItem>
                    <SelectItem value="xl">Extra Large</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Shadow</Label>
                <Select
                  value={watchedTemplate.shadow}
                  onValueChange={(value: Shadow) =>
                    setValue("template.shadow", value)
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">None</SelectItem>
                    <SelectItem value="sm">Small</SelectItem>
                    <SelectItem value="md">Medium</SelectItem>
                    <SelectItem value="lg">Large</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Spacing</Label>
                <Select
                  value={watchedTemplate.spacing}
                  onValueChange={(value: Spacing) =>
                    setValue("template.spacing", value)
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="compact">Compact</SelectItem>
                    <SelectItem value="normal">Normal</SelectItem>
                    <SelectItem value="relaxed">Relaxed</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Display Settings */}
      <Card>
        <CardHeader>
          <CardTitle>Display Settings</CardTitle>
          <CardDescription>
            Configure what information is shown on the status page
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label>Show Uptime Percentage</Label>
                <p className="text-sm text-muted-foreground">
                  Display uptime percentage for each monitor
                </p>
              </div>
              <Switch
                checked={watch("settings.showUptimePercentage")}
                onCheckedChange={(checked) =>
                  setValue("settings.showUptimePercentage", checked)
                }
              />
            </div>

            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label>Show Response Time</Label>
                <p className="text-sm text-muted-foreground">
                  Display average response time for each monitor
                </p>
              </div>
              <Switch
                checked={watch("settings.showResponseTime")}
                onCheckedChange={(checked) =>
                  setValue("settings.showResponseTime", checked)
                }
              />
            </div>

            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label>Show Incident History</Label>
                <p className="text-sm text-muted-foreground">
                  Display past incidents on the status page
                </p>
              </div>
              <Switch
                checked={watch("settings.showIncidentHistory")}
                onCheckedChange={(checked) =>
                  setValue("settings.showIncidentHistory", checked)
                }
              />
            </div>

            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label>Show Services Page</Label>
                <p className="text-sm text-muted-foreground">
                  Enable a detailed services catalog page with type-specific metrics
                </p>
              </div>
              <Switch
                checked={watch("settings.showServicesPage")}
                onCheckedChange={(checked) =>
                  setValue("settings.showServicesPage", checked)
                }
              />
            </div>

            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label>Show Geo Map</Label>
                <p className="text-sm text-muted-foreground">
                  Enable the geo view and map link on the public status page
                </p>
              </div>
              <Switch
                checked={watch("settings.showGeoMap")}
                onCheckedChange={(checked) =>
                  setValue("settings.showGeoMap", checked)
                }
              />
            </div>

            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label>Hide Branding</Label>
                <p className="text-sm text-muted-foreground">
                  Remove Uni-Status branding from the page { !isPaidPlan && "(Paid plan)" }
                </p>
              </div>
              <Switch
                checked={watch("settings.hideBranding")}
                disabled={!isPaidPlan}
                onCheckedChange={(checked) =>
                  setValue("settings.hideBranding", checked)
                }
              />
            </div>
          </div>

          <Separator />

          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Monitor Display Mode</Label>
              <p className="text-sm text-muted-foreground">
                Choose how to display uptime data for monitors
              </p>
              <Select
                value={watchedDisplayMode || "bars"}
                onValueChange={(value: "bars" | "graph" | "both") =>
                  setValue("settings.displayMode", value)
                }
              >
                <SelectTrigger className="w-full max-w-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="bars">Uptime Bars Only</SelectItem>
                  <SelectItem value="graph">Response Time Graph Only</SelectItem>
                  <SelectItem value="both">Both Bars and Graph</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {(watchedDisplayMode === "graph" || watchedDisplayMode === "both") && (
              <div className="space-y-2 pl-4 border-l-2 border-muted">
                <Label>Graph Tooltip Metrics</Label>
                <p className="text-sm text-muted-foreground">
                  Select which metrics to show in graph tooltips
                </p>
                <div className="grid grid-cols-3 gap-4 pt-2">
                  <div className="flex items-center space-x-2">
                    <Switch
                      id="metric-avg"
                      checked={watchedGraphTooltipMetrics?.avg ?? true}
                      onCheckedChange={(checked) =>
                        setValue("settings.graphTooltipMetrics.avg", checked)
                      }
                    />
                    <Label htmlFor="metric-avg" className="text-sm">Avg</Label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <Switch
                      id="metric-min"
                      checked={watchedGraphTooltipMetrics?.min ?? false}
                      onCheckedChange={(checked) =>
                        setValue("settings.graphTooltipMetrics.min", checked)
                      }
                    />
                    <Label htmlFor="metric-min" className="text-sm">Min</Label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <Switch
                      id="metric-max"
                      checked={watchedGraphTooltipMetrics?.max ?? false}
                      onCheckedChange={(checked) =>
                        setValue("settings.graphTooltipMetrics.max", checked)
                      }
                    />
                    <Label htmlFor="metric-max" className="text-sm">Max</Label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <Switch
                      id="metric-p50"
                      checked={watchedGraphTooltipMetrics?.p50 ?? false}
                      onCheckedChange={(checked) =>
                        setValue("settings.graphTooltipMetrics.p50", checked)
                      }
                    />
                    <Label htmlFor="metric-p50" className="text-sm">P50</Label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <Switch
                      id="metric-p90"
                      checked={watchedGraphTooltipMetrics?.p90 ?? false}
                      onCheckedChange={(checked) =>
                        setValue("settings.graphTooltipMetrics.p90", checked)
                      }
                    />
                    <Label htmlFor="metric-p90" className="text-sm">P90</Label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <Switch
                      id="metric-p99"
                      checked={watchedGraphTooltipMetrics?.p99 ?? false}
                      onCheckedChange={(checked) =>
                        setValue("settings.graphTooltipMetrics.p99", checked)
                      }
                    />
                    <Label htmlFor="metric-p99" className="text-sm">P99</Label>
                  </div>
                </div>
              </div>
            )}
          </div>

          <Separator />

          <div className="space-y-2">
            <Label>Uptime History Duration: {watchedUptimeDays} days</Label>
            <Slider
              value={[watchedUptimeDays]}
              onValueChange={([value]) => setValue("settings.uptimeDays", value)}
              min={7}
              max={90}
              step={1}
              className="w-full"
            />
            <p className="text-xs text-muted-foreground">
              How many days of uptime history to display (7-90 days)
            </p>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="headerText">Header Text</Label>
              <Input
                id="headerText"
                placeholder="Welcome to our status page"
                {...register("settings.headerText")}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="footerText">Footer Text</Label>
              <Input
                id="footerText"
                placeholder="Contact support if you have questions"
                {...register("settings.footerText")}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="supportUrl">Support URL</Label>
            <Input
              id="supportUrl"
              placeholder="https://example.com/support"
              {...register("settings.supportUrl")}
            />
          </div>
        </CardContent>
      </Card>

      {/* Appearance */}
      <AppearanceSection
        watchedPrimaryColor={watch("theme.primaryColor")}
        watchedCustomCss={watch("theme.customCss")}
        watchedColorMode={watch("theme.colorMode")}
        setValue={setValue}
        register={register}
      />

      {/* SEO */}
      <Card>
        <CardHeader>
          <CardTitle>SEO Settings</CardTitle>
          <CardDescription>
            Optimize your status page for search engines
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="seoTitle">Page Title</Label>
            <Input
              id="seoTitle"
              placeholder="System Status - My Company"
              {...register("seoTitle")}
            />
            <p className="text-xs text-muted-foreground">
              {(watch("seoTitle")?.length || 0)}/60 characters
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="seoDescription">Meta Description</Label>
            <textarea
              id="seoDescription"
              placeholder="Check the current status of our services and systems"
              {...register("seoDescription")}
              className="min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            />
            <p className="text-xs text-muted-foreground">
              {(watch("seoDescription")?.length || 0)}/160 characters
            </p>
          </div>

          <Separator />

          <div className="space-y-4">
            <div>
              <Label>Open Graph Image</Label>
              <p className="text-sm text-muted-foreground">
                Choose how the image appears when sharing on social media
              </p>
            </div>

            <div className="flex items-center gap-4">
              <button
                type="button"
                onClick={() => setValue("useOgTemplate", true, { shouldDirty: true })}
                className={cn(
                  "flex-1 rounded-lg border-2 p-4 text-left transition-colors",
                  watch("useOgTemplate")
                    ? "border-primary bg-primary/5"
                    : "border-border hover:border-muted-foreground/50"
                )}
              >
                <div className="font-medium">Use Dynamic Template</div>
                <div className="text-sm text-muted-foreground">
                  Auto-generated image showing live status
                </div>
              </button>
              <button
                type="button"
                onClick={() => setValue("useOgTemplate", false, { shouldDirty: true })}
                className={cn(
                  "flex-1 rounded-lg border-2 p-4 text-left transition-colors",
                  !watch("useOgTemplate")
                    ? "border-primary bg-primary/5"
                    : "border-border hover:border-muted-foreground/50"
                )}
              >
                <div className="font-medium">Upload Custom Image</div>
                <div className="text-sm text-muted-foreground">
                  Use your own static image (1200x630px)
                </div>
              </button>
            </div>

            {watch("useOgTemplate") ? (
              <div className="space-y-4">
                <Label>Select Template Style</Label>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                  {OG_TEMPLATES.map((template) => (
                    <button
                      key={template.id}
                      type="button"
                      onClick={() => setValue("ogTemplate", template.id, { shouldDirty: true })}
                      className={cn(
                        "rounded-lg border-2 p-3 text-left transition-colors",
                        watch("ogTemplate") === template.id
                          ? "border-primary bg-primary/5"
                          : "border-border hover:border-muted-foreground/50"
                      )}
                    >
                      <div className="font-medium text-sm">{template.name}</div>
                      <div className="text-xs text-muted-foreground mt-1">
                        {template.description}
                      </div>
                    </button>
                  ))}
                </div>
                <p className="text-xs text-muted-foreground">
                  The image will automatically update to show your current status
                </p>
              </div>
            ) : (
              <ImageUpload
                label="Custom Image"
                description="Upload a static image (recommended: 1200x630px)"
                value={watch("ogImageUrl")}
                onChange={(url) => setValue("ogImageUrl", url, { shouldDirty: true })}
                disabled={isSubmitting}
              />
            )}
          </div>
        </CardContent>
      </Card>

      {/* Form Actions */}
      <div className="flex items-center justify-end gap-4">
        <Button
          type="button"
          variant="outline"
          onClick={() => router.back()}
        >
          Cancel
        </Button>
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting
            ? mode === "create"
              ? "Creating..."
              : "Saving..."
            : mode === "create"
              ? "Create Status Page"
              : "Save Changes"}
        </Button>
      </div>
    </form>
  );
}

// Appearance Section Component
interface AppearanceSectionProps {
  watchedPrimaryColor: string | undefined;
  watchedCustomCss: string | undefined;
  watchedColorMode: "system" | "light" | "dark" | undefined;
  setValue: ReturnType<typeof useForm<StatusPageFormData>>["setValue"];
  register: ReturnType<typeof useForm<StatusPageFormData>>["register"];
}

function AppearanceSection({
  watchedPrimaryColor,
  watchedCustomCss,
  watchedColorMode,
  setValue,
  register,
}: AppearanceSectionProps) {
  const { data: themes, isLoading: themesLoading } = useStatusPageThemes();
  const [useTheme, setUseTheme] = useState(false);
  const [selectedThemeId, setSelectedThemeId] = useState<string | null>(null);
  const [initialDetectionDone, setInitialDetectionDone] = useState(false);

  // Detect currently applied theme from customCss on initial load
  useEffect(() => {
    if (initialDetectionDone || !themes || themes.length === 0) return;

    // Try to detect theme from customCss comment (e.g., "/* Theme: Theme Name */")
    if (watchedCustomCss) {
      const themeNameMatch = watchedCustomCss.match(/\/\* Theme: (.+?) \*\//);
      if (themeNameMatch) {
        const themeName = themeNameMatch[1];
        const matchedTheme = themes.find((t) => t.name === themeName);
        if (matchedTheme) {
          setSelectedThemeId(matchedTheme.id);
          setInitialDetectionDone(true);
          return;
        }
      }
    }

    // Fallback: try to match by primary color
    if (watchedPrimaryColor) {
      const matchedTheme = themes.find(
        (t) => t.colors.primary.toLowerCase() === watchedPrimaryColor.toLowerCase()
      );
      if (matchedTheme) {
        setSelectedThemeId(matchedTheme.id);
      }
    }

    setInitialDetectionDone(true);
  }, [themes, watchedCustomCss, watchedPrimaryColor, initialDetectionDone]);

  const handleThemeSelect = (themeId: string) => {
    const theme = themes?.find((t) => t.id === themeId);
    if (theme) {
      setSelectedThemeId(themeId);
      setValue("theme.primaryColor", theme.colors.primary, { shouldDirty: true });

      // Generate complete CSS to override all status color variants
      const statusCss = generateThemeCustomCss(theme.name, {
        success: theme.colors.success,
        warning: theme.colors.warning,
        error: theme.colors.error,
        info: theme.colors.info,
        primary: theme.colors.primary,
      });
      setValue("theme.customCss", statusCss, { shouldDirty: true });
    }
  };

  const handleUseCustomColors = () => {
    setUseTheme(false);
    setSelectedThemeId(null);
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Appearance</CardTitle>
        <CardDescription>
          Customise the look of your status page. Background and text colours automatically adapt to light/dark mode.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Theme Selector */}
        {themes && themes.length > 0 && (
          <>
            <div className="space-y-3">
              <Label>Colour Theme</Label>
              <p className="text-sm text-muted-foreground">
                Choose a saved theme or use custom colours
              </p>
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
                <button
                  type="button"
                  onClick={handleUseCustomColors}
                  className={cn(
                    "p-3 rounded-lg border-2 text-left transition-colors",
                    !selectedThemeId
                      ? "border-primary bg-primary/5"
                      : "border-border hover:border-muted-foreground/50"
                  )}
                >
                  <div className="flex gap-1 mb-1.5">
                    <div className="w-4 h-4 rounded-full bg-gradient-to-br from-blue-500 to-purple-500" />
                    <div className="w-4 h-4 rounded-full bg-gray-200" />
                  </div>
                  <p className="text-xs font-medium">Custom Colours</p>
                </button>
                {themes.map((theme) => (
                  <button
                    key={theme.id}
                    type="button"
                    onClick={() => handleThemeSelect(theme.id)}
                    className={cn(
                      "p-3 rounded-lg border-2 text-left transition-colors",
                      selectedThemeId === theme.id
                        ? "border-primary bg-primary/5"
                        : "border-border hover:border-muted-foreground/50"
                    )}
                  >
                    <div className="flex gap-1 mb-1.5">
                      <div
                        className="w-4 h-4 rounded-full"
                        style={{ backgroundColor: theme.colors.primary }}
                      />
                      <div
                        className="w-4 h-4 rounded-full"
                        style={{ backgroundColor: theme.colors.success }}
                      />
                      <div
                        className="w-4 h-4 rounded-full"
                        style={{ backgroundColor: theme.colors.surface }}
                      />
                    </div>
                    <p className="text-xs font-medium truncate">{theme.name}</p>
                  </button>
                ))}
              </div>
            </div>
            <Separator />
          </>
        )}

        {/* Color Mode Setting */}
        <div className="space-y-2">
          <Label>Colour Mode</Label>
          <p className="text-sm text-muted-foreground">
            Force the status page to use light or dark mode, or follow the visitor's system preference
          </p>
          <Select
            value={watchedColorMode || "system"}
            onValueChange={(value: "system" | "light" | "dark") =>
              setValue("theme.colorMode", value, { shouldDirty: true })
            }
          >
            <SelectTrigger className="w-full max-w-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="system">System (Default)</SelectItem>
              <SelectItem value="light">Light Mode</SelectItem>
              <SelectItem value="dark">Dark Mode</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <Separator />

        {/* Custom Color Options */}
        <div className="space-y-2">
          <Label htmlFor="primaryColor">Accent Colour</Label>
          <p className="text-sm text-muted-foreground">
            Used for buttons, links, and highlights. Leave empty to use the default blue.
          </p>
          <div className="flex gap-2">
            <Input
              id="primaryColor"
              placeholder="#3B82F6"
              {...register("theme.primaryColor")}
              className="flex-1 max-w-[200px]"
            />
            <input
              type="color"
              value={watchedPrimaryColor || "#3B82F6"}
              onChange={(e) => {
                setValue("theme.primaryColor", e.target.value, { shouldDirty: true });
                setSelectedThemeId(null);
              }}
              className="h-10 w-10 cursor-pointer appearance-none rounded-md border border-input bg-transparent p-0.5 [&::-webkit-color-swatch-wrapper]:p-0 [&::-webkit-color-swatch]:rounded [&::-webkit-color-swatch]:border-none [&::-moz-color-swatch]:rounded [&::-moz-color-swatch]:border-none"
            />
            {watchedPrimaryColor && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => {
                  setValue("theme.primaryColor", "", { shouldDirty: true });
                  setSelectedThemeId(null);
                }}
              >
                Clear
              </Button>
            )}
          </div>
        </div>

        <Separator />

        <div className="space-y-2">
          <Label htmlFor="customCss">Custom CSS</Label>
          <textarea
            id="customCss"
            placeholder="/* Add custom styles here */"
            {...register("theme.customCss")}
            className="min-h-[100px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm font-mono"
          />
          <p className="text-xs text-muted-foreground">
            Add custom CSS for advanced customisation. Has access to all CSS variables.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
