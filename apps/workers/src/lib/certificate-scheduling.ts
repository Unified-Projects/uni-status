interface MonitorLike {
  type: string;
  config?: Record<string, unknown> | null;
}

function getSslConfig(config: MonitorLike["config"]): { enabled?: boolean } {
  return ((config as { ssl?: { enabled?: boolean } } | null)?.ssl) || {};
}

export function isCertificateMonitoringEnabled(config: MonitorLike["config"]): boolean {
  const sslConfig = getSslConfig(config);
  return sslConfig.enabled !== false;
}

export function shouldQueueCertificateCheck(monitor: MonitorLike): boolean {
  const isCertificateType = monitor.type === "https" || monitor.type === "ssl";
  if (!isCertificateType) return false;
  return isCertificateMonitoringEnabled(monitor.config);
}
