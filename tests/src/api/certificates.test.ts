import { bootstrapTestContext, TestContext } from "../helpers/context";
import { insertCheckResults, setMonitorStatus } from "../helpers/data";

const API_BASE_URL = process.env.API_BASE_URL ?? "http://api:3001";

describe("Certificates API", () => {
  let ctx: TestContext;
  let httpsMonitorId: string;
  let sslMonitorId: string;

  beforeAll(async () => {
    ctx = await bootstrapTestContext();

    const createMonitor = async (payload: Record<string, unknown>) => {
      const response = await fetch(`${API_BASE_URL}/api/v1/monitors`, {
        method: "POST",
        headers: ctx.headers,
        body: JSON.stringify(payload),
      });

      expect(response.status).toBe(201);
      const body = await response.json();
      expect(body.success).toBe(true);
      return body.data;
    };

    const httpsMonitor = await createMonitor({
      name: "Cert HTTPS Monitor",
      url: "https://cert.example.com",
      type: "https",
      method: "GET",
      intervalSeconds: 60,
      config: { ssl: { checkHostname: true, expiryWarningDays: 30 } },
    });
    httpsMonitorId = httpsMonitor.id;

    const sslMonitor = await createMonitor({
      name: "Cert SSL Monitor",
      url: "https://legacy.example.com",
      type: "ssl",
      method: "GET",
      intervalSeconds: 60,
    });
    sslMonitorId = sslMonitor.id;

    // Seed certificate data for https monitor
    await insertCheckResults(httpsMonitorId, [
      {
        status: "success",
        certificateInfo: {
          issuer: "Example CA",
          subject: "CN=example.com",
          daysUntilExpiry: 25,
          validFrom: new Date().toISOString(),
          validTo: new Date(Date.now() + 25 * 86400000).toISOString(),
        },
        headers: { fingerprint: "fp1" },
      },
      {
        status: "success",
        certificateInfo: {
          issuer: "Example CA",
          subject: "CN=example.com",
          daysUntilExpiry: 10,
          validFrom: new Date().toISOString(),
          validTo: new Date(Date.now() + 10 * 86400000).toISOString(),
        },
        headers: { fingerprint: "fp2" },
        createdAt: new Date(Date.now() - 86400000),
      },
    ]);

    // Seed certificate transparency check for https monitor
    await insertCheckResults(httpsMonitorId, [
      {
        status: "success",
        metadata: {
          checkType: "certificate_transparency",
          newCertificates: [{ id: "new" }],
          unexpectedCertificates: [],
        },
        createdAt: new Date(),
      },
    ]);

    // Mark monitors active
    await setMonitorStatus(httpsMonitorId, "active");
    await setMonitorStatus(sslMonitorId, "active");
  });

  it("lists certificates for ssl/https monitors without database errors", async () => {
    const response = await fetch(`${API_BASE_URL}/api/v1/certificates`, {
      headers: ctx.headers,
    });

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.success).toBe(true);

    const monitorIds = body.data.map((row: any) => row.monitorId);
    expect(monitorIds).toEqual(expect.arrayContaining([httpsMonitorId, sslMonitorId]));
    body.data.forEach((row: any) => {
      expect(row.ctStatus).toBeDefined();
    });
    const httpsRow = body.data.find((row: any) => row.monitorId === httpsMonitorId);
    expect(httpsRow.certificateInfo?.daysUntilExpiry).toBe(25);
    expect(httpsRow.ctStatus?.state).toBe("new");
  });

  it("returns certificate details for an https monitor", async () => {
    const response = await fetch(`${API_BASE_URL}/api/v1/certificates/${httpsMonitorId}`, {
      headers: ctx.headers,
    });

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.success).toBe(true);
    expect(body.data.monitor.id).toBe(httpsMonitorId);
    expect(body.data.currentCertificate?.daysUntilExpiry).toBe(25);
    expect(Array.isArray(body.data.history)).toBe(true);
    expect(body.data.history.some((h: any) => h.daysUntilExpiry === 10)).toBe(true);
    expect(body.data.certificateChanges.length).toBeGreaterThanOrEqual(1);
    expect(body.data.ctStatus.state).toBe("new");
  });
});
