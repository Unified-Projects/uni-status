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
  config?: Record<string, unknown>;
  regions?: string[];
};

type ExternalMonitorFixture = {
  type: string;
  payload: MonitorPayload;
  configKey: string;
  validate?: (data: any) => void;
};

const uniqueSuffix = randomUUID().slice(0, 8);

const withDefaults = (
  type: string,
  url: string,
  extras: Partial<MonitorPayload> = {}
): MonitorPayload => ({
  name: `${type.toUpperCase()} Monitor ${uniqueSuffix}`,
  url,
  type,
  method: "GET",
  intervalSeconds: 300,
  timeoutMs: 30000,
  ...extras,
});

// External monitor type fixtures
const externalMonitorFixtures: ExternalMonitorFixture[] = [
  {
    type: "external_aws",
    payload: withDefaults("external_aws", "external://aws.amazon.com/health", {
      config: {
        externalStatus: {
          pollIntervalSeconds: 300,
          aws: {
            regions: ["us-east-1", "us-west-2"],
            services: ["ec2", "s3", "lambda"],
          },
        },
      },
    }),
    configKey: "externalStatus",
    validate: (data) => {
      expect(data.config?.externalStatus?.aws?.regions).toContain("us-east-1");
      expect(data.config?.externalStatus?.aws?.services).toContain("ec2");
    },
  },
  {
    type: "external_gcp",
    payload: withDefaults("external_gcp", "external://status.cloud.google.com", {
      config: {
        externalStatus: {
          pollIntervalSeconds: 300,
          gcp: {
            products: ["compute-engine", "cloud-storage", "cloud-functions"],
          },
        },
      },
    }),
    configKey: "externalStatus",
    validate: (data) => {
      expect(data.config?.externalStatus?.gcp?.products).toContain("compute-engine");
    },
  },
  {
    type: "external_azure",
    payload: withDefaults("external_azure", "external://status.azure.com", {
      config: {
        externalStatus: {
          pollIntervalSeconds: 300,
          azure: {
            regions: ["eastus", "westus2"],
            services: ["virtual-machines", "storage-accounts"],
          },
        },
      },
    }),
    configKey: "externalStatus",
    validate: (data) => {
      expect(data.config?.externalStatus?.azure?.services).toContain("virtual-machines");
    },
  },
  {
    type: "external_cloudflare",
    payload: withDefaults("external_cloudflare", "external://www.cloudflarestatus.com", {
      config: {
        externalStatus: {
          pollIntervalSeconds: 300,
          cloudflare: {
            components: ["cdn", "dns"],
          },
        },
      },
    }),
    configKey: "externalStatus",
  },
  {
    type: "external_okta",
    payload: withDefaults("external_okta", "external://status.okta.com", {
      config: {
        externalStatus: {
          pollIntervalSeconds: 300,
          okta: {
            cell: "OK1",
          },
        },
      },
    }),
    configKey: "externalStatus",
  },
  {
    type: "external_auth0",
    payload: withDefaults("external_auth0", "external://status.auth0.com", {
      config: {
        externalStatus: {
          pollIntervalSeconds: 300,
          auth0: {
            region: "us",
          },
        },
      },
    }),
    configKey: "externalStatus",
  },
  {
    type: "external_stripe",
    payload: withDefaults("external_stripe", "external://status.stripe.com", {
      config: {
        externalStatus: {
          pollIntervalSeconds: 300,
          stripe: {
            components: ["api", "dashboard"],
          },
        },
      },
    }),
    configKey: "externalStatus",
  },
  {
    type: "external_twilio",
    payload: withDefaults("external_twilio", "external://status.twilio.com", {
      config: {
        externalStatus: {
          pollIntervalSeconds: 300,
          twilio: {
            components: ["programmable-sms", "programmable-voice"],
          },
        },
      },
    }),
    configKey: "externalStatus",
  },
  {
    type: "external_statuspage",
    payload: withDefaults("external_statuspage", "external://status.example.com", {
      config: {
        externalStatus: {
          pollIntervalSeconds: 300,
          statuspage: {
            baseUrl: "https://status.stripe.com",
            components: ["api"],
          },
        },
      },
    }),
    configKey: "externalStatus",
    validate: (data) => {
      expect(data.config?.externalStatus?.statuspage?.baseUrl).toBe("https://status.stripe.com");
    },
  },
  {
    type: "external_custom",
    payload: withDefaults("external_custom", "external://custom.example.com", {
      config: {
        externalStatus: {
          pollIntervalSeconds: 300,
          custom: {
            statusUrl: "https://api.example.com/status",
            jsonPath: "$.status",
            statusMapping: {
              "ok": "operational",
              "degraded": "degraded",
              "down": "major_outage",
            },
          },
        },
      },
    }),
    configKey: "externalStatus",
    validate: (data) => {
      expect(data.config?.externalStatus?.custom?.statusUrl).toBe("https://api.example.com/status");
      expect(data.config?.externalStatus?.custom?.jsonPath).toBe("$.status");
    },
  },
];

describe("External Monitor Types API", () => {
  let ctx: TestContext;
  const createdMonitors: Record<string, { id: string }> = {};

  beforeAll(async () => {
    ctx = await bootstrapTestContext();
  });

  afterAll(async () => {
    // Cleanup created monitors
    for (const [type, monitor] of Object.entries(createdMonitors)) {
      try {
        await fetch(`${API_BASE_URL}/api/v1/monitors/${monitor.id}`, {
          method: "DELETE",
          headers: ctx.headers,
        });
      } catch (e) {
        // Ignore cleanup errors
      }
    }
  });

  describe("Monitor Creation", () => {
    it.each(externalMonitorFixtures)(
      "creates a $type monitor with expected config",
      async ({ type, payload, configKey, validate }) => {
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

        // Verify config key exists
        const config = body.data.config as Record<string, unknown> | undefined;
        expect(config?.[configKey]).toBeDefined();

        // Run custom validation if provided
        validate?.(body.data);
      }
    );
  });

  describe("Monitor Retrieval", () => {
    it("lists all external monitors", async () => {
      const response = await fetch(`${API_BASE_URL}/api/v1/monitors`, {
        headers: ctx.headers,
      });

      expect(response.status).toBe(200);
      const body = await response.json();
      expect(body.success).toBe(true);

      const externalMonitors = body.data.filter((m: any) => m.type.startsWith("external_"));
      expect(externalMonitors.length).toBeGreaterThanOrEqual(externalMonitorFixtures.length);
    });

    it.each(externalMonitorFixtures)(
      "retrieves $type monitor by id with full config",
      async ({ type }) => {
        const monitor = createdMonitors[type];
        if (!monitor) {
          throw new Error(`Monitor for type ${type} was not created`);
        }

        const response = await fetch(`${API_BASE_URL}/api/v1/monitors/${monitor.id}`, {
          headers: ctx.headers,
        });

        expect(response.status).toBe(200);
        const body = await response.json();
        expect(body.success).toBe(true);
        expect(body.data.type).toBe(type);
        expect(body.data.config?.externalStatus).toBeDefined();
      }
    );
  });

  describe("Monitor Updates", () => {
    it("updates external_statuspage monitor config", async () => {
      const monitor = createdMonitors["external_statuspage"];
      if (!monitor) {
        throw new Error("external_statuspage monitor was not created");
      }

      const updatePayload = {
        config: {
          externalStatus: {
            pollIntervalSeconds: 600,
            statuspage: {
              baseUrl: "https://status.github.com",
              components: ["git-operations", "api-requests"],
            },
          },
        },
      };

      const response = await fetch(`${API_BASE_URL}/api/v1/monitors/${monitor.id}`, {
        method: "PATCH",
        headers: ctx.headers,
        body: JSON.stringify(updatePayload),
      });

      expect(response.status).toBe(200);
      const body = await response.json();
      expect(body.success).toBe(true);
      expect(body.data.config?.externalStatus?.statuspage?.baseUrl).toBe("https://status.github.com");
      expect(body.data.config?.externalStatus?.pollIntervalSeconds).toBe(600);
    });

    it("updates external_aws regions and services", async () => {
      const monitor = createdMonitors["external_aws"];
      if (!monitor) {
        throw new Error("external_aws monitor was not created");
      }

      const updatePayload = {
        config: {
          externalStatus: {
            pollIntervalSeconds: 300,
            aws: {
              regions: ["eu-west-1", "ap-southeast-1"],
              services: ["rds", "dynamodb"],
            },
          },
        },
      };

      const response = await fetch(`${API_BASE_URL}/api/v1/monitors/${monitor.id}`, {
        method: "PATCH",
        headers: ctx.headers,
        body: JSON.stringify(updatePayload),
      });

      expect(response.status).toBe(200);
      const body = await response.json();
      expect(body.success).toBe(true);
      expect(body.data.config?.externalStatus?.aws?.regions).toContain("eu-west-1");
      expect(body.data.config?.externalStatus?.aws?.services).toContain("dynamodb");
    });

    it("updates external_custom status mapping", async () => {
      const monitor = createdMonitors["external_custom"];
      if (!monitor) {
        throw new Error("external_custom monitor was not created");
      }

      const updatePayload = {
        config: {
          externalStatus: {
            pollIntervalSeconds: 180,
            custom: {
              statusUrl: "https://api.newservice.com/health",
              jsonPath: "$.data.status",
              statusMapping: {
                "healthy": "operational",
                "warning": "degraded",
                "critical": "major_outage",
                "maintenance": "maintenance",
              },
            },
          },
        },
      };

      const response = await fetch(`${API_BASE_URL}/api/v1/monitors/${monitor.id}`, {
        method: "PATCH",
        headers: ctx.headers,
        body: JSON.stringify(updatePayload),
      });

      expect(response.status).toBe(200);
      const body = await response.json();
      expect(body.success).toBe(true);
      expect(body.data.config?.externalStatus?.custom?.statusUrl).toBe("https://api.newservice.com/health");
      expect(body.data.config?.externalStatus?.custom?.statusMapping?.healthy).toBe("operational");
    });
  });

  describe("Validation", () => {
    it("rejects external_statuspage without baseUrl", async () => {
      const invalidPayload = withDefaults("external_statuspage", "external://invalid.com", {
        config: {
          externalStatus: {
            pollIntervalSeconds: 300,
            statuspage: {
              // Missing required baseUrl
              components: ["api"],
            },
          },
        },
      });

      const response = await fetch(`${API_BASE_URL}/api/v1/monitors`, {
        method: "POST",
        headers: ctx.headers,
        body: JSON.stringify(invalidPayload),
      });

      expect(response.status).toBe(400);
    });

    it("rejects external_custom without statusUrl", async () => {
      const invalidPayload = withDefaults("external_custom", "external://invalid.com", {
        config: {
          externalStatus: {
            pollIntervalSeconds: 300,
            custom: {
              // Missing required statusUrl
              jsonPath: "$.status",
            },
          },
        },
      });

      const response = await fetch(`${API_BASE_URL}/api/v1/monitors`, {
        method: "POST",
        headers: ctx.headers,
        body: JSON.stringify(invalidPayload),
      });

      expect(response.status).toBe(400);
    });

    it("rejects poll interval below minimum (60s)", async () => {
      const invalidPayload = withDefaults("external_stripe", "external://status.stripe.com", {
        config: {
          externalStatus: {
            pollIntervalSeconds: 30, // Below minimum
          },
        },
      });

      const response = await fetch(`${API_BASE_URL}/api/v1/monitors`, {
        method: "POST",
        headers: ctx.headers,
        body: JSON.stringify(invalidPayload),
      });

      expect(response.status).toBe(400);
    });

    it("rejects poll interval above maximum (3600s)", async () => {
      const invalidPayload = withDefaults("external_stripe", "external://status.stripe.com", {
        config: {
          externalStatus: {
            pollIntervalSeconds: 7200, // Above maximum
          },
        },
      });

      const response = await fetch(`${API_BASE_URL}/api/v1/monitors`, {
        method: "POST",
        headers: ctx.headers,
        body: JSON.stringify(invalidPayload),
      });

      expect(response.status).toBe(400);
    });
  });

  describe("Statuspage.io Integration", () => {
    it("creates monitor for real statuspage.io page (Stripe)", async () => {
      const payload = withDefaults("external_statuspage", "external://status.stripe.com", {
        name: `Stripe Status Monitor ${uniqueSuffix}`,
        config: {
          externalStatus: {
            pollIntervalSeconds: 300,
            statuspage: {
              baseUrl: "https://status.stripe.com",
            },
          },
        },
      });

      const response = await fetch(`${API_BASE_URL}/api/v1/monitors`, {
        method: "POST",
        headers: ctx.headers,
        body: JSON.stringify(payload),
      });

      expect(response.status).toBe(201);
      const body = await response.json();
      expect(body.success).toBe(true);
      expect(body.data.config?.externalStatus?.statuspage?.baseUrl).toBe("https://status.stripe.com");

      // Store for cleanup
      createdMonitors["statuspage_stripe"] = { id: body.data.id };
    });

    it("creates monitor for GitHub status page", async () => {
      const payload = withDefaults("external_statuspage", "external://www.githubstatus.com", {
        name: `GitHub Status Monitor ${uniqueSuffix}`,
        config: {
          externalStatus: {
            pollIntervalSeconds: 300,
            statuspage: {
              baseUrl: "https://www.githubstatus.com",
            },
          },
        },
      });

      const response = await fetch(`${API_BASE_URL}/api/v1/monitors`, {
        method: "POST",
        headers: ctx.headers,
        body: JSON.stringify(payload),
      });

      expect(response.status).toBe(201);
      const body = await response.json();
      expect(body.success).toBe(true);
      expect(body.data.config?.externalStatus?.statuspage?.baseUrl).toBe("https://www.githubstatus.com");

      // Store for cleanup
      createdMonitors["statuspage_github"] = { id: body.data.id };
    });

    it("creates monitor for Atlassian status page", async () => {
      const payload = withDefaults("external_statuspage", "external://status.atlassian.com", {
        name: `Atlassian Status Monitor ${uniqueSuffix}`,
        config: {
          externalStatus: {
            pollIntervalSeconds: 300,
            statuspage: {
              baseUrl: "https://status.atlassian.com",
              components: ["Jira", "Confluence"],
            },
          },
        },
      });

      const response = await fetch(`${API_BASE_URL}/api/v1/monitors`, {
        method: "POST",
        headers: ctx.headers,
        body: JSON.stringify(payload),
      });

      expect(response.status).toBe(201);
      const body = await response.json();
      expect(body.success).toBe(true);

      // Store for cleanup
      createdMonitors["statuspage_atlassian"] = { id: body.data.id };
    });
  });

  describe("Monitor Deletion", () => {
    it("deletes external monitor", async () => {
      // Create a temporary monitor for deletion test
      const payload = withDefaults("external_cloudflare", "external://delete-test.com", {
        name: `Delete Test Monitor ${uniqueSuffix}`,
        config: {
          externalStatus: {
            pollIntervalSeconds: 300,
          },
        },
      });

      const createResponse = await fetch(`${API_BASE_URL}/api/v1/monitors`, {
        method: "POST",
        headers: ctx.headers,
        body: JSON.stringify(payload),
      });

      expect(createResponse.status).toBe(201);
      const createBody = await createResponse.json();
      const monitorId = createBody.data.id;

      // Delete the monitor
      const deleteResponse = await fetch(`${API_BASE_URL}/api/v1/monitors/${monitorId}`, {
        method: "DELETE",
        headers: ctx.headers,
      });

      expect(deleteResponse.status).toBe(200);

      // Verify deletion
      const getResponse = await fetch(`${API_BASE_URL}/api/v1/monitors/${monitorId}`, {
        headers: ctx.headers,
      });

      expect(getResponse.status).toBe(404);
    });
  });
});
