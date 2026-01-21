import { Resolver } from "dns/promises";

export interface DnsResolverOptions {
  hostname: string;
  recordType: "TXT" | "A" | "AAAA" | "CNAME" | "MX" | "NS";
  timeoutMs?: number;
  retries?: number;
}

export interface DnsResolverResult {
  success: boolean;
  records: string[];
  resolverUsed?: string;
  error?: string;
}

interface ResolverConfig {
  name: string;
  address: string;
}

interface DoHEndpoint {
  name: string;
  url: string;
}

const PUBLIC_RESOLVERS: ResolverConfig[] = [
  { name: "Google", address: "8.8.8.8" },
  { name: "Google Secondary", address: "8.8.4.4" },
  { name: "Cloudflare", address: "1.1.1.1" },
  { name: "Cloudflare Secondary", address: "1.0.0.1" },
];

const DOH_ENDPOINTS: DoHEndpoint[] = [
  { name: "Google DoH", url: "https://dns.google/resolve" },
  { name: "Cloudflare DoH", url: "https://cloudflare-dns.com/dns-query" },
];

async function resolveViaUdp(
  hostname: string,
  recordType: string,
  nameserver: string,
  timeoutMs: number
): Promise<{ records: string[]; error?: string }> {
  const resolver = new Resolver();
  resolver.setServers([nameserver]);

  const timeoutPromise = new Promise<never>((_, reject) => {
    setTimeout(() => reject(new Error("DNS query timeout")), timeoutMs);
  });

  try {
    let records: string[] = [];

    const queryPromise = (async () => {
      switch (recordType) {
        case "TXT": {
          const result = await resolver.resolveTxt(hostname);
          return result.flat();
        }
        case "A": {
          return await resolver.resolve4(hostname);
        }
        case "AAAA": {
          return await resolver.resolve6(hostname);
        }
        case "CNAME": {
          return await resolver.resolveCname(hostname);
        }
        case "MX": {
          const result = await resolver.resolveMx(hostname);
          return result.map((r) => `${r.priority} ${r.exchange}`);
        }
        case "NS": {
          return await resolver.resolveNs(hostname);
        }
        default:
          throw new Error(`Unsupported record type: ${recordType}`);
      }
    })();

    records = await Promise.race([queryPromise, timeoutPromise]);
    return { records };
  } catch (error) {
    const message = error instanceof Error ? error.message : "DNS lookup failed";
    return { records: [], error: message };
  }
}

async function resolveViaDoH(
  hostname: string,
  recordType: string,
  endpoint: string,
  timeoutMs: number
): Promise<{ records: string[]; error?: string }> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const url = new URL(endpoint);
    url.searchParams.set("name", hostname);
    url.searchParams.set("type", recordType);

    const response = await fetch(url.toString(), {
      headers: { accept: "application/dns-json" },
      signal: controller.signal,
    });

    if (!response.ok) {
      return { records: [], error: `DoH returned HTTP ${response.status}` };
    }

    const json = await response.json() as { Answer?: Array<{ data?: string }> };
    const answers = Array.isArray(json.Answer) ? json.Answer : [];

    // DoH returns TXT records with quotes, strip them
    const records = answers
      .map((answer) => {
        const data = answer.data;
        if (typeof data !== "string") return null;
        // Strip surrounding quotes from TXT records
        return data.replace(/^"|"$/g, "");
      })
      .filter((val): val is string => val !== null);

    return { records };
  } catch (error) {
    const message = error instanceof Error ? error.message : "DoH query failed";
    return { records: [], error: message };
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Resolves DNS records using multiple public DNS resolvers with retry logic.
 * This provides more reliable DNS lookups than using only the system resolver,
 * especially for recently-created records that may not have fully propagated.
 */
export async function resolveDnsRecords(options: DnsResolverOptions): Promise<DnsResolverResult> {
  const { hostname, recordType, timeoutMs = 5000, retries = 2 } = options;

  // Try each resolver with retries
  for (let attempt = 0; attempt <= retries; attempt++) {
    // Try UDP resolvers first (faster)
    for (const resolver of PUBLIC_RESOLVERS) {
      const result = await resolveViaUdp(hostname, recordType, resolver.address, timeoutMs);
      if (result.records.length > 0) {
        return {
          success: true,
          records: result.records,
          resolverUsed: `UDP:${resolver.name} (${resolver.address})`,
        };
      }
    }

    // Try DoH resolvers as fallback (works through firewalls)
    for (const endpoint of DOH_ENDPOINTS) {
      const result = await resolveViaDoH(hostname, recordType, endpoint.url, timeoutMs);
      if (result.records.length > 0) {
        return {
          success: true,
          records: result.records,
          resolverUsed: `DoH:${endpoint.name}`,
        };
      }
    }

    // Small delay before retry
    if (attempt < retries) {
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
  }

  return {
    success: false,
    records: [],
    error: "Could not resolve DNS records using any resolver. The record may not have propagated yet.",
  };
}
