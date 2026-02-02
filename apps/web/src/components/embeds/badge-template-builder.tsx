"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Palette,
  Sparkles,
  Wand2,
  Plus,
  Save,
  Trash2,
  Gauge,
  Shield,
  Code,
} from "lucide-react";
import { getStatusIconSvg, type StatusIconType } from "@uni-status/shared/lib/status-icons";
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Input,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Slider,
  Switch,
  Separator,
  Textarea,
  cn,
} from "@uni-status/ui";
import type { BadgeCustomDataConfig, BadgeTemplateConfig, BadgeTemplateData, BadgeStyleType, BadgeType } from "@uni-status/shared/types";
import {
  useBadgeTemplates,
  useCreateBadgeTemplate,
  useUpdateBadgeTemplate,
  useDeleteBadgeTemplate,
} from "@/hooks/use-badge-templates";
import { LoadingState } from "@/components/ui/loading-state";
import { EmptyState } from "@/components/ui/empty-state";
import type { BadgeTemplateInput, UpdateBadgeTemplateInput } from "@/lib/api-client";

type PreviewStatus = "operational" | "degraded" | "partial_outage" | "major_outage" | "maintenance" | "unknown";

const STATUS_LABELS: Record<PreviewStatus, string> = {
  operational: "Operational",
  degraded: "Degraded",
  partial_outage: "Partial Outage",
  major_outage: "Major Outage",
  maintenance: "Maintenance",
  unknown: "Unknown",
};

const STATUS_COLORS: Record<PreviewStatus, string> = {
  operational: "#22c55e",
  degraded: "#eab308",
  partial_outage: "#f97316",
  major_outage: "#ef4444",
  maintenance: "#3b82f6",
  unknown: "#6b7280",
};

const DEFAULT_CUSTOM_DATA_CONFIG: BadgeCustomDataConfig = {
  enabled: false,
  type: "uptime",
  customLabel: "Uptime",
  customValue: "99.95%",
  thresholds: [],
};

const DEFAULT_TEMPLATE_CONFIG: BadgeTemplateConfig = {
  label: "status",
  labelColor: "#4b5563",
  statusColors: {
    operational: STATUS_COLORS.operational,
    degraded: STATUS_COLORS.degraded,
    partialOutage: STATUS_COLORS.partial_outage,
    majorOutage: STATUS_COLORS.major_outage,
    maintenance: STATUS_COLORS.maintenance,
    unknown: STATUS_COLORS.unknown,
  },
  textColor: "#ffffff",
  statusTextColor: "#ffffff",
  scale: 1,
  dot: {
    size: 14,
    animate: false,
    animationStyle: "pulse",
  },
  customData: DEFAULT_CUSTOM_DATA_CONFIG,
  showIcon: true,
  customCss: "",
};

const DEFAULT_TEMPLATE = (): BadgeTemplateInput => ({
  name: "New Badge Template",
  description: "Reusable badge styling for embeds",
  type: "badge",
  style: "modern",
  isDefault: false,
  config: normalizeConfig(),
});

const PREVIEW_STATUSES: PreviewStatus[] = ["operational", "degraded", "major_outage"];

export function BadgeTemplateBuilder() {
  const { data: templates, isLoading } = useBadgeTemplates();
  const createTemplate = useCreateBadgeTemplate();
  const updateTemplate = useUpdateBadgeTemplate();
  const deleteTemplate = useDeleteBadgeTemplate();

  const [selectedTemplateId, setSelectedTemplateId] = useState<string | null>(null);
  const [form, setForm] = useState<BadgeTemplateInput>(DEFAULT_TEMPLATE());
  const [isCreatingNew, setIsCreatingNew] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isSaving = createTemplate.isPending || updateTemplate.isPending;
  const isDeleting = deleteTemplate.isPending;

  // Autofill the first template when data loads
  useEffect(() => {
    if (templates && templates.length > 0 && selectedTemplateId === null && !isCreatingNew) {
      const first = templates[0];
      setSelectedTemplateId(first.id);
      setForm(templateToForm(first));
    }

    if (templates && templates.length === 0 && !isCreatingNew) {
      setIsCreatingNew(true);
      setForm(DEFAULT_TEMPLATE());
    }
  }, [templates, selectedTemplateId, isCreatingNew]);

  const handleTemplateSelect = (template: BadgeTemplateData) => {
    setIsCreatingNew(false);
    setSelectedTemplateId(template.id);
    setForm(templateToForm(template));
    setError(null);
  };

  const handleNewTemplate = () => {
    setIsCreatingNew(true);
    setSelectedTemplateId(null);
    setForm(DEFAULT_TEMPLATE());
    setError(null);
  };

  const handleSave = async () => {
    setError(null);
    const payload = normalizePayload(form);

    try {
      if (isCreatingNew || !selectedTemplateId) {
        const created = await createTemplate.mutateAsync(payload);
        setIsCreatingNew(false);
        setSelectedTemplateId(created.id);
        setForm(templateToForm(created));
      } else {
        const updated = await updateTemplate.mutateAsync({
          id: selectedTemplateId,
          data: payload as UpdateBadgeTemplateInput,
        });
        setForm(templateToForm(updated));
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to save template");
    }
  };

  const handleDelete = async () => {
    if (!selectedTemplateId) return;
    setError(null);

    try {
      await deleteTemplate.mutateAsync(selectedTemplateId);
      handleNewTemplate();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to delete template");
    }
  };

  return (
    <div className="grid gap-6 lg:grid-cols-[320px_1fr]">
      <Card className="h-fit">
        <CardHeader className="pb-4">
          <CardTitle className="text-lg flex items-center gap-2">
            <Palette className="h-4 w-4" />
            Saved Badge Templates
          </CardTitle>
          <CardDescription>
            Start from an existing template or design a fresh one.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4 pt-0">
          <Button variant="secondary" size="sm" className="w-full justify-center" onClick={handleNewTemplate}>
            <Plus className="h-4 w-4 mr-2" />
            New Template
          </Button>

          {isLoading && <LoadingState variant="template" count={2} />}

          {!isLoading && (!templates || templates.length === 0) && (
            <EmptyState
              icon={Sparkles}
              title="No saved templates"
              description="Create your first badge template to reuse across embeds."
              action={{ label: "Start Designing", onClick: handleNewTemplate }}
            />
          )}

          {!isLoading && templates && templates.length > 0 && (
            <div className="space-y-2">
              {templates.map((template) => {
                const isActive = template.id === selectedTemplateId && !isCreatingNew;
                return (
                  <button
                    key={template.id}
                    onClick={() => handleTemplateSelect(template)}
                    className={cn(
                      "w-full rounded-lg border p-3 text-left transition hover:border-primary/60",
                      isActive && "border-primary bg-primary/5"
                    )}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <div className="flex items-center gap-2">
                          <p className="font-medium">{template.name}</p>
                          {template.isDefault && (
                            <Badge variant="secondary" className="bg-primary/10 text-primary">
                              Default
                            </Badge>
                          )}
                        </div>
                        {template.description && (
                          <p className="text-xs text-muted-foreground line-clamp-2 mt-1">
                            {template.description}
                          </p>
                        )}
                      </div>
                      <Badge variant="outline" className="text-[11px]">
                        {template.type === "dot" ? "Dot" : "Badge"} • {template.style}
                      </Badge>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      <div className="space-y-4">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-lg flex items-center gap-2">
              <Wand2 className="h-4 w-4" />
              Visual Builder
            </CardTitle>
            <CardDescription>
              Configure the badge label, style, colors, and motion. Save templates to reuse later.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="template-name">Template Name</Label>
                <Input
                  id="template-name"
                  value={form.name}
                  onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value }))}
                  placeholder="Status badge"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="template-description">Description</Label>
                <Input
                  id="template-description"
                  value={form.description || ""}
                  onChange={(e) => setForm((prev) => ({ ...prev, description: e.target.value }))}
                  placeholder="Optional helper text"
                />
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label>Template Type</Label>
                <Select
                  value={form.type}
                  onValueChange={(value) =>
                    setForm((prev) => ({ ...prev, type: value as BadgeType }))
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="badge">Badge</SelectItem>
                    <SelectItem value="dot">Status Dot</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {form.type === "badge" && (
                <div className="space-y-2">
                  <Label>Style</Label>
                  <Select
                    value={form.style}
                    onValueChange={(value) =>
                      setForm((prev) => ({ ...prev, style: value as BadgeStyleType }))
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="modern">Modern Pill</SelectItem>
                      <SelectItem value="flat">Flat</SelectItem>
                      <SelectItem value="plastic">Plastic</SelectItem>
                      <SelectItem value="flat-square">Flat Square</SelectItem>
                      <SelectItem value="for-the-badge">For the Badge</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              )}

              {form.type === "dot" && (
                <div className="space-y-2">
                  <Label>Style</Label>
                  <Input value="Dot uses theme colors" readOnly className="text-muted-foreground" />
                </div>
              )}
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label>Label Text</Label>
                <Input
                  value={form.config?.label || ""}
                  onChange={(e) => updateConfig("label", e.target.value)}
                  placeholder="status"
                />
              </div>
              <div className="space-y-2">
                <Label>Scale ({(form.config?.scale ?? 1).toFixed(2)}x)</Label>
                <Slider
                  value={[form.config?.scale || 1]}
                  min={0.5}
                  max={2}
                  step={0.05}
                  onValueChange={([value]) => updateConfig("scale", Number(value.toFixed(2)))}
                />
              </div>
            </div>

            <div className="flex flex-wrap gap-4">
              <div className="flex items-center gap-2">
                <Switch
                  checked={form.config?.showIcon ?? true}
                  onCheckedChange={(checked) => updateConfig("showIcon", checked)}
                  disabled={form.style !== "modern" || form.type === "dot"}
                />
                <Label className="cursor-pointer">Show Icon (Modern only)</Label>
              </div>
              <div className="flex items-center gap-2">
                <Switch
                  checked={form.isDefault ?? false}
                  onCheckedChange={(checked) => setForm((prev) => ({ ...prev, isDefault: checked }))}
                />
                <Label className="cursor-pointer">Mark as default</Label>
              </div>
            </div>

            {error && (
              <div className="rounded-md border border-destructive/50 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                {error}
              </div>
            )}

            <div className="flex flex-wrap gap-3">
              <Button onClick={handleSave} disabled={isSaving || !form.name.trim()}>
                <Save className="h-4 w-4 mr-2" />
                {isCreatingNew ? "Create Template" : "Save Changes"}
              </Button>
              {!isCreatingNew && (
                <Button
                  variant="ghost"
                  onClick={handleDelete}
                  disabled={isDeleting}
                  className="text-destructive hover:text-destructive"
                >
                  <Trash2 className="h-4 w-4 mr-2" />
                  Delete
                </Button>
              )}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-lg flex items-center gap-2">
              <Gauge className="h-4 w-4" />
              Live Preview
            </CardTitle>
            <CardDescription>
              See how this template renders across common states.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {form.type === "badge" && (
              <div className="space-y-2">
                <p className="text-xs uppercase tracking-wide text-muted-foreground">Palette sweep</p>
                <div className="flex flex-wrap gap-3">
                  {PREVIEW_STATUSES.map((status) => (
                    <BadgeSvgPreview
                      key={status}
                      status={status}
                      config={form.config}
                      style={form.style as BadgeStyleType}
                    />
                  ))}
                </div>
              </div>
            )}
            {form.type === "dot" && (
              <div className="space-y-2">
                <p className="text-xs uppercase tracking-wide text-muted-foreground">Palette sweep</p>
                <div className="flex flex-wrap gap-3">
                  {PREVIEW_STATUSES.map((status) => (
                    <DotPreview key={status} status={status} config={form.config} />
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        <div className="grid gap-4 lg:grid-cols-2">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Palette className="h-4 w-4" />
                Colors
              </CardTitle>
              <CardDescription>Choose label, text, and status colors.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-3">
                <ColorField
                  label="Label background"
                  value={form.config?.labelColor || ""}
                  onChange={(val) => updateConfig("labelColor", val)}
                />
                <ColorField
                  label="Label text"
                  value={form.config?.textColor || ""}
                  onChange={(val) => updateConfig("textColor", val)}
                />
                <ColorField
                  label="Status text"
                  value={form.config?.statusTextColor || ""}
                  onChange={(val) => updateConfig("statusTextColor", val)}
                />
              </div>

              <Separator />

              <div className="grid gap-3 md:grid-cols-2">
                {getStatusColorEntries(form.config).map((entry) => (
                  <ColorField
                    key={entry.key}
                    label={entry.label}
                    value={entry.value}
                    onChange={(val) => updateStatusColor(entry.key, val)}
                  />
                ))}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Code className="h-4 w-4" />
                Custom CSS
              </CardTitle>
              <CardDescription>Add custom CSS styles to the badge SVG.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="custom-css">CSS Rules</Label>
                <Textarea
                  id="custom-css"
                  value={form.config?.customCss || ""}
                  onChange={(e) => updateConfig("customCss", e.target.value)}
                  placeholder={`/* Example CSS */
text { font-style: italic; }
rect { opacity: 0.9; }`}
                  className="font-mono text-sm min-h-[120px]"
                />
                <p className="text-xs text-muted-foreground">
                  CSS is scoped to SVG elements (text, rect, circle, path, g). Dangerous patterns are automatically sanitized.
                </p>
              </div>
            </CardContent>
          </Card>

          {form.type === "dot" && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <Shield className="h-4 w-4" />
                  Dot Customization
                </CardTitle>
                <CardDescription>Configure the status dot size and animation.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid gap-3 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label>Dot size ({form.config?.dot?.size || 12}px)</Label>
                    <Slider
                      value={[form.config?.dot?.size || 12]}
                      min={8}
                      max={48}
                      step={1}
                      onValueChange={([value]) =>
                        updateConfig("dot", { ...form.config?.dot, size: value })
                      }
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Animation</Label>
                    <div className="flex items-center justify-between rounded-md border px-3 py-2">
                      <div>
                        <p className="text-sm font-medium">Enable Animation</p>
                        <p className="text-xs text-muted-foreground">Subtle animation for status indicator</p>
                      </div>
                      <Switch
                        checked={form.config?.dot?.animate ?? false}
                        onCheckedChange={(checked) =>
                          updateConfig("dot", { ...form.config?.dot, animate: checked })
                        }
                      />
                    </div>
                    {form.config?.dot?.animate && (
                      <Select
                        value={form.config.dot.animationStyle || "pulse"}
                        onValueChange={(value) =>
                          updateConfig("dot", { ...form.config?.dot, animationStyle: value as "pulse" | "blink" })
                        }
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Animation style" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="pulse">Pulse (breathing effect)</SelectItem>
                          <SelectItem value="blink">Blink (on/off effect)</SelectItem>
                        </SelectContent>
                      </Select>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );

  function updateConfig<K extends keyof BadgeTemplateConfig>(key: K, value: BadgeTemplateConfig[K]) {
    setForm((prev) => ({
      ...prev,
      config: {
        ...normalizeConfig(prev.config),
        [key]: value,
      },
    }));
  }

  function updateStatusColor(key: keyof NonNullable<BadgeTemplateConfig["statusColors"]>, value: string) {
    setForm((prev) => ({
      ...prev,
      config: {
        ...normalizeConfig(prev.config),
        statusColors: {
          ...normalizeConfig(prev.config).statusColors,
          [key]: value,
        },
      },
    }));
  }

}

function templateToForm(template: BadgeTemplateData): BadgeTemplateInput {
  return {
    name: template.name,
    description: template.description || "",
    type: template.type,
    style: template.style,
    isDefault: template.isDefault,
    config: normalizeConfig(template.config),
  };
}

function normalizePayload(input: BadgeTemplateInput): BadgeTemplateInput {
  return {
    ...input,
    description: input.description?.trim() || undefined,
    config: normalizeConfig(input.config),
  };
}

function normalizeCustomData(customData?: BadgeCustomDataConfig): BadgeCustomDataConfig {
  return {
    ...DEFAULT_CUSTOM_DATA_CONFIG,
    ...customData,
    enabled: customData?.enabled ?? DEFAULT_CUSTOM_DATA_CONFIG.enabled,
    type: customData?.type ?? DEFAULT_CUSTOM_DATA_CONFIG.type,
    thresholds: customData?.thresholds ?? [],
  };
}

function normalizeConfig(config?: BadgeTemplateConfig): BadgeTemplateConfig {
  return {
    ...DEFAULT_TEMPLATE_CONFIG,
    ...config,
    statusColors: {
      ...DEFAULT_TEMPLATE_CONFIG.statusColors,
      ...(config?.statusColors || {}),
    },
    dot: {
      ...DEFAULT_TEMPLATE_CONFIG.dot,
      ...(config?.dot || {}),
    },
    customData: normalizeCustomData(config?.customData),
  };
}

function getStatusColorEntries(config?: BadgeTemplateConfig) {
  const colors = normalizeConfig(config).statusColors || {};
  return [
    { key: "operational" as const, label: "Operational", value: colors.operational || STATUS_COLORS.operational },
    { key: "degraded" as const, label: "Degraded", value: colors.degraded || STATUS_COLORS.degraded },
    { key: "partialOutage" as const, label: "Partial outage", value: colors.partialOutage || STATUS_COLORS.partial_outage },
    { key: "majorOutage" as const, label: "Major outage", value: colors.majorOutage || STATUS_COLORS.major_outage },
    { key: "maintenance" as const, label: "Maintenance", value: colors.maintenance || STATUS_COLORS.maintenance },
    { key: "unknown" as const, label: "Unknown", value: colors.unknown || STATUS_COLORS.unknown },
  ];
}

function getStatusColor(config: BadgeTemplateConfig | undefined, status: PreviewStatus) {
  const normalized = normalizeConfig(config);
  const mapKey =
    status === "partial_outage" ? "partialOutage" :
      status === "major_outage" ? "majorOutage" : status;
  return (normalized.statusColors as Record<string, string>)[mapKey] || STATUS_COLORS[status];
}

function BadgeSvgPreview({
  status,
  config,
  style,
  condensed = false,
}: {
  status: PreviewStatus;
  config?: BadgeTemplateConfig;
  style: BadgeStyleType;
  condensed?: boolean;
}) {
  const { svg, width, height } = useMemo(
    () => buildBadgeSvg(status, style, normalizeConfig(config), condensed),
    [status, style, config, condensed]
  );
  const scale = config?.scale || 1;

  // Calculate container dimensions to accommodate scaled badge
  const scaledWidth = Math.ceil(width * scale);
  const scaledHeight = Math.ceil(height * scale);

  return (
    <div
      className="rounded-md border bg-muted/40 px-3 py-2 overflow-visible"
      style={{ minWidth: scaledWidth + 24, minHeight: scaledHeight + 16 }}
    >
      <div
        style={{ transform: `scale(${scale})`, transformOrigin: "top left" }}
        dangerouslySetInnerHTML={{ __html: svg }}
      />
    </div>
  );
}

function DotPreview({ status, config }: { status: PreviewStatus; config?: BadgeTemplateConfig }) {
  const svg = useMemo(() => buildDotSvg(status, normalizeConfig(config)), [status, config]);
  return (
    <div className="rounded-md border bg-muted/40 px-3 py-2">
      <div dangerouslySetInnerHTML={{ __html: svg }} />
    </div>
  );
}

function ColorField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  const safeValue = value || "#000000";
  return (
    <div className="space-y-1">
      <Label>{label}</Label>
      <div className="flex items-center gap-2">
        <input
          type="color"
          className="h-10 w-10 p-0 rounded-lg cursor-pointer border-0 overflow-hidden appearance-none"
          value={safeValue}
          onChange={(e) => onChange(e.target.value)}
        />
        <Input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="#000000"
        />
      </div>
    </div>
  );
}

function buildBadgeSvg(
  status: PreviewStatus,
  style: BadgeStyleType,
  config: BadgeTemplateConfig,
  condensed = false
): { svg: string; width: number; height: number } {
  const label = config.label || "status";
  const statusLabel = STATUS_LABELS[status] || status;
  const labelColor = config.labelColor || "#4b5563";
  const statusColor = getStatusColor(config, status);
  const labelTextColor = config.textColor || "#ffffff";
  const statusTextColor = config.statusTextColor || "#ffffff";
  const showIcon = config.showIcon !== false;
  const customCss = config.customCss || "";

  // Sanitize custom CSS
  const sanitizedCss = sanitizeCss(customCss);
  const styleTag = sanitizedCss ? `<style>${sanitizedCss}</style>` : "";

  if (style === "modern") {
    const modernHeight = 26;
    const fontSize = 12;
    const text = statusLabel;
    const textWidth = measureText(text, fontSize);
    const iconSpace = showIcon ? 18 : 0;
    const padding = condensed ? 10 : 14;
    const width = padding + iconSpace + textWidth + padding / 2;
    const radius = 6; // Slight corner rounding (was used when rounded=false)
    const iconSvg = showIcon ? renderStatusIcon(statusColor, status) : "";

    return {
      svg: `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${modernHeight}" role="img">
  ${styleTag}
  <rect width="${width}" height="${modernHeight}" rx="${radius}" fill="${statusColor}" />
  ${showIcon ? `<g transform="translate(${padding / 2}, ${(modernHeight - 16) / 2}) scale(${16 / 24})">${iconSvg}</g>` : ""}
  <text x="${padding / 2 + iconSpace}" y="${modernHeight / 2 + fontSize / 2 - 2}" fill="${statusTextColor}" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" font-size="${fontSize}" font-weight="600">${escapeText(text)}</text>
</svg>`,
      width,
      height: modernHeight,
    };
  }

  const fontSize = style === "for-the-badge" ? 11 : 11;
  const height = style === "for-the-badge" ? 28 : 22;
  const padding = style === "for-the-badge" ? 9 : condensed ? 4 : 6;
  const textY = style === "for-the-badge" ? 18 : 15;

  const labelText = style === "for-the-badge" ? label.toUpperCase() : label;
  const statusText = style === "for-the-badge" ? statusLabel.toUpperCase() : statusLabel;

  const labelWidth = Math.round(measureText(labelText, fontSize) + padding * 2);
  const statusWidth = Math.round(measureText(statusText, fontSize) + padding * 2);
  const totalWidth = labelWidth + statusWidth;

  // No rounding for non-modern styles (was used when rounded=false)
  const radius = 0;

  // Use a clip path for proper rounded corners on the badge as a whole
  const clipPath = radius > 0
    ? `<clipPath id="r"><rect width="${totalWidth}" height="${height}" rx="${radius}" fill="#fff"/></clipPath>`
    : "";
  const clipAttr = radius > 0 ? ' clip-path="url(#r)"' : "";

  return {
    svg: `<svg xmlns="http://www.w3.org/2000/svg" width="${totalWidth}" height="${height}" role="img" aria-label="${label}: ${statusLabel}">
  ${styleTag}
  ${clipPath}
  <g${clipAttr}>
    <rect width="${labelWidth}" height="${height}" fill="${labelColor}" />
    <rect x="${labelWidth}" width="${statusWidth}" height="${height}" fill="${statusColor}" />
  </g>
  <g fill="${labelTextColor}" text-anchor="middle" font-family="Verdana,Geneva,DejaVu Sans,sans-serif" font-size="${fontSize}">
    <text x="${labelWidth / 2}" y="${textY}">${escapeText(labelText)}</text>
    <text x="${labelWidth + statusWidth / 2}" y="${textY}" fill="${statusTextColor}">${escapeText(statusText)}</text>
  </g>
</svg>`,
    width: totalWidth,
    height,
  };
}

function sanitizeCss(css: string): string {
  if (!css || typeof css !== "string") return "";

  // Remove potentially dangerous patterns
  const dangerous = [
    /javascript\s*:/gi,
    /expression\s*\(/gi,
    /url\s*\(\s*["']?\s*data:/gi,
    /@import/gi,
    /@charset/gi,
    /behavior\s*:/gi,
    /-moz-binding/gi,
  ];

  let sanitized = css;
  for (const pattern of dangerous) {
    sanitized = sanitized.replace(pattern, "");
  }

  // Only allow basic CSS properties for SVG styling
  // Strip anything that looks like it might break out of the style context
  sanitized = sanitized.replace(/<[^>]*>/g, "");
  sanitized = sanitized.replace(/[<>]/g, "");

  return sanitized.trim();
}

function buildDotSvg(status: PreviewStatus, config: BadgeTemplateConfig) {
  const color = getStatusColor(config, status);
  const size = config.dot?.size || 12;
  const animate = config.dot?.animate;
  const animationStyle = config.dot?.animationStyle || "pulse";
  const radius = size / 2;
  const center = size / 2;
  const totalSize = animate ? size + 4 : size;
  const offset = animate ? 2 : 0;

  const pulseAnimation = animationStyle === "pulse" ? `
  <style>
    @keyframes pulse { 0% { opacity: 1; transform: scale(1);} 50% { opacity: 0.55; transform: scale(1.25);} 100% { opacity: 1; transform: scale(1);} }
    .pulse { animation: pulse 1.8s ease-in-out infinite; transform-origin: center; }
  </style>` : "";

  const blinkAnimation = animationStyle === "blink" ? `
  <style>
    @keyframes blink { 0%,100%{ opacity: 1; } 50% { opacity: 0.35; } }
    .blink { animation: blink 1.4s ease-in-out infinite; }
  </style>` : "";

  const animationClass = animate ? (animationStyle === "blink" ? "blink" : "pulse") : "";

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${totalSize}" height="${totalSize}" viewBox="0 0 ${totalSize} ${totalSize}" role="img">
  ${pulseAnimation}${blinkAnimation}
  <circle class="${animationClass}" cx="${center + offset}" cy="${center + offset}" r="${radius}" fill="${color}" />
</svg>`;
}

function measureText(text: string, fontSize: number) {
  return text.length * fontSize * 0.6;
}

function escapeText(text: string) {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function renderStatusIcon(_color: string, status: PreviewStatus) {
  // Use shared icon utility for consistent icons
  return getStatusIconSvg(status as StatusIconType, {
    stroke: "white",
    strokeWidth: 1.5,
    fill: "none",
  });
}

