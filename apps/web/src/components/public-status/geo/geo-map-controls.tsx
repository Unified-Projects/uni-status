"use client";

import { cn, Switch, Label } from "@uni-status/ui";
import { Radio, Globe, Link2, Eye } from "lucide-react";
import type { GeoControlState } from "./types";

interface GeoMapControlsProps {
  controls: GeoControlState;
  onControlChange: (key: keyof GeoControlState, value: boolean) => void;
  hasPublicProbes: boolean;
  hasPrivateProbes: boolean;
  hasQuorumConnections: boolean;
}

export function GeoMapControls({
  controls,
  onControlChange,
  hasPublicProbes,
  hasPrivateProbes,
  hasQuorumConnections,
}: GeoMapControlsProps) {
  return (
    <div className="flex flex-wrap items-center gap-4 p-4 bg-[var(--status-card)] rounded-lg border">
      <div className="text-sm font-medium text-[var(--status-muted-text)] flex items-center gap-2">
        <Eye className="h-4 w-4" />
        Display Options
      </div>

      {/* Divider */}
      <div className="h-6 w-px bg-[var(--status-border)]" />

      {/* Public Probes Toggle */}
      {hasPublicProbes && (
        <ControlToggle
          id="public-probes"
          label="Public Probes"
          icon={<Globe className="h-4 w-4" />}
          checked={controls.showPublicProbes}
          onCheckedChange={(checked) => onControlChange("showPublicProbes", checked)}
        />
      )}

      {/* Private Probes Toggle */}
      {hasPrivateProbes && (
        <ControlToggle
          id="private-probes"
          label="Private Probes"
          icon={<Radio className="h-4 w-4" />}
          checked={controls.showPrivateProbes}
          onCheckedChange={(checked) => onControlChange("showPrivateProbes", checked)}
        />
      )}

      {/* Quorum Connections Toggle */}
      {hasQuorumConnections && (
        <ControlToggle
          id="quorum-connections"
          label="Region Links"
          icon={<Link2 className="h-4 w-4" />}
          checked={controls.showQuorumConnections}
          onCheckedChange={(checked) => onControlChange("showQuorumConnections", checked)}
        />
      )}

      {/* Edge vs Origin Toggle (placeholder for future) */}
      {controls.showEdgeOrigin !== undefined && (
        <ControlToggle
          id="edge-origin"
          label="Edge/Origin"
          icon={
            <svg
              xmlns="http://www.w3.org/2000/svg"
              className="h-4 w-4"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M8 9l4-4 4 4m0 6l-4 4-4-4"
              />
            </svg>
          }
          checked={controls.showEdgeOrigin}
          onCheckedChange={(checked) => onControlChange("showEdgeOrigin", checked)}
        />
      )}
    </div>
  );
}

interface ControlToggleProps {
  id: string;
  label: string;
  icon: React.ReactNode;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  disabled?: boolean;
}

function ControlToggle({
  id,
  label,
  icon,
  checked,
  onCheckedChange,
  disabled = false,
}: ControlToggleProps) {
  return (
    <div
      className={cn(
        "flex items-center gap-2 px-3 py-1.5 rounded-md transition-colors",
        checked ? "bg-primary/10" : "bg-[var(--status-muted)]/50",
        disabled && "opacity-50 cursor-not-allowed"
      )}
    >
      <div className={cn("text-[var(--status-muted-text)]", checked && "text-primary")}>
        {icon}
      </div>
      <Label
        htmlFor={id}
        className={cn(
          "text-sm cursor-pointer select-none",
          disabled && "cursor-not-allowed"
        )}
      >
        {label}
      </Label>
      <Switch
        id={id}
        checked={checked}
        onCheckedChange={onCheckedChange}
        disabled={disabled}
        className="ml-1"
      />
    </div>
  );
}
