"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { MonitorStatus as SharedMonitorStatus, MonitorType as SharedMonitorType } from "@uni-status/shared/types";

export type MonitorStatus = SharedMonitorStatus;
export type MonitorType = SharedMonitorType;
export type IncidentStatus = "investigating" | "identified" | "monitoring" | "resolved";
export type IncidentSeverity = "minor" | "major" | "critical";
export type StatusPagePublishedFilter = "all" | "published" | "draft";
export type AlertHistoryStatusFilter = "all" | "triggered" | "acknowledged" | "resolved";

export interface MonitorFilters {
  status: MonitorStatus[];
  type: MonitorType[];
  search: string;
}

export interface IncidentFilters {
  status: IncidentStatus[];
  severity: IncidentSeverity[];
  search: string;
}

export interface StatusPageFilters {
  published: StatusPagePublishedFilter;
  search: string;
}

export interface AlertHistoryFilters {
  status: AlertHistoryStatusFilter;
  search: string;
}

export type SortField = "name" | "status" | "lastCheckedAt" | "responseTime" | "createdAt";
export type SortDirection = "asc" | "desc";

export interface SortConfig {
  field: SortField;
  direction: SortDirection;
}

interface DashboardState {
  // Organization context
  currentOrganizationId: string | null;
  setCurrentOrganization: (id: string | null) => void;

  // UI state
  sidebarCollapsed: boolean;
  toggleSidebar: () => void;
  setSidebarCollapsed: (collapsed: boolean) => void;

  // Monitor filters and sorting
  monitorFilters: MonitorFilters;
  setMonitorFilters: (filters: Partial<MonitorFilters>) => void;
  resetMonitorFilters: () => void;
  monitorSort: SortConfig;
  setMonitorSort: (sort: SortConfig) => void;

  // Incident filters
  incidentFilters: IncidentFilters;
  setIncidentFilters: (filters: Partial<IncidentFilters>) => void;
  resetIncidentFilters: () => void;

  // Incident sort
  incidentSort: SortConfig;
  setIncidentSort: (sort: SortConfig) => void;

  // Status page filters
  statusPageFilters: StatusPageFilters;
  setStatusPageFilters: (filters: Partial<StatusPageFilters>) => void;
  resetStatusPageFilters: () => void;

  // Alert history filters
  alertHistoryFilters: AlertHistoryFilters;
  setAlertHistoryFilters: (filters: Partial<AlertHistoryFilters>) => void;
  resetAlertHistoryFilters: () => void;

  // View preferences
  monitorView: "grid" | "list";
  setMonitorView: (view: "grid" | "list") => void;
  incidentView: "grid" | "list";
  setIncidentView: (view: "grid" | "list") => void;
  statusPageView: "grid" | "list";
  setStatusPageView: (view: "grid" | "list") => void;
  uptimeDays: number;
  setUptimeDays: (days: number) => void;
  uptimeGranularity: "minute" | "hour" | "day" | "auto";
  setUptimeGranularity: (granularity: "minute" | "hour" | "day" | "auto") => void;
  responseTimeHours: 1 | 6 | 24 | 168 | 720; // 1h, 6h, 24h, 7d, 30d
  setResponseTimeHours: (hours: 1 | 6 | 24 | 168 | 720) => void;
}

const defaultMonitorFilters: MonitorFilters = {
  status: [],
  type: [],
  search: "",
};

const defaultIncidentFilters: IncidentFilters = {
  status: [],
  severity: [],
  search: "",
};

const defaultStatusPageFilters: StatusPageFilters = {
  published: "all",
  search: "",
};

const defaultAlertHistoryFilters: AlertHistoryFilters = {
  status: "all",
  search: "",
};

const defaultMonitorSort: SortConfig = {
  field: "name",
  direction: "asc",
};

const defaultIncidentSort: SortConfig = {
  field: "createdAt",
  direction: "desc",
};

export const useDashboardStore = create<DashboardState>()(
  persist(
    (set) => ({
      // Organization context
      currentOrganizationId: null,
      setCurrentOrganization: (id) => set({ currentOrganizationId: id }),

      // UI state
      sidebarCollapsed: false,
      toggleSidebar: () => set((state) => ({ sidebarCollapsed: !state.sidebarCollapsed })),
      setSidebarCollapsed: (collapsed) => set({ sidebarCollapsed: collapsed }),

      // Monitor filters and sorting
      monitorFilters: defaultMonitorFilters,
      setMonitorFilters: (filters) =>
        set((state) => ({
          monitorFilters: { ...state.monitorFilters, ...filters },
        })),
      resetMonitorFilters: () => set({ monitorFilters: defaultMonitorFilters }),
      monitorSort: defaultMonitorSort,
      setMonitorSort: (sort) => set({ monitorSort: sort }),

      // Incident filters
      incidentFilters: defaultIncidentFilters,
      setIncidentFilters: (filters) =>
        set((state) => ({
          incidentFilters: { ...state.incidentFilters, ...filters },
        })),
      resetIncidentFilters: () => set({ incidentFilters: defaultIncidentFilters }),

      // Incident sort
      incidentSort: defaultIncidentSort,
      setIncidentSort: (sort) => set({ incidentSort: sort }),

      // Status page filters
      statusPageFilters: defaultStatusPageFilters,
      setStatusPageFilters: (filters) =>
        set((state) => ({
          statusPageFilters: { ...state.statusPageFilters, ...filters },
        })),
      resetStatusPageFilters: () => set({ statusPageFilters: defaultStatusPageFilters }),

      // Alert history filters
      alertHistoryFilters: defaultAlertHistoryFilters,
      setAlertHistoryFilters: (filters) =>
        set((state) => ({
          alertHistoryFilters: { ...state.alertHistoryFilters, ...filters },
        })),
      resetAlertHistoryFilters: () => set({ alertHistoryFilters: defaultAlertHistoryFilters }),

      // View preferences
      monitorView: "grid",
      setMonitorView: (view) => set({ monitorView: view }),
      incidentView: "grid",
      setIncidentView: (view) => set({ incidentView: view }),
      statusPageView: "grid",
      setStatusPageView: (view) => set({ statusPageView: view }),
      uptimeDays: 45,
      setUptimeDays: (days) => set({ uptimeDays: days }),
      uptimeGranularity: "auto",
      setUptimeGranularity: (granularity) => set({ uptimeGranularity: granularity }),
      responseTimeHours: 24,
      setResponseTimeHours: (hours) => set({ responseTimeHours: hours }),
    }),
    {
      name: "uni-status-dashboard",
      partialize: (state) => ({
        currentOrganizationId: state.currentOrganizationId,
        sidebarCollapsed: state.sidebarCollapsed,
        monitorView: state.monitorView,
        incidentView: state.incidentView,
        statusPageView: state.statusPageView,
        uptimeDays: state.uptimeDays,
        uptimeGranularity: state.uptimeGranularity,
        responseTimeHours: state.responseTimeHours,
      }),
    }
  )
);

// Selector hooks for common use cases
export const useCurrentOrganizationId = () =>
  useDashboardStore((state) => state.currentOrganizationId);

export const useMonitorFilters = () =>
  useDashboardStore((state) => state.monitorFilters);

export const useIncidentFilters = () =>
  useDashboardStore((state) => state.incidentFilters);

export const useStatusPageFilters = () =>
  useDashboardStore((state) => state.statusPageFilters);

export const useAlertHistoryFilters = () =>
  useDashboardStore((state) => state.alertHistoryFilters);

// Helper function to filter monitors
export function filterMonitors<T extends { status: MonitorStatus; type: MonitorType; name: string; url: string }>(
  monitors: T[],
  filters: MonitorFilters
): T[] {
  return monitors.filter((monitor) => {
    // Status filter
    if (filters.status.length > 0 && !filters.status.includes(monitor.status)) {
      return false;
    }

    // Type filter
    if (filters.type.length > 0 && !filters.type.includes(monitor.type)) {
      return false;
    }

    // Search filter
    if (filters.search) {
      const searchLower = filters.search.toLowerCase();
      const matchesName = monitor.name.toLowerCase().includes(searchLower);
      const matchesUrl = monitor.url.toLowerCase().includes(searchLower);
      if (!matchesName && !matchesUrl) {
        return false;
      }
    }

    return true;
  });
}

// Helper function to sort monitors
export function sortMonitors<T extends { name: string; status: string; lastCheckedAt: string | null; createdAt: string }>(
  monitors: T[],
  sort: SortConfig
): T[] {
  return [...monitors].sort((a, b) => {
    let comparison = 0;

    switch (sort.field) {
      case "name":
        comparison = a.name.localeCompare(b.name);
        break;
      case "status":
        comparison = a.status.localeCompare(b.status);
        break;
      case "lastCheckedAt":
        const aDate = a.lastCheckedAt ? new Date(a.lastCheckedAt).getTime() : 0;
        const bDate = b.lastCheckedAt ? new Date(b.lastCheckedAt).getTime() : 0;
        comparison = aDate - bDate;
        break;
      case "createdAt":
        comparison = new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
        break;
      default:
        comparison = 0;
    }

    return sort.direction === "asc" ? comparison : -comparison;
  });
}

// Helper function to filter incidents
export function filterIncidents<T extends { status: IncidentStatus; severity: IncidentSeverity; title: string }>(
  incidents: T[],
  filters: IncidentFilters
): T[] {
  return incidents.filter((incident) => {
    // Status filter
    if (filters.status.length > 0 && !filters.status.includes(incident.status)) {
      return false;
    }

    // Severity filter
    if (filters.severity.length > 0 && !filters.severity.includes(incident.severity)) {
      return false;
    }

    // Search filter
    if (filters.search) {
      const searchLower = filters.search.toLowerCase();
      if (!incident.title.toLowerCase().includes(searchLower)) {
        return false;
      }
    }

    return true;
  });
}

// Helper function to sort incidents
export function sortIncidents<T extends { title: string; status: string; severity: string; startedAt: string; createdAt: string }>(
  incidents: T[],
  sort: SortConfig
): T[] {
  return [...incidents].sort((a, b) => {
    let comparison = 0;

    switch (sort.field) {
      case "name":
        comparison = a.title.localeCompare(b.title);
        break;
      case "status":
        comparison = a.status.localeCompare(b.status);
        break;
      case "createdAt":
        comparison = new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
        break;
      default:
        comparison = new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
    }

    return sort.direction === "asc" ? comparison : -comparison;
  });
}

// Helper function to filter status pages
export function filterStatusPages<T extends { name: string; slug: string; published: boolean }>(
  statusPages: T[],
  filters: StatusPageFilters
): T[] {
  return statusPages.filter((page) => {
    // Published filter
    if (filters.published !== "all") {
      const isPublished = page.published;
      if (filters.published === "published" && !isPublished) return false;
      if (filters.published === "draft" && isPublished) return false;
    }

    // Search filter
    if (filters.search) {
      const searchLower = filters.search.toLowerCase();
      const matchesName = page.name.toLowerCase().includes(searchLower);
      const matchesSlug = page.slug.toLowerCase().includes(searchLower);
      if (!matchesName && !matchesSlug) {
        return false;
      }
    }

    return true;
  });
}
