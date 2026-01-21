/**
 * Integration tests to verify monitor scheduling works correctly for all monitor types.
 * These tests create monitors and verify they can be scheduled for execution.
 */

import { bootstrapTestContext, TestContext } from "../helpers/context";
import { Client } from "pg";

const API_BASE_URL = process.env.API_BASE_URL ?? "http://api:3001";
const DEFAULT_DB_URL = "postgresql://uni_status:uni_status_dev@postgres:5432/uni_status?sslmode=disable";

// Monitor types that should be schedulable (all except passive types)
const SCHEDULABLE_MONITOR_TYPES = [
  { type: "http", url: "http://example.com" },
  { type: "https", url: "https://example.com" },
  { type: "dns", url: "example.com" },
  { type: "ssl", url: "https://example.com" },
  { type: "tcp", url: "tcp://example.com:80" },
  { type: "ping", url: "ping://example.com" },
  { type: "heartbeat", url: "heartbeat://service" },
  { type: "database_postgres", url: "postgres://localhost:5432" },
  { type: "database_mysql", url: "mysql://localhost:3306" },
  { type: "database_mongodb", url: "mongodb://localhost:27017" },
  { type: "database_redis", url: "redis://localhost:6379" },
  { type: "database_elasticsearch", url: "http://localhost:9200" },
  { type: "grpc", url: "grpc://localhost:50051" },
  { type: "websocket", url: "ws://localhost:8080" },
  { type: "smtp", url: "smtp://localhost:587" },
  { type: "imap", url: "imap://localhost:993" },
  { type: "pop3", url: "pop3://localhost:995" },
  { type: "ssh", url: "ssh://localhost:22" },
  { type: "ldap", url: "ldap://localhost:389" },
  { type: "rdp", url: "rdp://localhost:3389" },
  { type: "mqtt", url: "mqtt://localhost:1883" },
  { type: "amqp", url: "amqp://localhost:5672" },
  { type: "traceroute", url: "traceroute://example.com" },
  { type: "email_auth", url: "email-auth://example.com" },
  { type: "prometheus_blackbox", url: "blackbox://example.com" },
  { type: "prometheus_promql", url: "promql://example.com" },
] as const;

// Passive monitor types that receive data via ingestion, not scheduled checks
const PASSIVE_MONITOR_TYPES = [
  { type: "prometheus_remote_write", url: "prom-remote-write://example.com" },
] as const;

describe("Monitor Scheduling", () => {
  let ctx: TestContext;

  beforeAll(async () => {
    ctx = await bootstrapTestContext();
  });

  describe("Schedulable monitor types", () => {
    it.each(SCHEDULABLE_MONITOR_TYPES)(
      "creates $type monitor with nextCheckAt set",
      async ({ type, url }) => {
        const response = await fetch(`${API_BASE_URL}/api/v1/monitors`, {
          method: "POST",
          headers: ctx.headers,
          body: JSON.stringify({
            name: `Test ${type} Monitor`,
            url,
            type,
            method: "GET",
            intervalSeconds: 60,
          }),
        });

        expect(response.status).toBe(201);
        const body = await response.json();
        expect(body.success).toBe(true);

        const monitorId = body.data.id;

        // Verify the monitor was created with nextCheckAt
        const client = new Client({
          connectionString: process.env.DATABASE_URL ?? DEFAULT_DB_URL,
        });
        await client.connect();

        const result = await client.query<{ next_check_at: Date | null }>(
          `SELECT next_check_at FROM monitors WHERE id = $1`,
          [monitorId]
        );

        await client.end();

        expect(result.rows.length).toBe(1);
        expect(result.rows[0].next_check_at).not.toBeNull();
      }
    );
  });

  describe("Passive monitor types", () => {
    it.each(PASSIVE_MONITOR_TYPES)(
      "creates $type monitor (passive - receives data via ingestion)",
      async ({ type, url }) => {
        const response = await fetch(`${API_BASE_URL}/api/v1/monitors`, {
          method: "POST",
          headers: ctx.headers,
          body: JSON.stringify({
            name: `Test ${type} Monitor`,
            url,
            type,
            method: "GET",
            intervalSeconds: 60,
            config: {
              prometheus: {
                remoteWrite: { expectedSeries: ["up"] },
              },
            },
          }),
        });

        expect(response.status).toBe(201);
        const body = await response.json();
        expect(body.success).toBe(true);
      }
    );
  });

  describe("Traceroute specific validation", () => {
    it("creates traceroute monitor with proper configuration", async () => {
      const response = await fetch(`${API_BASE_URL}/api/v1/monitors`, {
        method: "POST",
        headers: ctx.headers,
        body: JSON.stringify({
          name: "Traceroute Test Monitor",
          url: "traceroute://example.com",
          type: "traceroute",
          method: "GET",
          intervalSeconds: 300,
          config: {
            traceroute: {
              maxHops: 30,
              protocol: "icmp",
            },
          },
        }),
      });

      expect(response.status).toBe(201);
      const body = await response.json();
      expect(body.success).toBe(true);
      expect(body.data.config?.traceroute?.maxHops).toBe(30);
    });
  });

  describe("Email auth specific validation", () => {
    it("creates email_auth monitor with proper configuration", async () => {
      const response = await fetch(`${API_BASE_URL}/api/v1/monitors`, {
        method: "POST",
        headers: ctx.headers,
        body: JSON.stringify({
          name: "Email Auth Test Monitor",
          url: "email-auth://example.com",
          type: "email_auth",
          method: "GET",
          intervalSeconds: 300,
          config: {
            emailAuth: {
              domain: "example.com",
              dkimSelectors: ["default", "s1"],
              validatePolicy: true,
            },
          },
        }),
      });

      expect(response.status).toBe(201);
      const body = await response.json();
      expect(body.success).toBe(true);
      expect(body.data.config?.emailAuth?.domain).toBe("example.com");
      expect(body.data.config?.emailAuth?.dkimSelectors).toEqual(["default", "s1"]);
    });
  });
});
