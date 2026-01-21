// Region coordinates mapping
// Maps region IDs to their geographic coordinates [latitude, longitude]

export interface RegionCoordinateData {
  coordinates: [number, number];
  city: string;
  country: string;
  timezone: string;
}

export const REGION_COORDINATES: Record<string, RegionCoordinateData> = {
  // United Kingdom
  uk: {
    coordinates: [51.5074, -0.1278],
    city: "London",
    country: "United Kingdom",
    timezone: "Europe/London",
  },

  // United States
  "us-east": {
    coordinates: [38.9072, -77.0369],
    city: "Washington D.C.",
    country: "United States",
    timezone: "America/New_York",
  },
  "us-west": {
    coordinates: [37.7749, -122.4194],
    city: "San Francisco",
    country: "United States",
    timezone: "America/Los_Angeles",
  },

  // Europe
  "eu-west": {
    coordinates: [53.3498, -6.2603],
    city: "Dublin",
    country: "Ireland",
    timezone: "Europe/Dublin",
  },
  "eu-central": {
    coordinates: [50.1109, 8.6821],
    city: "Frankfurt",
    country: "Germany",
    timezone: "Europe/Berlin",
  },

  // Asia Pacific
  "ap-southeast": {
    coordinates: [1.3521, 103.8198],
    city: "Singapore",
    country: "Singapore",
    timezone: "Asia/Singapore",
  },
  "ap-northeast": {
    coordinates: [35.6762, 139.6503],
    city: "Tokyo",
    country: "Japan",
    timezone: "Asia/Tokyo",
  },

  // South America
  "sa-east": {
    coordinates: [-23.5505, -46.6333],
    city: "Sao Paulo",
    country: "Brazil",
    timezone: "America/Sao_Paulo",
  },

  // Australia
  "au-southeast": {
    coordinates: [-33.8688, 151.2093],
    city: "Sydney",
    country: "Australia",
    timezone: "Australia/Sydney",
  },
};

// Get coordinates for a region, with fallback
export function getRegionCoordinates(regionId: string): [number, number] {
  const region = REGION_COORDINATES[regionId];
  if (region) {
    return region.coordinates;
  }
  // Fallback to center of map if region not found
  return [0, 0];
}

// Get full region data
export function getRegionData(regionId: string): RegionCoordinateData | null {
  return REGION_COORDINATES[regionId] || null;
}

// Get all region IDs
export function getAllRegionIds(): string[] {
  return Object.keys(REGION_COORDINATES);
}

// Map tile URLs for light and dark themes
export const MAP_TILES = {
  light: "https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png",
  dark: "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png",
} as const;

export const MAP_ATTRIBUTION =
  '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>';

// Default map settings
export const DEFAULT_MAP_CENTER: [number, number] = [20, 0]; // Centered on Atlantic
export const DEFAULT_MAP_ZOOM = 2;
export const MIN_ZOOM = 2;
export const MAX_ZOOM = 10;

// Marker sizes
export const MARKER_SIZES = {
  region: 40,
  probe: 24,
  monitor: 28,
  incident: 32,
} as const;
