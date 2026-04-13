import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { bootstrapTestContext, TestContext } from "../helpers/context";
import { createMonitor } from "../helpers/data";
import { TEST_SERVICES, getTestConfigForMonitorType } from "../helpers/services";
import { triggerAndWaitForCheck } from "../helpers/worker-integration";

describe("Certificate Check Behavior", () => {
  let ctx: TestContext;

  beforeAll(async () => {
    ctx = await bootstrapTestContext();
  });

  afterAll(async () => {
    await ctx?.cleanup?.();
  });

  it("keeps regular HTTPS uptime checks separate from certificate results", async () => {
    const monitorId = await createMonitor(ctx, {
      type: "https",
      name: "HTTPS Uptime Check",
      url: TEST_SERVICES.NGINX_SSL_URL,
      timeoutMs: 15000,
      config: getTestConfigForMonitorType("https"),
    });

    const result = await triggerAndWaitForCheck(ctx, monitorId, {
      timeoutMs: 30000,
    });

    expect(result.status).toBe("success");
    expect(result.statusCode).toBe(200);
    expect(result.certificateInfo ?? null).toBeNull();
  });

  it("runs full certificate checks for SSL monitors", async () => {
    const monitorId = await createMonitor(ctx, {
      type: "ssl",
      name: "SSL Certificate Check",
      url: TEST_SERVICES.NGINX_SSL_URL,
      timeoutMs: 15000,
      config: getTestConfigForMonitorType("ssl"),
    });

    const result = await triggerAndWaitForCheck(ctx, monitorId, {
      timeoutMs: 30000,
      expectedStatus: "success",
    });

    expect(result.status).toBe("success");
    expect(result.certificateInfo).toBeDefined();
    expect(result.certificateInfo?.subject).toBeTruthy();
    expect(result.certificateInfo?.validTo).toBeTruthy();
  });

  it("does not attach certificate data for non-certificate monitor types", async () => {
    const monitorId = await createMonitor(ctx, {
      type: "http",
      name: "HTTP Monitor Without Certificate Check",
      url: `${TEST_SERVICES.HTTPBIN_URL}/get`,
      timeoutMs: 15000,
      config: getTestConfigForMonitorType("http"),
    });

    const result = await triggerAndWaitForCheck(ctx, monitorId, {
      timeoutMs: 30000,
    });

    expect(result.status).toBe("success");
    expect(result.statusCode).toBe(200);
    expect(result.certificateInfo ?? null).toBeNull();
  });

  it("preserves the HTTPS no-certificate-result behavior when ssl.enabled is false", async () => {
    const monitorId = await createMonitor(ctx, {
      type: "https",
      name: "HTTPS Monitor With Certificate Monitoring Disabled",
      url: TEST_SERVICES.NGINX_SSL_URL,
      timeoutMs: 15000,
      config: {
        ssl: {
          enabled: false,
          checkChain: false,
          checkHostname: false,
          expiryWarningDays: 30,
        },
        http: {},
      },
    });

    const result = await triggerAndWaitForCheck(ctx, monitorId, {
      timeoutMs: 30000,
    });

    expect(result.status).toBe("success");
    expect(result.statusCode).toBe(200);
    expect(result.certificateInfo ?? null).toBeNull();
  });
});
