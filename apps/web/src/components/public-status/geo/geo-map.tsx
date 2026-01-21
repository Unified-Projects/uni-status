"use client";

import { useEffect, useRef, useMemo } from "react";
import { useTheme } from "next-themes";
import type { Map as LeafletMap } from "leaflet";
import {
  MapContainer,
  TileLayer,
  Marker,
  Popup,
  Polyline,
  useMap,
} from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import {
  MAP_TILES,
  MAP_ATTRIBUTION,
  DEFAULT_MAP_CENTER,
  DEFAULT_MAP_ZOOM,
  MIN_ZOOM,
  MAX_ZOOM,
  REGION_COORDINATES,
} from "./region-coordinates";
import {
  type GeoRegion,
  type GeoMonitor,
  type GeoProbe,
  type GeoIncident,
  type GeoQuorumConnection,
  type GeoControlState,
} from "./types";
import { GeoLatencyPopup } from "./geo-latency-popup";
import { GeoMapLegend } from "./geo-map-legend";
import { useStatusColors } from "@/hooks/use-status-colors";

// Fix Leaflet default marker icon issue
delete (L.Icon.Default.prototype as { _getIconUrl?: () => void })._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
  iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
  shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
});

// Create custom marker icons
function createMarkerIcon(
  color: string,
  size: number = 32,
  isPulsing: boolean = false
): L.DivIcon {
  const pulsingClass = isPulsing ? "animate-pulse" : "";
  return L.divIcon({
    className: "custom-marker",
    html: `
      <div class="relative flex items-center justify-center ${pulsingClass}">
        <div
          class="absolute rounded-full opacity-30"
          style="width: ${size + 16}px; height: ${size + 16}px; background-color: ${color};"
        ></div>
        <div
          class="rounded-full border-2 shadow-lg flex items-center justify-center"
          style="width: ${size}px; height: ${size}px; background-color: ${color}; border-color: hsl(var(--background));"
        >
        </div>
      </div>
    `,
    iconSize: [size + 16, size + 16],
    iconAnchor: [(size + 16) / 2, (size + 16) / 2],
    popupAnchor: [0, -(size + 16) / 2],
  });
}

// Create region marker with count
function createRegionIcon(
  color: string,
  monitorCount: number,
  size: number = 40
): L.DivIcon {
  return L.divIcon({
    className: "custom-marker",
    html: `
      <div class="relative flex items-center justify-center">
        <div
          class="absolute rounded-full opacity-20"
          style="width: ${size + 20}px; height: ${size + 20}px; background-color: ${color};"
        ></div>
        <div
          class="rounded-full border-2 shadow-lg flex items-center justify-center font-bold text-sm"
          style="width: ${size}px; height: ${size}px; background-color: ${color}; border-color: hsl(var(--background)); color: hsl(var(--background));"
        >
          ${monitorCount}
        </div>
      </div>
    `,
    iconSize: [size + 20, size + 20],
    iconAnchor: [(size + 20) / 2, (size + 20) / 2],
    popupAnchor: [0, -(size + 20) / 2],
  });
}

// Create incident marker (pulsing)
function createIncidentIcon(
  color: string,
  size: number = 32
): L.DivIcon {
  return L.divIcon({
    className: "custom-marker",
    html: `
      <div class="relative flex items-center justify-center">
        <div
          class="absolute rounded-full animate-ping opacity-50"
          style="width: ${size + 16}px; height: ${size + 16}px; background-color: ${color};"
        ></div>
        <div
          class="absolute rounded-full animate-pulse opacity-30"
          style="width: ${size + 24}px; height: ${size + 24}px; background-color: ${color};"
        ></div>
        <div
          class="rounded-full border-2 shadow-lg flex items-center justify-center"
          style="width: ${size}px; height: ${size}px; background-color: ${color}; border-color: hsl(var(--background));"
        >
          <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" style="color: hsl(var(--background));" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
        </div>
      </div>
    `,
    iconSize: [size + 24, size + 24],
    iconAnchor: [(size + 24) / 2, (size + 24) / 2],
    popupAnchor: [0, -(size + 24) / 2],
  });
}

// Theme-aware tile layer component
function ThemeAwareTileLayer() {
  const { resolvedTheme } = useTheme();
  const map = useMap();
  const tileLayerRef = useRef<L.TileLayer | null>(null);

  useEffect(() => {
    const tileUrl = resolvedTheme === "dark" ? MAP_TILES.dark : MAP_TILES.light;

    if (tileLayerRef.current) {
      map.removeLayer(tileLayerRef.current);
    }

    const newLayer = L.tileLayer(tileUrl, {
      attribution: MAP_ATTRIBUTION,
      maxZoom: MAX_ZOOM,
      minZoom: MIN_ZOOM,
    });
    newLayer.addTo(map);
    tileLayerRef.current = newLayer;

    return () => {
      if (tileLayerRef.current) {
        map.removeLayer(tileLayerRef.current);
      }
    };
  }, [resolvedTheme, map]);

  return null;
}

// Quorum connection lines
interface QuorumConnectionsProps {
  connections: GeoQuorumConnection[];
  visible: boolean;
  colors: {
    active: string;
    degraded: string;
    down: string;
  };
}

function QuorumConnections({ connections, visible, colors }: QuorumConnectionsProps) {
  if (!visible) return null;

  return (
    <>
      {connections.map((connection, index) => {
        const fromCoords = REGION_COORDINATES[connection.fromRegion]?.coordinates;
        const toCoords = REGION_COORDINATES[connection.toRegion]?.coordinates;

        if (!fromCoords || !toCoords) return null;

        const color =
          connection.status === "down"
            ? colors.down
            : connection.status === "degraded"
            ? colors.degraded
            : colors.active;

        return (
          <Polyline
            key={`${connection.fromRegion}-${connection.toRegion}-${index}`}
            positions={[fromCoords, toCoords]}
            pathOptions={{
              color,
              weight: 2,
              opacity: 0.6,
              dashArray: connection.status === "healthy" ? undefined : "5, 10",
            }}
          />
        );
      })}
    </>
  );
}

interface GeoMapProps {
  regions: GeoRegion[];
  monitors: GeoMonitor[];
  probes: {
    public: GeoProbe[];
    private: GeoProbe[];
  };
  incidents: GeoIncident[];
  quorumConnections: GeoQuorumConnection[];
  controls: GeoControlState;
}

export function GeoMap({
  regions,
  monitors,
  probes,
  incidents,
  quorumConnections,
  controls,
}: GeoMapProps) {
  const mapRef = useRef<LeafletMap | null>(null);
  const statusColors = useStatusColors();

  // Leaflet leaves a stamp on the container, so ensure we clear it when React remounts
  // (React 18+ StrictMode or fast refresh can otherwise trigger "already initialized").
  useEffect(() => {
    return () => {
      const map = mapRef.current;
      if (!map) return;

      const container = map.getContainer?.();
      map.remove();

      if (container && (container as unknown as { _leaflet_id?: string })._leaflet_id) {
        delete (container as unknown as { _leaflet_id?: string })._leaflet_id;
      }

      mapRef.current = null;
    };
  }, []);

  // Filter probes based on controls
  // If showEdgeOrigin is defined, use edge/origin mode:
  // - true = Edge (public probes only)
  // - false = Origin (private probes only)
  // Otherwise, use the individual public/private toggles
  const visibleProbes =
    controls.showEdgeOrigin !== undefined
      ? controls.showEdgeOrigin
        ? probes.public  // Edge mode: show public probes (edge locations)
        : probes.private // Origin mode: show private probes (origin/backend)
      : [
          ...(controls.showPublicProbes ? probes.public : []),
          ...(controls.showPrivateProbes ? probes.private : []),
        ];

  return (
    <div className="relative w-full h-full min-h-[400px] rounded-lg overflow-hidden border bg-[var(--status-card)]">
      <MapContainer
        center={DEFAULT_MAP_CENTER}
        zoom={DEFAULT_MAP_ZOOM}
        minZoom={MIN_ZOOM}
        maxZoom={MAX_ZOOM}
        className="w-full h-full"
        ref={mapRef}
        whenReady={() => {
          // Map instance is already set via ref
        }}
        scrollWheelZoom={true}
        doubleClickZoom={true}
        zoomControl={true}
      >
        <ThemeAwareTileLayer />

        {/* Quorum connection lines */}
        <QuorumConnections
          connections={quorumConnections}
          visible={controls.showQuorumConnections}
          colors={{
            active: statusColors.active,
            degraded: statusColors.degraded,
            down: statusColors.down,
          }}
        />

        {/* Region markers */}
        {regions.map((region) => {
          const color = statusColors[region.status as keyof typeof statusColors] || statusColors.pending;
          return (
          <Marker
            key={`region-${region.id}`}
            position={region.coordinates}
            icon={createRegionIcon(color, region.monitorCount)}
          >
            <Popup>
              <GeoLatencyPopup
                title={region.name}
                subtitle={region.location}
                status={region.status}
                latency={region.latency}
                monitorCount={region.monitorCount}
                probeCount={region.probeCount}
              />
            </Popup>
          </Marker>
        );
        })}

        {/* Probe markers */}
        {visibleProbes.map((probe) => {
          const regionData = REGION_COORDINATES[probe.region];
          if (!regionData) return null;

          // Offset probes slightly from region center to avoid overlap
          const offset = probe.isPrivate ? 0.5 : -0.5;
          const position: [number, number] = [
            regionData.coordinates[0] + offset,
            regionData.coordinates[1] + offset,
          ];

          const color =
            probe.status === "active"
              ? statusColors.active
              : probe.status === "offline"
              ? statusColors.offline
              : probe.status === "disabled"
              ? statusColors.disabled
              : statusColors.pending;

          return (
            <Marker
              key={`probe-${probe.id}`}
              position={position}
              icon={createMarkerIcon(color, 24)}
            >
              <Popup>
                <div className="min-w-[180px]">
                  <div className="font-semibold text-[var(--status-text)]">{probe.name}</div>
                  <div className="text-sm text-[var(--status-muted-text)]">
                    {probe.isPrivate ? "Private Probe" : "Public Probe"}
                  </div>
                  <div className="mt-2 flex items-center gap-2">
                    <div
                      className="w-2 h-2 rounded-full"
                      style={{ backgroundColor: color }}
                    />
                    <span className="text-sm capitalize">{probe.status}</span>
                  </div>
                  {probe.version && (
                    <div className="text-xs text-[var(--status-muted-text)] mt-1">
                      Version: {probe.version}
                    </div>
                  )}
                </div>
              </Popup>
            </Marker>
          );
        })}

        {/* Incident markers */}
        {incidents.map((incident) => {
          // Place incident marker at first affected region
          const regionId = incident.affectedRegions[0];
          if (!regionId) return null;

          const regionData = REGION_COORDINATES[regionId];
          if (!regionData) return null;

          // Offset incident markers slightly
          const position: [number, number] = [
            regionData.coordinates[0] + 1,
            regionData.coordinates[1] - 1,
          ];

          const severityColor = statusColors[incident.severity as keyof typeof statusColors] || statusColors.minor;

          return (
            <Marker
              key={`incident-${incident.id}`}
              position={position}
              icon={createIncidentIcon(severityColor)}
            >
              <Popup>
                <div className="min-w-[200px]">
                  <div className="font-semibold text-[var(--status-text)]">{incident.title}</div>
                  <div className="mt-2 flex items-center gap-2">
                    <div
                      className="px-2 py-0.5 rounded text-xs font-medium"
                      style={{ backgroundColor: severityColor, color: "hsl(var(--background))" }}
                    >
                      {incident.severity.toUpperCase()}
                    </div>
                    <span className="text-sm text-[var(--status-muted-text)] capitalize">
                      {incident.status}
                    </span>
                  </div>
                  <div className="text-xs text-[var(--status-muted-text)] mt-2">
                    Affecting: {incident.affectedRegions.join(", ")}
                  </div>
                </div>
              </Popup>
            </Marker>
          );
        })}
      </MapContainer>

      {/* Legend overlay */}
      <GeoMapLegend />
    </div>
  );
}
