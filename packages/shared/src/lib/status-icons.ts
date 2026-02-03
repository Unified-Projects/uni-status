/**
 * Status icon utility for converting Lucide icons to SVG strings
 * Uses Lucide icon data directly to avoid SSR/client bundle issues
 */

import {
  CheckCircle,
  AlertTriangle,
  XCircle,
  Wrench,
  Circle,
  Pause,
  Clock,
} from "lucide-react";

export type StatusIconType =
  | "operational"
  | "active"
  | "degraded"
  | "partial_outage"
  | "down"
  | "major_outage"
  | "maintenance"
  | "paused"
  | "pending"
  | "unknown";

export interface SvgAttributes {
  stroke?: string;
  fill?: string;
  strokeWidth?: string | number;
  size?: number;
  [key: string]: string | number | undefined;
}

// Status to icon mappings
const STATUS_ICON_MAP: Record<StatusIconType, any> = {
  operational: CheckCircle,
  active: CheckCircle,
  degraded: AlertTriangle,
  partial_outage: AlertTriangle,
  down: XCircle,
  major_outage: XCircle,
  maintenance: Wrench,
  paused: Pause,
  pending: Clock,
  unknown: Circle,
};

// Manual SVG path data for each icon (extracted from lucide-react)
// This avoids runtime React rendering and SSR/client bundle issues
const STATUS_ICON_SVG_PATHS: Record<StatusIconType, string> = {
  operational: '<path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><path d="m9 11 3 3L22 4"/>',
  active: '<path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><path d="m9 11 3 3L22 4"/>',
  degraded: '<path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3"/><path d="M12 9v4"/><path d="M12 17h.01"/>',
  partial_outage: '<path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3"/><path d="M12 9v4"/><path d="M12 17h.01"/>',
  down: '<circle cx="12" cy="12" r="10"/><path d="m15 9-6 6"/><path d="m9 9 6 6"/>',
  major_outage: '<circle cx="12" cy="12" r="10"/><path d="m15 9-6 6"/><path d="m9 9 6 6"/>',
  maintenance: '<path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/>',
  paused: '<rect x="14" y="4" width="4" height="16" rx="1"/><rect x="6" y="4" width="4" height="16" rx="1"/>',
  pending: '<circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>',
  unknown: '<circle cx="12" cy="12" r="10"/>',
};

/**
 * Get SVG string for a status icon
 * @param status - Status type
 * @param attributes - Custom SVG attributes (stroke, fill, strokeWidth, size, etc.)
 */
export function getStatusIconSvg(
  status: StatusIconType,
  attributes?: SvgAttributes
): string {
  const svgPaths = STATUS_ICON_SVG_PATHS[status] || STATUS_ICON_SVG_PATHS.unknown;

  const size = attributes?.size || 24;
  const strokeWidth = attributes?.strokeWidth || 2;
  const stroke = attributes?.stroke || 'currentColor';
  const fill = attributes?.fill || 'none';

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="${fill}" stroke="${stroke}" stroke-width="${strokeWidth}" stroke-linecap="round" stroke-linejoin="round">${svgPaths}</svg>`;
}

/**
 * Get inner SVG content (without outer svg tags) for embedding
 * @param status - Status type
 * @param attributes - Custom SVG attributes
 */
export function getStatusIconSvgInner(
  status: StatusIconType,
  attributes?: SvgAttributes
): string {
  return STATUS_ICON_SVG_PATHS[status] || STATUS_ICON_SVG_PATHS.unknown;
}

/**
 * Get complete SVG element (including outer <svg> tags) for a status icon
 * @param status - Status type
 * @param attributes - Custom SVG attributes
 */
export function getStatusIconSvgElement(
  status: StatusIconType,
  attributes?: SvgAttributes
): string {
  return getStatusIconSvg(status, attributes);
}
