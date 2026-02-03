"use client";

import { useState, useCallback } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { Palette, RotateCcw, Sparkles } from "lucide-react";
import {
  Button,
  Input,
  Label,
  Switch,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  Separator,
  cn,
} from "@uni-status/ui";
import { ThemePreviewDual } from "./theme-preview";
import type { StatusPageTheme, StatusPageThemeColors } from "@/lib/api-client";

const hexColorSchema = z.string().regex(/^#[0-9A-Fa-f]{6}$/, "Must be a valid hex color");

const themeFormSchema = z.object({
  name: z.string().min(1, "Name is required").max(100),
  description: z.string().max(500).optional(),
  colors: z.object({
    primary: hexColorSchema,
    secondary: hexColorSchema.optional(),
    background: hexColorSchema,
    backgroundDark: hexColorSchema.optional(),
    text: hexColorSchema,
    textDark: hexColorSchema.optional(),
    surface: hexColorSchema,
    surfaceDark: hexColorSchema.optional(),
    border: hexColorSchema.optional(),
    borderDark: hexColorSchema.optional(),
    success: hexColorSchema,
    warning: hexColorSchema,
    error: hexColorSchema,
    info: hexColorSchema.optional(),
  }),
  isDefault: z.boolean(),
});

type ThemeFormData = z.infer<typeof themeFormSchema>;

const DEFAULT_COLORS: StatusPageThemeColors = {
  primary: "#3B82F6",
  secondary: "#6366F1",
  background: "#FFFFFF",
  backgroundDark: "#0F172A",
  text: "#1F2937",
  textDark: "#F9FAFB",
  surface: "#F9FAFB",
  surfaceDark: "#1E293B",
  border: "#E5E7EB",
  borderDark: "#334155",
  success: "#22C55E",
  warning: "#EAB308",
  error: "#EF4444",
  info: "#3B82F6",
};

const PRESET_THEMES: { name: string; colors: StatusPageThemeColors }[] = [
  {
    name: "Default Blue",
    colors: DEFAULT_COLORS,
  },
  {
    name: "Modern Purple",
    colors: {
      ...DEFAULT_COLORS,
      primary: "#8B5CF6",
      secondary: "#A78BFA",
      backgroundDark: "#1A1625",
      surfaceDark: "#2D2640",
    },
  },
  {
    name: "Professional Green",
    colors: {
      ...DEFAULT_COLORS,
      primary: "#059669",
      secondary: "#10B981",
      success: "#22C55E",
    },
  },
  {
    name: "Warm Orange",
    colors: {
      ...DEFAULT_COLORS,
      primary: "#EA580C",
      secondary: "#F97316",
      backgroundDark: "#1C1410",
      surfaceDark: "#2D211A",
    },
  },
  {
    name: "Sleek Gray",
    colors: {
      ...DEFAULT_COLORS,
      primary: "#4B5563",
      secondary: "#6B7280",
      background: "#F3F4F6",
      surface: "#FFFFFF",
    },
  },
  {
    name: "Ocean Teal",
    colors: {
      ...DEFAULT_COLORS,
      primary: "#0D9488",
      secondary: "#14B8A6",
      backgroundDark: "#0A1A19",
      surfaceDark: "#1A2D2C",
    },
  },
];

interface ColorPickerFieldProps {
  label: string;
  value: string | undefined;
  onChange: (value: string) => void;
  placeholder?: string;
  optional?: boolean;
  description?: string;
}

function ColorPickerField({
  label,
  value,
  onChange,
  placeholder,
  optional,
  description,
}: ColorPickerFieldProps) {
  return (
    <div className="space-y-1.5">
      <Label className="text-sm">
        {label}
        {optional && <span className="text-muted-foreground ml-1">(optional)</span>}
      </Label>
      {description && (
        <p className="text-xs text-muted-foreground">{description}</p>
      )}
      <div className="flex gap-2">
        <Input
          value={value || ""}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className="flex-1 font-mono text-sm"
        />
        <input
          type="color"
          value={value || placeholder || "#000000"}
          onChange={(e) => onChange(e.target.value)}
          className="h-10 w-10 cursor-pointer appearance-none rounded-md border border-input bg-transparent p-0.5 [&::-webkit-color-swatch-wrapper]:p-0 [&::-webkit-color-swatch]:rounded [&::-webkit-color-swatch]:border-none [&::-moz-color-swatch]:rounded [&::-moz-color-swatch]:border-none"
        />
        {optional && value && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => onChange("")}
            className="px-2"
          >
            Clear
          </Button>
        )}
      </div>
    </div>
  );
}

interface ThemeEditorProps {
  theme?: StatusPageTheme;
  onSave: (data: ThemeFormData) => Promise<void>;
  onCancel: () => void;
  isSaving?: boolean;
}

export function ThemeEditor({ theme, onSave, onCancel, isSaving }: ThemeEditorProps) {
  const [activeTab, setActiveTab] = useState<"basic" | "light" | "dark" | "status">("basic");

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    reset,
    formState: { errors },
  } = useForm<ThemeFormData>({
    resolver: // @ts-expect-error Zod v4 compatibility
    zodResolver(themeFormSchema),
    defaultValues: {
      name: theme?.name ?? "",
      description: theme?.description ?? "",
      colors: theme?.colors ?? DEFAULT_COLORS,
      isDefault: theme?.isDefault ?? false,
    },
  });

  const watchedColors = watch("colors");
  const watchedName = watch("name");

  const handleColorChange = useCallback(
    (key: keyof StatusPageThemeColors, value: string) => {
      setValue(`colors.${key}`, value || undefined, { shouldDirty: true });
    },
    [setValue]
  );

  const applyPreset = useCallback(
    (preset: { name: string; colors: StatusPageThemeColors }) => {
      setValue("colors", preset.colors, { shouldDirty: true });
      if (!watchedName) {
        setValue("name", preset.name);
      }
    },
    [setValue, watchedName]
  );

  const resetToDefault = useCallback(() => {
    reset({
      name: theme?.name ?? "",
      description: theme?.description ?? "",
      colors: theme?.colors ?? DEFAULT_COLORS,
      isDefault: theme?.isDefault ?? false,
    });
  }, [reset, theme]);

  const onSubmit = async (data: ThemeFormData) => {
    await onSave(data);
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
      {/* Theme Name and Description */}
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="name">Theme Name *</Label>
          <Input
            id="name"
            placeholder="My Custom Theme"
            {...register("name")}
          />
          {errors.name && (
            <p className="text-sm text-destructive">{errors.name.message}</p>
          )}
        </div>
        <div className="space-y-2">
          <Label htmlFor="description">Description</Label>
          <Input
            id="description"
            placeholder="A brief description of this theme"
            {...register("description")}
          />
        </div>
      </div>

      <div className="flex items-center justify-between">
        <div className="space-y-0.5">
          <Label>Set as Default</Label>
          <p className="text-sm text-muted-foreground">
            Use this theme as the default for new status pages
          </p>
        </div>
        <Switch
          checked={watch("isDefault")}
          onCheckedChange={(checked) => setValue("isDefault", checked)}
        />
      </div>

      <Separator />

      {/* Preset Themes */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-muted-foreground" />
            <Label>Quick Start Presets</Label>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={resetToDefault}
          >
            <RotateCcw className="h-4 w-4 mr-2" />
            Reset
          </Button>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
          {PRESET_THEMES.map((preset) => (
            <button
              key={preset.name}
              type="button"
              onClick={() => applyPreset(preset)}
              className="group p-2 rounded-lg border hover:border-primary/50 transition-colors text-left"
            >
              <div className="flex gap-1 mb-1.5">
                <div
                  className="w-4 h-4 rounded-full"
                  style={{ backgroundColor: preset.colors.primary }}
                />
                <div
                  className="w-4 h-4 rounded-full"
                  style={{ backgroundColor: preset.colors.success }}
                />
                <div
                  className="w-4 h-4 rounded-full"
                  style={{ backgroundColor: preset.colors.surface }}
                />
              </div>
              <p className="text-xs font-medium truncate">{preset.name}</p>
            </button>
          ))}
        </div>
      </div>

      <Separator />

      {/* Color Configuration Tabs */}
      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as typeof activeTab)}>
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="basic">Basic</TabsTrigger>
          <TabsTrigger value="light">Light Mode</TabsTrigger>
          <TabsTrigger value="dark">Dark Mode</TabsTrigger>
          <TabsTrigger value="status">Status</TabsTrigger>
        </TabsList>

        <TabsContent value="basic" className="space-y-4 mt-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <ColorPickerField
              label="Primary Color"
              value={watchedColors.primary}
              onChange={(v) => handleColorChange("primary", v)}
              placeholder="#3B82F6"
              description="Main accent color for buttons and links"
            />
            <ColorPickerField
              label="Secondary Color"
              value={watchedColors.secondary}
              onChange={(v) => handleColorChange("secondary", v)}
              placeholder="#6366F1"
              optional
              description="Secondary accent for hover states"
            />
          </div>
        </TabsContent>

        <TabsContent value="light" className="space-y-4 mt-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <ColorPickerField
              label="Background"
              value={watchedColors.background}
              onChange={(v) => handleColorChange("background", v)}
              placeholder="#FFFFFF"
              description="Main page background"
            />
            <ColorPickerField
              label="Surface"
              value={watchedColors.surface}
              onChange={(v) => handleColorChange("surface", v)}
              placeholder="#F9FAFB"
              description="Card and component backgrounds"
            />
            <ColorPickerField
              label="Text"
              value={watchedColors.text}
              onChange={(v) => handleColorChange("text", v)}
              placeholder="#1F2937"
              description="Primary text color"
            />
            <ColorPickerField
              label="Border"
              value={watchedColors.border}
              onChange={(v) => handleColorChange("border", v)}
              placeholder="#E5E7EB"
              optional
              description="Border and divider color"
            />
          </div>
        </TabsContent>

        <TabsContent value="dark" className="space-y-4 mt-4">
          <p className="text-sm text-muted-foreground">
            Dark mode colors are optional. If not set, they will be automatically derived from the light mode colors.
          </p>
          <div className="grid gap-4 sm:grid-cols-2">
            <ColorPickerField
              label="Background (Dark)"
              value={watchedColors.backgroundDark}
              onChange={(v) => handleColorChange("backgroundDark", v)}
              placeholder="#0F172A"
              optional
            />
            <ColorPickerField
              label="Surface (Dark)"
              value={watchedColors.surfaceDark}
              onChange={(v) => handleColorChange("surfaceDark", v)}
              placeholder="#1E293B"
              optional
            />
            <ColorPickerField
              label="Text (Dark)"
              value={watchedColors.textDark}
              onChange={(v) => handleColorChange("textDark", v)}
              placeholder="#F9FAFB"
              optional
            />
            <ColorPickerField
              label="Border (Dark)"
              value={watchedColors.borderDark}
              onChange={(v) => handleColorChange("borderDark", v)}
              placeholder="#334155"
              optional
            />
          </div>
        </TabsContent>

        <TabsContent value="status" className="space-y-4 mt-4">
          <p className="text-sm text-muted-foreground">
            These colors are used to indicate the status of monitors and services.
          </p>
          <div className="grid gap-4 sm:grid-cols-2">
            <ColorPickerField
              label="Success / Operational"
              value={watchedColors.success}
              onChange={(v) => handleColorChange("success", v)}
              placeholder="#22C55E"
              description="Used for operational status"
            />
            <ColorPickerField
              label="Warning / Degraded"
              value={watchedColors.warning}
              onChange={(v) => handleColorChange("warning", v)}
              placeholder="#EAB308"
              description="Used for degraded performance"
            />
            <ColorPickerField
              label="Error / Down"
              value={watchedColors.error}
              onChange={(v) => handleColorChange("error", v)}
              placeholder="#EF4444"
              description="Used for outages and errors"
            />
            <ColorPickerField
              label="Info / Maintenance"
              value={watchedColors.info}
              onChange={(v) => handleColorChange("info", v)}
              placeholder="#3B82F6"
              optional
              description="Used for informational states"
            />
          </div>
        </TabsContent>
      </Tabs>

      <Separator />

      {/* Live Preview */}
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <Palette className="h-4 w-4 text-muted-foreground" />
          <Label>Live Preview</Label>
        </div>
        <ThemePreviewDual colors={watchedColors} />
      </div>

      {/* Actions */}
      <div className="flex items-center justify-end gap-3 pt-4 border-t">
        <Button type="button" variant="outline" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" disabled={isSaving}>
          {isSaving ? "Saving..." : theme ? "Save Changes" : "Create Theme"}
        </Button>
      </div>
    </form>
  );
}
