"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { queryKeys } from "@/lib/api-client";
import { useDashboardStore } from "@/stores/dashboard-store";

const RAW_API_URL = process.env.NEXT_PUBLIC_API_URL || "/api";
const API_URL = RAW_API_URL.replace(/\/$/, "");
const BASE_INCLUDES_API = API_URL.endsWith("/api");

export type SSEConnectionStatus = "connecting" | "connected" | "disconnected" | "error";

export interface SSEEvent {
  type: string;
  data: unknown;
  timestamp: string;
}

interface UseSSEOptions {
  enabled?: boolean;
  onEvent?: (event: SSEEvent) => void;
}

export function useSSE(options: UseSSEOptions = {}) {
  const { enabled = true, onEvent } = options;
  const queryClient = useQueryClient();
  const organizationId = useDashboardStore((state) => state.currentOrganizationId);

  const [status, setStatus] = useState<SSEConnectionStatus>("disconnected");
  const [lastEvent, setLastEvent] = useState<SSEEvent | null>(null);
  const eventSourceRef = useRef<EventSource | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const reconnectAttemptsRef = useRef(0);

  const connect = useCallback(() => {
    if (!organizationId || !enabled) return;

    // Clean up existing connection
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
    }

    setStatus("connecting");

    const endpoint = "/api/v1/sse/dashboard";
    const normalizedEndpoint = BASE_INCLUDES_API ? endpoint.replace(/^\/api/, "") : endpoint;
    const url = `${API_URL}${normalizedEndpoint}?organizationId=${organizationId}`;
    const eventSource = new EventSource(url, { withCredentials: true });
    eventSourceRef.current = eventSource;

    eventSource.onopen = () => {
      setStatus("connected");
      reconnectAttemptsRef.current = 0;
    };

    eventSource.onmessage = (event) => {
      try {
        const parsedData = JSON.parse(event.data) as SSEEvent;
        setLastEvent(parsedData);
        onEvent?.(parsedData);
        handleEvent(parsedData, queryClient);
      } catch (error) {
        console.error("Failed to parse SSE event:", error);
      }
    };

    eventSource.onerror = () => {
      setStatus("error");
      eventSource.close();

      // Exponential backoff for reconnection
      const delay = Math.min(1000 * Math.pow(2, reconnectAttemptsRef.current), 30000);
      reconnectAttemptsRef.current += 1;

      reconnectTimeoutRef.current = setTimeout(() => {
        setStatus("disconnected");
        connect();
      }, delay);
    };
  }, [organizationId, enabled, onEvent, queryClient]);

  const disconnect = useCallback(() => {
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
      eventSourceRef.current = null;
    }
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }
    setStatus("disconnected");
  }, []);

  useEffect(() => {
    if (enabled && organizationId) {
      connect();
    } else {
      disconnect();
    }

    return () => {
      disconnect();
    };
  }, [enabled, organizationId, connect, disconnect]);

  return {
    status,
    lastEvent,
    reconnect: connect,
    disconnect,
  };
}

// Handle incoming SSE events and update React Query cache
function handleEvent(event: SSEEvent, queryClient: ReturnType<typeof useQueryClient>) {
  switch (event.type) {
    // Monitor events
    case "monitor:created":
    case "monitor:updated":
    case "monitor:deleted":
    case "monitor:status_changed":
      queryClient.invalidateQueries({ queryKey: queryKeys.monitors.all });
      queryClient.invalidateQueries({ queryKey: queryKeys.analytics.dashboard() });
      break;

    case "monitor:check_completed":
      const checkData = event.data as { monitorId: string };
      queryClient.invalidateQueries({ queryKey: queryKeys.monitors.detail(checkData.monitorId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.monitors.results(checkData.monitorId) });
      break;

    // Incident events
    case "incident:created":
    case "incident:updated":
    case "incident:resolved":
      queryClient.invalidateQueries({ queryKey: queryKeys.incidents.all });
      queryClient.invalidateQueries({ queryKey: queryKeys.analytics.dashboard() });
      break;

    // Alert events
    case "alert:triggered":
    case "alert:acknowledged":
    case "alert:resolved":
      queryClient.invalidateQueries({ queryKey: queryKeys.alerts.history.all });
      break;

    // Alert config events
    case "config:channel_created":
    case "config:channel_updated":
    case "config:channel_deleted":
      queryClient.invalidateQueries({ queryKey: queryKeys.alerts.channels.all });
      break;

    case "config:policy_created":
    case "config:policy_updated":
    case "config:policy_deleted":
      queryClient.invalidateQueries({ queryKey: queryKeys.alerts.policies.all });
      break;

    // Status page events
    case "status_page:updated":
      queryClient.invalidateQueries({ queryKey: queryKeys.statusPages.all });
      break;

    default:
      // Unknown event type, ignore
      break;
  }
}

// Connection status indicator component helper
export function getConnectionStatusColor(status: SSEConnectionStatus): string {
  switch (status) {
    case "connected":
      return "bg-green-500";
    case "connecting":
      return "bg-yellow-500";
    case "disconnected":
      return "bg-gray-500";
    case "error":
      return "bg-red-500";
    default:
      return "bg-gray-500";
  }
}

export function getConnectionStatusText(status: SSEConnectionStatus): string {
  switch (status) {
    case "connected":
      return "Live";
    case "connecting":
      return "Connecting...";
    case "disconnected":
      return "Offline";
    case "error":
      return "Connection error";
    default:
      return "Unknown";
  }
}
