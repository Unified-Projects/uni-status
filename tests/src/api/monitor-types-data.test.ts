/**
 * Monitor Types Data Storage Tests
 *
 * Verifies that each monitor type stores and collects the correct data.
 * Tests both API storage and result data fields.
 */

import { describe, it, expect, beforeAll } from "vitest";
import { randomUUID } from "crypto";
import { bootstrapTestContext, TestContext } from "../helpers/context";
import {
  insertCheckResultFull,
  insertHeartbeatPing,
  setMonitorStatus,
  getMonitorById,
} from "../helpers/data";
import {
  getLatestCheckResult,
  getHeartbeatPings,
} from "../helpers/worker-integration";
import {
  TEST_SERVICES,
  getTestUrlForMonitorType,
  getTestConfigForMonitorType,
} from "../helpers/services";

const API_BASE_URL = process.env.API_BASE_URL ?? "http://api:3001";

type MonitorPayload = {
  name: string;
  url: string;
  type: string;
  method?: string;
  intervalSeconds?: number;
  timeoutMs?: number;
  config?: Record<string, unknown>;
  regions?: string[];
  assertions?: Record<string, unknown>;
};

async function createMonitor(
  ctx: TestContext,
  payload: MonitorPayload
): Promise<{ id: string; heartbeatToken?: string; config?: Record<string, unknown> }> {
  const response = await fetch(`${API_BASE_URL}/api/v1/monitors`, {
    method: "POST",
    headers: ctx.headers,
    body: JSON.stringify({
      intervalSeconds: 60,
      timeoutMs: 30000,
      method: "GET",
      regions: ["uk"],
      ...payload,
    }),
  });

  expect(response.status).toBe(201);
  const body = await response.json();
  expect(body.success).toBe(true);

  return {
    id: body.data.id,
    heartbeatToken: body.data.heartbeatToken,
    config: body.data.config,
  };
}

async function getMonitorResults(
  ctx: TestContext,
  monitorId: string,
  options?: { limit?: number }
): Promise<{ results: any[]; meta: any }> {
  const limit = options?.limit ?? 10;
  const response = await fetch(
    `${API_BASE_URL}/api/v1/monitors/${monitorId}/results?limit=${limit}`,
    { headers: ctx.headers }
  );

  expect(response.status).toBe(200);
  const body = await response.json();
  expect(body.success).toBe(true);

  return { results: body.data, meta: body.meta };
}

describe("Monitor Types Data Storage", () => {
  let ctx: TestContext;

  beforeAll(async () => {
    ctx = await bootstrapTestContext();
  });

  describe("HTTP Monitor", () => {
    it("stores config correctly", async () => {
      const monitor = await createMonitor(ctx, {
        name: `HTTP Data Test ${randomUUID().slice(0, 8)}`,
        url: `${TEST_SERVICES.HTTPBIN_URL}/get`,
        type: "http",
        config: {
          http: {
            cache: { requireCacheControl: true, requireEtag: true },
            responseSize: { warnBytes: 100000, errorBytes: 500000 },
          },
        },
      });

      expect(monitor.config).toBeDefined();
      expect(monitor.config?.http).toBeDefined();

      // Verify via GET
      const fetchedMonitor = await getMonitorById(monitor.id);
      expect(fetchedMonitor).toBeDefined();
      expect(fetchedMonitor!.config.http).toBeDefined();
    });

    it("stores check results with timing metrics", async () => {
      const monitor = await createMonitor(ctx, {
        name: `HTTP Timing Test ${randomUUID().slice(0, 8)}`,
        url: `${TEST_SERVICES.HTTPBIN_URL}/get`,
        type: "http",
        config: getTestConfigForMonitorType("http"),
      });

      // Insert a check result with all timing fields
      await insertCheckResultFull(monitor.id, {
        status: "success",
        responseTimeMs: 150,
        statusCode: 200,
        dnsMs: 10,
        tcpMs: 20,
        tlsMs: 0,
        ttfbMs: 100,
        transferMs: 20,
        responseSize: 1024,
        headers: {
          "content-type": "application/json",
          "x-custom-header": "test-value",
        },
      });

      // Fetch results via API
      const { results } = await getMonitorResults(ctx, monitor.id);
      expect(results.length).toBeGreaterThan(0);

      const result = results[0];
      expect(result.responseTimeMs).toBe(150);
      expect(result.statusCode).toBe(200);
      expect(result.dnsMs).toBe(10);
      expect(result.tcpMs).toBe(20);
      expect(result.ttfbMs).toBe(100);
      expect(result.transferMs).toBe(20);
      expect(result.responseSize).toBe(1024);
    });

    it("stores response headers", async () => {
      const monitor = await createMonitor(ctx, {
        name: `HTTP Headers Storage Test ${randomUUID().slice(0, 8)}`,
        url: `${TEST_SERVICES.HTTPBIN_URL}/get`,
        type: "http",
        config: getTestConfigForMonitorType("http"),
      });

      await insertCheckResultFull(monitor.id, {
        status: "success",
        responseTimeMs: 100,
        statusCode: 200,
        headers: {
          "content-type": "application/json",
          "cache-control": "max-age=3600",
          "x-request-id": "abc123",
        },
      });

      const { results } = await getMonitorResults(ctx, monitor.id);
      expect(results[0].headers).toBeDefined();
      expect(results[0].headers["content-type"]).toBe("application/json");
    });
  });

  describe("HTTPS Monitor", () => {
    it("stores SSL config correctly", async () => {
      const monitor = await createMonitor(ctx, {
        name: `HTTPS SSL Config Test ${randomUUID().slice(0, 8)}`,
        url: TEST_SERVICES.NGINX_SSL_URL,
        type: "https",
        config: {
          ssl: {
            checkChain: true,
            checkHostname: true,
            expiryWarningDays: 30,
            expiryErrorDays: 7,
            minTlsVersion: "TLSv1.2",
          },
          http: {},
        },
      });

      expect(monitor.config).toBeDefined();
      expect(monitor.config?.ssl).toBeDefined();

      const fetchedMonitor = await getMonitorById(monitor.id);
      expect(fetchedMonitor!.config.ssl.checkChain).toBe(true);
      expect(fetchedMonitor!.config.ssl.expiryWarningDays).toBe(30);
    });

    it("stores certificate info in check results", async () => {
      const monitor = await createMonitor(ctx, {
        name: `HTTPS Cert Info Test ${randomUUID().slice(0, 8)}`,
        url: TEST_SERVICES.NGINX_SSL_URL,
        type: "https",
        config: getTestConfigForMonitorType("https"),
      });

      const validFrom = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
      const validTo = new Date(Date.now() + 335 * 24 * 60 * 60 * 1000).toISOString();

      await insertCheckResultFull(monitor.id, {
        status: "success",
        responseTimeMs: 200,
        statusCode: 200,
        tlsMs: 50,
        certificateInfo: {
          issuer: "CN=Test CA,O=Test Org,C=US",
          subject: "CN=uni-status-nginx-ssl-test",
          validFrom,
          validTo,
          daysUntilExpiry: 335,
          serialNumber: "ABC123",
          fingerprint: "SHA256:abcdef1234567890",
        },
      });

      const { results } = await getMonitorResults(ctx, monitor.id);
      expect(results[0].certificateInfo).toBeDefined();
      expect(results[0].certificateInfo.issuer).toContain("Test CA");
      expect(results[0].certificateInfo.subject).toContain("nginx-ssl-test");
      expect(results[0].certificateInfo.daysUntilExpiry).toBe(335);
      expect(results[0].tlsMs).toBe(50);
    });
  });

  describe("DNS Monitor", () => {
    it("stores DNS config correctly", async () => {
      const monitor = await createMonitor(ctx, {
        name: `DNS Config Test ${randomUUID().slice(0, 8)}`,
        url: "example.com",
        type: "dns",
        config: {
          dns: {
            recordType: "A",
            nameserver: "8.8.8.8",
            expectedValue: "93.184.216.34",
            propagationCheck: true,
            resolverStrategy: "all",
          },
        },
      });

      expect(monitor.config).toBeDefined();
      expect(monitor.config?.dns).toBeDefined();

      const fetchedMonitor = await getMonitorById(monitor.id);
      expect(fetchedMonitor!.config.dns.recordType).toBe("A");
      expect(fetchedMonitor!.config.dns.propagationCheck).toBe(true);
    });

    it("stores DNS records in metadata", async () => {
      const monitor = await createMonitor(ctx, {
        name: `DNS Records Test ${randomUUID().slice(0, 8)}`,
        url: "example.com",
        type: "dns",
        config: {
          dns: { recordType: "A", nameserver: "8.8.8.8" },
        },
      });

      await insertCheckResultFull(monitor.id, {
        status: "success",
        responseTimeMs: 25,
        metadata: {
          recordType: "A",
          records: ["93.184.216.34"],
          ttl: 3600,
          resolvers: [
            { resolver: "8.8.8.8", success: true, records: ["93.184.216.34"], latencyMs: 25 },
          ],
        },
      });

      const { results } = await getMonitorResults(ctx, monitor.id);
      expect(results[0].metadata).toBeDefined();
      expect(results[0].metadata.recordType).toBe("A");
      expect(results[0].metadata.records).toContain("93.184.216.34");
      expect(results[0].metadata.ttl).toBe(3600);
    });
  });

  describe("SSL Monitor", () => {
    it("stores SSL-specific config", async () => {
      const monitor = await createMonitor(ctx, {
        name: `SSL Monitor Config Test ${randomUUID().slice(0, 8)}`,
        url: TEST_SERVICES.NGINX_SSL_URL,
        type: "ssl",
        config: {
          ssl: {
            checkChain: true,
            checkHostname: true,
            expiryWarningDays: 45,
            expiryErrorDays: 14,
            requireOcspStapling: false,
            caaCheck: true,
            caaIssuers: ["letsencrypt.org"],
          },
        },
      });

      const fetchedMonitor = await getMonitorById(monitor.id);
      expect(fetchedMonitor!.config.ssl.checkChain).toBe(true);
      expect(fetchedMonitor!.config.ssl.caaCheck).toBe(true);
    });

    it("stores full certificate chain info", async () => {
      const monitor = await createMonitor(ctx, {
        name: `SSL Chain Test ${randomUUID().slice(0, 8)}`,
        url: TEST_SERVICES.NGINX_SSL_URL,
        type: "ssl",
        config: getTestConfigForMonitorType("ssl"),
      });

      await insertCheckResultFull(monitor.id, {
        status: "success",
        responseTimeMs: 100,
        certificateInfo: {
          issuer: "CN=Root CA,O=Test,C=US",
          subject: "CN=test.local",
          validFrom: new Date().toISOString(),
          validTo: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString(),
          daysUntilExpiry: 365,
          serialNumber: "123456",
          fingerprint: "SHA256:xyz",
        },
        metadata: {
          chainValid: true,
          chainLength: 2,
          ocspStatus: "good",
          tlsVersion: "TLSv1.3",
          cipher: "TLS_AES_256_GCM_SHA384",
        },
      });

      const { results } = await getMonitorResults(ctx, monitor.id);
      expect(results[0].certificateInfo).toBeDefined();
      expect(results[0].metadata.chainValid).toBe(true);
      expect(results[0].metadata.tlsVersion).toBe("TLSv1.3");
    });
  });

  describe("TCP Monitor", () => {
    it("stores TCP connection results", async () => {
      const monitor = await createMonitor(ctx, {
        name: `TCP Data Test ${randomUUID().slice(0, 8)}`,
        url: TEST_SERVICES.TCP_ECHO_URL,
        type: "tcp",
        timeoutMs: 10000,
      });

      await insertCheckResultFull(monitor.id, {
        status: "success",
        responseTimeMs: 15,
        tcpMs: 15,
        metadata: {
          connected: true,
          localAddress: "172.18.0.10",
          remoteAddress: "172.18.0.5",
        },
      });

      const { results } = await getMonitorResults(ctx, monitor.id);
      expect(results[0].status).toBe("success");
      expect(results[0].tcpMs).toBe(15);
    });
  });

  describe("Heartbeat Monitor", () => {
    it("stores heartbeat config with expectedInterval and gracePeriod", async () => {
      const monitor = await createMonitor(ctx, {
        name: `Heartbeat Config Test ${randomUUID().slice(0, 8)}`,
        url: "heartbeat://my-cron-job",
        type: "heartbeat",
        config: {
          heartbeat: {
            expectedInterval: 300, // 5 minutes
            gracePeriod: 60, // 1 minute grace
            timezone: "America/New_York",
          },
        },
      });

      expect(monitor.heartbeatToken).toBeDefined();
      expect(monitor.heartbeatToken!.length).toBeGreaterThan(0);

      const fetchedMonitor = await getMonitorById(monitor.id);
      expect(fetchedMonitor!.config.heartbeat.expectedInterval).toBe(300);
      expect(fetchedMonitor!.config.heartbeat.gracePeriod).toBe(60);
    });

    it("stores heartbeat pings with status and duration", async () => {
      const monitor = await createMonitor(ctx, {
        name: `Heartbeat Ping Test ${randomUUID().slice(0, 8)}`,
        url: "heartbeat://backup-job",
        type: "heartbeat",
        config: getTestConfigForMonitorType("heartbeat"),
      });

      // Insert heartbeat pings
      await insertHeartbeatPing(monitor.id, {
        status: "start",
        metadata: { job: "backup" },
      });

      await insertHeartbeatPing(monitor.id, {
        status: "complete",
        durationMs: 5000,
        exitCode: 0,
        metadata: { job: "backup", filesProcessed: 100 },
      });

      // Fetch heartbeat pings
      const pings = await getHeartbeatPings(monitor.id);
      expect(pings.length).toBe(2);

      const completePing = pings.find((p) => p.status === "complete");
      expect(completePing).toBeDefined();
      expect(completePing!.durationMs).toBe(5000);
      expect(completePing!.exitCode).toBe(0);
    });

    it("stores failed heartbeat pings with exit code", async () => {
      const monitor = await createMonitor(ctx, {
        name: `Heartbeat Fail Test ${randomUUID().slice(0, 8)}`,
        url: "heartbeat://failing-job",
        type: "heartbeat",
        config: getTestConfigForMonitorType("heartbeat"),
      });

      await insertHeartbeatPing(monitor.id, {
        status: "fail",
        durationMs: 10000,
        exitCode: 1,
        metadata: { error: "Connection timeout", job: "sync" },
      });

      const pings = await getHeartbeatPings(monitor.id);
      expect(pings[0].status).toBe("fail");
      expect(pings[0].exitCode).toBe(1);
      expect(pings[0].metadata?.error).toBe("Connection timeout");
    });
  });

  describe("Database Monitors", () => {
    it("stores PostgreSQL config correctly", async () => {
      const monitor = await createMonitor(ctx, {
        name: `Postgres Config Test ${randomUUID().slice(0, 8)}`,
        url: `postgres://${TEST_SERVICES.POSTGRES_HOST}:${TEST_SERVICES.POSTGRES_PORT}/uni_status`,
        type: "database_postgres",
        config: {
          database: {
            host: TEST_SERVICES.POSTGRES_HOST,
            port: TEST_SERVICES.POSTGRES_PORT,
            database: "uni_status",
            username: "uni_status",
            query: "SELECT 1 as health",
            expectedRowCount: 1,
          },
        },
      });

      const fetchedMonitor = await getMonitorById(monitor.id);
      expect(fetchedMonitor!.config.database.host).toBe(TEST_SERVICES.POSTGRES_HOST);
      expect(fetchedMonitor!.config.database.query).toBe("SELECT 1 as health");
    });

    it("stores database check results with version info", async () => {
      const monitor = await createMonitor(ctx, {
        name: `Postgres Results Test ${randomUUID().slice(0, 8)}`,
        url: `postgres://${TEST_SERVICES.POSTGRES_HOST}:${TEST_SERVICES.POSTGRES_PORT}/uni_status`,
        type: "database_postgres",
        config: getTestConfigForMonitorType("database_postgres"),
      });

      await insertCheckResultFull(monitor.id, {
        status: "success",
        responseTimeMs: 50,
        metadata: {
          version: "PostgreSQL 16.0",
          connectionTimeMs: 20,
          queryTimeMs: 30,
          rowCount: 1,
        },
      });

      const { results } = await getMonitorResults(ctx, monitor.id);
      expect(results[0].metadata.version).toContain("PostgreSQL");
      expect(results[0].metadata.connectionTimeMs).toBe(20);
    });

    it("stores Redis config correctly", async () => {
      const monitor = await createMonitor(ctx, {
        name: `Redis Config Test ${randomUUID().slice(0, 8)}`,
        url: `redis://${TEST_SERVICES.REDIS_HOST}:${TEST_SERVICES.REDIS_PORT}`,
        type: "database_redis",
        config: {
          database: {
            host: TEST_SERVICES.REDIS_HOST,
            port: TEST_SERVICES.REDIS_PORT,
          },
        },
      });

      const fetchedMonitor = await getMonitorById(monitor.id);
      expect(fetchedMonitor!.config.database.host).toBe(TEST_SERVICES.REDIS_HOST);
    });
  });

  describe("Email Server Monitors", () => {
    it("stores SMTP config correctly", async () => {
      const monitor = await createMonitor(ctx, {
        name: `SMTP Config Test ${randomUUID().slice(0, 8)}`,
        url: `smtp://${TEST_SERVICES.MAILHOG_HOST}:${TEST_SERVICES.MAILHOG_SMTP_PORT}`,
        type: "smtp",
        config: {
          emailServer: {
            host: TEST_SERVICES.MAILHOG_HOST,
            port: TEST_SERVICES.MAILHOG_SMTP_PORT,
            starttls: false,
          },
        },
      });

      const fetchedMonitor = await getMonitorById(monitor.id);
      expect(fetchedMonitor!.config.emailServer.host).toBe(TEST_SERVICES.MAILHOG_HOST);
    });

    it("stores SMTP check results", async () => {
      const monitor = await createMonitor(ctx, {
        name: `SMTP Results Test ${randomUUID().slice(0, 8)}`,
        url: `smtp://${TEST_SERVICES.MAILHOG_HOST}:${TEST_SERVICES.MAILHOG_SMTP_PORT}`,
        type: "smtp",
        config: getTestConfigForMonitorType("smtp"),
      });

      await insertCheckResultFull(monitor.id, {
        status: "success",
        responseTimeMs: 100,
        metadata: {
          banner: "220 mailhog ESMTP",
          ehloResponse: ["250-mailhog", "250-SIZE 0", "250 AUTH"],
          startTlsAvailable: false,
        },
      });

      const { results } = await getMonitorResults(ctx, monitor.id);
      expect(results[0].metadata.banner).toContain("ESMTP");
    });
  });

  describe("Email Auth Monitor", () => {
    it("stores email auth config correctly", async () => {
      const monitor = await createMonitor(ctx, {
        name: `Email Auth Config Test ${randomUUID().slice(0, 8)}`,
        url: "email-auth://example.com",
        type: "email_auth",
        config: {
          emailAuth: {
            domain: "example.com",
            dkimSelectors: ["default", "google"],
            validatePolicy: true,
          },
        },
      });

      const fetchedMonitor = await getMonitorById(monitor.id);
      expect(fetchedMonitor!.config.emailAuth.domain).toBe("example.com");
      expect(fetchedMonitor!.config.emailAuth.dkimSelectors).toContain("default");
    });

    it("stores email auth details in results", async () => {
      const monitor = await createMonitor(ctx, {
        name: `Email Auth Results Test ${randomUUID().slice(0, 8)}`,
        url: "email-auth://example.com",
        type: "email_auth",
        config: {
          emailAuth: { domain: "example.com", dkimSelectors: ["default"] },
        },
      });

      await insertCheckResultFull(monitor.id, {
        status: "success",
        responseTimeMs: 500,
        emailAuthDetails: {
          domain: "example.com",
          spf: { valid: true, record: "v=spf1 include:_spf.google.com ~all" },
          dkim: { valid: true, selectors: ["default"] },
          dmarc: { valid: true, policy: "reject" },
          overallScore: 95,
        },
      });

      const { results } = await getMonitorResults(ctx, monitor.id);
      expect(results[0].emailAuthDetails).toBeDefined();
      expect(results[0].emailAuthDetails.spf.valid).toBe(true);
      expect(results[0].emailAuthDetails.dmarc.policy).toBe("reject");
      expect(results[0].emailAuthDetails.overallScore).toBe(95);
    });
  });

  describe("Protocol Monitors", () => {
    it("stores SSH config and banner in results", async () => {
      const monitor = await createMonitor(ctx, {
        name: `SSH Config Test ${randomUUID().slice(0, 8)}`,
        url: `ssh://${TEST_SERVICES.OPENSSH_HOST}:${TEST_SERVICES.OPENSSH_PORT}`,
        type: "ssh",
        config: {
          protocol: {
            host: TEST_SERVICES.OPENSSH_HOST,
            port: TEST_SERVICES.OPENSSH_PORT,
            expectBanner: "SSH-2.0",
          },
        },
      });

      await insertCheckResultFull(monitor.id, {
        status: "success",
        responseTimeMs: 50,
        metadata: {
          banner: "SSH-2.0-OpenSSH_8.4",
          keyExchangeAlgorithms: ["curve25519-sha256"],
        },
      });

      const { results } = await getMonitorResults(ctx, monitor.id);
      expect(results[0].metadata.banner).toContain("SSH-2.0");
    });

    it("stores LDAP config and results", async () => {
      const monitor = await createMonitor(ctx, {
        name: `LDAP Config Test ${randomUUID().slice(0, 8)}`,
        url: TEST_SERVICES.OPENLDAP_URL,
        type: "ldap",
        config: {
          protocol: {
            host: TEST_SERVICES.OPENLDAP_HOST,
            port: TEST_SERVICES.OPENLDAP_PORT,
            ldapBaseDn: TEST_SERVICES.OPENLDAP_BASE_DN,
          },
        },
      });

      await insertCheckResultFull(monitor.id, {
        status: "success",
        responseTimeMs: 30,
        metadata: {
          bindSuccess: true,
          supportedControls: ["1.3.6.1.4.1.4203.1.9.1.1"],
        },
      });

      const { results } = await getMonitorResults(ctx, monitor.id);
      expect(results[0].metadata.bindSuccess).toBe(true);
    });
  });

  describe("Message Broker Monitors", () => {
    it("stores MQTT config correctly", async () => {
      const monitor = await createMonitor(ctx, {
        name: `MQTT Config Test ${randomUUID().slice(0, 8)}`,
        url: TEST_SERVICES.MOSQUITTO_URL,
        type: "mqtt",
        config: {
          broker: {
            topic: "health/status",
            tls: false,
            qos: 1,
          },
        },
      });

      const fetchedMonitor = await getMonitorById(monitor.id);
      expect(fetchedMonitor!.config.broker.topic).toBe("health/status");
    });

    it("stores AMQP config correctly", async () => {
      const monitor = await createMonitor(ctx, {
        name: `AMQP Config Test ${randomUUID().slice(0, 8)}`,
        url: TEST_SERVICES.RABBITMQ_URL,
        type: "amqp",
        config: {
          broker: {
            queue: "health-check",
            vhost: "/",
            username: TEST_SERVICES.RABBITMQ_USER,
            password: TEST_SERVICES.RABBITMQ_PASS,
          },
        },
      });

      const fetchedMonitor = await getMonitorById(monitor.id);
      expect(fetchedMonitor!.config.broker.queue).toBe("health-check");
      expect(fetchedMonitor!.config.broker.vhost).toBe("/");
    });
  });

  describe("Traceroute Monitor", () => {
    it("stores traceroute config correctly", async () => {
      const monitor = await createMonitor(ctx, {
        name: `Traceroute Config Test ${randomUUID().slice(0, 8)}`,
        url: "traceroute://example.com",
        type: "traceroute",
        config: {
          traceroute: {
            maxHops: 15,
            protocol: "icmp",
            packetSize: 64,
          },
        },
      });

      const fetchedMonitor = await getMonitorById(monitor.id);
      expect(fetchedMonitor!.config.traceroute.maxHops).toBe(15);
      expect(fetchedMonitor!.config.traceroute.protocol).toBe("icmp");
    });

    it("stores hop data in metadata", async () => {
      const monitor = await createMonitor(ctx, {
        name: `Traceroute Hops Test ${randomUUID().slice(0, 8)}`,
        url: "traceroute://example.com",
        type: "traceroute",
        config: getTestConfigForMonitorType("traceroute"),
      });

      await insertCheckResultFull(monitor.id, {
        status: "success",
        responseTimeMs: 500,
        metadata: {
          destination: "93.184.216.34",
          totalHops: 10,
          hops: [
            { hop: 1, ip: "192.168.1.1", hostname: "router.local", rtt: [1.2, 1.5, 1.3] },
            { hop: 2, ip: "10.0.0.1", hostname: "isp-gateway", rtt: [5.0, 4.8, 5.2] },
            { hop: 10, ip: "93.184.216.34", hostname: "example.com", rtt: [50.0, 49.5, 51.0] },
          ],
        },
      });

      const { results } = await getMonitorResults(ctx, monitor.id);
      expect(results[0].metadata.totalHops).toBe(10);
      expect(results[0].metadata.hops.length).toBe(3);
      expect(results[0].metadata.hops[0].hostname).toBe("router.local");
    });
  });

  describe("Prometheus Monitors", () => {
    it("stores Prometheus blackbox config", async () => {
      const monitor = await createMonitor(ctx, {
        name: `Prometheus Blackbox Test ${randomUUID().slice(0, 8)}`,
        url: "blackbox://example.com",
        type: "prometheus_blackbox",
        config: {
          prometheus: {
            exporterUrl: "http://blackbox-exporter:9115/probe",
            module: "http_2xx",
            timeoutSeconds: 10,
          },
        },
      });

      const fetchedMonitor = await getMonitorById(monitor.id);
      expect(fetchedMonitor!.config.prometheus.module).toBe("http_2xx");
    });

    it("stores PromQL config and results", async () => {
      const monitor = await createMonitor(ctx, {
        name: `PromQL Test ${randomUUID().slice(0, 8)}`,
        url: "promql://prometheus.local",
        type: "prometheus_promql",
        config: {
          prometheus: {
            prometheusUrl: "http://prometheus:9090",
            promql: {
              query: 'avg(up{job="api"})',
              lookbackSeconds: 300,
              stepSeconds: 60,
            },
            thresholds: {
              degraded: 0.99,
              down: 0.95,
              comparison: "gte",
            },
          },
        },
      });

      await insertCheckResultFull(monitor.id, {
        status: "success",
        responseTimeMs: 100,
        metadata: {
          query: 'avg(up{job="api"})',
          value: 1.0,
          thresholdMet: true,
          samples: 5,
        },
      });

      const { results } = await getMonitorResults(ctx, monitor.id);
      expect(results[0].metadata.value).toBe(1.0);
      expect(results[0].metadata.thresholdMet).toBe(true);
    });
  });

  describe("WebSocket Monitor", () => {
    it("stores WebSocket config correctly", async () => {
      const monitor = await createMonitor(ctx, {
        name: `WebSocket Config Test ${randomUUID().slice(0, 8)}`,
        url: TEST_SERVICES.WS_ECHO_URL,
        type: "websocket",
        config: {
          websocket: {
            sendMessage: "ping",
            expectMessage: "ping",
            closeTimeout: 5000,
          },
        },
      });

      const fetchedMonitor = await getMonitorById(monitor.id);
      expect(fetchedMonitor!.config.websocket.sendMessage).toBe("ping");
      expect(fetchedMonitor!.config.websocket.expectMessage).toBe("ping");
    });

    it("stores WebSocket connection results", async () => {
      const monitor = await createMonitor(ctx, {
        name: `WebSocket Results Test ${randomUUID().slice(0, 8)}`,
        url: TEST_SERVICES.WS_ECHO_URL,
        type: "websocket",
        config: getTestConfigForMonitorType("websocket"),
      });

      await insertCheckResultFull(monitor.id, {
        status: "success",
        responseTimeMs: 25,
        metadata: {
          connected: true,
          messageSent: "ping",
          messageReceived: "ping",
          latencyMs: 5,
        },
      });

      const { results } = await getMonitorResults(ctx, monitor.id);
      expect(results[0].metadata.connected).toBe(true);
      expect(results[0].metadata.messageReceived).toBe("ping");
    });
  });

  describe("gRPC Monitor", () => {
    it("stores gRPC config correctly", async () => {
      const monitor = await createMonitor(ctx, {
        name: `gRPC Config Test ${randomUUID().slice(0, 8)}`,
        url: "grpc://grpc-service.local:50051",
        type: "grpc",
        config: {
          grpc: {
            service: "helloworld.Greeter",
            method: "SayHello",
            tls: true,
            timeout: 5000,
          },
        },
      });

      const fetchedMonitor = await getMonitorById(monitor.id);
      expect(fetchedMonitor!.config.grpc.service).toBe("helloworld.Greeter");
      expect(fetchedMonitor!.config.grpc.method).toBe("SayHello");
    });

    it("stores gRPC results with metadata", async () => {
      const monitor = await createMonitor(ctx, {
        name: `gRPC Results Test ${randomUUID().slice(0, 8)}`,
        url: "grpc://grpc-service.local:50051",
        type: "grpc",
        config: {
          grpc: { service: "health.Health", method: "Check", tls: false },
        },
      });

      await insertCheckResultFull(monitor.id, {
        status: "success",
        responseTimeMs: 15,
        metadata: {
          grpcStatus: "OK",
          grpcMessage: "",
          responseSize: 24,
        },
      });

      const { results } = await getMonitorResults(ctx, monitor.id);
      expect(results[0].metadata.grpcStatus).toBe("OK");
    });
  });

  describe("PageSpeed and Web Vitals Storage", () => {
    it("stores PageSpeed scores in check results", async () => {
      const monitor = await createMonitor(ctx, {
        name: `PageSpeed Test ${randomUUID().slice(0, 8)}`,
        url: `${TEST_SERVICES.HTTPBIN_URL}/html`,
        type: "https",
        config: getTestConfigForMonitorType("https"),
      });

      await insertCheckResultFull(monitor.id, {
        status: "success",
        responseTimeMs: 200,
        statusCode: 200,
        pagespeedScores: {
          performance: 85,
          accessibility: 92,
          bestPractices: 88,
          seo: 90,
        },
      });

      const { results } = await getMonitorResults(ctx, monitor.id);
      expect(results[0].pagespeedScores).toBeDefined();
      expect(results[0].pagespeedScores.performance).toBe(85);
      expect(results[0].pagespeedScores.accessibility).toBe(92);
    });

    it("stores Web Vitals in check results", async () => {
      const monitor = await createMonitor(ctx, {
        name: `Web Vitals Test ${randomUUID().slice(0, 8)}`,
        url: `${TEST_SERVICES.HTTPBIN_URL}/html`,
        type: "https",
        config: getTestConfigForMonitorType("https"),
      });

      await insertCheckResultFull(monitor.id, {
        status: "success",
        responseTimeMs: 200,
        statusCode: 200,
        webVitals: {
          lcp: 2500, // Largest Contentful Paint (ms)
          fid: 100, // First Input Delay (ms)
          cls: 0.1, // Cumulative Layout Shift
          fcp: 1800, // First Contentful Paint (ms)
          ttfb: 200, // Time to First Byte (ms)
          inp: 200, // Interaction to Next Paint (ms)
          si: 3000, // Speed Index (ms)
          tbt: 150, // Total Blocking Time (ms)
        },
      });

      const { results } = await getMonitorResults(ctx, monitor.id);
      expect(results[0].webVitals).toBeDefined();
      expect(results[0].webVitals.lcp).toBe(2500);
      expect(results[0].webVitals.cls).toBe(0.1);
    });
  });

  describe("Security Headers Storage", () => {
    it("stores security headers analysis in check results", async () => {
      const monitor = await createMonitor(ctx, {
        name: `Security Headers Test ${randomUUID().slice(0, 8)}`,
        url: `${TEST_SERVICES.HTTPBIN_URL}/get`,
        type: "https",
        config: getTestConfigForMonitorType("https"),
      });

      await insertCheckResultFull(monitor.id, {
        status: "success",
        responseTimeMs: 150,
        statusCode: 200,
        securityHeaders: {
          overallScore: 75,
          grade: "B",
          headers: {
            "strict-transport-security": { present: true, value: "max-age=31536000" },
            "content-security-policy": { present: true, value: "default-src 'self'" },
            "x-frame-options": { present: true, value: "DENY" },
            "x-content-type-options": { present: true, value: "nosniff" },
            "x-xss-protection": { present: false },
            "referrer-policy": { present: true, value: "strict-origin-when-cross-origin" },
          },
        },
      });

      const { results } = await getMonitorResults(ctx, monitor.id);
      expect(results[0].securityHeaders).toBeDefined();
      expect(results[0].securityHeaders.grade).toBe("B");
      expect(results[0].securityHeaders.overallScore).toBe(75);
      expect(results[0].securityHeaders.headers["x-frame-options"].present).toBe(true);
    });
  });
});
