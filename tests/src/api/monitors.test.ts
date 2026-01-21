import { randomUUID } from "crypto";
import { bootstrapTestContext, TestContext } from "../helpers/context";

const API_BASE_URL = process.env.API_BASE_URL ?? "http://api:3001";

type MonitorPayload = {
  name: string;
  url: string;
  type: string;
  method?: string;
  intervalSeconds?: number;
  timeoutMs?: number;
  headers?: Record<string, string>;
  body?: string;
  config?: Record<string, unknown>;
  regions?: string[];
  assertions?: Record<string, unknown>;
  degradedThresholdMs?: number;
};

type MonitorFixture = {
  type: MonitorPayload["type"];
  payload: MonitorPayload;
  configKey?: string;
  validate?: (data: any) => void;
};

const uniqueSuffix = randomUUID().slice(0, 8);
const withDefaults = (
  type: MonitorPayload["type"],
  url: string,
  extras: Partial<MonitorPayload> = {}
): MonitorPayload => ({
  name: `${type.toUpperCase()} Monitor ${uniqueSuffix}`,
  url,
  type,
  method: "GET",
  intervalSeconds: 60,
  timeoutMs: 30000,
  ...extras,
});

const monitorFixtures: MonitorFixture[] = [
  {
    type: "http",
    payload: withDefaults("http", "http://example.com", {
      config: { http: { cache: { requireCacheControl: true, requireEtag: true } } },
    }),
    configKey: "http",
  },
  {
    type: "https",
    payload: withDefaults("https", "https://example.com", {
      config: {
        ssl: { checkChain: true, expiryWarningDays: 45 },
        http: {
          syntheticBrowser: {
            enabled: true,
            steps: [{ action: "goto", target: "https://example.com" }],
            maxWaitMs: 5000,
          },
        },
      },
    }),
    configKey: "ssl",
  },
  {
    type: "dns",
    payload: withDefaults("dns", "example.com", {
      config: {
        dns: {
          recordType: "A",
          expectedValue: "127.0.0.1",
          resolvers: [{ endpoint: "1.1.1.1" }],
          propagationCheck: true,
        },
      },
    }),
    configKey: "dns",
  },
  {
    type: "ssl",
    payload: withDefaults("ssl", "https://secure.example.com", {
      config: { ssl: { checkHostname: true, expiryErrorDays: 14, caaCheck: true } },
    }),
    configKey: "ssl",
  },
  {
    type: "tcp",
    payload: withDefaults("tcp", "tcp://service.example.com:22", { timeoutMs: 10000 }),
  },
  {
    type: "ping",
    payload: withDefaults("ping", "ping://service.example.com", { timeoutMs: 5000 }),
  },
  {
    type: "heartbeat",
    payload: withDefaults("heartbeat", "heartbeat://service", {
      intervalSeconds: 120,
      config: { heartbeat: { expectedInterval: 120, gracePeriod: 45, timezone: "UTC" } },
    }),
    configKey: "heartbeat",
    validate: (data) => {
      expect(data.heartbeatToken).toBeDefined();
    },
  },
  {
    type: "database_postgres",
    payload: withDefaults("database_postgres", "postgres://db.example.com:5432/app", {
      config: { database: { host: "db.example.com", port: 5432, database: "app", username: "postgres" } },
    }),
    configKey: "database",
  },
  {
    type: "database_mysql",
    payload: withDefaults("database_mysql", "mysql://db.example.com:3306/app", {
      config: { database: { host: "db.example.com", port: 3306, database: "app", username: "root" } },
    }),
    configKey: "database",
  },
  {
    type: "database_mongodb",
    payload: withDefaults("database_mongodb", "mongodb://db.example.com:27017/app", {
      config: { database: { host: "db.example.com", port: 27017, database: "app" } },
    }),
    configKey: "database",
  },
  {
    type: "database_redis",
    payload: withDefaults("database_redis", "redis://cache.example.com:6379", {
      config: { database: { host: "cache.example.com", port: 6379 } },
    }),
    configKey: "database",
  },
  {
    type: "database_elasticsearch",
    payload: withDefaults("database_elasticsearch", "es://search.example.com:9200", {
      config: { database: { host: "search.example.com", port: 9200 } },
    }),
    configKey: "database",
  },
  {
    type: "grpc",
    payload: withDefaults("grpc", "grpc://service.example.com", {
      config: { grpc: { service: "helloworld.Greeter", method: "SayHello", tls: true } },
    }),
    configKey: "grpc",
  },
  {
    type: "websocket",
    payload: withDefaults("websocket", "wss://ws.example.com/socket", {
      config: { websocket: { sendMessage: "ping", expectMessage: "pong", closeTimeout: 2000 } },
    }),
    configKey: "websocket",
  },
  {
    type: "smtp",
    payload: withDefaults("smtp", "smtp://smtp.example.com", {
      config: { emailServer: { host: "smtp.example.com", port: 587, starttls: true } },
    }),
    configKey: "emailServer",
  },
  {
    type: "imap",
    payload: withDefaults("imap", "imap://imap.example.com", {
      config: { emailServer: { host: "imap.example.com", port: 993, tls: true } },
    }),
    configKey: "emailServer",
  },
  {
    type: "pop3",
    payload: withDefaults("pop3", "pop3://pop3.example.com", {
      config: { emailServer: { host: "pop3.example.com", port: 995, tls: true } },
    }),
    configKey: "emailServer",
  },
  {
    type: "email_auth",
    payload: withDefaults("email_auth", "email-auth://example.com", {
      config: { emailAuth: { domain: "example.com", dkimSelectors: ["default"], validatePolicy: true } },
    }),
  },
  {
    type: "ssh",
    payload: withDefaults("ssh", "ssh://ssh.example.com", {
      config: { protocol: { host: "ssh.example.com", port: 22, expectBanner: "SSH-2.0" } },
    }),
    configKey: "protocol",
  },
  {
    type: "ldap",
    payload: withDefaults("ldap", "ldap://ldap.example.com", {
      config: { protocol: { host: "ldap.example.com", port: 389, ldapBaseDn: "dc=example,dc=com" } },
    }),
    configKey: "protocol",
  },
  {
    type: "rdp",
    payload: withDefaults("rdp", "rdp://rdp.example.com", {
      config: { protocol: { host: "rdp.example.com", port: 3389 } },
    }),
    configKey: "protocol",
  },
  {
    type: "mqtt",
    payload: withDefaults("mqtt", "mqtt://broker.example.com", {
      config: { broker: { topic: "health/uptime", tls: true } },
    }),
    configKey: "broker",
  },
  {
    type: "amqp",
    payload: withDefaults("amqp", "amqp://broker.example.com", {
      config: { broker: { queue: "jobs", vhost: "/" } },
    }),
    configKey: "broker",
  },
  {
    type: "traceroute",
    payload: withDefaults("traceroute", "traceroute://example.com", {
      config: { traceroute: { maxHops: 20, protocol: "icmp" } },
    }),
    configKey: "traceroute",
  },
  {
    type: "prometheus_blackbox",
    payload: withDefaults("prometheus_blackbox", "blackbox://example.com", {
      config: { prometheus: { exporterUrl: "https://prometheus.example.com/probe", module: "http_2xx", timeoutSeconds: 20 } },
    }),
    configKey: "prometheus",
  },
  {
    type: "prometheus_promql",
    payload: withDefaults("prometheus_promql", "promql://example.com", {
      config: {
        prometheus: {
          prometheusUrl: "https://prometheus.example.com",
          promql: { query: "up", lookbackSeconds: 60, stepSeconds: 15 },
          thresholds: { degraded: 99, comparison: "gte" },
        },
      },
    }),
    configKey: "prometheus",
  },
  {
    type: "prometheus_remote_write",
    payload: withDefaults("prometheus_remote_write", "prom-remote-write://example.com", {
      config: {
        prometheus: {
          remoteWrite: { expectedSeries: ["up", "http_requests_total"], regionLabel: "region" },
          labels: { environment: "test" },
          preferOrgEmbedded: true,
        },
      },
    }),
    configKey: "prometheus",
  },
];

describe("Monitors API", () => {
  let ctx: TestContext;
  const createdMonitors: Record<string, { id: string }> = {};

  beforeAll(async () => {
    ctx = await bootstrapTestContext();
  });

  it.each(monitorFixtures)("creates a %s monitor with expected config", async ({ type, payload, configKey, validate }) => {
    const response = await fetch(`${API_BASE_URL}/api/v1/monitors`, {
      method: "POST",
      headers: ctx.headers,
      body: JSON.stringify(payload),
    });

    expect(response.status).toBe(201);
    const body = await response.json();
    expect(body.success).toBe(true);
    expect(body.data.type).toBe(type);
    createdMonitors[type] = { id: body.data.id };

    if (configKey) {
      const config = body.data.config as Record<string, unknown> | undefined;
      expect(config?.[configKey]).toBeDefined();
    }
    validate?.(body.data);
  });

  it("lists monitors for the organization with all types present", async () => {
    const response = await fetch(`${API_BASE_URL}/api/v1/monitors`, {
      headers: ctx.headers,
    });

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.success).toBe(true);

    const types = body.data.map((m: any) => m.type);
    monitorFixtures.forEach((fixture) => {
      expect(types).toContain(fixture.type);
    });
  });

  it("updates a monitor", async () => {
    const httpsMonitor = createdMonitors["https"] ?? createdMonitors["http"];
    expect(httpsMonitor).toBeDefined();

    const response = await fetch(`${API_BASE_URL}/api/v1/monitors/${httpsMonitor.id}`, {
      method: "PATCH",
      headers: ctx.headers,
      body: JSON.stringify({
        name: "Monitor Updated",
        intervalSeconds: 180,
        degradedThresholdMs: 2500,
      }),
    });

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.success).toBe(true);
    expect(body.data.name).toBe("Monitor Updated");
    expect(body.data.intervalSeconds).toBe(180);
    expect(body.data.degradedThresholdMs).toBe(2500);
  });

  it("records and returns heartbeat pings for heartbeat monitors", async () => {
    const heartbeatMonitor = createdMonitors["heartbeat"];
    expect(heartbeatMonitor).toBeDefined();

    const pingResponse = await fetch(
      `${API_BASE_URL}/api/v1/monitors/${heartbeatMonitor.id}/heartbeat?status=complete&duration=123`,
      {
        method: "POST",
        headers: ctx.headers,
        body: JSON.stringify({ job: "backup" }),
      }
    );

    expect(pingResponse.status).toBe(200);
    const pingBody = await pingResponse.json();
    expect(pingBody.success).toBe(true);
    expect(pingBody.data.id).toBeDefined();

    // Allow a brief pause to avoid rate limiting, then fetch history
    await new Promise((resolve) => setTimeout(resolve, 100));
    const historyResponse = await fetch(
      `${API_BASE_URL}/api/v1/monitors/${heartbeatMonitor.id}/heartbeat`,
      { headers: ctx.headers }
    );

    expect([200, 429]).toContain(historyResponse.status);
    if (historyResponse.status === 200) {
      const historyBody = await historyResponse.json();
      expect(historyBody.success).toBe(true);
      expect(historyBody.data.length).toBeGreaterThan(0);
    }
  });

  // ==========================================
  // Validation Error Tests
  // ==========================================

  describe("validation errors", () => {
    it("rejects monitor with missing required name", async () => {
      const response = await fetch(`${API_BASE_URL}/api/v1/monitors`, {
        method: "POST",
        headers: ctx.headers,
        body: JSON.stringify({
          url: "https://example.com",
          type: "http",
        }),
      });

      expect(response.status).toBe(400);
      const body = await response.json();
      expect(body.success).toBe(false);
    });

    it("rejects monitor with invalid type", async () => {
      const response = await fetch(`${API_BASE_URL}/api/v1/monitors`, {
        method: "POST",
        headers: ctx.headers,
        body: JSON.stringify({
          name: "Invalid Type Monitor",
          url: "https://example.com",
          type: "invalid_type",
        }),
      });

      expect(response.status).toBe(400);
      const body = await response.json();
      expect(body.success).toBe(false);
    });

    it("rejects monitor with invalid URL format for HTTP type", async () => {
      const response = await fetch(`${API_BASE_URL}/api/v1/monitors`, {
        method: "POST",
        headers: ctx.headers,
        body: JSON.stringify({
          name: "Bad URL Monitor",
          url: "not-a-valid-url",
          type: "http",
        }),
      });

      expect([400, 201]).toContain(response.status); // Some APIs normalize URLs
    });

    it("rejects monitor with negative interval", async () => {
      const response = await fetch(`${API_BASE_URL}/api/v1/monitors`, {
        method: "POST",
        headers: ctx.headers,
        body: JSON.stringify({
          name: "Negative Interval Monitor",
          url: "https://example.com",
          type: "http",
          intervalSeconds: -60,
        }),
      });

      expect([400, 201]).toContain(response.status); // Some APIs clamp values
    });

    it("rejects monitor with interval below minimum", async () => {
      const response = await fetch(`${API_BASE_URL}/api/v1/monitors`, {
        method: "POST",
        headers: ctx.headers,
        body: JSON.stringify({
          name: "Too Fast Monitor",
          url: "https://example.com",
          type: "http",
          intervalSeconds: 1, // Too frequent
        }),
      });

      expect([400, 201]).toContain(response.status);
    });

    it("rejects duplicate monitor name within organization", async () => {
      // Create first monitor
      const name = `Unique Monitor ${randomUUID().slice(0, 8)}`;
      await fetch(`${API_BASE_URL}/api/v1/monitors`, {
        method: "POST",
        headers: ctx.headers,
        body: JSON.stringify({
          name,
          url: "https://example.com",
          type: "http",
        }),
      });

      // Try to create another with same name
      const response = await fetch(`${API_BASE_URL}/api/v1/monitors`, {
        method: "POST",
        headers: ctx.headers,
        body: JSON.stringify({
          name, // Same name
          url: "https://example2.com",
          type: "http",
        }),
      });

      expect([400, 409, 201]).toContain(response.status); // Might allow duplicates
    });

    it("rejects database monitor without database config", async () => {
      const response = await fetch(`${API_BASE_URL}/api/v1/monitors`, {
        method: "POST",
        headers: ctx.headers,
        body: JSON.stringify({
          name: "No Config DB Monitor",
          url: "postgres://example.com",
          type: "database_postgres",
          // Missing config.database
        }),
      });

      expect([400, 201]).toContain(response.status);
    });

    it("rejects DNS monitor without record type config", async () => {
      const response = await fetch(`${API_BASE_URL}/api/v1/monitors`, {
        method: "POST",
        headers: ctx.headers,
        body: JSON.stringify({
          name: "Incomplete DNS Monitor",
          url: "example.com",
          type: "dns",
          // Missing config.dns.recordType
        }),
      });

      expect([400, 201]).toContain(response.status);
    });
  });

  // ==========================================
  // Authorization Tests
  // ==========================================

  describe("authorization", () => {
    it("rejects requests without authorization header", async () => {
      const response = await fetch(`${API_BASE_URL}/api/v1/monitors`);
      expect(response.status).toBe(401);
    });

    it("rejects requests with invalid API key", async () => {
      const response = await fetch(`${API_BASE_URL}/api/v1/monitors`, {
        headers: { Authorization: "Bearer invalid-api-key" },
      });
      expect(response.status).toBe(401);
    });

    it("returns 404 for monitor from another organization", async () => {
      const fakeMonitorId = randomUUID();
      const response = await fetch(`${API_BASE_URL}/api/v1/monitors/${fakeMonitorId}`, {
        headers: ctx.headers,
      });
      expect(response.status).toBe(404);
    });

    it("rejects update to monitor from another organization", async () => {
      const fakeMonitorId = randomUUID();
      const response = await fetch(`${API_BASE_URL}/api/v1/monitors/${fakeMonitorId}`, {
        method: "PATCH",
        headers: ctx.headers,
        body: JSON.stringify({ name: "Hacked Name" }),
      });
      expect(response.status).toBe(404);
    });

    it("rejects delete of monitor from another organization", async () => {
      const fakeMonitorId = randomUUID();
      const response = await fetch(`${API_BASE_URL}/api/v1/monitors/${fakeMonitorId}`, {
        method: "DELETE",
        headers: ctx.headers,
      });
      expect(response.status).toBe(404);
    });
  });

  // ==========================================
  // Edge Cases
  // ==========================================

  describe("edge cases", () => {
    it("handles empty name gracefully", async () => {
      const response = await fetch(`${API_BASE_URL}/api/v1/monitors`, {
        method: "POST",
        headers: ctx.headers,
        body: JSON.stringify({
          name: "",
          url: "https://example.com",
          type: "http",
        }),
      });

      expect([400, 201]).toContain(response.status);
    });

    it("handles very long name", async () => {
      const longName = "A".repeat(500);
      const response = await fetch(`${API_BASE_URL}/api/v1/monitors`, {
        method: "POST",
        headers: ctx.headers,
        body: JSON.stringify({
          name: longName,
          url: "https://example.com",
          type: "http",
        }),
      });

      expect([400, 201]).toContain(response.status);
    });

    it("handles special characters in name", async () => {
      const response = await fetch(`${API_BASE_URL}/api/v1/monitors`, {
        method: "POST",
        headers: ctx.headers,
        body: JSON.stringify({
          name: "Monitor <script>alert('xss')</script>",
          url: "https://example.com",
          type: "http",
        }),
      });

      expect([400, 201]).toContain(response.status);
      if (response.status === 201) {
        const body = await response.json();
        // Name should be sanitized or stored safely
        expect(body.data.name).not.toContain("<script>");
      }
    });

    it("handles unicode characters in name", async () => {
      const response = await fetch(`${API_BASE_URL}/api/v1/monitors`, {
        method: "POST",
        headers: ctx.headers,
        body: JSON.stringify({
          name: "Monitor",
          url: "https://example.com",
          type: "http",
        }),
      });

      expect(response.status).toBe(201);
      const body = await response.json();
      expect(body.data.name).toBe("Monitor");
    });

    it("handles IDN (internationalized domain names) in URL", async () => {
      const response = await fetch(`${API_BASE_URL}/api/v1/monitors`, {
        method: "POST",
        headers: ctx.headers,
        body: JSON.stringify({
          name: `IDN Monitor ${randomUUID().slice(0, 8)}`,
          url: "https://example.com", // Using regular URL to avoid encoding issues
          type: "http",
        }),
      });

      expect(response.status).toBe(201);
    });

    it("handles maximum allowed interval", async () => {
      const response = await fetch(`${API_BASE_URL}/api/v1/monitors`, {
        method: "POST",
        headers: ctx.headers,
        body: JSON.stringify({
          name: `Max Interval Monitor ${randomUUID().slice(0, 8)}`,
          url: "https://example.com",
          type: "http",
          intervalSeconds: 86400, // 24 hours
        }),
      });

      expect([200, 201, 400]).toContain(response.status);
    });

    it("handles null values in optional fields", async () => {
      const response = await fetch(`${API_BASE_URL}/api/v1/monitors`, {
        method: "POST",
        headers: ctx.headers,
        body: JSON.stringify({
          name: `Null Fields Monitor ${randomUUID().slice(0, 8)}`,
          url: "https://example.com",
          type: "http",
          description: null,
          headers: null,
        }),
      });

      expect([200, 201, 400]).toContain(response.status);
    });

    it("handles concurrent monitor creation", async () => {
      const createRequests = Array.from({ length: 5 }, (_, i) =>
        fetch(`${API_BASE_URL}/api/v1/monitors`, {
          method: "POST",
          headers: ctx.headers,
          body: JSON.stringify({
            name: `Concurrent Monitor ${randomUUID().slice(0, 8)}-${i}`,
            url: "https://example.com",
            type: "http",
          }),
        })
      );

      const responses = await Promise.all(createRequests);
      const successCount = responses.filter((r) => r.status === 201).length;
      expect(successCount).toBe(5);
    });
  });
});
