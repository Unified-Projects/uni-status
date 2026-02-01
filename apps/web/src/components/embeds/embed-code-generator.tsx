"use client";

import { useState, useMemo, useEffect } from "react";
import { Check, Copy, Palette } from "lucide-react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Button,
  Input,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Switch,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@uni-status/ui";
import type { BadgeTemplateData, BadgeTemplateConfig } from "@uni-status/shared/types";
import { EmbedTypeSelector, type EmbedType } from "./embed-type-selector";
import { EmbedPreview } from "./embed-preview";

interface EmbedCodeGeneratorProps {
  slug: string;
  statusPageName: string;
  monitorId?: string;
  monitorName?: string;
  apiUrl?: string;
  appUrl?: string;
  /** Canonical URL for the status page (uses custom domain if configured) */
  canonicalUrl?: string;
  /** Custom badge templates from the user's organization */
  badgeTemplates?: BadgeTemplateData[];
}

type BadgeStyle = "flat" | "plastic" | "flat-square" | "for-the-badge" | "modern";
type EmbedTheme = "light" | "dark" | "auto";

export function EmbedCodeGenerator({
  slug,
  statusPageName,
  monitorId,
  monitorName,
  apiUrl = process.env.NEXT_PUBLIC_API_URL || "/api",
  appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000",
  canonicalUrl,
  badgeTemplates = [],
}: EmbedCodeGeneratorProps) {
  const [embedType, setEmbedType] = useState<EmbedType>("badge");
  const [copied, setCopied] = useState(false);

  // Badge options
  const [badgeLabel, setBadgeLabel] = useState("status");
  const [badgeStyle, setBadgeStyle] = useState<BadgeStyle>("modern");
  const [selectedTemplateId, setSelectedTemplateId] = useState<string | null>(null);

  // Get the selected template (if any)
  const selectedTemplate = useMemo(() => {
    if (!selectedTemplateId) return null;
    return badgeTemplates.find((t) => t.id === selectedTemplateId) || null;
  }, [selectedTemplateId, badgeTemplates]);

  // Get template config for URL generation
  const templateConfig = useMemo((): BadgeTemplateConfig | null => {
    if (!selectedTemplate) return null;
    return selectedTemplate.config || null;
  }, [selectedTemplate]);

  // Update badge options when a template is selected
  useEffect(() => {
    if (selectedTemplate) {
      // Apply template style
      setBadgeStyle(selectedTemplate.style as BadgeStyle);
      // Apply template label if configured
      if (selectedTemplate.config?.label) {
        setBadgeLabel(selectedTemplate.config.label);
      }
    }
  }, [selectedTemplate]);

  // Dot options
  const [dotSize, setDotSize] = useState(12);
  const [dotAnimate, setDotAnimate] = useState(false);

  // Card/Widget options
  const [theme, setTheme] = useState<EmbedTheme>("light");
  const [showMonitors, setShowMonitors] = useState(true);
  const [showIncidents, setShowIncidents] = useState(true);
  const [refreshInterval, setRefreshInterval] = useState(60000);

  const isMonitorEmbed = !!monitorId;
  const displayName = isMonitorEmbed ? monitorName : statusPageName;

  // Generate embed codes
  const codes = useMemo(() => {
    // Normalize API URL - remove trailing /api if present to avoid double prefix
    const normalizedApiUrl = apiUrl.replace(/\/api\/?$/, '');

    // Determine the base URL for embed resources
    // If canonicalUrl is provided and is a custom domain (doesn't contain /status/),
    // use it as the base for embed URLs so the custom domain serves the badges
    // Otherwise fall back to the internal API URL
    const isCustomDomain = canonicalUrl && !canonicalUrl.includes('/status/');
    const embedBaseUrl = isCustomDomain ? canonicalUrl : normalizedApiUrl;

    const baseApiUrl = isMonitorEmbed
      ? `${embedBaseUrl}/api/public/embeds/monitors/${monitorId}`
      : `${embedBaseUrl}/api/public/embeds/status-pages/${slug}`;

    // Use canonical URL for app embeds (cards/iframes) when custom domain is set
    const baseAppUrl = isMonitorEmbed
      ? `${appUrl}/embed/monitors/${monitorId}`
      : `${isCustomDomain ? canonicalUrl : appUrl}/embed/status/${slug}`;

    switch (embedType) {
      case "badge": {
        // Build badge URL with base params
        const badgeParams = new URLSearchParams();
        badgeParams.set("label", badgeLabel);
        badgeParams.set("style", badgeStyle);

        // Add template config params if using a template
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

        const badgeUrl = `${baseApiUrl}/badge.svg?${badgeParams.toString()}`;
        // Use canonical URL if provided (respects custom domain), otherwise fall back to system URL
        const statusPageUrl = isMonitorEmbed ? "#" : (canonicalUrl || `${appUrl}/status/${slug}`);

        return {
          markdown: `[![${displayName}](${badgeUrl})](${statusPageUrl})`,
          html: `<a href="${statusPageUrl}" target="_blank" rel="noopener noreferrer">\n  <img src="${badgeUrl}" alt="${displayName}" />\n</a>`,
          imageUrl: badgeUrl,
        };
      }

      case "dot": {
        const dotUrl = `${baseApiUrl}/dot.svg?size=${dotSize}&animate=${dotAnimate}`;

        return {
          markdown: `![${displayName}](${dotUrl})`,
          html: `<img src="${dotUrl}" alt="${displayName}" style="vertical-align: middle;" />`,
          imageUrl: dotUrl,
        };
      }

      case "card": {
        const iframeUrl = isMonitorEmbed
          ? `${baseAppUrl}/card?theme=${theme}`
          : `${baseAppUrl}/card?theme=${theme}&showMonitors=${showMonitors}&showIncidents=${showIncidents}`;

        return {
          html: `<iframe\n  src="${iframeUrl}"\n  width="400"\n  height="${isMonitorEmbed ? "80" : "250"}"\n  frameborder="0"\n  style="border: 0;"\n  title="${displayName} Status"\n></iframe>`,
          iframeUrl,
        };
      }

      case "widget": {
        const widgetUrl = `${baseApiUrl}/widget.js`;
        const dataAttrs = [
          `data-theme="${theme}"`,
          `data-show-monitors="${showMonitors}"`,
          `data-show-incidents="${showIncidents}"`,
          `data-refresh="${refreshInterval}"`,
        ].join("\n  ");

        return {
          html: `<script\n  src="${widgetUrl}"\n  ${dataAttrs}\n></script>`,
          widgetUrl,
        };
      }

      default:
        return {};
    }
  }, [
    embedType,
    slug,
    monitorId,
    isMonitorEmbed,
    displayName,
    apiUrl,
    appUrl,
    canonicalUrl,
    badgeLabel,
    badgeStyle,
    templateConfig,
    dotSize,
    dotAnimate,
    theme,
    showMonitors,
    showIncidents,
    refreshInterval,
  ]);

  const copyToClipboard = async (text: string) => {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const previewOptions = {
    label: badgeLabel,
    style: badgeStyle,
    size: dotSize,
    animate: dotAnimate,
    theme,
    showMonitors,
    showIncidents,
    templateConfig,
  };

  // Filter templates to only show badge type templates
  const badgeTypeTemplates = badgeTemplates.filter((t) => t.type === "badge");

  return (
    <div className="space-y-6">
      {/* Embed Type Selector */}
      <div>
        <Label className="text-sm font-medium mb-3 block">Embed Type</Label>
        <EmbedTypeSelector value={embedType} onChange={setEmbedType} />
      </div>

      {/* Options */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-medium">Options</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {embedType === "badge" && (
            <>
              {/* Template Selector - shown when user has saved templates */}
              {badgeTypeTemplates.length > 0 && (
                <div className="space-y-2">
                  <Label htmlFor="badge-template" className="flex items-center gap-2">
                    <Palette className="h-4 w-4" />
                    Custom Template
                  </Label>
                  <Select
                    value={selectedTemplateId || "none"}
                    onValueChange={(v) => setSelectedTemplateId(v === "none" ? null : v)}
                  >
                    <SelectTrigger id="badge-template">
                      <SelectValue placeholder="Use default styling" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Use default styling</SelectItem>
                      {badgeTypeTemplates.map((template) => (
                        <SelectItem key={template.id} value={template.id}>
                          {template.name}
                          {template.isDefault && " (Default)"}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {selectedTemplate && selectedTemplate.description && (
                    <p className="text-xs text-muted-foreground">
                      {selectedTemplate.description}
                    </p>
                  )}
                </div>
              )}

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="badge-label">Label Text</Label>
                  <Input
                    id="badge-label"
                    value={badgeLabel}
                    onChange={(e) => setBadgeLabel(e.target.value)}
                    placeholder="status"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="badge-style">Badge Style</Label>
                  <Select value={badgeStyle} onValueChange={(v) => setBadgeStyle(v as BadgeStyle)}>
                    <SelectTrigger id="badge-style">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="modern">Modern</SelectItem>
                      <SelectItem value="flat">Flat</SelectItem>
                      <SelectItem value="plastic">Plastic</SelectItem>
                      <SelectItem value="flat-square">Flat Square</SelectItem>
                      <SelectItem value="for-the-badge">For the Badge</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {/* Show custom colors indicator when using a template */}
              {selectedTemplate && templateConfig && (
                <div className="flex items-center gap-2 p-2 bg-muted rounded-md text-xs text-muted-foreground">
                  <Palette className="h-3 w-3" />
                  <span>
                    Using custom colors from &quot;{selectedTemplate.name}&quot; template
                  </span>
                </div>
              )}
            </>
          )}

          {embedType === "dot" && (
            <>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="dot-size">Size (px)</Label>
                  <Input
                    id="dot-size"
                    type="number"
                    min={8}
                    max={64}
                    value={dotSize}
                    onChange={(e) => setDotSize(Number(e.target.value))}
                  />
                </div>
                <div className="flex items-center justify-between">
                  <Label htmlFor="dot-animate">Pulse Animation</Label>
                  <Switch
                    id="dot-animate"
                    checked={dotAnimate}
                    onCheckedChange={setDotAnimate}
                  />
                </div>
              </div>
            </>
          )}

          {(embedType === "card" || embedType === "widget") && (
            <>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="theme">Theme</Label>
                  <Select value={theme} onValueChange={(v) => setTheme(v as EmbedTheme)}>
                    <SelectTrigger id="theme">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="light">Light</SelectItem>
                      <SelectItem value="dark">Dark</SelectItem>
                      <SelectItem value="auto">Auto (System)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                {embedType === "widget" && (
                  <div className="space-y-2">
                    <Label htmlFor="refresh">Refresh Interval</Label>
                    <Select
                      value={refreshInterval.toString()}
                      onValueChange={(v) => setRefreshInterval(Number(v))}
                    >
                      <SelectTrigger id="refresh">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="30000">30 seconds</SelectItem>
                        <SelectItem value="60000">1 minute</SelectItem>
                        <SelectItem value="300000">5 minutes</SelectItem>
                        <SelectItem value="600000">10 minutes</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                )}
              </div>
              {!isMonitorEmbed && (
                <div className="flex flex-wrap gap-6">
                  <div className="flex items-center justify-between gap-4">
                    <Label htmlFor="show-monitors">Show Monitors</Label>
                    <Switch
                      id="show-monitors"
                      checked={showMonitors}
                      onCheckedChange={setShowMonitors}
                    />
                  </div>
                  <div className="flex items-center justify-between gap-4">
                    <Label htmlFor="show-incidents">Show Incidents</Label>
                    <Switch
                      id="show-incidents"
                      checked={showIncidents}
                      onCheckedChange={setShowIncidents}
                    />
                  </div>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>

      {/* Preview */}
      <EmbedPreview
        type={embedType}
        slug={slug}
        monitorId={monitorId}
        options={previewOptions}
        apiUrl={apiUrl}
      />

      {/* Code Output */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-medium">Embed Code</CardTitle>
        </CardHeader>
        <CardContent>
          {(embedType === "badge" || embedType === "dot") ? (
            <Tabs defaultValue="html">
              <TabsList className="mb-4">
                <TabsTrigger value="html">HTML</TabsTrigger>
                <TabsTrigger value="markdown">Markdown</TabsTrigger>
                <TabsTrigger value="url">Image URL</TabsTrigger>
              </TabsList>
              <TabsContent value="html">
                <CodeBlock
                  code={codes.html || ""}
                  onCopy={() => copyToClipboard(codes.html || "")}
                  copied={copied}
                />
              </TabsContent>
              <TabsContent value="markdown">
                <CodeBlock
                  code={codes.markdown || ""}
                  onCopy={() => copyToClipboard(codes.markdown || "")}
                  copied={copied}
                />
              </TabsContent>
              <TabsContent value="url">
                <CodeBlock
                  code={codes.imageUrl || ""}
                  onCopy={() => copyToClipboard(codes.imageUrl || "")}
                  copied={copied}
                />
              </TabsContent>
            </Tabs>
          ) : (
            <CodeBlock
              code={codes.html || ""}
              onCopy={() => copyToClipboard(codes.html || "")}
              copied={copied}
            />
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function CodeBlock({
  code,
  onCopy,
  copied,
}: {
  code: string;
  onCopy: () => void;
  copied: boolean;
}) {
  return (
    <div className="relative">
      <pre className="bg-muted rounded-lg p-4 text-sm overflow-x-auto font-mono">
        <code>{code}</code>
      </pre>
      <Button
        variant="outline"
        size="sm"
        className="absolute top-2 right-2"
        onClick={onCopy}
      >
        {copied ? (
          <>
            <Check className="h-4 w-4 mr-1" />
            Copied
          </>
        ) : (
          <>
            <Copy className="h-4 w-4 mr-1" />
            Copy
          </>
        )}
      </Button>
    </div>
  );
}
