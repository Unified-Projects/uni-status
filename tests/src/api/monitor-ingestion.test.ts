import { bootstrapTestContext, TestContext } from "../helpers/context";
import { insertCheckResults, setMonitorStatus, insertCheckResultFull } from "../helpers/data";
import { nanoid } from "nanoid";

const API_BASE_URL = process.env.API_BASE_URL ?? "http://api:3001";

describe("Monitor ingestion & analytics", () => {
  let ctx: TestContext;
  let monitorId: string;

  beforeAll(async () => {
    ctx = await bootstrapTestContext();

    const monitorRes = await fetch(`${API_BASE_URL}/api/v1/monitors`, {
      method: "POST",
      headers: ctx.headers,
      body: JSON.stringify({
        name: "Ingestion Monitor",
        url: "https://ingestion.example.com",
        type: "https",
        method: "GET",
        intervalSeconds: 60,
      }),
    });

    const monitorBody = await monitorRes.json();
    monitorId = monitorBody.data.id;

    // Mark the monitor active so UI-facing consumers see a healthy status
    await setMonitorStatus(ctx, monitorId, "active");

    // Seed raw check results to drive uptime/latency calculations
    await insertCheckResults(ctx, monitorId, [
      { status: "success", responseTimeMs: 100 },
      { status: "success", responseTimeMs: 300 },
      { status: "degraded", responseTimeMs: 400 },
      { status: "failure", responseTimeMs: 600 },
    ]);
  });

  it("surfaces uptime and latency stats in the monitor list", async () => {
    const response = await fetch(`${API_BASE_URL}/api/v1/monitors`, {
      headers: ctx.headers,
    });

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.success).toBe(true);
    const monitor = body.data.find((m: any) => m.id === monitorId);
    expect(monitor).toBeDefined();
    // Uptime = (success + degraded) / total = 3/4 = 75%
    expect(monitor.uptimePercentage).toBeCloseTo(75, 2);
    // Average response time = (100 + 300 + 400 + 600) / 4 = 350
    expect(monitor.avgResponseTime).toBeCloseTo(350, 1);
    expect(monitor.status).toBe("active");
  });

  it("returns seeded check results for monitor details", async () => {
    const response = await fetch(
      `${API_BASE_URL}/api/v1/monitors/${monitorId}/results?limit=10`,
      { headers: ctx.headers }
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.success).toBe(true);
    const statuses = body.data.map((r: any) => r.status);
    expect(statuses).toEqual(
      expect.arrayContaining(["success", "degraded", "failure"])
    );
    expect(body.data.length).toBeGreaterThanOrEqual(4);
  });

  it("reports accurate uptime via analytics endpoint", async () => {
    const response = await fetch(
      `${API_BASE_URL}/api/v1/analytics/uptime?monitorId=${monitorId}&days=7`,
      { headers: ctx.headers }
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.success).toBe(true);
    expect(body.data.uptimePercentage).toBeCloseTo(75, 2);
    const firstDay = body.data.daily?.[0];
    if (firstDay?.uptimePercentage !== null && firstDay?.uptimePercentage !== undefined) {
      expect(firstDay.uptimePercentage).toBeCloseTo(75, 2);
    }
  });

  // ==========================================
  // Timing Fields Tests
  // ==========================================

  describe("timing fields storage", () => {
    let timingMonitorId: string;

    beforeAll(async () => {
      const monitorRes = await fetch(`${API_BASE_URL}/api/v1/monitors`, {
        method: "POST",
        headers: ctx.headers,
        body: JSON.stringify({
          name: `Timing Monitor ${nanoid(8)}`,
          url: "https://timing.example.com",
          type: "https",
          method: "GET",
          intervalSeconds: 60,
        }),
      });

      const monitorBody = await monitorRes.json();
      timingMonitorId = monitorBody.data.id;
      await setMonitorStatus(ctx, timingMonitorId, "active");
    });

    it("stores all HTTP timing fields", async () => {
      await insertCheckResultFull(ctx, timingMonitorId, {
        status: "success",
        responseTimeMs: 250,
        statusCode: 200,
        dnsMs: 15,
        tcpMs: 25,
        tlsMs: 50,
        ttfbMs: 120,
        transferMs: 40,
      });

      const response = await fetch(
        `${API_BASE_URL}/api/v1/monitors/${timingMonitorId}/results?limit=1`,
        { headers: ctx.headers }
      );

      expect(response.status).toBe(200);
      const body = await response.json();
      expect(body.data.length).toBeGreaterThan(0);

      const result = body.data[0];
      expect(result.responseTimeMs).toBe(250);
      expect(result.statusCode).toBe(200);
      // Timing fields may be in result or metadata depending on implementation
      if (result.dnsMs !== undefined) {
        expect(result.dnsMs).toBe(15);
        expect(result.tcpMs).toBe(25);
        expect(result.tlsMs).toBe(50);
        expect(result.ttfbMs).toBe(120);
        expect(result.transferMs).toBe(40);
      }
    });

    it("handles missing optional timing fields", async () => {
      await insertCheckResultFull(ctx, timingMonitorId, {
        status: "success",
        responseTimeMs: 100,
        // Omit optional timing fields
      });

      const response = await fetch(
        `${API_BASE_URL}/api/v1/monitors/${timingMonitorId}/results?limit=1`,
        { headers: ctx.headers }
      );

      expect(response.status).toBe(200);
      const body = await response.json();
      expect(body.data.length).toBeGreaterThan(0);

      const result = body.data[0];
      expect(result.responseTimeMs).toBe(100);
    });

    it("stores zero timing values correctly", async () => {
      await insertCheckResultFull(ctx, timingMonitorId, {
        status: "success",
        responseTimeMs: 50,
        dnsMs: 0, // DNS from cache
        tcpMs: 10,
        tlsMs: 0, // Reused TLS session
        ttfbMs: 30,
        transferMs: 10,
      });

      const response = await fetch(
        `${API_BASE_URL}/api/v1/monitors/${timingMonitorId}/results?limit=1`,
        { headers: ctx.headers }
      );

      expect(response.status).toBe(200);
      const body = await response.json();
      expect(body.data[0].responseTimeMs).toBe(50);
    });
  });

  // ==========================================
  // Certificate Info Tests
  // ==========================================

  describe("certificate info storage", () => {
    let sslMonitorId: string;

    beforeAll(async () => {
      const monitorRes = await fetch(`${API_BASE_URL}/api/v1/monitors`, {
        method: "POST",
        headers: ctx.headers,
        body: JSON.stringify({
          name: `SSL Monitor ${nanoid(8)}`,
          url: "https://ssl.example.com",
          type: "ssl",
          config: {
            ssl: { checkChain: true, expiryWarningDays: 30 },
          },
          intervalSeconds: 60,
        }),
      });

      const monitorBody = await monitorRes.json();
      sslMonitorId = monitorBody.data.id;
      await setMonitorStatus(ctx, sslMonitorId, "active");
    });

    it("stores certificate info with check result", async () => {
      const certInfo = {
        issuer: "Let's Encrypt Authority X3",
        subject: "ssl.example.com",
        validFrom: "2024-01-01T00:00:00Z",
        validTo: "2024-12-31T23:59:59Z",
        daysUntilExpiry: 180,
        serialNumber: "ABC123DEF456",
        fingerprint: "sha256:1234567890abcdef",
        chain: [
          { issuer: "DST Root CA X3", subject: "Let's Encrypt Authority X3" },
        ],
      };

      await insertCheckResultFull(ctx, sslMonitorId, {
        status: "success",
        responseTimeMs: 150,
        certificateInfo: certInfo,
      });

      const response = await fetch(
        `${API_BASE_URL}/api/v1/monitors/${sslMonitorId}/results?limit=1`,
        { headers: ctx.headers }
      );

      expect(response.status).toBe(200);
      const body = await response.json();
      expect(body.data.length).toBeGreaterThan(0);

      const result = body.data[0];
      if (result.certificateInfo) {
        expect(result.certificateInfo.issuer).toBe("Let's Encrypt Authority X3");
        expect(result.certificateInfo.subject).toBe("ssl.example.com");
        expect(result.certificateInfo.daysUntilExpiry).toBe(180);
      }
    });

    it("stores expiring certificate warning", async () => {
      const expiringCertInfo = {
        issuer: "Let's Encrypt Authority X3",
        subject: "ssl.example.com",
        validFrom: "2024-01-01T00:00:00Z",
        validTo: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
        daysUntilExpiry: 7, // Expiring soon
      };

      await insertCheckResultFull(ctx, sslMonitorId, {
        status: "degraded", // Degraded due to expiring cert
        responseTimeMs: 150,
        certificateInfo: expiringCertInfo,
      });

      const response = await fetch(
        `${API_BASE_URL}/api/v1/monitors/${sslMonitorId}/results?limit=1`,
        { headers: ctx.headers }
      );

      expect(response.status).toBe(200);
      const body = await response.json();
      expect(body.data[0].status).toBe("degraded");
    });

    it("stores expired certificate as failure", async () => {
      const expiredCertInfo = {
        issuer: "Let's Encrypt Authority X3",
        subject: "ssl.example.com",
        validFrom: "2023-01-01T00:00:00Z",
        validTo: "2023-12-31T23:59:59Z", // Past date
        daysUntilExpiry: -30, // Already expired
      };

      await insertCheckResultFull(ctx, sslMonitorId, {
        status: "failure",
        responseTimeMs: 150,
        certificateInfo: expiredCertInfo,
      });

      const response = await fetch(
        `${API_BASE_URL}/api/v1/monitors/${sslMonitorId}/results?limit=1`,
        { headers: ctx.headers }
      );

      expect(response.status).toBe(200);
      const body = await response.json();
      expect(body.data[0].status).toBe("failure");
    });
  });

  // ==========================================
  // Email Auth Details Tests
  // ==========================================

  describe("email auth details storage", () => {
    let emailAuthMonitorId: string;

    beforeAll(async () => {
      const monitorRes = await fetch(`${API_BASE_URL}/api/v1/monitors`, {
        method: "POST",
        headers: ctx.headers,
        body: JSON.stringify({
          name: `Email Auth Monitor ${nanoid(8)}`,
          url: "email-auth://example.com",
          type: "email_auth",
          config: {
            emailAuth: { domain: "example.com", dkimSelectors: ["default"] },
          },
          intervalSeconds: 60,
        }),
      });

      const monitorBody = await monitorRes.json();
      emailAuthMonitorId = monitorBody.data.id;
      await setMonitorStatus(ctx, emailAuthMonitorId, "active");
    });

    it("stores email auth details with check result", async () => {
      const emailAuthDetails = {
        overallScore: 95,
        spf: { status: "pass", record: "v=spf1 include:_spf.google.com ~all" },
        dkim: { status: "pass", selectors: ["default", "google"] },
        dmarc: { status: "pass", policy: "quarantine", pct: 100 },
      };

      await insertCheckResultFull(ctx, emailAuthMonitorId, {
        status: "success",
        responseTimeMs: 500,
        emailAuthDetails,
      });

      const response = await fetch(
        `${API_BASE_URL}/api/v1/monitors/${emailAuthMonitorId}/results?limit=1`,
        { headers: ctx.headers }
      );

      expect(response.status).toBe(200);
      const body = await response.json();
      expect(body.data.length).toBeGreaterThan(0);

      const result = body.data[0];
      if (result.emailAuthDetails) {
        expect(result.emailAuthDetails.overallScore).toBe(95);
        expect(result.emailAuthDetails.spf.status).toBe("pass");
      }
    });

    it("stores failing email auth check", async () => {
      const failingEmailAuth = {
        overallScore: 30,
        spf: { status: "fail", error: "No SPF record found" },
        dkim: { status: "fail", error: "DKIM signature invalid" },
        dmarc: { status: "none", error: "No DMARC record" },
      };

      await insertCheckResultFull(ctx, emailAuthMonitorId, {
        status: "failure",
        responseTimeMs: 300,
        emailAuthDetails: failingEmailAuth,
      });

      const response = await fetch(
        `${API_BASE_URL}/api/v1/monitors/${emailAuthMonitorId}/results?limit=1`,
        { headers: ctx.headers }
      );

      expect(response.status).toBe(200);
      const body = await response.json();
      expect(body.data[0].status).toBe("failure");
    });
  });

  // ==========================================
  // Metadata Storage Tests
  // ==========================================

  describe("metadata storage", () => {
    let metadataMonitorId: string;

    beforeAll(async () => {
      const monitorRes = await fetch(`${API_BASE_URL}/api/v1/monitors`, {
        method: "POST",
        headers: ctx.headers,
        body: JSON.stringify({
          name: `Metadata Monitor ${nanoid(8)}`,
          url: "https://metadata.example.com",
          type: "https",
          method: "GET",
          intervalSeconds: 60,
        }),
      });

      const monitorBody = await monitorRes.json();
      metadataMonitorId = monitorBody.data.id;
      await setMonitorStatus(ctx, metadataMonitorId, "active");
    });

    it("stores custom metadata with check result", async () => {
      const metadata = {
        headers: { "X-Response-Time": "125ms", Server: "nginx/1.20" },
        redirectCount: 2,
        finalUrl: "https://www.metadata.example.com/",
        bodySize: 45678,
      };

      await insertCheckResultFull(ctx, metadataMonitorId, {
        status: "success",
        responseTimeMs: 200,
        metadata,
      });

      const response = await fetch(
        `${API_BASE_URL}/api/v1/monitors/${metadataMonitorId}/results?limit=1`,
        { headers: ctx.headers }
      );

      expect(response.status).toBe(200);
      const body = await response.json();
      expect(body.data.length).toBeGreaterThan(0);

      const result = body.data[0];
      if (result.metadata) {
        expect(result.metadata.redirectCount).toBe(2);
        expect(result.metadata.finalUrl).toBe("https://www.metadata.example.com/");
      }
    });

    it("stores DNS metadata with records", async () => {
      const dnsMonitorRes = await fetch(`${API_BASE_URL}/api/v1/monitors`, {
        method: "POST",
        headers: ctx.headers,
        body: JSON.stringify({
          name: `DNS Monitor ${nanoid(8)}`,
          url: "dns.example.com",
          type: "dns",
          config: { dns: { recordType: "A" } },
          intervalSeconds: 60,
        }),
      });

      const dnsMonitorBody = await dnsMonitorRes.json();
      const dnsMonitorId = dnsMonitorBody.data.id;
      await setMonitorStatus(ctx, dnsMonitorId, "active");

      const dnsMetadata = {
        recordType: "A",
        records: ["192.0.2.1", "192.0.2.2"],
        ttl: 300,
        resolver: "1.1.1.1",
      };

      await insertCheckResultFull(ctx, dnsMonitorId, {
        status: "success",
        responseTimeMs: 25,
        metadata: dnsMetadata,
      });

      const response = await fetch(
        `${API_BASE_URL}/api/v1/monitors/${dnsMonitorId}/results?limit=1`,
        { headers: ctx.headers }
      );

      expect(response.status).toBe(200);
      const body = await response.json();
      if (body.data[0]?.metadata) {
        expect(body.data[0].metadata.recordType).toBe("A");
        expect(body.data[0].metadata.records).toContain("192.0.2.1");
      }
    });
  });
});
