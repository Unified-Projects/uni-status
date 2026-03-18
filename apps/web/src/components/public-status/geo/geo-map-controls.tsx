"use client";

import { Button, cn, Label, Switch } from "@uni-status/ui";
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
    <div className="flex flex-col gap-4 rounded-lg border bg-[var(--status-card)] p-4 lg:flex-row lg:items-center lg:justify-between">
      <div className="text-sm font-medium text-[var(--status-muted-text)] flex items-center gap-2">
        <Eye className="h-4 w-4" />
        Display Options
      </div>

      <div className="flex flex-1 flex-wrap items-center gap-3">
        {(hasPublicProbes || hasPrivateProbes) && (
          <div className="flex flex-wrap items-center gap-2 rounded-md bg-[var(--status-muted)]/60 p-1">
            {hasPublicProbes && (
              <Button
                type="button"
                size="sm"
                variant={controls.showEdgeOrigin ? "default" : "ghost"}
                className="h-8"
                onClick={() => onControlChange("showEdgeOrigin", true)}
              >
                <Globe className="h-4 w-4" />
                Edge
              </Button>
            )}
            {hasPrivateProbes && (
              <Button
                type="button"
                size="sm"
                variant={!controls.showEdgeOrigin ? "default" : "ghost"}
                className="h-8"
                onClick={() => onControlChange("showEdgeOrigin", false)}
              >
                <Radio className="h-4 w-4" />
                Origin
              </Button>
            )}
          </div>
        )}

        {hasQuorumConnections && (
          <ControlToggle
            id="quorum-connections"
            label="Region Links"
            icon={<Link2 className="h-4 w-4" />}
            checked={controls.showQuorumConnections}
            onCheckedChange={(checked) => onControlChange("showQuorumConnections", checked)}
          />
        )}
      </div>
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
