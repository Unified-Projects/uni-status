/**
 * Status icon utility for converting Lucide icons to SVG strings
 * Usable in both React (frontend) and server-side (API) contexts
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
import { renderToStaticMarkup } from 'react-dom/server';
import * as React from 'react';

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

/**
 * Get SVG string for a status icon using React server-side rendering
 * @param status - Status type
 * @param attributes - Custom SVG attributes (stroke, fill, strokeWidth, size, etc.)
 */
export function getStatusIconSvg(
  status: StatusIconType,
  attributes?: SvgAttributes
): string {
  const Icon = STATUS_ICON_MAP[status] || Circle;

  // Render React component to SVG string
  const iconElement = React.createElement(Icon, {
    size: attributes?.size || 24,
    strokeWidth: attributes?.strokeWidth || 2,
    color: attributes?.stroke || 'currentColor',
    fill: attributes?.fill || 'none',
  });

  const svgString = renderToStaticMarkup(iconElement);

  // Extract inner SVG content for embedding (remove outer svg tags if needed for embedding)
  // For most use cases, we want just the inner content
  const match = svgString.match(/<svg[^>]*>(.*)<\/svg>/s);
  return match ? match[1] : svgString;
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
  const Icon = STATUS_ICON_MAP[status] || Circle;

  const iconElement = React.createElement(Icon, {
    size: attributes?.size || 24,
    strokeWidth: attributes?.strokeWidth || 2,
    color: attributes?.stroke || 'currentColor',
    fill: attributes?.fill || 'none',
  });

  return renderToStaticMarkup(iconElement);
}
