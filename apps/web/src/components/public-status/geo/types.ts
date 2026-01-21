// Geo View Types

export interface GeoRegion {
  id: string;
  name: string;
  location: string;
  coordinates: [number, number]; // [lat, lng]
  flag: string;
  status: "active" | "degraded" | "down" | "pending";
  probeCount: number;
  monitorCount: number;
  latency: {
    p50: number;
    p95: number;
    p99: number;
  } | null;
}

export interface GeoMonitor {
  id: string;
  name: string;
  type: string;
  status: "active" | "degraded" | "down" | "paused" | "pending";
  regions: string[];
  latencyByRegion: Record<
    string,
    {
      p50: number;
      p95: number;
      p99: number;
    }
  >;
  hasActiveIncident: boolean;
}

export interface GeoProbe {
  id: string;
  name: string;
  region: string;
  status: "pending" | "active" | "offline" | "disabled";
  lastHeartbeatAt: string | null;
  isPrivate: boolean;
  version?: string;
}

export interface GeoIncident {
  id: string;
  title: string;
  severity: "minor" | "major" | "critical";
  status: string;
  affectedRegions: string[];
  affectedMonitorIds: string[];
  startedAt: string;
}

export interface GeoQuorumConnection {
  fromRegion: string;
  toRegion: string;
  status: "healthy" | "degraded" | "down";
  latencyMs: number;
}

export interface GeoSettings {
  showPublicProbes: boolean;
  showPrivateProbes: boolean;
  quorumRequired: number;
}

export interface GeoData {
  regions: GeoRegion[];
  monitors: GeoMonitor[];
  probes: {
    public: GeoProbe[];
    private: GeoProbe[];
  };
  incidents: GeoIncident[];
  quorumConnections: GeoQuorumConnection[];
  settings: GeoSettings;
}

export interface GeoResponse {
  success: boolean;
  data?: GeoData;
  error?: {
    code: string;
    message: string;
  };
}

// Map marker types
export type MarkerType = "region" | "probe" | "monitor" | "incident";

export interface BaseMarker {
  id: string;
  type: MarkerType;
  coordinates: [number, number];
  label: string;
}

export interface RegionMarker extends BaseMarker {
  type: "region";
  status: GeoRegion["status"];
  probeCount: number;
  monitorCount: number;
  latency: GeoRegion["latency"];
}

export interface ProbeMarker extends BaseMarker {
  type: "probe";
  status: GeoProbe["status"];
  isPrivate: boolean;
  lastHeartbeatAt: string | null;
}

export interface MonitorMarker extends BaseMarker {
  type: "monitor";
  status: GeoMonitor["status"];
  monitorType: string;
  hasActiveIncident: boolean;
}

export interface IncidentMarker extends BaseMarker {
  type: "incident";
  severity: GeoIncident["severity"];
  title: string;
}

export type GeoMarker = RegionMarker | ProbeMarker | MonitorMarker | IncidentMarker;

// Control state
export interface GeoControlState {
  showPublicProbes: boolean;
  showPrivateProbes: boolean;
  showEdgeOrigin: boolean;
  showQuorumConnections: boolean;
  selectedRegion: string | null;
}

// Status colors using CSS variables - resolved at runtime for Leaflet/Canvas
// Import getResolvedStatusColor from @/lib/status-colors for runtime resolution
// These are fallback values; prefer using getMonitorStatusColor() for runtime resolution
export const STATUS_COLORS = {
  active: "var(--status-success-solid)",
  degraded: "var(--status-warning-solid)",
  down: "var(--status-error-solid)",
  pending: "var(--status-gray-solid)",
  paused: "var(--status-gray-solid)",
  offline: "var(--status-gray-solid)",
  disabled: "var(--status-gray-border)",
} as const;

export const SEVERITY_COLORS = {
  minor: "var(--status-warning-solid)",
  major: "var(--status-orange-solid)",
  critical: "var(--status-error-solid)",
} as const;
