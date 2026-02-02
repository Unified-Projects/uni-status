import { Job } from "bullmq";
import { nanoid } from "nanoid";
import * as tls from "tls";
import { promises as dns } from "dns";
import { db } from "@uni-status/database";
import { monitors, checkResults } from "@uni-status/database/schema";
import { eq } from "drizzle-orm";
import { publishEvent } from "../lib/redis";
import { evaluateAlerts } from "../lib/alert-evaluator";
import { linkCheckToActiveIncident } from "../lib/incident-linker";
import type { CheckStatus } from "@uni-status/shared/types";
import { createLogger } from "@uni-status/shared";

const log = createLogger({ module: "ssl-check" });


interface SslCheckJob {
  monitorId: string;
  url: string;
  timeoutMs: number;
  regions: string[];
  config?: {
    ssl?: {
      expiryWarningDays?: number; // Days before expiry to trigger warning (default: 30)
      expiryErrorDays?: number;   // Days before expiry to trigger error (default: 7)
      checkChain?: boolean;       // Verify certificate chain
      checkHostname?: boolean;    // Verify hostname matches certificate
      minTlsVersion?: "TLSv1.2" | "TLSv1.3"; // Enforce minimum TLS version
      allowedCiphers?: string[];  // Allowed cipher suites (names)
      blockedCiphers?: string[];  // Blocked cipher suites (names)
      requireOcspStapling?: boolean; // Require OCSP staple in handshake
      ocspCheck?: boolean;        // Contact OCSP responder
      ocspResponderTimeoutMs?: number; // Timeout for OCSP responder reachability
      checkCrl?: boolean;         // Attempt CRL reachability
      requireCompleteChain?: boolean; // Require full chain (no missing intermediates)
      caaCheck?: boolean;         // Validate CAA records
      caaIssuers?: string[];      // Allowed CA issuers for CAA validation
    };
  };
}

export interface CertificateInfo {
  issuer?: string;
  subject?: string;
  validFrom?: string;
  validTo?: string;
  daysUntilExpiry?: number;
  serialNumber?: string;
  fingerprint?: string;
  altNames?: string[];
  protocol?: string;
  cipher?: string;
  isExpired?: boolean;
  chainValid?: boolean;
  hostnameValid?: boolean;
  chainComplete?: boolean;
  ocspStapled?: boolean;
  ocspUrl?: string;
  crlUrls?: string[];
}

export function getCertificateInfo(
  hostname: string,
  port: number,
  timeoutMs: number,
  checkHostname: boolean = true,
  requestOcsp: boolean = false
): Promise<CertificateInfo> {
  return new Promise((resolve, reject) => {
    const startTime = Date.now();
    let ocspStapled: boolean | undefined;

    const socket = tls.connect(
      {
        host: hostname,
        port: port,
        servername: hostname, // SNI
        rejectUnauthorized: false, // We want to check the cert ourselves
        requestOCSP: requestOcsp,
      } as tls.ConnectionOptions & tls.TLSSocketOptions,
      () => {
        try {
          const cert = socket.getPeerCertificate(true);
          const cipher = socket.getCipher();
          const protocol = socket.getProtocol();

          if (!cert || Object.keys(cert).length === 0) {
            socket.destroy();
            reject(new Error("No certificate received from server"));
            return;
          }

          // Parse certificate dates
          const validFrom = new Date(cert.valid_from);
          const validTo = new Date(cert.valid_to);
          const now = new Date();
          const daysUntilExpiry = Math.floor(
            (validTo.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)
          );

          // Check if certificate is expired
          const isExpired = now > validTo || now < validFrom;

          // Check hostname validity
          let hostnameValid = true;
          if (checkHostname) {
            const altNames = cert.subjectaltname
              ? cert.subjectaltname.split(", ").map((name: string) => name.replace(/^DNS:/, ""))
              : [];
            const cnMatch = cert.subject?.CN === hostname;
            const sanMatch = altNames.some((name: string) => {
              if (name.startsWith("*.")) {
                // Wildcard matching
                const wildcard = name.substring(2);
                return hostname.endsWith(wildcard) && hostname.split(".").length === wildcard.split(".").length + 1;
              }
              return name === hostname;
            });
            hostnameValid = cnMatch || sanMatch;
          }

          // Build certificate chain completeness flag (basic depth walk)
          let chainValid = true;
          let chainComplete = true;
          const seen = new Set<string>();
          let depth = 0;
          let currentCert: typeof cert | undefined = cert;
          while (currentCert && depth < 10) {
            const fingerprint = currentCert.fingerprint256 || currentCert.fingerprint || `${depth}-${currentCert.serialNumber ?? "unknown"}`;
            if (seen.has(fingerprint)) {
              // Cycle detected, stop
              break;
            }
            seen.add(fingerprint);

            const issuer = currentCert.issuerCertificate as tls.DetailedPeerCertificate | undefined;
            if (!issuer || issuer === currentCert) {
              // Reached root/self-signed
              break;
            }
            if (!issuer.raw) {
              chainComplete = false;
              break;
            }
            currentCert = issuer;
            depth += 1;
          }

          // Node's authorized flag still helps detect trust issues
          chainValid = socket.authorized || !checkHostname;

          const certInfo: CertificateInfo = {
            issuer: cert.issuer ? formatDN(cert.issuer) : undefined,
            subject: cert.subject ? formatDN(cert.subject) : undefined,
            validFrom: validFrom.toISOString(),
            validTo: validTo.toISOString(),
            daysUntilExpiry,
            serialNumber: cert.serialNumber,
            fingerprint: cert.fingerprint256 || cert.fingerprint,
            altNames: cert.subjectaltname
              ? cert.subjectaltname.split(", ").map((name: string) => name.replace(/^DNS:/, ""))
              : undefined,
            protocol: protocol || undefined,
            cipher: cipher?.name,
            isExpired,
            chainValid,
            hostnameValid,
            chainComplete,
            ocspStapled: requestOcsp ? Boolean(ocspStapled) : ocspStapled,
            ocspUrl: extractOcspUrl(cert),
            crlUrls: extractCrlUrls(cert),
          };

          socket.destroy();
          resolve(certInfo);
        } catch (error) {
          socket.destroy();
          reject(error);
        }
      }
    );

    socket.setTimeout(timeoutMs);

    socket.on("OCSPResponse", (data) => {
      ocspStapled = Boolean(data && data.length > 0);
    });

    socket.on("error", (error) => {
      socket.destroy();
      reject(error);
    });

    socket.on("timeout", () => {
      socket.destroy();
      reject(new Error("TLS connection timeout"));
    });

    // Additional timeout guard
    setTimeout(() => {
      if (!socket.destroyed) {
        socket.destroy();
        reject(new Error("TLS connection timeout"));
      }
    }, timeoutMs);
  });
}

function formatDN(dn: tls.Certificate): string {
  const parts: string[] = [];
  if (dn.CN) parts.push(`CN=${dn.CN}`);
  if (dn.O) parts.push(`O=${dn.O}`);
  if (dn.OU) parts.push(`OU=${dn.OU}`);
  if (dn.L) parts.push(`L=${dn.L}`);
  if (dn.ST) parts.push(`ST=${dn.ST}`);
  if (dn.C) parts.push(`C=${dn.C}`);
  return parts.join(", ");
}

function extractOcspUrl(cert: tls.PeerCertificate | tls.DetailedPeerCertificate): string | undefined {
  const infoAccess = cert?.infoAccess as Record<string, unknown> | undefined;
  if (infoAccess) {
    const ocspEntry = (infoAccess["OCSP"] ?? infoAccess["OCSP - URI"]) as string[] | string | undefined;
    if (Array.isArray(ocspEntry)) {
      return ocspEntry[0];
    }
    if (typeof ocspEntry === "string") return ocspEntry;
  }
  const ocspUrl = (cert as { ocsp_url?: string }).ocsp_url;
  if (typeof ocspUrl === "string") return ocspUrl;
  return undefined;
}

function extractCrlUrls(cert: tls.PeerCertificate | tls.DetailedPeerCertificate): string[] | undefined {
  const urls = new Set<string>();
  const infoAccess = cert?.infoAccess as Record<string, unknown> | undefined;
  const maybeAdd = (val: unknown) => {
    if (typeof val === "string") urls.add(val);
    if (Array.isArray(val)) {
      val.forEach((v) => {
        if (typeof v === "string") urls.add(v);
      });
    }
  };

  if (infoAccess) {
    maybeAdd(infoAccess["X509v3 CRL Distribution Points"]);
    maybeAdd(infoAccess["CRL Distribution Points"]);
    maybeAdd(infoAccess["crlDistributionPoints"]);
  }

  maybeAdd((cert as { crl?: string | string[] }).crl);
  maybeAdd((cert as { crl_url?: string | string[] }).crl_url);

  const arr = Array.from(urls);
  return arr.length > 0 ? arr : undefined;
}

function isProtocolBelowMin(protocol: string | undefined, min: "TLSv1.2" | "TLSv1.3"): boolean {
  if (!protocol) return false;
  const order = ["TLSv1", "TLSv1.1", "TLSv1.2", "TLSv1.3"];
  const currentIdx = order.indexOf(protocol);
  const minIdx = order.indexOf(min);
  if (currentIdx === -1 || minIdx === -1) return false;
  return currentIdx < minIdx;
}

async function checkUrlReachable(url: string, timeoutMs: number): Promise<{ ok: boolean; error?: string; status?: number }> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const resp = await fetch(url, { method: "HEAD", redirect: "follow", signal: controller.signal });
    clearTimeout(timeout);
    return { ok: resp.ok, status: resp.status };
  } catch (error) {
    clearTimeout(timeout);
    return { ok: false, error: error instanceof Error ? error.message : "unknown error" };
  }
}

async function validateCaa(hostname: string, allowedIssuers?: string[]): Promise<{ valid: boolean; records?: string[]; error?: string }> {
  try {
    const records = await dns.resolveCaa(hostname);
    if (!records || records.length === 0) {
      // No CAA records: allowed by default
      return { valid: true, records: [] };
    }

    const recordStrings = records.map((r) => {
      if ("issue" in r && r.issue) return `issue ${r.issue}`;
      if ("issuewild" in r && r.issuewild) return `issuewild ${r.issuewild}`;
      if ("iodef" in r && r.iodef) return `iodef ${r.iodef}`;
      return JSON.stringify(r);
    });

    if (allowedIssuers && allowedIssuers.length > 0) {
      const issuerAllowed = records.some((r: any) => {
        const issuer = r.issue || r.issuewild;
        return issuer && allowedIssuers.some((allowed) => issuer.includes(allowed));
      });
      return { valid: issuerAllowed, records: recordStrings, error: issuerAllowed ? undefined : "Issuer not permitted by CAA" };
    }

    return { valid: true, records: recordStrings };
  } catch (error) {
    const message = error instanceof Error ? error.message : "CAA lookup failed";
    // Treat missing records as permissive
    const code = (error as { code?: string })?.code;
    if (code === "ENODATA" || code === "ENOTFOUND" || code === "ENODNS") {
      return { valid: true, error: "no_caa_records" };
    }
    return { valid: false, error: message };
  }
}

export async function processSslCheck(job: Job<SslCheckJob>) {
  const { monitorId, url, timeoutMs, regions, config } = job.data;
  const defaultRegion = process.env.MONITOR_DEFAULT_REGION || "uk";
  const preferredRegion = regions[0] || defaultRegion;
  const region = preferredRegion === "us-east" && defaultRegion !== "us-east"
    ? defaultRegion
    : preferredRegion;

  // Get SSL config options
  const sslConfig = config?.ssl;
  const expiryWarningDays = sslConfig?.expiryWarningDays ?? 30;
  const expiryErrorDays = sslConfig?.expiryErrorDays ?? 7;
  const checkChain = sslConfig?.checkChain ?? true;
  const checkHostname = sslConfig?.checkHostname ?? true;

  log.info(`Processing SSL check for ${monitorId}: ${url}`);

  const startTime = performance.now();
  let status: CheckStatus = "success";
  let responseTimeMs = 0;
  let errorMessage: string | undefined;
  let errorCode: string | undefined;
  let certificateInfo: CertificateInfo | undefined;
  let ocspResponderStatus: string | undefined;
  let ocspResponderOk: boolean | undefined;
  let caaStatus: string | undefined;
  let caaValid: boolean | undefined;
  let crlStatus: string | undefined;
  let tlsVersionStatus: string | undefined;
  let cipherStatus: string | undefined;
  let certificateDetails: Record<string, unknown> | undefined;

  try {
    // Parse URL to get hostname and port
    const parsedUrl = new URL(url);
    const hostname = parsedUrl.hostname;
    const port = parsedUrl.port ? parseInt(parsedUrl.port) : 443;

    // Get certificate information
    const requestOcsp = Boolean(sslConfig?.requireOcspStapling || sslConfig?.ocspCheck);
    certificateInfo = await getCertificateInfo(hostname, port, timeoutMs, checkHostname, requestOcsp);
    responseTimeMs = Math.round(performance.now() - startTime);

    // Evaluate certificate status
    if (certificateInfo.isExpired) {
      status = "failure";
      errorMessage = "Certificate has expired";
      errorCode = "CERT_EXPIRED";
    } else if (!certificateInfo.hostnameValid && checkHostname) {
      status = "failure";
      errorMessage = `Certificate hostname mismatch: expected ${hostname}`;
      errorCode = "CERT_HOSTNAME_MISMATCH";
    } else if (!certificateInfo.chainValid && checkChain) {
      status = "degraded";
      errorMessage = "Certificate chain validation failed";
      errorCode = "CERT_CHAIN_INVALID";
    } else if (sslConfig?.requireCompleteChain && certificateInfo.chainComplete === false) {
      status = "failure";
      errorMessage = "Certificate chain incomplete (missing intermediates)";
      errorCode = "CERT_CHAIN_INCOMPLETE";
    } else if (certificateInfo.daysUntilExpiry !== undefined) {
      if (certificateInfo.daysUntilExpiry <= expiryErrorDays) {
        status = "failure";
        errorMessage = `Certificate expires in ${certificateInfo.daysUntilExpiry} days`;
        errorCode = "CERT_EXPIRING_CRITICAL";
      } else if (certificateInfo.daysUntilExpiry <= expiryWarningDays) {
        status = "degraded";
        errorMessage = `Certificate expires in ${certificateInfo.daysUntilExpiry} days`;
        errorCode = "CERT_EXPIRING_WARNING";
      }
    }

    // TLS version enforcement
    if (
      status === "success" &&
      sslConfig?.minTlsVersion &&
      isProtocolBelowMin(certificateInfo.protocol, sslConfig.minTlsVersion)
    ) {
      status = "failure";
      errorMessage = `TLS version ${certificateInfo.protocol} below minimum ${sslConfig.minTlsVersion}`;
      errorCode = "TLS_VERSION_TOO_LOW";
      tlsVersionStatus = "below_minimum";
    } else if (sslConfig?.minTlsVersion) {
      tlsVersionStatus = "meets_minimum";
    }

    // Cipher suite auditing
    if (certificateInfo.cipher) {
      if (sslConfig?.blockedCiphers?.includes(certificateInfo.cipher)) {
        status = "failure";
        errorMessage = `Blocked cipher detected: ${certificateInfo.cipher}`;
        errorCode = "CIPHER_BLOCKED";
        cipherStatus = "blocked";
      } else if (
        sslConfig?.allowedCiphers &&
        sslConfig.allowedCiphers.length > 0 &&
        !sslConfig.allowedCiphers.includes(certificateInfo.cipher)
      ) {
        if (status === "success") status = "degraded";
        errorMessage = errorMessage
          ? `${errorMessage}; Cipher ${certificateInfo.cipher} not in allow list`
          : `Cipher ${certificateInfo.cipher} not in allow list`;
        errorCode = errorCode || "CIPHER_NOT_ALLOWED";
        cipherStatus = "not_allowed";
      } else {
        cipherStatus = "allowed";
      }
    }

    // OCSP stapling requirement
    if (sslConfig?.requireOcspStapling) {
      if (!certificateInfo.ocspStapled) {
        if (status === "success") status = "degraded";
        errorMessage = errorMessage
          ? `${errorMessage}; OCSP stapling missing`
          : "OCSP stapling missing";
        errorCode = errorCode || "OCSP_STAPLE_MISSING";
      }
    }

    // OCSP responder reachability (best-effort)
    if (sslConfig?.ocspCheck && certificateInfo.ocspUrl) {
      const ocspTimeout = sslConfig.ocspResponderTimeoutMs ?? 5000;
      const ocspResult = await checkUrlReachable(certificateInfo.ocspUrl, ocspTimeout);
      ocspResponderOk = ocspResult.ok;
      ocspResponderStatus = ocspResult.ok ? "ok" : ocspResult.error || `HTTP ${ocspResult.status ?? "unknown"}`;
      if (!ocspResult.ok) {
        if (status === "success") status = "degraded";
        errorMessage = errorMessage
          ? `${errorMessage}; OCSP responder unreachable`
          : "OCSP responder unreachable";
        errorCode = errorCode || "OCSP_RESPONDER_UNREACHABLE";
      }
    } else if (sslConfig?.ocspCheck && !certificateInfo.ocspUrl) {
      ocspResponderStatus = "no_ocsp_url";
      if (status === "success") status = "degraded";
      errorMessage = errorMessage
        ? `${errorMessage}; OCSP URL not present in certificate`
        : "OCSP URL not present in certificate";
      errorCode = errorCode || "OCSP_URL_MISSING";
    }

    // CRL reachability (best-effort)
    if (sslConfig?.checkCrl && certificateInfo.crlUrls?.length) {
      const [crlUrl] = certificateInfo.crlUrls;
      if (crlUrl) {
        const crlResult = await checkUrlReachable(
          crlUrl,
          sslConfig.ocspResponderTimeoutMs ?? 5000
        );
        crlStatus = crlResult.ok ? "ok" : crlResult.error || `HTTP ${crlResult.status ?? "unknown"}`;
        if (!crlResult.ok) {
          if (status === "success") status = "degraded";
          errorMessage = errorMessage
            ? `${errorMessage}; CRL endpoint unreachable`
            : "CRL endpoint unreachable";
          errorCode = errorCode || "CRL_UNREACHABLE";
        }
      } else {
        crlStatus = "no_crl_urls";
      }
    } else if (sslConfig?.checkCrl) {
      crlStatus = "no_crl_urls";
    }

    // CAA validation
    if (sslConfig?.caaCheck) {
      const caaResult = await validateCaa(hostname, sslConfig.caaIssuers);
      caaValid = caaResult.valid;
      caaStatus = caaResult.error || (caaResult.valid ? "ok" : "invalid");
      if (!caaResult.valid) {
        if (status === "success") status = "degraded";
        errorMessage = errorMessage
          ? `${errorMessage}; CAA validation failed`
          : "CAA validation failed";
        errorCode = errorCode || "CAA_INVALID";
      }
    }

    certificateDetails = certificateInfo
      ? {
          serialNumber: certificateInfo.serialNumber,
          fingerprint: certificateInfo.fingerprint,
          altNames: certificateInfo.altNames,
          protocol: certificateInfo.protocol,
          cipher: certificateInfo.cipher,
          chainValid: certificateInfo.chainValid,
          hostnameValid: certificateInfo.hostnameValid,
          chainComplete: certificateInfo.chainComplete,
          ocspStapled: certificateInfo.ocspStapled,
          ocspUrl: certificateInfo.ocspUrl,
          ocspResponder: ocspResponderStatus,
          crlStatus,
          caaStatus,
          tlsVersionStatus,
          cipherStatus,
        }
      : undefined;
  } catch (error) {
    responseTimeMs = Math.round(performance.now() - startTime);
    status = "error";

    if (error instanceof Error) {
      errorMessage = error.message;

      // Map common TLS errors to codes
      if (error.message.includes("ECONNREFUSED")) {
        errorCode = "CONNECTION_REFUSED";
        errorMessage = "Connection refused - server not accepting TLS connections";
      } else if (error.message.includes("ENOTFOUND")) {
        errorCode = "HOST_NOT_FOUND";
        errorMessage = "Hostname could not be resolved";
      } else if (error.message.includes("timeout")) {
        errorCode = "TIMEOUT";
        status = "timeout";
      } else if (error.message.includes("UNABLE_TO_GET_ISSUER_CERT")) {
        errorCode = "CERT_CHAIN_INCOMPLETE";
        errorMessage = "Unable to verify certificate chain - missing issuer certificate";
      } else if (error.message.includes("CERT_HAS_EXPIRED")) {
        errorCode = "CERT_EXPIRED";
        errorMessage = "Certificate has expired";
      } else if (error.message.includes("DEPTH_ZERO_SELF_SIGNED")) {
        errorCode = "SELF_SIGNED";
        errorMessage = "Self-signed certificate detected";
      } else if (error.message.includes("UNABLE_TO_VERIFY_LEAF_SIGNATURE")) {
        errorCode = "CERT_UNTRUSTED";
        errorMessage = "Unable to verify certificate - untrusted certificate authority";
      } else {
        errorCode = error.name || "SSL_ERROR";
      }
    } else {
      errorMessage = "SSL check failed";
      errorCode = "SSL_ERROR";
    }
  }

  // Fetch monitor to check its type and get organizationId
  const monitor = await db
    .select({ organizationId: monitors.organizationId, type: monitors.type })
    .from(monitors)
    .where(eq(monitors.id, monitorId))
    .limit(1);

  const isSSLMonitor = monitor[0]?.type === "ssl";

  // For SSL-type monitors: store results, update status, trigger alerts
  // For HTTPS monitors: only capture certificate info (HTTP check handles the rest)
  if (isSSLMonitor) {
    const resultId = nanoid();

    await db.insert(checkResults).values({
      id: resultId,
      monitorId,
      region,
      status,
      responseTimeMs,
      tlsMs: responseTimeMs,
      errorMessage,
      errorCode,
      certificateInfo: certificateInfo ? {
        issuer: certificateInfo.issuer,
        subject: certificateInfo.subject,
        validFrom: certificateInfo.validFrom,
        validTo: certificateInfo.validTo,
        daysUntilExpiry: certificateInfo.daysUntilExpiry,
      } : undefined,
      headers: certificateInfo ? {
        serialNumber: certificateInfo.serialNumber || "",
        fingerprint: certificateInfo.fingerprint || "",
        protocol: certificateInfo.protocol || "",
        cipher: certificateInfo.cipher || "",
        altNames: certificateInfo.altNames?.join(", ") || "",
        chainValid: String(certificateInfo.chainValid),
        hostnameValid: String(certificateInfo.hostnameValid),
        chainComplete: certificateInfo.chainComplete === undefined ? "" : String(certificateInfo.chainComplete),
        ocspStapled: certificateInfo.ocspStapled === undefined ? "" : String(certificateInfo.ocspStapled),
        ocspUrl: certificateInfo.ocspUrl || "",
        ocspResponder: ocspResponderStatus || "",
        crlStatus: crlStatus || "",
        caaStatus: caaStatus || "",
        tlsVersionStatus: tlsVersionStatus || "",
        cipherStatus: cipherStatus || "",
      } : undefined,
      metadata: certificateDetails ? { certificateDetails } : undefined,
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

    await db
      .update(monitors)
      .set({
        status: newStatus,
        lastCheckedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(monitors.id, monitorId));

    // Evaluate alert policies
    if (monitor[0]) {
      await evaluateAlerts({
        monitorId,
        organizationId: monitor[0].organizationId,
        checkResultId: resultId,
        checkStatus: status,
        errorMessage,
        responseTimeMs,
      });
    }
  }

  // Publish certificate info event (for real-time updates) - always
  await publishEvent(`monitor:${monitorId}`, {
    type: "monitor:certificate",
    data: {
      monitorId,
      status,
      certificateInfo,
      errorMessage,
      errorCode,
      timestamp: new Date().toISOString(),
    },
  });

  const expiryInfo = certificateInfo?.daysUntilExpiry !== undefined
    ? ` (expires in ${certificateInfo.daysUntilExpiry} days)`
    : "";
  log.info(`[SSL Check] ${isSSLMonitor ? "Full check" : "Cert info only"} for ${monitorId}: ${status}${expiryInfo}`);

  return { status, responseTimeMs, certificateInfo };
}
