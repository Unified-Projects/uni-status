"use client";

import { useEffect, useState, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle, Skeleton, cn } from "@uni-status/ui";
import { RefreshCw } from "lucide-react";
import type { BadgeTemplateConfig } from "@uni-status/shared/types";
import type { EmbedType } from "./embed-type-selector";

interface EmbedPreviewProps {
  type: EmbedType;
  slug: string;
  monitorId?: string;
  options: {
    label?: string;
    style?: "flat" | "plastic" | "flat-square" | "for-the-badge" | "modern";
    size?: number;
    animate?: boolean;
    theme?: "light" | "dark" | "auto";
    showMonitors?: boolean;
    showIncidents?: boolean;
    templateConfig?: BadgeTemplateConfig | null;
  };
  apiUrl: string;
}

export function EmbedPreview({
  type,
  slug,
  monitorId,
  options,
  apiUrl,
}: EmbedPreviewProps) {
  const [content, setContent] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const isMonitorEmbed = !!monitorId;
  // Normalize API URL - remove trailing /api if present to avoid double prefix
  const normalizedApiUrl = apiUrl.replace(/\/api\/?$/, '');
  const baseUrl = isMonitorEmbed
    ? `${normalizedApiUrl}/api/public/embeds/monitors/${monitorId}`
    : `${normalizedApiUrl}/api/public/embeds/status-pages/${slug}`;

  // Serialize templateConfig for stable dependency comparison
  // This ensures the effect runs when any config property changes
  const templateConfigKey = useMemo(() => {
    return options.templateConfig ? JSON.stringify(options.templateConfig) : null;
  }, [options.templateConfig]);

  useEffect(() => {
    async function fetchPreview() {
      setLoading(true);
      setError(null);

      try {
        if (type === "badge") {
          // Build URL with template config params
          const badgeParams = new URLSearchParams();
          badgeParams.set("label", options.label || "status");
          badgeParams.set("style", options.style || "flat");

          // Add template config params if provided
          const templateConfig = options.templateConfig;
          if (templateConfig) {
            if (templateConfig.labelColor) {
              badgeParams.set("labelColor", templateConfig.labelColor);
            }
            if (templateConfig.textColor) {
              badgeParams.set("textColor", templateConfig.textColor);
            }
            if (templateConfig.statusTextColor) {
              badgeParams.set("statusTextColor", templateConfig.statusTextColor);
            }
            if (templateConfig.scale && templateConfig.scale !== 1) {
              badgeParams.set("scale", templateConfig.scale.toString());
            }
            if (templateConfig.statusColors) {
              badgeParams.set("statusColors", JSON.stringify(templateConfig.statusColors));
            }
          }

          // Add cache-busting param to ensure fresh preview when config changes
          const url = `${baseUrl}/badge.svg?${badgeParams.toString()}`;
          const response = await fetch(url, { cache: "no-store" });
          if (!response.ok) throw new Error("Failed to load badge");
          const svg = await response.text();
          setContent(svg);
        } else if (type === "dot") {
          const url = `${baseUrl}/dot.svg?size=${options.size || 12}&animate=${options.animate || false}`;
          const response = await fetch(url, { cache: "no-store" });
          if (!response.ok) throw new Error("Failed to load dot");
          const svg = await response.text();
          setContent(svg);
        } else if (type === "card" || type === "widget") {
          // For card/widget, we show the iframe preview URL
          setContent("iframe");
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load preview");
      } finally {
        setLoading(false);
      }
    }

    fetchPreview();
  }, [type, baseUrl, options.label, options.style, options.size, options.animate, templateConfigKey]);

  const previewBgClass =
    options.theme === "dark"
      ? "bg-gray-900"
      : options.theme === "light"
        ? "bg-white"
        : "bg-gray-100";

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-medium flex items-center gap-2">
          Preview
          {loading && <RefreshCw className="h-3 w-3 animate-spin text-muted-foreground" />}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div
          className={cn(
            "rounded-lg border p-6 flex items-center justify-center min-h-[100px]",
            previewBgClass
          )}
        >
          {loading && (
            <Skeleton className="h-8 w-32" />
          )}

          {error && (
            <p className="text-sm text-destructive">{error}</p>
          )}

          {!loading && !error && content && (
            <>
              {(type === "badge" || type === "dot") && (
                <div dangerouslySetInnerHTML={{ __html: content }} />
              )}

              {type === "card" && !isMonitorEmbed && (
                <iframe
                  src={`/embed/status/${slug}/card?theme=${options.theme || "light"}&showMonitors=${options.showMonitors !== false}&showIncidents=${options.showIncidents !== false}`}
                  className="border-0 w-full"
                  style={{ height: "250px", maxWidth: "500px" }}
                  title="Status Card Preview"
                />
              )}

              {type === "card" && isMonitorEmbed && (
                <iframe
                  src={`/embed/monitors/${monitorId}/card?theme=${options.theme || "light"}`}
                  className="border-0 w-full"
                  style={{ height: "100px", maxWidth: "500px" }}
                  title="Monitor Card Preview"
                />
              )}

              {type === "widget" && (
                <div className="text-center text-sm text-muted-foreground">
                  <p>Widget preview not available</p>
                  <p className="text-xs mt-1">Copy the code and test on your site</p>
                </div>
              )}
            </>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
