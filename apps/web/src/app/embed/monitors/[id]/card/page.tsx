"use client";

import { useEffect, useState } from "react";
import { CheckCircle, AlertTriangle, XCircle, Pause, Clock } from "lucide-react";
import { cn } from "@uni-status/ui/lib/utils";

// Normalize API URL - remove trailing /api if present to avoid double prefix
const RAW_API_URL = process.env.NEXT_PUBLIC_API_URL || "/api";
const API_URL = RAW_API_URL.replace(/\/api\/?$/, '');

type MonitorStatus = "active" | "degraded" | "down" | "paused" | "pending";

interface MonitorData {
  id: string;
  name: string;
  status: MonitorStatus;
  statusText: string;
  lastUpdatedAt: string;
}

const statusConfig: Record<MonitorStatus, { icon: typeof CheckCircle; color: string; bg: string }> = {
  active: {
    icon: CheckCircle,
    color: "text-green-600",
    bg: "bg-green-50 dark:bg-green-950",
  },
  degraded: {
    icon: AlertTriangle,
    color: "text-yellow-600",
    bg: "bg-yellow-50 dark:bg-yellow-950",
  },
  down: {
    icon: XCircle,
    color: "text-red-600",
    bg: "bg-red-50 dark:bg-red-950",
  },
  paused: {
    icon: Pause,
    color: "text-gray-600",
    bg: "bg-gray-50 dark:bg-gray-950",
  },
  pending: {
    icon: Clock,
    color: "text-gray-400",
    bg: "bg-gray-50 dark:bg-gray-950",
  },
};

interface PageProps {
  params: Promise<{ id: string }>;
  searchParams: Promise<{
    theme?: "light" | "dark" | "auto";
    transparent?: string;
  }>;
}

export default function MonitorEmbedCardPage({ params, searchParams }: PageProps) {
  const [monitorId, setMonitorId] = useState<string>("");
  const [options, setOptions] = useState<{
    theme: "light" | "dark" | "auto";
    transparent: boolean;
  }>({
    theme: "light",
    transparent: false,
  });
  const [data, setData] = useState<MonitorData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([params, searchParams]).then(([p, sp]) => {
      setMonitorId(p.id);
      setOptions({
        theme: sp.theme || "light",
        transparent: sp.transparent === "true",
      });
    });
  }, [params, searchParams]);

  useEffect(() => {
    if (!monitorId) return;

    async function fetchStatus() {
      try {
        const url = `${API_URL}/api/public/embeds/monitors/${monitorId}/status.json`;
        const response = await fetch(url);
        const json = await response.json();

        if (json.success && json.data) {
          setData(json.data);
        } else {
          setError(json.error?.message || "Failed to load status");
        }
      } catch {
        setError("Failed to load status");
      } finally {
        setLoading(false);
      }
    }

    fetchStatus();
    const interval = setInterval(fetchStatus, 60000);
    return () => clearInterval(interval);
  }, [monitorId]);

  // Apply theme
  useEffect(() => {
    if (options.theme === "dark") {
      document.documentElement.classList.add("dark");
    } else if (options.theme === "light") {
      document.documentElement.classList.remove("dark");
    } else {
      if (window.matchMedia("(prefers-color-scheme: dark)").matches) {
        document.documentElement.classList.add("dark");
      }
    }
  }, [options.theme]);

  if (loading) {
    return (
      <div className={cn(
        "p-4 rounded-lg border animate-pulse",
        options.transparent ? "bg-transparent" : "bg-white dark:bg-gray-900"
      )}>
        <div className="h-5 bg-gray-200 dark:bg-gray-700 rounded w-3/4 mb-2" />
        <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-1/2" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className={cn(
        "p-4 rounded-lg border text-gray-500 dark:text-gray-400",
        options.transparent ? "bg-transparent" : "bg-white dark:bg-gray-900"
      )}>
        {error || "Status unavailable"}
      </div>
    );
  }

  const config = statusConfig[data.status];
  const StatusIcon = config.icon;

  return (
    <div className={cn(
      "rounded-lg border overflow-hidden",
      options.transparent ? "bg-transparent border-transparent" : "bg-white dark:bg-gray-900 border-gray-200 dark:border-gray-800"
    )}>
      <div className={cn("px-4 py-3 flex items-center gap-3", config.bg)}>
        <StatusIcon className={cn("h-5 w-5", config.color)} />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">
            {data.name}
          </p>
          <p className={cn("text-xs", config.color)}>
            {data.statusText}
          </p>
        </div>
      </div>
    </div>
  );
}
