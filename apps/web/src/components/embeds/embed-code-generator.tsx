"use client";

import { useState, useMemo } from "react";
import { Check, Copy } from "lucide-react";
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
import { EmbedTypeSelector, type EmbedType } from "./embed-type-selector";
import { EmbedPreview } from "./embed-preview";

interface EmbedCodeGeneratorProps {
  slug: string;
  statusPageName: string;
  monitorId?: string;
  monitorName?: string;
  apiUrl?: string;
  appUrl?: string;
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
}: EmbedCodeGeneratorProps) {
  const [embedType, setEmbedType] = useState<EmbedType>("badge");
  const [copied, setCopied] = useState(false);

  // Badge options
  const [badgeLabel, setBadgeLabel] = useState("status");
  const [badgeStyle, setBadgeStyle] = useState<BadgeStyle>("modern");

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

    const baseApiUrl = isMonitorEmbed
      ? `${normalizedApiUrl}/api/public/embeds/monitors/${monitorId}`
      : `${normalizedApiUrl}/api/public/embeds/status-pages/${slug}`;

    const baseAppUrl = isMonitorEmbed
      ? `${appUrl}/embed/monitors/${monitorId}`
      : `${appUrl}/embed/status/${slug}`;

    switch (embedType) {
      case "badge": {
        const badgeUrl = `${baseApiUrl}/badge.svg?label=${encodeURIComponent(badgeLabel)}&style=${badgeStyle}`;
        const statusPageUrl = isMonitorEmbed ? "#" : `${appUrl}/status/${slug}`;

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
    badgeLabel,
    badgeStyle,
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
  };

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
