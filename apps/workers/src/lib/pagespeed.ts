/**
 * Google PageSpeed Insights API helper module
 *
 * Fetches Lighthouse scores and Core Web Vitals for URLs
 * API documentation: https://developers.google.com/speed/docs/insights/v5/get-started
 */

const PAGESPEED_API_URL = "https://www.googleapis.com/pagespeedonline/v5/runPagespeed";

export interface PageSpeedScores {
  [key: string]: number | undefined;
  performance?: number;
  accessibility?: number;
  bestPractices?: number;
  seo?: number;
}

export interface WebVitals {
  lcp?: number;   // Largest Contentful Paint (ms)
  fid?: number;   // First Input Delay (ms)
  inp?: number;   // Interaction to Next Paint (ms)
  cls?: number;   // Cumulative Layout Shift
  fcp?: number;   // First Contentful Paint (ms)
  ttfb?: number;  // Time to First Byte (ms)
  si?: number;    // Speed Index
  tbt?: number;   // Total Blocking Time (ms)
}

export interface PageSpeedResult {
  scores: PageSpeedScores;
  webVitals: WebVitals;
  strategy: "mobile" | "desktop";
  fetchTime: number;  // Time taken to fetch the PageSpeed data (ms)
  error?: string;
}

export interface PageSpeedConfig {
  apiKey?: string;
  strategy?: "mobile" | "desktop" | "both";
  categories?: ("performance" | "accessibility" | "best-practices" | "seo")[];
}

interface PageSpeedApiResponse {
  lighthouseResult?: {
    categories?: Record<string, { score?: number }>;
    audits?: Record<string, { numericValue?: number }>;
  };
  loadingExperience?: {
    metrics?: Record<string, { percentile: number }>;
  };
}

/**
 * Fetch PageSpeed Insights data for a URL
 */
export async function fetchPageSpeedData(
  url: string,
  config: PageSpeedConfig
): Promise<PageSpeedResult[]> {
  const { apiKey, strategy = "mobile", categories = ["performance"] } = config;

  const results: PageSpeedResult[] = [];
  const strategies = strategy === "both" ? ["mobile", "desktop"] as const : [strategy] as const;

  for (const strat of strategies) {
    const result = await fetchSinglePageSpeedResult(url, strat, categories, apiKey);
    results.push(result);
  }

  return results;
}

async function fetchSinglePageSpeedResult(
  url: string,
  strategy: "mobile" | "desktop",
  categories: string[],
  apiKey?: string
): Promise<PageSpeedResult> {
  const startTime = performance.now();

  try {
    // Build query parameters
    const params = new URLSearchParams();
    params.set("url", url);
    params.set("strategy", strategy);

    // Add categories
    for (const category of categories) {
      params.append("category", category.toUpperCase().replace("-", "_"));
    }

    // Add API key if provided
    if (apiKey) {
      params.set("key", apiKey);
    }

    const requestUrl = `${PAGESPEED_API_URL}?${params.toString()}`;

    // PageSpeed API can take a while, use a long timeout
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 60000); // 60 second timeout

    const response = await fetch(requestUrl, {
      method: "GET",
      signal: controller.signal,
    });

    clearTimeout(timeout);

    const fetchTime = Math.round(performance.now() - startTime);

    if (!response.ok) {
      const errorBody = await response.text();
      let errorMessage = `PageSpeed API error: ${response.status}`;
      try {
        const errorJson = JSON.parse(errorBody);
        if (errorJson.error?.message) {
          errorMessage = errorJson.error.message;
        }
      } catch {
        // Use default error message
      }

      return {
        scores: {},
        webVitals: {},
        strategy,
        fetchTime,
        error: errorMessage,
      };
    }

    const data = (await response.json()) as PageSpeedApiResponse;

    // Extract Lighthouse scores
    const scores: PageSpeedScores = {};
    const lighthouseCategories = data.lighthouseResult?.categories;

    if (lighthouseCategories) {
      const performanceScore = lighthouseCategories.performance?.score;
      if (typeof performanceScore === "number") {
        scores.performance = Math.round(performanceScore * 100);
      }
      const accessibilityScore = lighthouseCategories.accessibility?.score;
      if (typeof accessibilityScore === "number") {
        scores.accessibility = Math.round(accessibilityScore * 100);
      }
      const bestPracticesScore = lighthouseCategories["best-practices"]?.score;
      if (typeof bestPracticesScore === "number") {
        scores.bestPractices = Math.round(bestPracticesScore * 100);
      }
      const seoScore = lighthouseCategories.seo?.score;
      if (typeof seoScore === "number") {
        scores.seo = Math.round(seoScore * 100);
      }
    }

    // Extract Core Web Vitals from Lighthouse audits
    const webVitals: WebVitals = {};
    const audits = data.lighthouseResult?.audits;

    if (audits) {
      // Largest Contentful Paint (in ms)
      if (audits["largest-contentful-paint"]?.numericValue) {
        webVitals.lcp = Math.round(audits["largest-contentful-paint"].numericValue);
      }

      // Total Blocking Time (in ms) - proxy for FID
      if (audits["total-blocking-time"]?.numericValue) {
        webVitals.tbt = Math.round(audits["total-blocking-time"].numericValue);
      }

      // Cumulative Layout Shift
      if (audits["cumulative-layout-shift"]?.numericValue !== undefined) {
        webVitals.cls = audits["cumulative-layout-shift"].numericValue;
      }

      // First Contentful Paint (in ms)
      if (audits["first-contentful-paint"]?.numericValue) {
        webVitals.fcp = Math.round(audits["first-contentful-paint"].numericValue);
      }

      // Time to First Byte (in ms)
      if (audits["server-response-time"]?.numericValue) {
        webVitals.ttfb = Math.round(audits["server-response-time"].numericValue);
      }

      // Speed Index
      if (audits["speed-index"]?.numericValue) {
        webVitals.si = Math.round(audits["speed-index"].numericValue);
      }

      // Interaction to Next Paint (if available - newer metric)
      if (audits["experimental-interaction-to-next-paint"]?.numericValue) {
        webVitals.inp = Math.round(audits["experimental-interaction-to-next-paint"].numericValue);
      }
    }

    // Also check field data (CrUX - Chrome User Experience Report)
    const loadingExperience = data.loadingExperience;
    if (loadingExperience?.metrics) {
      // Field data for LCP
      if (!webVitals.lcp && loadingExperience.metrics.LARGEST_CONTENTFUL_PAINT_MS) {
        webVitals.lcp = loadingExperience.metrics.LARGEST_CONTENTFUL_PAINT_MS.percentile;
      }

      // Field data for FID
      if (loadingExperience.metrics.FIRST_INPUT_DELAY_MS) {
        webVitals.fid = loadingExperience.metrics.FIRST_INPUT_DELAY_MS.percentile;
      }

      // Field data for CLS
      if (!webVitals.cls && loadingExperience.metrics.CUMULATIVE_LAYOUT_SHIFT_SCORE) {
        webVitals.cls = loadingExperience.metrics.CUMULATIVE_LAYOUT_SHIFT_SCORE.percentile / 100;
      }

      // Field data for INP
      if (loadingExperience.metrics.INTERACTION_TO_NEXT_PAINT) {
        webVitals.inp = loadingExperience.metrics.INTERACTION_TO_NEXT_PAINT.percentile;
      }
    }

    return {
      scores,
      webVitals,
      strategy,
      fetchTime,
    };
  } catch (error) {
    const fetchTime = Math.round(performance.now() - startTime);

    let errorMessage = "Unknown error fetching PageSpeed data";
    if (error instanceof Error) {
      if (error.name === "AbortError") {
        errorMessage = "PageSpeed API request timed out after 60 seconds";
      } else {
        errorMessage = error.message;
      }
    }

    return {
      scores: {},
      webVitals: {},
      strategy,
      fetchTime,
      error: errorMessage,
    };
  }
}

/**
 * Check if PageSpeed scores meet the configured thresholds
 * Returns an object with any violations
 */
export function checkPageSpeedThresholds(
  scores: PageSpeedScores,
  thresholds?: {
    performance?: number;
    accessibility?: number;
    bestPractices?: number;
    seo?: number;
  }
): { passed: boolean; violations: string[] } {
  if (!thresholds) {
    return { passed: true, violations: [] };
  }

  const violations: string[] = [];

  if (thresholds.performance && scores.performance !== undefined) {
    if (scores.performance < thresholds.performance) {
      violations.push(`Performance: ${scores.performance} < ${thresholds.performance}`);
    }
  }

  if (thresholds.accessibility && scores.accessibility !== undefined) {
    if (scores.accessibility < thresholds.accessibility) {
      violations.push(`Accessibility: ${scores.accessibility} < ${thresholds.accessibility}`);
    }
  }

  if (thresholds.bestPractices && scores.bestPractices !== undefined) {
    if (scores.bestPractices < thresholds.bestPractices) {
      violations.push(`Best Practices: ${scores.bestPractices} < ${thresholds.bestPractices}`);
    }
  }

  if (thresholds.seo && scores.seo !== undefined) {
    if (scores.seo < thresholds.seo) {
      violations.push(`SEO: ${scores.seo} < ${thresholds.seo}`);
    }
  }

  return { passed: violations.length === 0, violations };
}

/**
 * Check if Web Vitals meet the configured thresholds
 * Uses Google's recommended thresholds:
 * - LCP: Good < 2500ms, Needs Improvement < 4000ms
 * - FID: Good < 100ms, Needs Improvement < 300ms
 * - CLS: Good < 0.1, Needs Improvement < 0.25
 */
export function checkWebVitalsThresholds(
  webVitals: WebVitals,
  thresholds?: {
    lcp?: number;
    fid?: number;
    cls?: number;
  }
): { passed: boolean; violations: string[] } {
  if (!thresholds) {
    return { passed: true, violations: [] };
  }

  const violations: string[] = [];

  if (thresholds.lcp && webVitals.lcp !== undefined) {
    if (webVitals.lcp > thresholds.lcp) {
      violations.push(`LCP: ${webVitals.lcp}ms > ${thresholds.lcp}ms`);
    }
  }

  if (thresholds.fid) {
    const fidValue = webVitals.fid ?? webVitals.tbt; // Use TBT as proxy if FID not available
    if (fidValue !== undefined && fidValue > thresholds.fid) {
      violations.push(`FID/TBT: ${fidValue}ms > ${thresholds.fid}ms`);
    }
  }

  if (thresholds.cls && webVitals.cls !== undefined) {
    if (webVitals.cls > thresholds.cls) {
      violations.push(`CLS: ${webVitals.cls.toFixed(3)} > ${thresholds.cls}`);
    }
  }

  return { passed: violations.length === 0, violations };
}
