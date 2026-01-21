import type { LayoutType } from "@uni-status/shared";

// Check if a layout type needs full-page control
// This is a pure function that can be used on both server and client
export function isFullPageLayout(layout: LayoutType): boolean {
  return layout === "sidebar" || layout === "cards" || layout === "single-page";
}
