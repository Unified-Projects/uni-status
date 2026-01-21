"use client";

import { STATUS_COLORS, SEVERITY_COLORS } from "./types";

export function GeoMapLegend() {
  return (
    <div className="absolute bottom-4 left-4 z-[1000] bg-[var(--status-card)]/95 backdrop-blur-sm rounded-lg border shadow-lg p-3 text-sm">
      <div className="font-semibold mb-2">Legend</div>

      {/* Status indicators */}
      <div className="space-y-1.5">
        <LegendItem color={STATUS_COLORS.active} label="Operational" />
        <LegendItem color={STATUS_COLORS.degraded} label="Degraded" />
        <LegendItem color={STATUS_COLORS.down} label="Down" />
        <LegendItem color={STATUS_COLORS.pending} label="Pending" />
      </div>

      {/* Divider */}
      <div className="border-t my-2" />

      {/* Incident severity */}
      <div className="text-xs text-[var(--status-muted-text)] mb-1.5">Incidents</div>
      <div className="space-y-1.5">
        <LegendItem color={SEVERITY_COLORS.minor} label="Minor" isPulsing />
        <LegendItem color={SEVERITY_COLORS.major} label="Major" isPulsing />
        <LegendItem color={SEVERITY_COLORS.critical} label="Critical" isPulsing />
      </div>
    </div>
  );
}

interface LegendItemProps {
  color: string;
  label: string;
  isPulsing?: boolean;
}

function LegendItem({ color, label, isPulsing = false }: LegendItemProps) {
  return (
    <div className="flex items-center gap-2">
      <div className="relative">
        {isPulsing && (
          <div
            className="absolute inset-0 rounded-full animate-ping opacity-50"
            style={{ backgroundColor: color }}
          />
        )}
        <div
          className="w-3 h-3 rounded-full relative z-10"
          style={{ backgroundColor: color }}
        />
      </div>
      <span className="text-[var(--status-muted-text)]">{label}</span>
    </div>
  );
}
