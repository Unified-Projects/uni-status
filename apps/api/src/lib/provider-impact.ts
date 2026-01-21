import type { ExternalMappedStatus } from "@uni-status/shared/types";

export type MonitorStatus = "active" | "degraded" | "down" | "paused" | "pending";

export interface ProviderSnapshot {
  id: string;
  name: string;
  currentStatus?: ExternalMappedStatus | null;
  currentStatusText?: string | null;
  affectsMonitorIds?: string[] | null;
}

export interface ProviderImpact {
  providerId: string;
  providerName: string;
  providerStatus: ExternalMappedStatus;
  providerStatusText?: string | null;
}

const providerStatusToMonitorStatus: Record<ExternalMappedStatus, MonitorStatus | null> = {
  operational: null,
  unknown: null,
  degraded: "degraded",
  partial_outage: "degraded",
  major_outage: "down",
  maintenance: "paused",
};

const monitorStatusSeverity: Record<MonitorStatus, number> = {
  down: 3,
  degraded: 2,
  active: 1,
  pending: 1,
  paused: 0,
};

/**
 * Build a map of monitors to provider impacts for quick lookup.
 */
export function mapProviderImpacts(
  monitorIds: string[],
  providers: ProviderSnapshot[]
): Map<string, ProviderImpact[]> {
  const impactMap = new Map<string, ProviderImpact[]>();

  for (const provider of providers) {
    const mappedStatus = providerStatusToMonitorStatus[provider.currentStatus || "unknown"];
    if (!mappedStatus) continue;

    const affected = provider.affectsMonitorIds || [];
    for (const monitorId of affected) {
      if (!monitorIds.includes(monitorId)) continue;

      const impacts = impactMap.get(monitorId) || [];
      impacts.push({
        providerId: provider.id,
        providerName: provider.name,
        providerStatus: provider.currentStatus || "unknown",
        providerStatusText: provider.currentStatusText || undefined,
      });
      impactMap.set(monitorId, impacts);
    }
  }

  return impactMap;
}

/**
 * Combine base monitor status with provider impacts (worst status wins).
 */
export function deriveStatusWithProviders(
  baseStatus: MonitorStatus,
  impacts?: ProviderImpact[]
): MonitorStatus {
  if (!impacts || impacts.length === 0) return baseStatus;

  let derived = baseStatus;
  for (const impact of impacts) {
    const mappedStatus = providerStatusToMonitorStatus[impact.providerStatus];
    if (mappedStatus && monitorStatusSeverity[mappedStatus] > monitorStatusSeverity[derived]) {
      derived = mappedStatus;
    }
  }
  return derived;
}

/**
 * Attach provider impact metadata to monitors and return status adjusted for provider issues.
 */
export function attachProviderImpacts<T extends { id: string; status: MonitorStatus }>(
  monitors: T[],
  impacts: Map<string, ProviderImpact[]>
): Array<T & { baseStatus: MonitorStatus; providerImpacts?: ProviderImpact[] }> {
  return monitors.map((monitor) => {
    const monitorImpacts = impacts.get(monitor.id) || [];
    const nextStatus = deriveStatusWithProviders(monitor.status, monitorImpacts);

    return {
      ...monitor,
      baseStatus: monitor.status,
      status: nextStatus,
      providerImpacts: monitorImpacts.length > 0 ? monitorImpacts : undefined,
    };
  });
}
