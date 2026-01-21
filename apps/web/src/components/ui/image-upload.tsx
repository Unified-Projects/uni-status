"use client";

import { useState, useRef, useCallback } from "react";
import { Button, Input, Label, cn } from "@uni-status/ui";
import { Upload, X, Link2 } from "lucide-react";
import { apiUpload, getAssetUrl } from "@/lib/api";
import { useDashboardStore } from "@/stores/dashboard-store";

interface ImageUploadProps {
  value?: string;
  onChange: (url: string) => void;
  label?: string;
  description?: string;
  accept?: string;
  maxSize?: number; // in MB
  className?: string;
  disabled?: boolean;
}

export function ImageUpload({
  value,
  onChange,
  label,
  description,
  accept = "image/png,image/jpeg,image/gif,image/svg+xml,image/webp,image/x-icon",
  maxSize = 5,
  className,
  disabled = false,
}: ImageUploadProps) {
  const organizationId = useDashboardStore((state) => state.currentOrganizationId);
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [useUrl, setUseUrl] = useState(false);
  const [urlInput, setUrlInput] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFileSelect = useCallback(async (file: File) => {
    setError(null);

    // Validate organization context
    if (!organizationId) {
      setError("Organization context required. Please refresh the page.");
      return;
    }

    // Validate file size
    if (file.size > maxSize * 1024 * 1024) {
      setError(`File too large. Maximum size is ${maxSize}MB`);
      return;
    }

    // Validate file type
    const allowedTypes = accept.split(",").map((t) => t.trim());
    if (!allowedTypes.some((type) => file.type === type || type === "*/*")) {
      setError("Invalid file type");
      return;
    }

    setIsUploading(true);

    try {
      const response = await apiUpload<{ url: string; filename: string }>(
        "/api/v1/uploads",
        file,
        { organizationId: organizationId || undefined }
      );

      if (response.success && response.data) {
        onChange(response.data.url);
      } else {
        // Narrow to error shape when success is false; otherwise fall back to a generic message.
        const message = !response.success ? response.error?.message : undefined;
        setError(message || "Upload failed");
      }
    } catch (err) {
      setError("Upload failed. Please try again.");
      console.error("Upload error:", err);
    } finally {
      setIsUploading(false);
    }
  }, [accept, maxSize, onChange, organizationId]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);

    const file = e.dataTransfer.files[0];
    if (file) {
      handleFileSelect(file);
    }
  }, [handleFileSelect]);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  const handleInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      handleFileSelect(file);
    }
  }, [handleFileSelect]);

  const handleRemove = useCallback(() => {
    onChange("");
    setUrlInput("");
    if (inputRef.current) {
      inputRef.current.value = "";
    }
  }, [onChange]);

  const handleUrlSubmit = useCallback(() => {
    if (urlInput) {
      onChange(urlInput);
      setUseUrl(false);
    }
  }, [urlInput, onChange]);

  return (
    <div className={cn("space-y-3", className)}>
      {label && <Label className="block">{label}</Label>}

      {/* Preview current image */}
      {value && (
        <div className="relative w-fit">
          <img
            src={getAssetUrl(value)}
            alt="Preview"
            className="block h-20 w-auto max-w-[220px] object-contain rounded-lg border bg-muted/50 shadow-sm"
            onError={(e) => {
              (e.target as HTMLImageElement).src = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='80' height='80' viewBox='0 0 24 24' fill='none' stroke='%23888' stroke-width='1' stroke-linecap='round' stroke-linejoin='round'%3E%3Crect width='18' height='18' x='3' y='3' rx='2' ry='2'/%3E%3Ccircle cx='9' cy='9' r='2'/%3E%3Cpath d='m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21'/%3E%3C/svg%3E";
            }}
          />
          <button
            type="button"
            onClick={handleRemove}
            disabled={disabled}
            className="absolute -top-2 -right-2 p-1 rounded-full bg-destructive text-destructive-foreground hover:bg-destructive/90 transition-colors"
          >
            <X className="h-3 w-3" />
          </button>
        </div>
      )}

      {/* Upload area */}
      {!value && !useUrl && (
        <div
          onDrop={handleDrop}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          className={cn(
            "relative flex w-full flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed p-6 transition-colors",
            isDragging ? "border-primary bg-primary/5" : "border-muted-foreground/25 hover:border-muted-foreground/50",
            disabled && "opacity-50 cursor-not-allowed"
          )}
        >
          <input
            ref={inputRef}
            type="file"
            accept={accept}
            onChange={handleInputChange}
            disabled={disabled || isUploading}
            className="absolute inset-0 cursor-pointer opacity-0"
          />
          {isUploading ? (
            <div className="flex flex-col items-center gap-2">
              <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
              <span className="text-sm text-muted-foreground">Uploading...</span>
            </div>
          ) : (
            <>
              <Upload className="h-8 w-8 text-muted-foreground" />
              <div className="text-center">
                <p className="text-sm font-medium">
                  Drop an image here or click to browse
                </p>
                <p className="text-xs text-muted-foreground">
                  PNG, JPG, GIF, SVG, WebP, ICO (max {maxSize}MB)
                </p>
              </div>
            </>
          )}
        </div>
      )}

      {/* URL input mode */}
      {!value && useUrl && (
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Link2 className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={urlInput}
              onChange={(e) => setUrlInput(e.target.value)}
              placeholder="https://example.com/image.png"
              className="pl-10"
              disabled={disabled}
            />
          </div>
          <Button
            type="button"
            onClick={handleUrlSubmit}
            disabled={disabled || !urlInput}
          >
            Use URL
          </Button>
        </div>
      )}

      {/* Toggle between upload and URL */}
      {!value && (
        <button
          type="button"
          onClick={() => setUseUrl(!useUrl)}
          disabled={disabled || isUploading}
          className="text-xs text-muted-foreground hover:text-foreground transition-colors"
        >
          {useUrl ? (
            <span className="flex items-center gap-1">
              <Upload className="h-3 w-3" /> Upload a file instead
            </span>
          ) : (
            <span className="flex items-center gap-1">
              <Link2 className="h-3 w-3" /> Use external URL instead
            </span>
          )}
        </button>
      )}

      {/* Error message */}
      {error && (
        <p className="text-sm text-destructive">{error}</p>
      )}

      {/* Description */}
      {description && !error && (
        <p className="text-xs text-muted-foreground">{description}</p>
      )}
    </div>
  );
}
