import type { SecurityHeadersAnalysis, SecurityHeaderResult, SecurityGrade } from "@uni-status/shared/types";

export interface AnalyzeSecurityHeadersOptions {
  checkHstsPreload?: boolean;
}

/**
 * Analyzes HTTP response headers for security best practices.
 * Returns a score and grade based on the presence and configuration of security headers.
 */
export async function analyzeSecurityHeaders(
  headers: Record<string, string>,
  url: string,
  options?: AnalyzeSecurityHeadersOptions
): Promise<SecurityHeadersAnalysis> {
  // Normalize header names to lowercase for consistent lookup
  const normalizedHeaders: Record<string, string> = {};
  for (const [key, value] of Object.entries(headers)) {
    normalizedHeaders[key.toLowerCase()] = value;
  }

  const results: SecurityHeadersAnalysis["headers"] = {};
  const scores: number[] = [];

  // Analyze Content-Security-Policy
  results.contentSecurityPolicy = analyzeContentSecurityPolicy(
    normalizedHeaders["content-security-policy"] || null
  );
  scores.push(results.contentSecurityPolicy.score);

  // Analyze X-Content-Type-Options
  results.xContentTypeOptions = analyzeXContentTypeOptions(
    normalizedHeaders["x-content-type-options"] || null
  );
  scores.push(results.xContentTypeOptions.score);

  // Analyze X-Frame-Options
  results.xFrameOptions = analyzeXFrameOptions(
    normalizedHeaders["x-frame-options"] || null
  );
  scores.push(results.xFrameOptions.score);

  // Analyze X-XSS-Protection (deprecated)
  results.xXssProtection = analyzeXXssProtection(
    normalizedHeaders["x-xss-protection"] || null
  );
  scores.push(results.xXssProtection.score);

  // Analyze Referrer-Policy
  results.referrerPolicy = analyzeReferrerPolicy(
    normalizedHeaders["referrer-policy"] || null
  );
  scores.push(results.referrerPolicy.score);

  // Analyze Permissions-Policy
  results.permissionsPolicy = analyzePermissionsPolicy(
    normalizedHeaders["permissions-policy"] || null
  );
  scores.push(results.permissionsPolicy.score);

  // Analyze Strict-Transport-Security
  results.strictTransportSecurity = analyzeStrictTransportSecurity(
    normalizedHeaders["strict-transport-security"] || null
  );
  scores.push(results.strictTransportSecurity.score);

  // Optional: Check HSTS Preload status
  if (options?.checkHstsPreload) {
    try {
      const domain = new URL(url).hostname;
      results.hstsPreload = await checkHstsPreload(domain);
      scores.push(results.hstsPreload.score);
    } catch (error) {
      results.hstsPreload = {
        header: "HSTS Preload",
        status: "invalid",
        value: null,
        score: 0,
        recommendations: ["Could not check HSTS preload status"],
      };
    }
  }

  // Calculate overall score (average of all scores)
  const overallScore = Math.round(
    scores.reduce((sum, score) => sum + score, 0) / scores.length
  );

  // Calculate grade based on overall score
  const grade = calculateGrade(overallScore);

  return {
    overallScore,
    grade,
    headers: results,
    checkedAt: new Date().toISOString(),
  };
}

function analyzeContentSecurityPolicy(value: string | null): SecurityHeaderResult {
  if (!value) {
    return {
      header: "Content-Security-Policy",
      status: "missing",
      value: null,
      score: 0,
      recommendations: [
        "Add a Content-Security-Policy header to prevent XSS and data injection attacks",
        "Start with a restrictive policy like: default-src 'self'",
      ],
    };
  }

  const recommendations: string[] = [];
  let score = 50; // Base score for having a CSP

  // Check for unsafe-inline (reduces security)
  if (value.includes("'unsafe-inline'")) {
    score -= 15;
    recommendations.push("Remove 'unsafe-inline' to prevent inline script execution");
  }

  // Check for unsafe-eval (reduces security)
  if (value.includes("'unsafe-eval'")) {
    score -= 15;
    recommendations.push("Remove 'unsafe-eval' to prevent eval() usage");
  }

  // Check for default-src (good practice)
  if (value.includes("default-src")) {
    score += 20;
  } else {
    recommendations.push("Add a default-src directive as a fallback");
  }

  // Check for upgrade-insecure-requests
  if (value.includes("upgrade-insecure-requests")) {
    score += 10;
  }

  // Check for block-all-mixed-content
  if (value.includes("block-all-mixed-content")) {
    score += 5;
  }

  // Check for frame-ancestors (clickjacking protection)
  if (value.includes("frame-ancestors")) {
    score += 10;
  }

  // Ensure score is within bounds
  score = Math.max(0, Math.min(100, score));

  return {
    header: "Content-Security-Policy",
    status: recommendations.length > 0 ? "warning" : "present",
    value,
    score,
    recommendations: recommendations.length > 0 ? recommendations : undefined,
  };
}

function analyzeXContentTypeOptions(value: string | null): SecurityHeaderResult {
  if (!value) {
    return {
      header: "X-Content-Type-Options",
      status: "missing",
      value: null,
      score: 0,
      recommendations: [
        "Add X-Content-Type-Options: nosniff to prevent MIME type sniffing",
      ],
    };
  }

  if (value.toLowerCase() === "nosniff") {
    return {
      header: "X-Content-Type-Options",
      status: "present",
      value,
      score: 100,
    };
  }

  return {
    header: "X-Content-Type-Options",
    status: "invalid",
    value,
    score: 25,
    recommendations: [
      "Set X-Content-Type-Options to 'nosniff'",
    ],
  };
}

function analyzeXFrameOptions(value: string | null): SecurityHeaderResult {
  if (!value) {
    return {
      header: "X-Frame-Options",
      status: "missing",
      value: null,
      score: 0,
      recommendations: [
        "Add X-Frame-Options header to prevent clickjacking",
        "Use DENY or SAMEORIGIN value",
      ],
    };
  }

  const upperValue = value.toUpperCase();

  if (upperValue === "DENY") {
    return {
      header: "X-Frame-Options",
      status: "present",
      value,
      score: 100,
    };
  }

  if (upperValue === "SAMEORIGIN") {
    return {
      header: "X-Frame-Options",
      status: "present",
      value,
      score: 80,
      recommendations: [
        "Consider using DENY for maximum protection if framing is not needed",
      ],
    };
  }

  if (upperValue.startsWith("ALLOW-FROM")) {
    return {
      header: "X-Frame-Options",
      status: "warning",
      value,
      score: 50,
      recommendations: [
        "ALLOW-FROM is deprecated and not supported by all browsers",
        "Use CSP frame-ancestors directive instead",
      ],
    };
  }

  return {
    header: "X-Frame-Options",
    status: "invalid",
    value,
    score: 25,
    recommendations: [
      "Use a valid value: DENY or SAMEORIGIN",
    ],
  };
}

function analyzeXXssProtection(value: string | null): SecurityHeaderResult {
  // Note: X-XSS-Protection is deprecated and can introduce vulnerabilities in older browsers
  if (!value) {
    return {
      header: "X-XSS-Protection",
      status: "missing",
      value: null,
      score: 75, // Not having it is actually fine now
      recommendations: [
        "X-XSS-Protection is deprecated; CSP is preferred for XSS protection",
      ],
    };
  }

  if (value === "0") {
    // Explicitly disabled - this is recommended for modern browsers
    return {
      header: "X-XSS-Protection",
      status: "present",
      value,
      score: 100,
      recommendations: [
        "Good: X-XSS-Protection is disabled (recommended for modern browsers)",
      ],
    };
  }

  if (value.includes("1") && value.includes("mode=block")) {
    return {
      header: "X-XSS-Protection",
      status: "warning",
      value,
      score: 50,
      recommendations: [
        "X-XSS-Protection is deprecated and can cause issues in older browsers",
        "Consider setting to 0 and relying on CSP instead",
      ],
    };
  }

  return {
    header: "X-XSS-Protection",
    status: "warning",
    value,
    score: 50,
    recommendations: [
      "Consider setting to 0 or removing entirely",
      "Use Content-Security-Policy for XSS protection",
    ],
  };
}

function analyzeReferrerPolicy(value: string | null): SecurityHeaderResult {
  if (!value) {
    return {
      header: "Referrer-Policy",
      status: "missing",
      value: null,
      score: 0,
      recommendations: [
        "Add a Referrer-Policy header to control information sent in the Referer header",
        "Consider 'strict-origin-when-cross-origin' or 'no-referrer' for privacy",
      ],
    };
  }

  const strictPolicies = ["no-referrer", "same-origin"];
  const goodPolicies = ["strict-origin", "strict-origin-when-cross-origin", "origin"];
  const weakPolicies = ["origin-when-cross-origin", "no-referrer-when-downgrade"];

  if (strictPolicies.includes(value.toLowerCase())) {
    return {
      header: "Referrer-Policy",
      status: "present",
      value,
      score: 100,
    };
  }

  if (goodPolicies.includes(value.toLowerCase())) {
    return {
      header: "Referrer-Policy",
      status: "present",
      value,
      score: 85,
    };
  }

  if (weakPolicies.includes(value.toLowerCase())) {
    return {
      header: "Referrer-Policy",
      status: "warning",
      value,
      score: 60,
      recommendations: [
        "Consider using a stricter policy like 'strict-origin-when-cross-origin'",
      ],
    };
  }

  if (value.toLowerCase() === "unsafe-url") {
    return {
      header: "Referrer-Policy",
      status: "warning",
      value,
      score: 20,
      recommendations: [
        "unsafe-url exposes the full URL including path and query string",
        "Use a stricter policy for better privacy",
      ],
    };
  }

  return {
    header: "Referrer-Policy",
    status: "invalid",
    value,
    score: 25,
    recommendations: [
      "Use a valid Referrer-Policy value",
    ],
  };
}

function analyzePermissionsPolicy(value: string | null): SecurityHeaderResult {
  if (!value) {
    return {
      header: "Permissions-Policy",
      status: "missing",
      value: null,
      score: 0,
      recommendations: [
        "Add a Permissions-Policy header to control browser features",
        "Restrict sensitive features like camera, microphone, and geolocation",
      ],
    };
  }

  const recommendations: string[] = [];
  let score = 50; // Base score for having the header

  // Check for restrictive policies
  const restrictedFeatures = [
    "geolocation",
    "camera",
    "microphone",
    "payment",
    "usb",
  ];

  for (const feature of restrictedFeatures) {
    if (value.includes(`${feature}=()`)) {
      score += 10;
    } else if (value.includes(`${feature}=self`) || value.includes(`${feature}=(self)`)) {
      score += 5;
    }
  }

  // Cap at 100
  score = Math.min(100, score);

  if (score < 80) {
    recommendations.push(
      "Consider restricting more sensitive features like camera, microphone, geolocation"
    );
  }

  return {
    header: "Permissions-Policy",
    status: recommendations.length > 0 ? "warning" : "present",
    value,
    score,
    recommendations: recommendations.length > 0 ? recommendations : undefined,
  };
}

function analyzeStrictTransportSecurity(value: string | null): SecurityHeaderResult {
  if (!value) {
    return {
      header: "Strict-Transport-Security",
      status: "missing",
      value: null,
      score: 0,
      recommendations: [
        "Add HSTS header to enforce HTTPS connections",
        "Use: Strict-Transport-Security: max-age=31536000; includeSubDomains",
      ],
    };
  }

  const recommendations: string[] = [];
  let score = 40; // Base score for having HSTS

  // Parse max-age
  const maxAgeMatch = value.match(/max-age=(\d+)/);
  const maxAge = maxAgeMatch?.[1] ? Number.parseInt(maxAgeMatch[1], 10) : 0;

  if (maxAge >= 31536000) {
    // 1 year or more
    score += 30;
  } else if (maxAge >= 15768000) {
    // 6 months
    score += 20;
    recommendations.push("Consider increasing max-age to 1 year (31536000)");
  } else if (maxAge >= 2592000) {
    // 1 month
    score += 10;
    recommendations.push("max-age is short; increase to at least 6 months");
  } else {
    recommendations.push("max-age is very short; increase to at least 6 months");
  }

  // Check for includeSubDomains
  if (value.toLowerCase().includes("includesubdomains")) {
    score += 15;
  } else {
    recommendations.push("Add includeSubDomains to protect all subdomains");
  }

  // Check for preload
  if (value.toLowerCase().includes("preload")) {
    score += 15;
  }

  // Cap at 100
  score = Math.min(100, score);

  return {
    header: "Strict-Transport-Security",
    status: recommendations.length > 0 ? "warning" : "present",
    value,
    score,
    recommendations: recommendations.length > 0 ? recommendations : undefined,
  };
}

async function checkHstsPreload(domain: string): Promise<SecurityHeaderResult> {
  try {
    // Call the hstspreload.org API
    const response = await fetch(`https://hstspreload.org/api/v2/status?domain=${encodeURIComponent(domain)}`, {
      headers: {
        "Accept": "application/json",
      },
    });

    if (!response.ok) {
      throw new Error(`HSTS Preload API returned ${response.status}`);
    }

    const data = await response.json() as { status: string; issues?: Array<{ code: string; message: string }> };

    if (data.status === "preloaded") {
      return {
        header: "HSTS Preload",
        status: "present",
        value: "preloaded",
        score: 100,
      };
    }

    if (data.status === "pending") {
      return {
        header: "HSTS Preload",
        status: "warning",
        value: "pending",
        score: 75,
        recommendations: ["Domain is pending addition to the HSTS preload list"],
      };
    }

    // Not preloaded
    const recommendations = ["Domain is not on the HSTS preload list"];
    if (data.issues && data.issues.length > 0) {
      recommendations.push(...data.issues.map((i) => i.message));
    }

    return {
      header: "HSTS Preload",
      status: "missing",
      value: null,
      score: 0,
      recommendations,
    };
  } catch (error) {
    return {
      header: "HSTS Preload",
      status: "invalid",
      value: null,
      score: 0,
      recommendations: [
        "Could not verify HSTS preload status",
        error instanceof Error ? error.message : "Unknown error",
      ],
    };
  }
}

function calculateGrade(score: number): SecurityGrade {
  if (score >= 90) return "A+";
  if (score >= 80) return "A";
  if (score >= 70) return "B";
  if (score >= 60) return "C";
  if (score >= 50) return "D";
  return "F";
}
