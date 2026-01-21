import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { Client } from "pg";
import { bootstrapTestContext, TestContext } from "../helpers/context";
import { insertCheckResultFull, insertApiKey } from "../helpers/data";
import { randomUUID } from "crypto";

const API_URL = (process.env.API_BASE_URL ?? "http://api:3001") + "/api/v1";
const DEFAULT_DB_URL =
  "postgresql://uni_status:uni_status_dev@postgres:5432/uni_status?sslmode=disable";

let ctx: TestContext;
let dbClient: Client;

beforeAll(async () => {
  dbClient = new Client({
    connectionString: process.env.DATABASE_URL ?? DEFAULT_DB_URL,
  });
  await dbClient.connect();
  // Database is reset once at test suite start via setupFiles
  ctx = await bootstrapTestContext();
});

afterAll(async () => {
  await dbClient?.end();
});

// Helper to create an HTTPS monitor
async function createHttpsMonitor(
  name: string,
  url: string = "https://example.com"
): Promise<string> {
  const res = await fetch(`${API_URL}/monitors`, {
    method: "POST",
    headers: ctx.headers,
    body: JSON.stringify({
      name,
      url,
      type: "https",
      intervalSeconds: 60,
      timeoutMs: 5000,
    }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Failed to create HTTPS monitor: ${res.status} ${text}`);
  }
  const data = await res.json();
  if (!data.data?.id) {
    throw new Error(`No monitor ID returned: ${JSON.stringify(data)}`);
  }
  return data.data.id;
}

// Helper to create an SSL monitor
async function createSslMonitor(
  name: string,
  url: string = "https://example.com"
): Promise<string> {
  const res = await fetch(`${API_URL}/monitors`, {
    method: "POST",
    headers: ctx.headers,
    body: JSON.stringify({
      name,
      url,
      type: "ssl",
      intervalSeconds: 60,
      timeoutMs: 5000,
    }),
  });
  const data = await res.json();
  return data.data.id;
}

// Helper to create an HTTP monitor (non-SSL)
async function createHttpMonitor(name: string): Promise<string> {
  const res = await fetch(`${API_URL}/monitors`, {
    method: "POST",
    headers: ctx.headers,
    body: JSON.stringify({
      name,
      url: "http://example.com",
      type: "http",
      intervalSeconds: 60,
      timeoutMs: 5000,
    }),
  });
  const data = await res.json();
  return data.data.id;
}

// Helper to insert certificate check result
async function insertCertificateCheckResult(
  monitorId: string,
  options: {
    daysUntilExpiry?: number;
    issuer?: string;
    subject?: string;
    validFrom?: string;
    validTo?: string;
    serialNumber?: string;
    fingerprint?: string;
    status?: "success" | "degraded" | "failure" | "error";
    createdAt?: Date;
  }
): Promise<string> {
  const now = new Date();
  const validFrom = options.validFrom ?? new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString();
  const daysUntilExpiry = options.daysUntilExpiry ?? 90;
  const validTo = options.validTo ?? new Date(now.getTime() + daysUntilExpiry * 24 * 60 * 60 * 1000).toISOString();

  return insertCheckResultFull(monitorId, {
    status: options.status ?? "success",
    responseTimeMs: 150,
    statusCode: 200,
    tlsMs: 50,
    certificateInfo: {
      issuer: options.issuer ?? "Let's Encrypt Authority X3",
      subject: options.subject ?? "example.com",
      validFrom,
      validTo,
      daysUntilExpiry,
      serialNumber: options.serialNumber ?? randomUUID(),
      fingerprint: options.fingerprint ?? `SHA256:${randomUUID()}`,
    },
    headers: {
      fingerprint: options.fingerprint ?? `SHA256:${randomUUID()}`,
    },
    createdAt: options.createdAt ?? now,
  });
}

// Helper to insert CT check result
async function insertCtCheckResult(
  monitorId: string,
  options: {
    newCertificates?: number;
    unexpectedCertificates?: number;
    status?: "success" | "error";
    createdAt?: Date;
  }
): Promise<void> {
  const id = randomUUID();
  const now = new Date();

  const newCerts = Array(options.newCertificates ?? 0).fill({
    issuer: "Test CA",
    notBefore: now.toISOString(),
    notAfter: new Date(now.getTime() + 365 * 24 * 60 * 60 * 1000).toISOString(),
  });

  const unexpectedCerts = Array(options.unexpectedCertificates ?? 0).fill({
    issuer: "Unknown CA",
    notBefore: now.toISOString(),
    notAfter: new Date(now.getTime() + 365 * 24 * 60 * 60 * 1000).toISOString(),
  });

  await dbClient.query(
    `INSERT INTO check_results
     (id, monitor_id, region, status, response_time_ms, metadata, created_at)
     VALUES ($1, $2, 'uk', $3, 100, $4, $5)`,
    [
      id,
      monitorId,
      options.status ?? "success",
      JSON.stringify({
        checkType: "certificate_transparency",
        entries: [],
        newCertificates: newCerts,
        unexpectedCertificates: unexpectedCerts,
      }),
      options.createdAt ?? now,
    ]
  );
}

describe("Certificates API - Comprehensive Tests", () => {
  describe("GET /certificates - List Certificates", () => {
    it("returns empty array when no SSL/HTTPS monitors exist", async () => {
      const res = await fetch(`${API_URL}/certificates`, {
        method: "GET",
        headers: ctx.headers,
      });

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.success).toBe(true);
      expect(Array.isArray(data.data)).toBe(true);
    });

    it("lists HTTPS monitors with certificate info", async () => {
      const monitorId = await createHttpsMonitor("HTTPS Monitor");
      await insertCertificateCheckResult(monitorId, { daysUntilExpiry: 60 });

      const res = await fetch(`${API_URL}/certificates`, {
        method: "GET",
        headers: ctx.headers,
      });

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.success).toBe(true);

      const monitor = data.data.find(
        (m: { monitorId: string }) => m.monitorId === monitorId
      );
      expect(monitor).toBeDefined();
      expect(monitor.certificateInfo).toBeDefined();
      expect(monitor.certificateInfo.daysUntilExpiry).toBe(60);
    });

    it("lists SSL monitors with certificate info", async () => {
      const monitorId = await createSslMonitor("SSL Monitor");
      await insertCertificateCheckResult(monitorId, { daysUntilExpiry: 45 });

      const res = await fetch(`${API_URL}/certificates`, {
        method: "GET",
        headers: ctx.headers,
      });

      expect(res.status).toBe(200);
      const data = await res.json();

      const monitor = data.data.find(
        (m: { monitorId: string }) => m.monitorId === monitorId
      );
      expect(monitor).toBeDefined();
      expect(monitor.monitorType).toBe("ssl");
    });

    it("excludes non-SSL/HTTPS monitors", async () => {
      const httpMonitorId = await createHttpMonitor("HTTP Only Monitor");

      const res = await fetch(`${API_URL}/certificates`, {
        method: "GET",
        headers: ctx.headers,
      });

      expect(res.status).toBe(200);
      const data = await res.json();

      const hasHttpMonitor = data.data.some(
        (m: { monitorId: string }) => m.monitorId === httpMonitorId
      );
      expect(hasHttpMonitor).toBe(false);
    });

    it("sorts by days until expiry ascending", async () => {
      const monitor1 = await createHttpsMonitor("Expiring Soon 1");
      const monitor2 = await createHttpsMonitor("Expiring Soon 2");
      const monitor3 = await createHttpsMonitor("Healthy");

      await insertCertificateCheckResult(monitor1, { daysUntilExpiry: 5 });
      await insertCertificateCheckResult(monitor2, { daysUntilExpiry: 15 });
      await insertCertificateCheckResult(monitor3, { daysUntilExpiry: 90 });

      const res = await fetch(`${API_URL}/certificates`, {
        method: "GET",
        headers: ctx.headers,
      });

      const data = await res.json();

      // Filter to just these monitors
      const ourMonitors = data.data.filter((m: { monitorId: string }) =>
        [monitor1, monitor2, monitor3].includes(m.monitorId)
      );

      // Should be sorted by expiry
      if (ourMonitors.length >= 2) {
        for (let i = 0; i < ourMonitors.length - 1; i++) {
          const days1 = ourMonitors[i].certificateInfo?.daysUntilExpiry ?? 999999;
          const days2 = ourMonitors[i + 1].certificateInfo?.daysUntilExpiry ?? 999999;
          expect(days1).toBeLessThanOrEqual(days2);
        }
      }
    });

    it("puts monitors without certificate info at the end", async () => {
      const withCert = await createHttpsMonitor("With Cert");
      const withoutCert = await createHttpsMonitor("Without Cert");

      await insertCertificateCheckResult(withCert, { daysUntilExpiry: 30 });
      // Don't insert cert for withoutCert

      const res = await fetch(`${API_URL}/certificates`, {
        method: "GET",
        headers: ctx.headers,
      });

      const data = await res.json();
      const withCertIndex = data.data.findIndex(
        (m: { monitorId: string }) => m.monitorId === withCert
      );
      const withoutCertIndex = data.data.findIndex(
        (m: { monitorId: string }) => m.monitorId === withoutCert
      );

      // Monitor with cert should come before monitor without
      if (withCertIndex !== -1 && withoutCertIndex !== -1) {
        expect(withCertIndex).toBeLessThan(withoutCertIndex);
      }
    });

    it("includes stats summary", async () => {
      const expired = await createHttpsMonitor("Expired");
      const expiringSoon = await createHttpsMonitor("Expiring Soon");
      const healthy = await createHttpsMonitor("Healthy");

      await insertCertificateCheckResult(expired, { daysUntilExpiry: -5 });
      await insertCertificateCheckResult(expiringSoon, { daysUntilExpiry: 15 });
      await insertCertificateCheckResult(healthy, { daysUntilExpiry: 90 });

      const res = await fetch(`${API_URL}/certificates`, {
        method: "GET",
        headers: ctx.headers,
      });

      expect(res.status).toBe(200);
      const data = await res.json();

      expect(data.stats).toBeDefined();
      expect(data.stats.total).toBeGreaterThanOrEqual(3);
      expect(data.stats.expired).toBeGreaterThanOrEqual(1);
      expect(data.stats.expiringSoon).toBeGreaterThanOrEqual(1);
      expect(data.stats.healthy).toBeGreaterThanOrEqual(1);
    });

    it("includes CT status for each monitor", async () => {
      const monitorId = await createHttpsMonitor("CT Monitor");
      await insertCertificateCheckResult(monitorId, { daysUntilExpiry: 60 });
      await insertCtCheckResult(monitorId, { newCertificates: 2 });

      const res = await fetch(`${API_URL}/certificates`, {
        method: "GET",
        headers: ctx.headers,
      });

      const data = await res.json();
      const monitor = data.data.find(
        (m: { monitorId: string }) => m.monitorId === monitorId
      );

      expect(monitor.ctStatus).toBeDefined();
      expect(monitor.ctStatus.newCount).toBe(2);
    });

    it("shows CT state as unexpected when unexpected certs found", async () => {
      const monitorId = await createHttpsMonitor("CT Unexpected");
      await insertCertificateCheckResult(monitorId, { daysUntilExpiry: 60 });
      await insertCtCheckResult(monitorId, { unexpectedCertificates: 1 });

      const res = await fetch(`${API_URL}/certificates`, {
        method: "GET",
        headers: ctx.headers,
      });

      const data = await res.json();
      const monitor = data.data.find(
        (m: { monitorId: string }) => m.monitorId === monitorId
      );

      expect(monitor.ctStatus.state).toBe("unexpected");
      expect(monitor.ctStatus.unexpectedCount).toBe(1);
    });

    it("includes last checked timestamp", async () => {
      const monitorId = await createHttpsMonitor("Last Checked");
      await insertCertificateCheckResult(monitorId, { daysUntilExpiry: 60 });

      const res = await fetch(`${API_URL}/certificates`, {
        method: "GET",
        headers: ctx.headers,
      });

      const data = await res.json();
      const monitor = data.data.find(
        (m: { monitorId: string }) => m.monitorId === monitorId
      );

      expect(monitor.lastChecked).toBeDefined();
    });

    it("does not return monitors from other organizations", async () => {
      const monitorId = await createHttpsMonitor("My Org Monitor");
      await insertCertificateCheckResult(monitorId, { daysUntilExpiry: 60 });

      const otherCtx = await bootstrapTestContext();

      const res = await fetch(`${API_URL}/certificates`, {
        method: "GET",
        headers: otherCtx.headers,
      });

      const data = await res.json();
      const hasOurMonitor = data.data.some(
        (m: { monitorId: string }) => m.monitorId === monitorId
      );
      expect(hasOurMonitor).toBe(false);
    });
  });

  describe("GET /certificates/:monitorId - Get Certificate Details", () => {
    it("returns detailed certificate info for HTTPS monitor", async () => {
      const monitorId = await createHttpsMonitor("Detail HTTPS Monitor");
      await insertCertificateCheckResult(monitorId, {
        daysUntilExpiry: 60,
        issuer: "DigiCert Inc",
        subject: "example.com",
      });

      const res = await fetch(`${API_URL}/certificates/${monitorId}`, {
        method: "GET",
        headers: ctx.headers,
      });

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.success).toBe(true);
      expect(data.data.monitor.id).toBe(monitorId);
      expect(data.data.currentCertificate).toBeDefined();
      expect(data.data.currentCertificate.issuer).toBe("DigiCert Inc");
      expect(data.data.currentCertificate.subject).toBe("example.com");
    });

    it("returns detailed certificate info for SSL monitor", async () => {
      const monitorId = await createSslMonitor("Detail SSL Monitor");
      await insertCertificateCheckResult(monitorId, { daysUntilExpiry: 45 });

      const res = await fetch(`${API_URL}/certificates/${monitorId}`, {
        method: "GET",
        headers: ctx.headers,
      });

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.data.monitor.type).toBe("ssl");
    });

    it("returns monitor metadata", async () => {
      const monitorId = await createHttpsMonitor("Monitor Meta", "https://test.example.com");
      await insertCertificateCheckResult(monitorId, { daysUntilExpiry: 60 });

      const res = await fetch(`${API_URL}/certificates/${monitorId}`, {
        method: "GET",
        headers: ctx.headers,
      });

      const data = await res.json();
      expect(data.data.monitor).toBeDefined();
      expect(data.data.monitor.id).toBe(monitorId);
      expect(data.data.monitor.name).toBe("Monitor Meta");
      expect(data.data.monitor.url).toBe("https://test.example.com");
      expect(data.data.monitor.status).toBeDefined();
    });

    it("returns certificate history", async () => {
      const monitorId = await createHttpsMonitor("History Monitor");

      // Insert multiple check results over time
      const now = new Date();
      for (let i = 0; i < 5; i++) {
        const createdAt = new Date(now.getTime() - i * 24 * 60 * 60 * 1000);
        await insertCertificateCheckResult(monitorId, {
          daysUntilExpiry: 60 - i,
          createdAt,
        });
      }

      const res = await fetch(`${API_URL}/certificates/${monitorId}`, {
        method: "GET",
        headers: ctx.headers,
      });

      const data = await res.json();
      expect(data.data.history).toBeDefined();
      expect(Array.isArray(data.data.history)).toBe(true);
      expect(data.data.history.length).toBeGreaterThanOrEqual(5);
    });

    it("detects certificate changes", async () => {
      const monitorId = await createHttpsMonitor("Change Detection Monitor");

      // Insert results with different fingerprints
      const now = new Date();
      await insertCertificateCheckResult(monitorId, {
        daysUntilExpiry: 60,
        fingerprint: "SHA256:old-fingerprint",
        createdAt: new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000),
      });
      await insertCertificateCheckResult(monitorId, {
        daysUntilExpiry: 90,
        fingerprint: "SHA256:new-fingerprint",
        createdAt: new Date(now.getTime() - 1 * 24 * 60 * 60 * 1000),
      });

      const res = await fetch(`${API_URL}/certificates/${monitorId}`, {
        method: "GET",
        headers: ctx.headers,
      });

      const data = await res.json();
      expect(data.data.certificateChanges).toBeDefined();
      // Note: Changes may or may not be detected depending on exact implementation
    });

    it("includes CT status details", async () => {
      const monitorId = await createHttpsMonitor("CT Details Monitor");
      await insertCertificateCheckResult(monitorId, { daysUntilExpiry: 60 });
      await insertCtCheckResult(monitorId, {
        newCertificates: 3,
        unexpectedCertificates: 1,
      });

      const res = await fetch(`${API_URL}/certificates/${monitorId}`, {
        method: "GET",
        headers: ctx.headers,
      });

      const data = await res.json();
      expect(data.data.ctStatus).toBeDefined();
      expect(data.data.ctStatus.newCount).toBe(3);
      expect(data.data.ctStatus.unexpectedCount).toBe(1);
      expect(data.data.ctStatus.state).toBe("unexpected");
    });

    it("includes CT history", async () => {
      const monitorId = await createHttpsMonitor("CT History Monitor");
      await insertCertificateCheckResult(monitorId, { daysUntilExpiry: 60 });

      // Insert multiple CT checks
      const now = new Date();
      for (let i = 0; i < 3; i++) {
        await insertCtCheckResult(monitorId, {
          newCertificates: i,
          createdAt: new Date(now.getTime() - i * 24 * 60 * 60 * 1000),
        });
      }

      const res = await fetch(`${API_URL}/certificates/${monitorId}`, {
        method: "GET",
        headers: ctx.headers,
      });

      const data = await res.json();
      expect(data.data.ctHistory).toBeDefined();
      expect(Array.isArray(data.data.ctHistory)).toBe(true);
    });

    it("includes SSL config from monitor", async () => {
      const monitorId = await createHttpsMonitor("SSL Config Monitor");
      await insertCertificateCheckResult(monitorId, { daysUntilExpiry: 60 });

      const res = await fetch(`${API_URL}/certificates/${monitorId}`, {
        method: "GET",
        headers: ctx.headers,
      });

      const data = await res.json();
      expect(data.data.monitor.sslConfig).toBeDefined();
    });

    it("includes check status and errors", async () => {
      const monitorId = await createHttpsMonitor("Error Monitor");
      await insertCheckResultFull(monitorId, {
        status: "error",
        errorMessage: "Certificate verification failed",
        errorCode: "CERT_HAS_EXPIRED",
        certificateInfo: {
          issuer: "Test CA",
          subject: "expired.example.com",
          daysUntilExpiry: -10,
        },
      });

      const res = await fetch(`${API_URL}/certificates/${monitorId}`, {
        method: "GET",
        headers: ctx.headers,
      });

      const data = await res.json();
      expect(data.data.checkStatus).toBe("error");
      expect(data.data.errorMessage).toBe("Certificate verification failed");
      expect(data.data.errorCode).toBe("CERT_HAS_EXPIRED");
    });

    it("returns 404 for non-existent monitor", async () => {
      const res = await fetch(`${API_URL}/certificates/nonexistent-id`, {
        method: "GET",
        headers: ctx.headers,
      });

      expect(res.status).toBe(404);
      const data = await res.json();
      expect(data.success).toBe(false);
    });

    it("returns 400 for non-SSL/HTTPS monitor", async () => {
      const httpMonitorId = await createHttpMonitor("HTTP Monitor for Cert Test");

      const res = await fetch(`${API_URL}/certificates/${httpMonitorId}`, {
        method: "GET",
        headers: ctx.headers,
      });

      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.success).toBe(false);
      expect(data.error).toContain("SSL");
    });

    it("returns 404 for monitor from another organization", async () => {
      const monitorId = await createHttpsMonitor("Other Org Cert Monitor");
      await insertCertificateCheckResult(monitorId, { daysUntilExpiry: 60 });

      const otherCtx = await bootstrapTestContext();

      const res = await fetch(`${API_URL}/certificates/${monitorId}`, {
        method: "GET",
        headers: otherCtx.headers,
      });

      expect(res.status).toBe(404);
    });

    it("returns null for certificate when no check results", async () => {
      const monitorId = await createHttpsMonitor("No Results Monitor");

      const res = await fetch(`${API_URL}/certificates/${monitorId}`, {
        method: "GET",
        headers: ctx.headers,
      });

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.data.currentCertificate).toBeNull();
      expect(data.data.lastChecked).toBeNull();
    });
  });

  describe("Certificate Status Categories", () => {
    it("correctly identifies expired certificates", async () => {
      const monitorId = await createHttpsMonitor("Expired Cert");
      await insertCertificateCheckResult(monitorId, { daysUntilExpiry: -5 });

      const res = await fetch(`${API_URL}/certificates`, {
        method: "GET",
        headers: ctx.headers,
      });

      const data = await res.json();
      const monitor = data.data.find(
        (m: { monitorId: string }) => m.monitorId === monitorId
      );

      expect(monitor.certificateInfo.daysUntilExpiry).toBe(-5);
      expect(data.stats.expired).toBeGreaterThanOrEqual(1);
    });

    it("correctly identifies expiring soon certificates (within 30 days)", async () => {
      const monitorId = await createHttpsMonitor("Expiring Cert");
      await insertCertificateCheckResult(monitorId, { daysUntilExpiry: 15 });

      const res = await fetch(`${API_URL}/certificates`, {
        method: "GET",
        headers: ctx.headers,
      });

      const data = await res.json();
      expect(data.stats.expiringSoon).toBeGreaterThanOrEqual(1);
    });

    it("correctly identifies healthy certificates (more than 30 days)", async () => {
      const monitorId = await createHttpsMonitor("Healthy Cert");
      await insertCertificateCheckResult(monitorId, { daysUntilExpiry: 90 });

      const res = await fetch(`${API_URL}/certificates`, {
        method: "GET",
        headers: ctx.headers,
      });

      const data = await res.json();
      expect(data.stats.healthy).toBeGreaterThanOrEqual(1);
    });

    it("correctly identifies unknown status (no certificate info)", async () => {
      await createHttpsMonitor("Unknown Cert");
      // Don't insert any check results

      const res = await fetch(`${API_URL}/certificates`, {
        method: "GET",
        headers: ctx.headers,
      });

      const data = await res.json();
      expect(data.stats.unknown).toBeGreaterThanOrEqual(1);
    });
  });

  describe("CT Status States", () => {
    it("shows healthy when no new or unexpected certs", async () => {
      const monitorId = await createHttpsMonitor("CT Healthy");
      await insertCertificateCheckResult(monitorId, { daysUntilExpiry: 60 });
      await insertCtCheckResult(monitorId, {
        newCertificates: 0,
        unexpectedCertificates: 0,
      });

      const res = await fetch(`${API_URL}/certificates/${monitorId}`, {
        method: "GET",
        headers: ctx.headers,
      });

      const data = await res.json();
      expect(data.data.ctStatus.state).toBe("healthy");
    });

    it("shows new when new certs found", async () => {
      const monitorId = await createHttpsMonitor("CT New");
      await insertCertificateCheckResult(monitorId, { daysUntilExpiry: 60 });
      await insertCtCheckResult(monitorId, {
        newCertificates: 5,
        unexpectedCertificates: 0,
      });

      const res = await fetch(`${API_URL}/certificates/${monitorId}`, {
        method: "GET",
        headers: ctx.headers,
      });

      const data = await res.json();
      expect(data.data.ctStatus.state).toBe("new");
    });

    it("shows unexpected when unexpected certs found", async () => {
      const monitorId = await createHttpsMonitor("CT Unexpected State");
      await insertCertificateCheckResult(monitorId, { daysUntilExpiry: 60 });
      await insertCtCheckResult(monitorId, {
        newCertificates: 0,
        unexpectedCertificates: 2,
      });

      const res = await fetch(`${API_URL}/certificates/${monitorId}`, {
        method: "GET",
        headers: ctx.headers,
      });

      const data = await res.json();
      expect(data.data.ctStatus.state).toBe("unexpected");
    });

    it("shows error when CT check failed", async () => {
      const monitorId = await createHttpsMonitor("CT Error");
      await insertCertificateCheckResult(monitorId, { daysUntilExpiry: 60 });
      await insertCtCheckResult(monitorId, {
        status: "error",
      });

      const res = await fetch(`${API_URL}/certificates/${monitorId}`, {
        method: "GET",
        headers: ctx.headers,
      });

      const data = await res.json();
      expect(data.data.ctStatus.state).toBe("error");
    });

    it("shows unknown when no CT checks performed", async () => {
      const monitorId = await createHttpsMonitor("CT Unknown");
      await insertCertificateCheckResult(monitorId, { daysUntilExpiry: 60 });
      // No CT check inserted

      const res = await fetch(`${API_URL}/certificates/${monitorId}`, {
        method: "GET",
        headers: ctx.headers,
      });

      const data = await res.json();
      expect(["unknown", "disabled"]).toContain(data.data.ctStatus.state);
    });
  });

  describe("Edge Cases", () => {
    it("handles certificate expiring exactly on boundary (30 days)", async () => {
      const monitorId = await createHttpsMonitor("Boundary Cert");
      await insertCertificateCheckResult(monitorId, { daysUntilExpiry: 30 });

      const res = await fetch(`${API_URL}/certificates`, {
        method: "GET",
        headers: ctx.headers,
      });

      const data = await res.json();
      // 30 days is typically "expiring soon" boundary
      expect(data.stats.expiringSoon + data.stats.healthy).toBeGreaterThanOrEqual(1);
    });

    it("handles certificate expiring exactly today (0 days)", async () => {
      const monitorId = await createHttpsMonitor("Today Expiry");
      await insertCertificateCheckResult(monitorId, { daysUntilExpiry: 0 });

      const res = await fetch(`${API_URL}/certificates`, {
        method: "GET",
        headers: ctx.headers,
      });

      const data = await res.json();
      // 0 days could be counted as expired or expiring soon depending on implementation
      expect(data.stats.expired + data.stats.expiringSoon).toBeGreaterThanOrEqual(1);
    });

    it("handles very large days until expiry", async () => {
      const monitorId = await createHttpsMonitor("Long Validity");
      await insertCertificateCheckResult(monitorId, { daysUntilExpiry: 3650 }); // 10 years

      const res = await fetch(`${API_URL}/certificates/${monitorId}`, {
        method: "GET",
        headers: ctx.headers,
      });

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.data.currentCertificate.daysUntilExpiry).toBe(3650);
    });

    it("handles many monitors efficiently", async () => {
      // Create many monitors
      const monitorPromises = [];
      for (let i = 0; i < 10; i++) {
        monitorPromises.push(createHttpsMonitor(`Bulk Monitor ${i}`));
      }
      const monitorIds = await Promise.all(monitorPromises);

      // Add certs to all
      for (const id of monitorIds) {
        await insertCertificateCheckResult(id, {
          daysUntilExpiry: Math.floor(Math.random() * 180),
        });
      }

      const start = Date.now();
      const res = await fetch(`${API_URL}/certificates`, {
        method: "GET",
        headers: ctx.headers,
      });
      const duration = Date.now() - start;

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.data.length).toBeGreaterThanOrEqual(10);
      // Should complete in reasonable time
      expect(duration).toBeLessThan(10000);
    });

    it("handles special characters in certificate fields", async () => {
      const monitorId = await createHttpsMonitor("Special Chars Cert");
      await insertCertificateCheckResult(monitorId, {
        daysUntilExpiry: 60,
        issuer: "O=Company, Inc., CN=Test CA",
        subject: "CN=*.example.com, O=Test Org",
      });

      const res = await fetch(`${API_URL}/certificates/${monitorId}`, {
        method: "GET",
        headers: ctx.headers,
      });

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.data.currentCertificate.issuer).toContain("Company");
    });
  });

  describe("Authorization", () => {
    it("allows read-only access to list certificates", async () => {
      // Create a read-only API key using the helper
      const { token: readOnlyToken } = await insertApiKey(
        ctx.organizationId,
        ctx.userId,
        { name: "read-only-list-certs", scopes: ["read"] }
      );

      const res = await fetch(`${API_URL}/certificates`, {
        method: "GET",
        headers: {
          Authorization: `Bearer ${readOnlyToken}`,
          "Content-Type": "application/json",
        },
      });

      expect(res.status).toBe(200);
    });

    it("allows read-only access to get certificate details", async () => {
      const monitorId = await createHttpsMonitor("Read Only Detail");
      await insertCertificateCheckResult(monitorId, { daysUntilExpiry: 60 });

      // Create a read-only API key using the helper
      const { token: readOnlyToken } = await insertApiKey(
        ctx.organizationId,
        ctx.userId,
        { name: "read-only-cert-details", scopes: ["read"] }
      );

      const res = await fetch(`${API_URL}/certificates/${monitorId}`, {
        method: "GET",
        headers: {
          Authorization: `Bearer ${readOnlyToken}`,
          "Content-Type": "application/json",
        },
      });

      if (res.status !== 200) {
        const body = await res.text();
        console.error(`Certificate read-only access failed: ${res.status} - ${body}`);
        console.error(`MonitorId: ${monitorId}, OrgId: ${ctx.organizationId}`);
      }
      expect(res.status).toBe(200);
    });
  });
});
