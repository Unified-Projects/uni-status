/**
 * Enterprise feature flags and detection
 */

import { ENTERPRISE_FEATURES, type EnterpriseFeature } from "../index";

/**
 * Check if a specific enterprise feature is enabled
 */
export function isFeatureEnabled(feature: EnterpriseFeature): boolean {
  // All enterprise features are enabled when the package is installed
  return Object.values(ENTERPRISE_FEATURES).includes(feature);
}

/**
 * Get all enabled enterprise features
 */
export function getEnabledFeatures(): EnterpriseFeature[] {
  return Object.values(ENTERPRISE_FEATURES);
}

/**
 * Check if enterprise package is available
 * This is always true when this module is loaded
 */
export function isEnterpriseInstalled(): boolean {
  return true;
}
