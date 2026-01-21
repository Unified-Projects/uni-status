export type MonitorStatus = "active" | "degraded" | "down" | "paused" | "pending";

export interface IndicatorProps {
  status: MonitorStatus;
  size?: "sm" | "default" | "lg";
  pulse?: boolean;
  className?: string;
}

export const statusLabels: Record<MonitorStatus, string> = {
  active: "Operational",
  degraded: "Degraded",
  down: "Down",
  paused: "Paused",
  pending: "Pending",
};

export const statusColors: Record<MonitorStatus, string> = {
  active: "bg-[var(--status-success-text)]",
  degraded: "bg-[var(--status-warning-text)]",
  down: "bg-[var(--status-error-text)]",
  paused: "bg-[var(--status-gray-text)]",
  pending: "bg-[var(--status-gray-text)]/70",
};

export const statusTextColors: Record<MonitorStatus, string> = {
  active: "text-[var(--status-success-text)]",
  degraded: "text-[var(--status-warning-text)]",
  down: "text-[var(--status-error-text)]",
  paused: "text-[var(--status-gray-text)]",
  pending: "text-[var(--status-gray-text)]",
};

export const statusBgColors: Record<MonitorStatus, string> = {
  active: "bg-[var(--status-success-bg)]",
  degraded: "bg-[var(--status-warning-bg)]",
  down: "bg-[var(--status-error-bg)]",
  paused: "bg-[var(--status-gray-bg)]",
  pending: "bg-[var(--status-gray-bg)]",
};

export const statusBorderColors: Record<MonitorStatus, string> = {
  active: "border-[var(--status-success-text)]",
  degraded: "border-[var(--status-warning-text)]",
  down: "border-[var(--status-error-text)]",
  paused: "border-[var(--status-gray-text)]",
  pending: "border-[var(--status-gray-text)]/70",
};
