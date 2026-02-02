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
  [key: string]: string | number | undefined;
}

// Icon nodes from lucide-react (internal structure)
type IconNode = [elementName: string, attrs: Record<string, string | number>][];

// Access the internal icon structure
function getIconNode(Icon: any): IconNode {
  // Lucide icons have an internal __iconNode property
  return Icon.__iconNode || [];
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
 * Convert icon node structure to SVG path string
 */
export function renderIconNodeToSvg(
  nodes: IconNode,
  attributes?: SvgAttributes
): string {
  const defaultAttrs: SvgAttributes = {
    stroke: attributes?.stroke || "currentColor",
    strokeWidth: attributes?.strokeWidth || 2,
    fill: attributes?.fill || "none",
    strokeLinecap: "round",
    strokeLinejoin: "round",
  };

  const mergedAttrs = { ...defaultAttrs, ...attributes };

  return nodes
    .map(([elementName, attrs]) => {
      // Apply custom attributes, but preserve element-specific ones
      const finalAttrs: Record<string, string | number> = { ...attrs };

      // Apply stroke, fill, etc. to path elements
      if (elementName === "path" || elementName === "circle" || elementName === "polyline" || elementName === "line" || elementName === "rect") {
        if (mergedAttrs.stroke !== undefined) finalAttrs.stroke = mergedAttrs.stroke;
        if (mergedAttrs.strokeWidth !== undefined) finalAttrs["stroke-width"] = mergedAttrs.strokeWidth;
        if (mergedAttrs.fill !== undefined && elementName !== "circle") {
          // Preserve fill="none" for circles unless explicitly overridden
          if (attrs.fill !== "none" || mergedAttrs.fill !== "none") {
            finalAttrs.fill = mergedAttrs.fill;
          }
        }
        if (mergedAttrs.strokeLinecap) finalAttrs["stroke-linecap"] = mergedAttrs.strokeLinecap;
        if (mergedAttrs.strokeLinejoin) finalAttrs["stroke-linejoin"] = mergedAttrs.strokeLinejoin;
      }

      const attrString = Object.entries(finalAttrs)
        .map(([key, value]) => `${key}="${value}"`)
        .join(" ");

      return `<${elementName} ${attrString}/>`;
    })
    .join("");
}

/**
 * Get SVG string for a status icon
 * @param status - Status type
 * @param attributes - Custom SVG attributes (stroke, fill, etc.)
 */
export function getStatusIconSvg(
  status: StatusIconType,
  attributes?: SvgAttributes
): string {
  const Icon = STATUS_ICON_MAP[status] || Circle;
  const nodes = getIconNode(Icon);
  return renderIconNodeToSvg(nodes, attributes);
}

// Export icon nodes for direct access if needed
export const STATUS_ICON_NODES: Record<StatusIconType, IconNode> = Object.fromEntries(
  Object.entries(STATUS_ICON_MAP).map(([key, Icon]) => [
    key,
    getIconNode(Icon),
  ])
) as Record<StatusIconType, IconNode>;
