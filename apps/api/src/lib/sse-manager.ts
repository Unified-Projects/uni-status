import IORedis from "ioredis";
import { SSE_CHANNELS } from "@uni-status/shared/constants";
import { getRedisUrl } from "@uni-status/shared/config";
import { createLogger } from "@uni-status/shared";
import { db } from "@uni-status/database";
import { monitors } from "@uni-status/database/schema";
import { eq } from "drizzle-orm";

const log = createLogger({ module: "realtime-hub" });
const REDIS_URL = getRedisUrl();

export interface SSEClient {
  id: string;
  organizationId?: string;
  monitorId?: string;
  statusPageSlug?: string;
  protocol?: "sse" | "websocket";
  send: (event: string, data: unknown) => Promise<void>;
}

export interface SSEEvent {
  type: string;
  data: unknown;
  timestamp: string;
}

class SSEConnectionManager {
  private clients: Map<string, SSEClient> = new Map();
  private clientsByOrganization: Map<string, Set<string>> = new Map();
  private clientsByMonitor: Map<string, Set<string>> = new Map();
  private clientsByStatusPage: Map<string, Set<string>> = new Map();
  private subscriber: IORedis | null = null;
  private initialized = false;
  private monitorOrgCache = new Map<string, { organizationId: string; timestamp: number }>();
  private readonly monitorOrgCacheTtlMs = 5 * 60 * 1000;
  private readonly monitorOrgCacheMaxEntries = 2048;

  private addClientToIndex(index: Map<string, Set<string>>, key: string | undefined, clientId: string) {
    if (!key) return;
    const existing = index.get(key);
    if (existing) {
      existing.add(clientId);
      return;
    }
    index.set(key, new Set([clientId]));
  }

  private removeClientFromIndex(index: Map<string, Set<string>>, key: string | undefined, clientId: string) {
    if (!key) return;
    const existing = index.get(key);
    if (!existing) return;
    existing.delete(clientId);
    if (existing.size === 0) {
      index.delete(key);
    }
  }

  private indexClient(client: SSEClient) {
    this.addClientToIndex(this.clientsByOrganization, client.organizationId, client.id);
    this.addClientToIndex(this.clientsByMonitor, client.monitorId, client.id);
    this.addClientToIndex(this.clientsByStatusPage, client.statusPageSlug, client.id);
  }

  private unindexClient(client: SSEClient) {
    this.removeClientFromIndex(this.clientsByOrganization, client.organizationId, client.id);
    this.removeClientFromIndex(this.clientsByMonitor, client.monitorId, client.id);
    this.removeClientFromIndex(this.clientsByStatusPage, client.statusPageSlug, client.id);
  }

  private pruneMonitorOrgCache(now = Date.now()) {
    for (const [monitorId, entry] of this.monitorOrgCache.entries()) {
      if (now - entry.timestamp >= this.monitorOrgCacheTtlMs) {
        this.monitorOrgCache.delete(monitorId);
      }
    }

    if (this.monitorOrgCache.size <= this.monitorOrgCacheMaxEntries) {
      return;
    }

    const overflow = this.monitorOrgCache.size - this.monitorOrgCacheMaxEntries;
    const oldestEntries = Array.from(this.monitorOrgCache.entries())
      .sort((a, b) => a[1].timestamp - b[1].timestamp)
      .slice(0, overflow);

    for (const [monitorId] of oldestEntries) {
      this.monitorOrgCache.delete(monitorId);
    }
  }

  private setMonitorOrgCacheEntry(monitorId: string, organizationId: string, now = Date.now()) {
    this.monitorOrgCache.delete(monitorId);
    this.monitorOrgCache.set(monitorId, {
      organizationId,
      timestamp: now,
    });
    this.pruneMonitorOrgCache(now);
  }

  /**
   * Initialize the connection manager and subscribe to Redis
   */
  async initialize() {
    if (this.initialized) return;

    this.subscriber = new IORedis(REDIS_URL);

    // Subscribe to all event patterns
    await this.subscriber.psubscribe(
      `${SSE_CHANNELS.MONITOR}*`,
      `${SSE_CHANNELS.ORGANIZATION}*`,
      `${SSE_CHANNELS.STATUS_PAGE}*`
    );

    // Handle incoming messages
    this.subscriber.on("pmessage", (_pattern, channel, message) => {
      void this.handleMessage(channel, message);
    });

    this.initialized = true;
    log.info("Initialized and subscribed to Redis channels");
  }

  /**
   * Handle incoming Redis message and fan-out to relevant clients
   */
  private async handleMessage(channel: string, message: string) {
    try {
      const event = JSON.parse(message) as SSEEvent;

      // Add timestamp if not present
      if (!event.timestamp) {
        event.timestamp = new Date().toISOString();
      }

      // Determine which clients should receive this event
      const targetClients = await this.getTargetClients(channel, event);

      // Send to all target clients
      for (const client of targetClients) {
        client.send(event.type, event).catch((err) => {
          log.error({ err, clientId: client.id }, "Failed to send to client");
          this.removeClient(client.id);
        });
      }
    } catch (err) {
      log.error({ err }, "Failed to parse message");
    }
  }

  private extractOrganizationId(event: SSEEvent): string | null {
    const eventRecord = (typeof event === "object" && event !== null)
      ? event as unknown as Record<string, unknown>
      : null;
    const dataRecord = (typeof event.data === "object" && event.data !== null)
      ? event.data as Record<string, unknown>
      : null;

    const fromData = dataRecord?.organizationId;
    if (typeof fromData === "string" && fromData.length > 0) {
      return fromData;
    }

    const nestedMonitor = dataRecord?.monitor;
    if (typeof nestedMonitor === "object" && nestedMonitor !== null) {
      const nestedOrg = (nestedMonitor as Record<string, unknown>).organizationId;
      if (typeof nestedOrg === "string" && nestedOrg.length > 0) {
        return nestedOrg;
      }
    }

    const fromEvent = eventRecord?.organizationId;
    if (typeof fromEvent === "string" && fromEvent.length > 0) {
      return fromEvent;
    }

    return null;
  }

  private async getOrganizationIdForMonitor(monitorId: string): Promise<string | null> {
    const now = Date.now();
    this.pruneMonitorOrgCache(now);

    const cached = this.monitorOrgCache.get(monitorId);
    if (cached && now - cached.timestamp < this.monitorOrgCacheTtlMs) {
      this.setMonitorOrgCacheEntry(monitorId, cached.organizationId, now);
      return cached.organizationId;
    }

    if (cached) {
      this.monitorOrgCache.delete(monitorId);
    }

    const monitor = await db.query.monitors.findFirst({
      where: eq(monitors.id, monitorId),
      columns: {
        organizationId: true,
      },
    });

    if (!monitor?.organizationId) {
      return null;
    }

    this.setMonitorOrgCacheEntry(monitorId, monitor.organizationId, now);
    return monitor.organizationId;
  }

  /**
   * Get clients that should receive an event based on channel
   */
  private async getTargetClients(channel: string, event: SSEEvent): Promise<SSEClient[]> {
    const targets = new Map<string, SSEClient>();
    const addTarget = (client: SSEClient) => {
      targets.set(client.id, client);
    };
    const addTargetsByIds = (ids: Set<string> | undefined) => {
      if (!ids) return;
      for (const id of ids) {
        const client = this.clients.get(id);
        if (client) {
          addTarget(client);
        }
      }
    };

    // Monitor channel: monitor:${id}
    if (channel.startsWith(SSE_CHANNELS.MONITOR)) {
      const monitorId = channel.replace(SSE_CHANNELS.MONITOR, "");
      const eventOrgId = this.extractOrganizationId(event) || await this.getOrganizationIdForMonitor(monitorId);
      const monitorSubscribers = this.clientsByMonitor.get(monitorId);
      addTargetsByIds(monitorSubscribers);

      if (eventOrgId) {
        const orgSubscribers = this.clientsByOrganization.get(eventOrgId);
        if (orgSubscribers) {
          for (const clientId of orgSubscribers) {
            const client = this.clients.get(clientId);
            if (client && !client.monitorId && !client.statusPageSlug) {
              addTarget(client);
            }
          }
        }
      }
    }

    // Organization channel: org:${id}
    if (channel.startsWith(SSE_CHANNELS.ORGANIZATION)) {
      const orgId = channel.replace(SSE_CHANNELS.ORGANIZATION, "");
      addTargetsByIds(this.clientsByOrganization.get(orgId));
    }

    // Status page channel: status:${slug}
    if (channel.startsWith(SSE_CHANNELS.STATUS_PAGE)) {
      const slug = channel.replace(SSE_CHANNELS.STATUS_PAGE, "");
      addTargetsByIds(this.clientsByStatusPage.get(slug));
    }

    return Array.from(targets.values());
  }

  /**
   * Register a new SSE client
   */
  addClient(client: SSEClient) {
    this.clients.set(client.id, client);
    this.indexClient(client);
    log.info({ clientId: client.id, totalClients: this.clients.size }, "Client connected");
  }

  /**
   * Remove an SSE client
   */
  removeClient(clientId: string) {
    const existing = this.clients.get(clientId);
    const removed = this.clients.delete(clientId);
    if (removed) {
      if (existing) {
        this.unindexClient(existing);
      }
      log.info({ clientId, totalClients: this.clients.size }, "Client disconnected");
    }
  }

  /**
   * Update an existing client's subscription info
   */
  updateClient(clientId: string, updates: Partial<Omit<SSEClient, "id" | "send">>) {
    const client = this.clients.get(clientId);
    if (!client) return;
    this.unindexClient(client);
    const updated = { ...client, ...updates };
    this.clients.set(clientId, updated);
    this.indexClient(updated);
  }

  /**
   * Get connected client count
   */
  getClientCount(): number {
    return this.clients.size;
  }

  /**
   * Broadcast an event to all clients (for debugging/admin)
   */
  async broadcast(event: SSEEvent) {
    for (const client of this.clients.values()) {
      try {
        await client.send(event.type, event);
      } catch (err) {
        log.error({ err, clientId: client.id }, "Broadcast failed for client");
        this.removeClient(client.id);
      }
    }
  }
}

// Singleton instances/aliases for SSE + WebSocket consumers
export const realtimeHub = new SSEConnectionManager();
export const sseManager = realtimeHub;
