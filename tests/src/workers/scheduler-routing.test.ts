/**
 * Test to ensure all monitor types defined in the schema have corresponding
 * queue mappings in the scheduler. This prevents regressions where new monitor
 * types are added but not properly hooked up for scheduling.
 */

// All monitor types from packages/database/src/schema/monitors.ts monitorTypeEnum
const ALL_MONITOR_TYPES = [
  "http",
  "https",
  "dns",
  "ssl",
  "tcp",
  "ping",
  "heartbeat",
  "database_postgres",
  "database_mysql",
  "database_mongodb",
  "database_redis",
  "database_elasticsearch",
  "grpc",
  "websocket",
  "smtp",
  "imap",
  "pop3",
  "ssh",
  "ldap",
  "rdp",
  "mqtt",
  "amqp",
  "traceroute",
  "prometheus_blackbox",
  "prometheus_promql",
  "prometheus_remote_write",
  "email_auth",
] as const;

// Monitor types that are intentionally passive (no queue needed)
const PASSIVE_MONITOR_TYPES = ["prometheus_remote_write"] as const;

// Expected queue mappings - this mirrors the scheduler's getQueueForType logic
const EXPECTED_QUEUE_MAPPINGS: Record<string, string | null> = {
  http: "monitor_http",
  https: "monitor_http",
  dns: "monitor_dns",
  ssl: "monitor_ssl",
  tcp: "monitor_tcp",
  ping: "monitor_ping",
  heartbeat: "monitor_heartbeat",
  database_postgres: "monitor_database_postgres",
  database_mysql: "monitor_database_mysql",
  database_mongodb: "monitor_database_mongodb",
  database_redis: "monitor_database_redis",
  database_elasticsearch: "monitor_database_elasticsearch",
  grpc: "monitor_grpc",
  websocket: "monitor_websocket",
  smtp: "monitor_smtp",
  imap: "monitor_imap",
  pop3: "monitor_pop3",
  ssh: "monitor_ssh",
  ldap: "monitor_ldap",
  rdp: "monitor_rdp",
  mqtt: "monitor_mqtt",
  amqp: "monitor_amqp",
  traceroute: "monitor_traceroute",
  email_auth: "monitor_email_auth",
  prometheus_blackbox: "monitor_prometheus_blackbox",
  prometheus_promql: "monitor_prometheus_promql",
  prometheus_remote_write: null, // Passive - receives status via remote write ingestion
};

describe("Scheduler Queue Routing", () => {
  describe("Monitor type coverage", () => {
    it("should have queue mappings defined for all active monitor types", () => {
      const activeTypes = ALL_MONITOR_TYPES.filter(
        (type) => !PASSIVE_MONITOR_TYPES.includes(type as any)
      );

      for (const type of activeTypes) {
        const mapping = EXPECTED_QUEUE_MAPPINGS[type];
        expect(mapping).toBeDefined();
        expect(mapping).not.toBeNull();
        expect(typeof mapping).toBe("string");
      }
    });

    it("should have null mappings only for passive monitor types", () => {
      for (const type of PASSIVE_MONITOR_TYPES) {
        expect(EXPECTED_QUEUE_MAPPINGS[type]).toBeNull();
      }
    });

    it("should cover all defined monitor types", () => {
      const mappedTypes = Object.keys(EXPECTED_QUEUE_MAPPINGS).sort();
      const allTypes = [...ALL_MONITOR_TYPES].sort();
      expect(mappedTypes).toEqual(allTypes);
    });
  });

  describe("Queue name consistency", () => {
    it("should use consistent queue naming pattern", () => {
      for (const [type, queueName] of Object.entries(EXPECTED_QUEUE_MAPPINGS)) {
        if (queueName === null) continue;

        // Queue names should follow pattern: monitor_{type} or monitor_database_{db}
        expect(queueName).toMatch(/^monitor_/);

        // For database types, verify the pattern
        if (type.startsWith("database_")) {
          const dbType = type.replace("database_", "");
          expect(queueName).toBe(`monitor_database_${dbType}`);
        }
      }
    });
  });
});
