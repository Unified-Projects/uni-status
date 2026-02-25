import { Job } from "bullmq";
import { nanoid } from "nanoid";
import { db } from "@uni-status/database";
import { monitors, checkResults, organizations } from "@uni-status/database/schema";
import { eq, desc } from "drizzle-orm";
import { publishEvent } from "../lib/redis";
import { evaluateAlerts } from "../lib/alert-evaluator";
import { linkCheckToActiveIncident } from "../lib/incident-linker";
import { fetchPageSpeedData, checkPageSpeedThresholds, checkWebVitalsThresholds, type PageSpeedScores, type WebVitals } from "../lib/pagespeed";
import { analyzeSecurityHeaders } from "../lib/security-headers";
import type { CheckStatus, SecurityHeadersAnalysis } from "@uni-status/shared/types";
import { createLogger } from "@uni-status/shared";

const log = createLogger({ module: "http-check" });


interface SyntheticStep {
  action: "goto" | "click" | "type" | "waitForSelector" | "waitForTimeout";
  target?: string;
  value?: string;
}

interface HttpCheckJob {
  monitorId: string;
  organizationId: string;
  url: string;
  method?: string;
  headers?: Record<string, string>;
  body?: string;
  timeoutMs: number;
  assertions?: {
    statusCode?: number[];
    responseTime?: number;
    headers?: Record<string, string>;
    body?: {
      contains?: string;
      notContains?: string;
      regex?: string;
    };
  };
  regions: string[];
  degradedThresholdMs?: number | null;
  config?: {
    pagespeed?: {
      enabled?: boolean;
      strategy?: "mobile" | "desktop" | "both";
      categories?: ("performance" | "accessibility" | "best-practices" | "seo")[];
      thresholds?: {
        performance?: number;
        accessibility?: number;
        bestPractices?: number;
        seo?: number;
      };
      webVitalsThresholds?: {
        lcp?: number;
        fid?: number;
        cls?: number;
      };
      intervalSeconds?: number;  // Run pagespeed independently, default 86400 (24 hours)
    };
    securityHeaders?: {
      enabled?: boolean;
      minScore?: number;
      checkHstsPreload?: boolean;
    };
    http?: {
      cache?: {
        requireCacheControl?: boolean;
        allowedCacheControl?: string[];
        requireEtag?: boolean;
        maxAgeSeconds?: number;
        allowNoStore?: boolean;
      };
      responseSize?: {
        warnBytes?: number;
        errorBytes?: number;
      };
      graphql?: {
        operations?: Array<{
          name?: string;
          type?: "query" | "mutation" | "introspection";
          query: string;
          variables?: Record<string, unknown>;
          expectErrors?: boolean;
          expectIntrospectionEnabled?: boolean;
          urlOverride?: string;
        }>;
      };
      apiFlows?: Array<{
        name?: string;
        method?: string;
        url?: string;
        headers?: Record<string, string>;
        body?: string;
        expectStatus?: number[];
        saveAs?: string;
        extract?: Array<{ path: string; name: string }>;
      }>;
      syntheticBrowser?: {
        enabled?: boolean;
        steps?: SyntheticStep[];
        screenshot?: boolean;
        visualRegression?: boolean;
        maxWaitMs?: number;
      };
      contract?: {
        enabled?: boolean;
        openapi?: Record<string, unknown>;
        operationId?: string;
        path?: string;
        method?: string;
        statusCode?: number;
        requiredFields?: Array<{ path: string; type?: "string" | "number" | "boolean" | "object" | "array" }>;
      };
    };
    cdn?: {
      edgeUrl?: string;
      originUrl: string;
      edgeHeaders?: Record<string, string>;
      originHeaders?: Record<string, string>;
      compareToleranceMs?: number;
      requireStatusMatch?: boolean;
    };
  };
  // Track when pagespeed was last run
  lastPagespeedAt?: Date | string | null;
}

interface TimingMetrics {
  dnsMs?: number;
  tcpMs?: number;
  tlsMs?: number;
  ttfbMs?: number;
  transferMs?: number;
}

export async function processHttpCheck(job: Job<HttpCheckJob>) {
  const {
    monitorId,
    organizationId,
    url,
    method = "GET",
    headers = {},
    body,
    timeoutMs,
    assertions,
    regions,
    degradedThresholdMs,
    config,
    lastPagespeedAt,
  } = job.data;

  const defaultRegion = process.env.MONITOR_DEFAULT_REGION || "uk";
  const preferredRegion = regions[0] || defaultRegion;
  const region = preferredRegion === "us-east" && defaultRegion !== "us-east"
    ? defaultRegion
    : preferredRegion;

  log.info(`Processing HTTP check for ${monitorId}: ${url}`);

  const startTime = performance.now();
  let status: CheckStatus = "success";
  let responseTimeMs = 0;
  let statusCode: number | undefined;
  let errorMessage: string | undefined;
  let errorCode: string | undefined;
  let responseHeaders: Record<string, string> | undefined;
  let timing: TimingMetrics = {};
  let pagespeedScores: PageSpeedScores | undefined;
  let webVitals: WebVitals | undefined;
  let pagespeedError: string | undefined;
  let pagespeedViolations: Array<{ category: string; score: number; threshold: number }> = [];
  let securityHeadersResult: SecurityHeadersAnalysis | undefined;
  let cdnMeta: Record<string, string> | undefined;
  let responseBodyText: string | undefined;
  let responseSizeBytes: number | undefined;
  let cacheIssues: string[] = [];
  let sizeIssues: string[] = [];
  let graphqlIssues: string[] = [];
  let apiFlowIssues: string[] = [];
  let syntheticIssues: string[] = [];
  let contractIssues: string[] = [];
  let visualRegressionDetected = false;
  let browserScreenshotHash: string | undefined;

  const applyIssue = (message: string, severity: "failure" | "degraded", code?: string) => {
    if (severity === "failure") {
      status = "failure";
    } else if (status === "success") {
      status = "degraded";
    }
    errorMessage = errorMessage ? `${errorMessage}; ${message}` : message;
    if (!errorCode && code) errorCode = code;
  };

  // Use the actual timeoutMs for abort - degradedThresholdMs only affects status marking, not request timeout
  // A request should only be aborted when it exceeds timeoutMs, not when it exceeds degradedThresholdMs
  const abortTimeoutMs = timeoutMs;

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), abortTimeoutMs);

    const response = await fetch(url, {
      method,
      headers,
      body: body || undefined,
      signal: controller.signal,
    });

    clearTimeout(timeout);

    responseTimeMs = Math.round(performance.now() - startTime);
    statusCode = response.status;

    // Get response headers
    responseHeaders = {};
    response.headers.forEach((value, key) => {
      responseHeaders![key] = value;
    });

    // Capture body and size for downstream checks
    try {
      const responseClone = response.clone();
      const bodyBuffer = await responseClone.arrayBuffer();
      responseSizeBytes = bodyBuffer.byteLength;
      responseBodyText = new TextDecoder().decode(bodyBuffer);
    } catch (bodyErr) {
      log.warn(`Failed to read response body for ${monitorId}:`, bodyErr);
    }

    // Check assertions
    if (assertions?.statusCode && !assertions.statusCode.includes(statusCode)) {
      status = "failure";
      errorMessage = `Expected status ${assertions.statusCode.join(" or ")}, got ${statusCode}`;
    }

    // Check for degraded status: prefer degradedThresholdMs, fall back to assertions.responseTime
    if (status === "success") {
      const degradedThreshold = degradedThresholdMs ?? assertions?.responseTime;
      if (degradedThreshold && responseTimeMs > degradedThreshold) {
        status = "degraded";
      }
    }

    if (status === "success" && assertions?.headers) {
      for (const [key, value] of Object.entries(assertions.headers)) {
        const actual = response.headers.get(key);
        if (actual !== value) {
          status = "failure";
          errorMessage = `Header ${key}: expected "${value}", got "${actual}"`;
          break;
        }
      }
    }

    if (status === "success" && assertions?.body) {
      const responseBody = responseBodyText ?? await response.text();

      if (assertions.body.contains && !responseBody.includes(assertions.body.contains)) {
        status = "failure";
        errorMessage = `Response body does not contain "${assertions.body.contains}"`;
      }

      if (assertions.body.notContains && responseBody.includes(assertions.body.notContains)) {
        status = "failure";
        errorMessage = `Response body contains "${assertions.body.notContains}"`;
      }

      if (assertions.body.regex) {
        const regex = new RegExp(assertions.body.regex);
        if (!regex.test(responseBody)) {
          status = "failure";
          errorMessage = `Response body does not match regex "${assertions.body.regex}"`;
        }
      }
    }

    // Cache header validation
    if ((status === "success" || status === "degraded") && config?.http?.cache) {
      const cacheCfg = config.http.cache;
      const cacheControl = response.headers.get("cache-control");
      const etagHeader = response.headers.get("etag");
      const directives = cacheControl
        ? cacheControl
            .toLowerCase()
            .split(",")
            .map((d) => d.trim())
            .filter(Boolean)
        : [];

      if (cacheCfg.requireCacheControl && !cacheControl) {
        cacheIssues.push("Cache-Control header missing");
        applyIssue("Cache-Control header missing", "degraded", "CACHE_HEADER_MISSING");
      }

      if (cacheCfg.requireEtag && !etagHeader) {
        cacheIssues.push("ETag header missing");
        applyIssue("ETag header missing", "degraded", "ETAG_MISSING");
      }

      if (cacheCfg.allowedCacheControl && cacheCfg.allowedCacheControl.length > 0 && directives.length > 0) {
        const disallowed = directives.filter((d) => !cacheCfg.allowedCacheControl!.includes(d));
        if (disallowed.length > 0) {
          cacheIssues.push(`Disallowed Cache-Control directives: ${disallowed.join(", ")}`);
          applyIssue(`Disallowed Cache-Control directives: ${disallowed.join(", ")}`, "degraded", "CACHE_DIRECTIVE_INVALID");
        }
      }

      if (!cacheCfg.allowNoStore && directives.includes("no-store")) {
        cacheIssues.push("no-store directive present");
        applyIssue("no-store directive present", "degraded", "CACHE_NO_STORE");
      }

      if (cacheCfg.maxAgeSeconds !== undefined && directives.length > 0) {
        const maxAgeMatch = directives.find((d) => d.startsWith("max-age"));
        if (maxAgeMatch) {
          const parts = maxAgeMatch.split("=");
          const value = parts[1] ? parseInt(parts[1], 10) : NaN;
          if (!Number.isNaN(value) && value > cacheCfg.maxAgeSeconds) {
            cacheIssues.push(`max-age ${value}s exceeds limit ${cacheCfg.maxAgeSeconds}s`);
            applyIssue(`max-age ${value}s exceeds limit ${cacheCfg.maxAgeSeconds}s`, "degraded", "CACHE_MAX_AGE_EXCEEDED");
          }
        }
      }
    }

    // Response size validation
    if ((status === "success" || status === "degraded") && config?.http?.responseSize) {
      const sizeCfg = config.http.responseSize;
      if (responseSizeBytes === undefined) {
        const contentLength = response.headers.get("content-length");
        if (contentLength) {
          const parsed = parseInt(contentLength, 10);
          if (!Number.isNaN(parsed)) responseSizeBytes = parsed;
        }
      }
      if (responseSizeBytes !== undefined) {
        if (sizeCfg.errorBytes && responseSizeBytes > sizeCfg.errorBytes) {
          sizeIssues.push(`Response size ${responseSizeBytes} bytes exceeds error limit ${sizeCfg.errorBytes}`);
          applyIssue(`Response size ${responseSizeBytes} bytes exceeds limit ${sizeCfg.errorBytes}`, "failure", "RESPONSE_TOO_LARGE");
        } else if (sizeCfg.warnBytes && responseSizeBytes > sizeCfg.warnBytes) {
          sizeIssues.push(`Response size ${responseSizeBytes} bytes exceeds warning limit ${sizeCfg.warnBytes}`);
          applyIssue(`Response size ${responseSizeBytes} bytes exceeds warning limit ${sizeCfg.warnBytes}`, "degraded", "RESPONSE_LARGE");
        }
      }
    }
  } catch (error) {
    responseTimeMs = Math.round(performance.now() - startTime);

    if (error instanceof Error) {
      if (error.name === "AbortError") {
        status = "timeout";
        errorMessage = `Request timed out after ${abortTimeoutMs}ms`;
        errorCode = "TIMEOUT";
      } else {
        status = "error";
        errorMessage = error.message;
        errorCode = error.name;
      }
    } else {
      status = "error";
      errorMessage = "Unknown error occurred";
      errorCode = "UNKNOWN";
    }
  }

  const getByPath = (obj: unknown, path: string): unknown => {
    return path.split(".").reduce<unknown>((acc, key) => {
      if (acc && typeof acc === "object" && key in acc) {
        return (acc as Record<string, unknown>)[key];
      }
      return undefined;
    }, obj);
  };

  // GraphQL operations (queries, mutations, introspection)
  if ((status === "success" || status === "degraded") && config?.http?.graphql?.operations?.length) {
    for (const op of config.http.graphql.operations) {
      try {
        const targetUrl = op.urlOverride || url;
        const gqlResponse = await fetch(targetUrl, {
          method: "POST",
          headers: {
            "content-type": "application/json",
            ...headers,
          },
          body: JSON.stringify({ query: op.query, variables: op.variables }),
        });

        const gqlJson = (await gqlResponse.json().catch(() => null)) as
          | { errors?: unknown[]; data?: Record<string, unknown> }
          | null;
        const hasErrors = Array.isArray(gqlJson?.errors) && gqlJson.errors.length > 0;

        if (!gqlResponse.ok) {
          graphqlIssues.push(`${op.name || op.type || "graphql"} status ${gqlResponse.status}`);
          applyIssue(`GraphQL ${op.type || "operation"} failed with status ${gqlResponse.status}`, "failure", "GRAPHQL_ERROR");
        } else if (!op.expectErrors && hasErrors) {
          graphqlIssues.push(`${op.name || op.type || "graphql"} returned errors`);
          applyIssue(`GraphQL ${op.type || "operation"} returned errors`, "degraded", "GRAPHQL_ERRORS_PRESENT");
        }

        if (op.type === "introspection") {
          const hasIntrospection = Boolean(
            gqlJson?.data && (gqlJson.data as Record<string, unknown>).__schema
          );
          const expectEnabled = op.expectIntrospectionEnabled ?? true;
          if (expectEnabled && !hasIntrospection) {
            graphqlIssues.push("Introspection disabled/unavailable");
            applyIssue("GraphQL introspection disabled", "degraded", "GRAPHQL_INTROSPECTION_DISABLED");
          }
          if (!expectEnabled && hasIntrospection) {
            graphqlIssues.push("Introspection unexpectedly enabled");
            applyIssue("GraphQL introspection enabled unexpectedly", "degraded", "GRAPHQL_INTROSPECTION_ENABLED");
          }
        }
      } catch (gqlErr) {
        graphqlIssues.push(`GraphQL request failed: ${gqlErr instanceof Error ? gqlErr.message : "unknown"}`);
        applyIssue("GraphQL operation failed", "failure", "GRAPHQL_FAILURE");
      }
    }
  }

  // Multi-step API flows (sequential)
  if ((status === "success" || status === "degraded") && config?.http?.apiFlows?.length) {
    const flowContext: Record<string, unknown> = {};
    const resolveTemplate = (input?: string) =>
      input?.replace(/{{(.*?)}}/g, (_, key) => (flowContext[key.trim()] ?? "").toString()) ?? "";

    for (const step of config.http.apiFlows) {
      const stepUrl = step.url ? resolveTemplate(step.url) : url;
      const stepMethod = step.method || method;
      const stepHeaders: Record<string, string> = { ...headers };
      if (step.headers) {
        Object.entries(step.headers).forEach(([k, v]) => {
          stepHeaders[k] = resolveTemplate(v);
        });
      }
      const stepBody = step.body ? resolveTemplate(step.body) : undefined;
      const stepName = step.name || stepUrl;

      try {
        const stepResp = await fetch(stepUrl, {
          method: stepMethod,
          headers: stepHeaders,
          body: stepBody,
        });
        const stepStatus = stepResp.status;
        const expectedStatuses = step.expectStatus || [200, 201, 202];

        if (!expectedStatuses.includes(stepStatus)) {
          apiFlowIssues.push(`${stepName}: expected ${expectedStatuses.join(",")}, got ${stepStatus}`);
          applyIssue(`Flow step ${stepName} failed (${stepStatus})`, "failure", "API_FLOW_FAILED");
        }

        const stepJson = await stepResp.json().catch(() => null);
        if (step.saveAs && stepJson) {
          flowContext[step.saveAs] = stepJson;
        }
        if (step.extract && stepJson) {
          for (const extractor of step.extract) {
            const value = getByPath(stepJson, extractor.path);
            if (value === undefined) {
              apiFlowIssues.push(`${stepName}: missing ${extractor.path}`);
              applyIssue(`Flow extraction failed: ${extractor.path}`, "degraded", "API_FLOW_EXTRACT_MISSING");
            } else {
              flowContext[extractor.name] = value;
            }
          }
        }
      } catch (flowErr) {
        apiFlowIssues.push(`${stepName}: ${flowErr instanceof Error ? flowErr.message : "error"}`);
        applyIssue(`Flow step ${stepName} errored`, "failure", "API_FLOW_ERROR");
      }
    }
  }

  // API contract validation (lightweight)
  if ((status === "success" || status === "degraded") && config?.http?.contract?.enabled) {
    if (responseBodyText) {
      try {
        const parsed = JSON.parse(responseBodyText);
        if (config.http.contract?.requiredFields) {
          for (const field of config.http.contract.requiredFields) {
            const value = getByPath(parsed, field.path);
            if (value === undefined) {
              contractIssues.push(`Missing field ${field.path}`);
              applyIssue(`Contract missing field ${field.path}`, "degraded", "API_CONTRACT_MISSING_FIELD");
            } else if (field.type && typeof value !== field.type) {
              contractIssues.push(`Field ${field.path} expected ${field.type}, got ${typeof value}`);
              applyIssue(`Contract type mismatch for ${field.path}`, "degraded", "API_CONTRACT_TYPE_MISMATCH");
            }
          }
        }
      } catch (jsonErr) {
        contractIssues.push("Response not JSON for contract validation");
        applyIssue("Contract validation failed: invalid JSON", "failure", "API_CONTRACT_INVALID_JSON");
      }
    } else {
      contractIssues.push("No response body to validate contract");
      applyIssue("Contract validation skipped: empty body", "degraded", "API_CONTRACT_NO_BODY");
    }
  }

  // Synthetic browser transactions (Puppeteer)
  if ((status === "success" || status === "degraded") && config?.http?.syntheticBrowser?.enabled) {
    let browser: any = null;
    try {
      const puppeteer = await import("puppeteer");
      browser = await puppeteer.default.launch({
        headless: true,
        args: ["--no-sandbox", "--disable-setuid-sandbox"],
      });
      const page = await browser.newPage();
      const maxWait = config.http.syntheticBrowser.maxWaitMs ?? timeoutMs;
      await page.setDefaultTimeout(maxWait);

      const steps: SyntheticStep[] =
        config.http.syntheticBrowser.steps && config.http.syntheticBrowser.steps.length > 0
          ? config.http.syntheticBrowser.steps
          : [{ action: "goto", target: url }];

      for (const step of steps) {
        switch (step.action) {
          case "goto":
            await page.goto(step.target || url, { waitUntil: "networkidle2", timeout: maxWait });
            break;
          case "click":
            if (!step.target) throw new Error("click step missing target");
            await page.click(step.target);
            break;
          case "type":
            if (!step.target) throw new Error("type step missing target");
            await page.type(step.target, step.value ?? "");
            break;
          case "waitForSelector":
            if (!step.target) throw new Error("waitForSelector step missing target");
            await page.waitForSelector(step.target, { timeout: maxWait });
            break;
          case "waitForTimeout":
            await page.waitForTimeout(Number(step.value ?? 1000));
            break;
          default:
            break;
        }
      }

      let previousScreenshotHash: string | undefined;
      if (config.http.syntheticBrowser.visualRegression) {
        const lastResult = await db.query.checkResults.findFirst({
          where: eq(checkResults.monitorId, monitorId),
          orderBy: [desc(checkResults.createdAt)],
        });
        previousScreenshotHash = (lastResult?.headers as Record<string, string> | undefined)?.browserScreenshotHash;
      }

      if (config.http.syntheticBrowser.screenshot || config.http.syntheticBrowser.visualRegression) {
        const screenshotBuffer = await page.screenshot({ fullPage: true });
        const crypto = await import("crypto");
        browserScreenshotHash = crypto.createHash("sha256").update(screenshotBuffer).digest("hex");

        if (previousScreenshotHash && browserScreenshotHash !== previousScreenshotHash) {
          visualRegressionDetected = true;
          syntheticIssues.push("Visual regression detected");
          applyIssue("Synthetic visual regression detected", "degraded", "VISUAL_REGRESSION");
        }
      }
    } catch (syntheticErr) {
      syntheticIssues.push(syntheticErr instanceof Error ? syntheticErr.message : "Synthetic flow error");
      applyIssue("Synthetic browser flow failed", "failure", "SYNTHETIC_BROWSER_ERROR");
    } finally {
      if (browser) {
        await browser.close().catch(() => {});
      }
    }
  }

  // PageSpeed Insights check (only if enabled and HTTP check was successful)
  // Only run if enough time has passed since last pagespeed run (default 24 hours)
  const pagespeedIntervalSeconds = config?.pagespeed?.intervalSeconds ?? 86400; // Default 24 hours
  const lastPagespeedTime = lastPagespeedAt ? new Date(lastPagespeedAt).getTime() : 0;
  const timeSinceLastPagespeed = lastPagespeedTime ? Date.now() - lastPagespeedTime : Infinity;
  const shouldRunPagespeed = config?.pagespeed?.enabled &&
    (status === "success" || status === "degraded") &&
    timeSinceLastPagespeed >= (pagespeedIntervalSeconds * 1000);

  if (shouldRunPagespeed) {
    try {
      log.info(`Fetching PageSpeed data for ${monitorId}: ${url} (last run: ${lastPagespeedAt || 'never'})`);

      // Get organization's PageSpeed API key
      let pagespeedApiKey: string | undefined;

      if (organizationId) {
        const org = await db.query.organizations.findFirst({
          where: eq(organizations.id, organizationId),
          columns: { settings: true },
        });

        pagespeedApiKey = org?.settings?.integrations?.pagespeed?.apiKey;
      }

      // Fetch PageSpeed data
      const results = await fetchPageSpeedData(url, {
        apiKey: pagespeedApiKey,
        strategy: config.pagespeed.strategy || "mobile",
        categories: config.pagespeed.categories || ["performance"],
      });

      // Use the first result (mobile or the specified strategy)
      const primaryResult = results[0];

      if (primaryResult) {
        if (primaryResult.error) {
          pagespeedError = primaryResult.error;
          log.warn(`PageSpeed error for ${monitorId}: ${primaryResult.error}`);
        } else {
          pagespeedScores = primaryResult.scores;
          webVitals = primaryResult.webVitals;

          log.info(`PageSpeed scores for ${monitorId}:`, pagespeedScores);

          // Check PageSpeed thresholds
          if (config.pagespeed.thresholds && pagespeedScores) {
            const thresholdCheck = checkPageSpeedThresholds(pagespeedScores, config.pagespeed.thresholds);
            if (!thresholdCheck.passed) {
              // Track violations for alerting
              const thresholds = config.pagespeed.thresholds;
              if (thresholds.performance && pagespeedScores.performance && pagespeedScores.performance < thresholds.performance) {
                pagespeedViolations.push({ category: "performance", score: pagespeedScores.performance, threshold: thresholds.performance });
              }
              if (thresholds.accessibility && pagespeedScores.accessibility && pagespeedScores.accessibility < thresholds.accessibility) {
                pagespeedViolations.push({ category: "accessibility", score: pagespeedScores.accessibility, threshold: thresholds.accessibility });
              }
              if (thresholds.bestPractices && pagespeedScores.bestPractices && pagespeedScores.bestPractices < thresholds.bestPractices) {
                pagespeedViolations.push({ category: "bestPractices", score: pagespeedScores.bestPractices, threshold: thresholds.bestPractices });
              }
              if (thresholds.seo && pagespeedScores.seo && pagespeedScores.seo < thresholds.seo) {
                pagespeedViolations.push({ category: "seo", score: pagespeedScores.seo, threshold: thresholds.seo });
              }

              // Mark as degraded if PageSpeed thresholds are not met
              if (status === "success") {
                status = "degraded";
                errorMessage = `PageSpeed thresholds not met: ${thresholdCheck.violations.join(", ")}`;
              }
            }
          }

          // Check Web Vitals thresholds
          if (config.pagespeed.webVitalsThresholds && webVitals) {
            const vitalsCheck = checkWebVitalsThresholds(webVitals, config.pagespeed.webVitalsThresholds);
            if (!vitalsCheck.passed) {
              // Mark as degraded if Web Vitals thresholds are not met
              if (status === "success") {
                status = "degraded";
                errorMessage = `Web Vitals thresholds not met: ${vitalsCheck.violations.join(", ")}`;
              }
            }
          }
        }
      }
    } catch (psError) {
      pagespeedError = psError instanceof Error ? psError.message : "Unknown PageSpeed error";
      log.error(`PageSpeed check failed for ${monitorId}:`, psError);
    }
  }

  // Security Headers check (only if enabled and HTTP check was successful)
  if (config?.securityHeaders?.enabled && responseHeaders && (status === "success" || status === "degraded")) {
    try {
      log.info(`Analyzing security headers for ${monitorId}: ${url}`);

      securityHeadersResult = await analyzeSecurityHeaders(
        responseHeaders,
        url,
        { checkHstsPreload: config.securityHeaders.checkHstsPreload }
      );

      log.info(`Security headers score for ${monitorId}: ${securityHeadersResult.overallScore} (${securityHeadersResult.grade})`);

      // Check minimum score threshold
      if (config.securityHeaders.minScore !== undefined) {
        if (securityHeadersResult.overallScore < config.securityHeaders.minScore) {
          // Mark as degraded if security score is below threshold
          if (status === "success") {
            status = "degraded";
            errorMessage = `Security headers score ${securityHeadersResult.overallScore} below threshold ${config.securityHeaders.minScore}`;
          }
        }
      }
    } catch (shError) {
      log.error(`Security headers check failed for ${monitorId}:`, shError);
    }
  }

  // CDN Edge vs Origin comparison
  if (config?.cdn?.originUrl) {
    const cdnIssues: string[] = [];
    const tolerance = config.cdn.compareToleranceMs ?? 250;
    const requireStatusMatch = config.cdn.requireStatusMatch ?? false;
    const edgeUrl = config.cdn.edgeUrl || url;

    const buildHeaders = (override?: Record<string, string>) => {
      const merged: Record<string, string> = {};
      Object.entries(headers).forEach(([key, value]) => {
        merged[key] = value;
      });
      if (override) {
        Object.entries(override).forEach(([key, value]) => {
          merged[key] = value;
        });
      }
      return merged;
    };

    const runTimedFetch = async (
      targetUrl: string,
      headerOverride?: Record<string, string>
    ): Promise<{ status?: number; time?: number; error?: string }> => {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), timeoutMs);
      const start = performance.now();
      try {
        const resp = await fetch(targetUrl, {
          method,
          headers: headerOverride ? buildHeaders(headerOverride) : headers,
          body: body || undefined,
          signal: controller.signal,
        });
        const time = Math.round(performance.now() - start);
        clearTimeout(timeout);
        return { status: resp.status, time };
      } catch (err) {
        clearTimeout(timeout);
        return {
          error: err instanceof Error ? err.message : "Fetch failed",
          time: Math.round(performance.now() - start),
        };
      }
    };

    // Edge measurement (reuse main response when possible)
    let edgeStatus = statusCode;
    let edgeTime = responseTimeMs;
    const edgeHeadersOverride = config.cdn.edgeHeaders;
    const needsEdgeFetch = edgeUrl !== url || Boolean(edgeHeadersOverride);

    if (needsEdgeFetch || edgeStatus === undefined) {
      const edgeResult = await runTimedFetch(edgeUrl, edgeHeadersOverride);
      edgeStatus = edgeResult.status;
      edgeTime = edgeResult.time ?? edgeTime;
      if (edgeResult.error) {
        cdnIssues.push(`Edge fetch failed: ${edgeResult.error}`);
      }
    }

    // Origin measurement
    const originHeadersOverride = config.cdn.originHeaders;
    const originResult = await runTimedFetch(config.cdn.originUrl, originHeadersOverride);
    const originStatus = originResult.status;
    const originTime = originResult.time;

    if (originResult.error) {
      if (status === "success") status = "degraded";
      errorCode = errorCode || "CDN_ORIGIN_FAILED";
      cdnIssues.push(`Origin fetch failed: ${originResult.error}`);
    }

    if (requireStatusMatch && edgeStatus !== undefined && originStatus !== undefined && edgeStatus !== originStatus) {
      if (status === "success") status = "degraded";
      errorCode = errorCode || "CDN_STATUS_MISMATCH";
      cdnIssues.push(`Edge status ${edgeStatus} vs origin ${originStatus}`);
    }

    if (
      edgeTime !== undefined &&
      originTime !== undefined &&
      edgeTime - originTime > tolerance
    ) {
      if (status === "success") status = "degraded";
      errorCode = errorCode || "CDN_LATENCY_REGRESSION";
      cdnIssues.push(`Edge slower than origin by ${edgeTime - originTime}ms`);
    }

    if (cdnIssues.length > 0) {
      errorMessage = errorMessage
        ? `${errorMessage}; ${cdnIssues.join("; ")}`
        : cdnIssues.join("; ");
    }

    cdnMeta = {
      cdnEdgeStatus: edgeStatus !== undefined ? String(edgeStatus) : "unknown",
      cdnOriginStatus: originStatus !== undefined ? String(originStatus) : "unknown",
      cdnEdgeMs: edgeTime !== undefined ? String(edgeTime) : "unknown",
      cdnOriginMs: originTime !== undefined ? String(originTime) : "unknown",
      cdnDeltaMs:
        edgeTime !== undefined && originTime !== undefined
          ? String(edgeTime - originTime)
          : "unknown",
      cdnToleranceMs: String(tolerance),
      cdnRequireStatusMatch: String(requireStatusMatch),
    };
  }

  // Store result
  const resultId = nanoid();

  let headersToStore = responseHeaders ? { ...responseHeaders } : undefined;
  if (cdnMeta) {
    headersToStore = headersToStore ? { ...headersToStore, ...cdnMeta } : { ...cdnMeta };
  }
  if (responseSizeBytes !== undefined) {
    headersToStore = headersToStore ? { ...headersToStore, responseSizeBytes: String(responseSizeBytes) } : { responseSizeBytes: String(responseSizeBytes) };
  }
  if (cacheIssues.length > 0) {
    headersToStore = headersToStore ? { ...headersToStore, cacheIssues: cacheIssues.join("; ") } : { cacheIssues: cacheIssues.join("; ") };
  }
  if (sizeIssues.length > 0) {
    headersToStore = headersToStore ? { ...headersToStore, sizeIssues: sizeIssues.join("; ") } : { sizeIssues: sizeIssues.join("; ") };
  }
  if (graphqlIssues.length > 0) {
    headersToStore = headersToStore ? { ...headersToStore, graphqlIssues: graphqlIssues.join("; ") } : { graphqlIssues: graphqlIssues.join("; ") };
  }
  if (apiFlowIssues.length > 0) {
    headersToStore = headersToStore ? { ...headersToStore, apiFlowIssues: apiFlowIssues.join("; ") } : { apiFlowIssues: apiFlowIssues.join("; ") };
  }
  if (syntheticIssues.length > 0) {
    headersToStore = headersToStore ? { ...headersToStore, syntheticIssues: syntheticIssues.join("; ") } : { syntheticIssues: syntheticIssues.join("; ") };
  }
  if (contractIssues.length > 0) {
    headersToStore = headersToStore ? { ...headersToStore, contractIssues: contractIssues.join("; ") } : { contractIssues: contractIssues.join("; ") };
  }
  if (visualRegressionDetected) {
    headersToStore = headersToStore ? { ...headersToStore, visualRegressionDetected: "true" } : { visualRegressionDetected: "true" };
  }
  if (browserScreenshotHash) {
    headersToStore = headersToStore ? { ...headersToStore, browserScreenshotHash } : { browserScreenshotHash };
  }

  await db.insert(checkResults).values({
    id: resultId,
    monitorId,
    region,
    status,
    responseTimeMs,
    statusCode,
    dnsMs: timing.dnsMs,
    tcpMs: timing.tcpMs,
    tlsMs: timing.tlsMs,
    ttfbMs: timing.ttfbMs,
    transferMs: timing.transferMs,
    responseSize: responseSizeBytes,
    errorMessage,
    errorCode,
    headers: headersToStore,
    pagespeedScores: pagespeedScores || undefined,
    webVitals: webVitals || undefined,
    securityHeaders: securityHeadersResult || undefined,
    createdAt: new Date(),
  });

  // Link failed checks to active incidents
  await linkCheckToActiveIncident(resultId, monitorId, status);

  // Update monitor status
  const newStatus =
    status === "success"
      ? "active"
      : status === "degraded"
      ? "degraded"
      : "down";

  // Update monitor status and lastPagespeedAt if pagespeed was run
  const monitorUpdate: Record<string, unknown> = {
    status: newStatus,
    updatedAt: new Date(),
  };

  // Update lastPagespeedAt if pagespeed was run in this check
  if (shouldRunPagespeed) {
    monitorUpdate.lastPagespeedAt = new Date();
  }

  await db
    .update(monitors)
    .set(monitorUpdate)
    .where(eq(monitors.id, monitorId));

  // Publish event for real-time updates
  await publishEvent(`monitor:${monitorId}`, {
    type: "monitor:check",
    data: {
      monitorId,
      status,
      responseTimeMs,
      statusCode,
      timestamp: new Date().toISOString(),
    },
  });

  // Evaluate alert policies for this monitor
  if (organizationId) {
    await evaluateAlerts({
      monitorId,
      organizationId,
      checkResultId: resultId,
      checkStatus: status,
      errorMessage,
      responseTimeMs,
      statusCode,
      pagespeedScores: pagespeedScores || null,
      pagespeedViolations: pagespeedViolations.length > 0 ? pagespeedViolations : null,
    });
  }

  log.info(`HTTP check completed for ${monitorId}: ${status} (${responseTimeMs}ms)`);

  return {
    status,
    responseTimeMs,
    statusCode,
  };
}
