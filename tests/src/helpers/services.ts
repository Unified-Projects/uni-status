/**
 * Test Services Configuration
 *
 * Contains URLs and connection details for all test target services
 * running in the Docker Compose test environment.
 */

export const TEST_SERVICES = {
  // HTTP/HTTPS Testing
  HTTPBIN_URL: "http://uni-status-httpbin-test:80",
  HTTPBIN_HOST: "uni-status-httpbin-test",
  HTTPBIN_PORT: 80,

  // SSL/HTTPS Testing (nginx with self-signed cert)
  NGINX_SSL_URL: "https://uni-status-nginx-ssl-test:443",
  NGINX_SSL_HOST: "uni-status-nginx-ssl-test",
  NGINX_SSL_PORT: 443,
  NGINX_HTTP_URL: "http://uni-status-nginx-ssl-test:80",
  NGINX_HTTP_PORT: 80,

  // TCP Echo Server
  TCP_ECHO_HOST: "uni-status-tcp-echo-test",
  TCP_ECHO_PORT: 9000,
  TCP_ECHO_URL: "tcp://uni-status-tcp-echo-test:9000",

  // WebSocket Echo Server
  WS_ECHO_URL: "ws://uni-status-ws-echo-test:8080",
  WS_ECHO_HOST: "uni-status-ws-echo-test",
  WS_ECHO_PORT: 8080,

  // RabbitMQ (AMQP)
  // Use service name for DNS resolution within Docker network
  RABBITMQ_HOST: "rabbitmq",
  RABBITMQ_PORT: 5672,
  RABBITMQ_MANAGEMENT_PORT: 15672,
  RABBITMQ_URL: "amqp://test:test@rabbitmq:5672",
  RABBITMQ_USER: "test",
  RABBITMQ_PASS: "test",

  // Mosquitto (MQTT)
  // Use service name for DNS resolution within Docker network
  MOSQUITTO_HOST: "mosquitto",
  MOSQUITTO_PORT: 1883,
  MOSQUITTO_URL: "mqtt://mosquitto:1883",

  // OpenSSH Server
  OPENSSH_HOST: "uni-status-openssh-test",
  OPENSSH_PORT: 2222,
  OPENSSH_URL: "ssh://uni-status-openssh-test:2222",
  OPENSSH_USER: "testuser",
  OPENSSH_PASS: "testpass",

  // OpenLDAP Server
  OPENLDAP_HOST: "uni-status-openldap-test",
  OPENLDAP_PORT: 389,
  OPENLDAP_URL: "ldap://uni-status-openldap-test:389",
  OPENLDAP_BASE_DN: "dc=test,dc=local",
  OPENLDAP_ADMIN_DN: "cn=admin,dc=test,dc=local",
  OPENLDAP_ADMIN_PASS: "admin",

  // MailHog (SMTP)
  MAILHOG_HOST: "uni-status-mailhog-test",
  MAILHOG_SMTP_PORT: 1025,
  MAILHOG_HTTP_PORT: 8025,
  MAILHOG_SMTP_URL: "smtp://uni-status-mailhog-test:1025",

  // Internal Services
  POSTGRES_HOST: "postgres",
  POSTGRES_PORT: 5432,
  REDIS_HOST: "redis",
  REDIS_PORT: 6379,
} as const;

/**
 * Monitor type to test service URL mapping
 * Returns appropriate test target URLs for each monitor type
 */
export function getTestUrlForMonitorType(
  type: string,
  options?: { path?: string; timeout?: boolean }
): string {
  const path = options?.path ?? "";

  switch (type) {
    case "http":
      return `${TEST_SERVICES.HTTPBIN_URL}/get${path}`;
    case "https":
      return `${TEST_SERVICES.NGINX_SSL_URL}${path || "/"}`;
    case "ssl":
      return TEST_SERVICES.NGINX_SSL_URL;
    case "tcp":
      return TEST_SERVICES.TCP_ECHO_URL;
    case "websocket":
      return TEST_SERVICES.WS_ECHO_URL;
    case "smtp":
      return TEST_SERVICES.MAILHOG_SMTP_URL;
    case "mqtt":
      return TEST_SERVICES.MOSQUITTO_URL;
    case "amqp":
      return TEST_SERVICES.RABBITMQ_URL;
    case "ssh":
      return TEST_SERVICES.OPENSSH_URL;
    case "ldap":
      return TEST_SERVICES.OPENLDAP_URL;
    case "ping":
      return `ping://${TEST_SERVICES.HTTPBIN_HOST}`;
    case "dns":
      return "example.com";
    case "heartbeat":
      return "heartbeat://test-service";
    case "database_postgres":
      return `postgres://${TEST_SERVICES.POSTGRES_HOST}:${TEST_SERVICES.POSTGRES_PORT}/uni_status`;
    case "database_redis":
      return `redis://${TEST_SERVICES.REDIS_HOST}:${TEST_SERVICES.REDIS_PORT}`;
    default:
      return `${TEST_SERVICES.HTTPBIN_URL}/get`;
  }
}

/**
 * Get test configuration for a specific monitor type
 * Returns type-specific config objects for creating monitors
 */
export function getTestConfigForMonitorType(type: string): Record<string, unknown> {
  switch (type) {
    case "http":
      return {
        http: {
          cache: { requireCacheControl: false },
        },
      };
    case "https":
      return {
        ssl: {
          checkChain: false, // Self-signed cert
          checkHostname: false,
          expiryWarningDays: 30,
        },
        http: {},
      };
    case "ssl":
      return {
        ssl: {
          checkChain: false,
          checkHostname: false,
          expiryWarningDays: 30,
          expiryErrorDays: 7,
        },
      };
    case "dns":
      return {
        dns: {
          recordType: "A",
          nameserver: "8.8.8.8",
        },
      };
    case "tcp":
      return {};
    case "websocket":
      return {
        websocket: {
          sendMessage: "ping",
          expectMessage: "ping", // Echo server returns same message
          closeTimeout: 5000,
        },
      };
    case "smtp":
      return {
        emailServer: {
          host: TEST_SERVICES.MAILHOG_HOST,
          port: TEST_SERVICES.MAILHOG_SMTP_PORT,
          starttls: false,
        },
      };
    case "imap":
      return {
        emailServer: {
          host: TEST_SERVICES.MAILHOG_HOST,
          port: 143,
          tls: false,
        },
      };
    case "pop3":
      return {
        emailServer: {
          host: TEST_SERVICES.MAILHOG_HOST,
          port: 110,
          tls: false,
        },
      };
    case "mqtt":
      return {
        broker: {
          host: TEST_SERVICES.MOSQUITTO_HOST,
          port: TEST_SERVICES.MOSQUITTO_PORT,
          topic: "test/health",
          tls: false,
        },
      };
    case "amqp":
      return {
        broker: {
          host: TEST_SERVICES.RABBITMQ_HOST,
          port: TEST_SERVICES.RABBITMQ_PORT,
          // Don't specify a queue - just test connection
          // If a queue is specified, it must exist or the check will fail
          vhost: "/",
          username: TEST_SERVICES.RABBITMQ_USER,
          password: TEST_SERVICES.RABBITMQ_PASS,
        },
      };
    case "ssh":
      return {
        protocol: {
          host: TEST_SERVICES.OPENSSH_HOST,
          port: TEST_SERVICES.OPENSSH_PORT,
          username: TEST_SERVICES.OPENSSH_USER,
          password: TEST_SERVICES.OPENSSH_PASS,
          expectBanner: "SSH-2.0",
        },
      };
    case "ldap":
      return {
        protocol: {
          host: TEST_SERVICES.OPENLDAP_HOST,
          port: TEST_SERVICES.OPENLDAP_PORT,
          ldapBaseDn: TEST_SERVICES.OPENLDAP_BASE_DN,
        },
      };
    case "heartbeat":
      return {
        heartbeat: {
          expectedInterval: 60,
          gracePeriod: 30,
          timezone: "UTC",
        },
      };
    case "database_postgres":
      return {
        database: {
          host: TEST_SERVICES.POSTGRES_HOST,
          port: TEST_SERVICES.POSTGRES_PORT,
          database: "uni_status",
          username: "uni_status",
          password: "uni_status_dev",
          query: "SELECT 1",
        },
      };
    case "database_redis":
      return {
        database: {
          host: TEST_SERVICES.REDIS_HOST,
          port: TEST_SERVICES.REDIS_PORT,
        },
      };
    case "traceroute":
      return {
        traceroute: {
          maxHops: 10,
          protocol: "icmp",
        },
      };
    case "prometheus_blackbox":
      return {
        prometheus: {
          exporterUrl: `${TEST_SERVICES.HTTPBIN_URL}/get`,
          module: "http_2xx",
          timeoutSeconds: 10,
        },
      };
    case "prometheus_promql":
      return {
        prometheus: {
          prometheusUrl: TEST_SERVICES.HTTPBIN_URL,
          promql: {
            query: "up",
            lookbackSeconds: 60,
            stepSeconds: 15,
          },
          thresholds: {
            degraded: 0.99,
            comparison: "gte",
          },
        },
      };
    default:
      return {};
  }
}

/**
 * Sleep utility for async operations
 */
export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
