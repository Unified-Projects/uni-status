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
  private subscriber: IORedis | null = null;
  private initialized = false;
  private monitorOrgCache = new Map<string, { organizationId: string; timestamp: number }>();
  private readonly monitorOrgCacheTtlMs = 5 * 60 * 1000;

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
    const cached = this.monitorOrgCache.get(monitorId);
    const now = Date.now();
    if (cached && now - cached.timestamp < this.monitorOrgCacheTtlMs) {
      return cached.organizationId;
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

    this.monitorOrgCache.set(monitorId, {
      organizationId: monitor.organizationId,
      timestamp: now,
    });
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

    // Monitor channel: monitor:${id}
    if (channel.startsWith(SSE_CHANNELS.MONITOR)) {
      const monitorId = channel.replace(SSE_CHANNELS.MONITOR, "");
      const eventOrgId = this.extractOrganizationId(event) || await this.getOrganizationIdForMonitor(monitorId);

      for (const client of this.clients.values()) {
        // Direct monitor subscription
        if (client.monitorId === monitorId) {
          addTarget(client);
        }

        // Dashboard subscriptions only receive monitor events scoped to their organization.
        if (client.organizationId && !client.monitorId && !client.statusPageSlug) {
          if (eventOrgId && client.organizationId === eventOrgId) {
            addTarget(client);
          }
        }
      }
    }

    // Organization channel: org:${id}
    if (channel.startsWith(SSE_CHANNELS.ORGANIZATION)) {
      const orgId = channel.replace(SSE_CHANNELS.ORGANIZATION, "");

      for (const client of this.clients.values()) {
        if (client.organizationId === orgId) {
          addTarget(client);
        }
      }
    }

    // Status page channel: status:${slug}
    if (channel.startsWith(SSE_CHANNELS.STATUS_PAGE)) {
      const slug = channel.replace(SSE_CHANNELS.STATUS_PAGE, "");

      for (const client of this.clients.values()) {
        if (client.statusPageSlug === slug) {
          addTarget(client);
        }
      }
    }

    return Array.from(targets.values());
  }

  /**
   * Register a new SSE client
   */
  addClient(client: SSEClient) {
    this.clients.set(client.id, client);
    log.info({ clientId: client.id, totalClients: this.clients.size }, "Client connected");
  }

  /**
   * Remove an SSE client
   */
  removeClient(clientId: string) {
    const removed = this.clients.delete(clientId);
    if (removed) {
      log.info({ clientId, totalClients: this.clients.size }, "Client disconnected");
    }
  }

  /**
   * Update an existing client's subscription info
   */
  updateClient(clientId: string, updates: Partial<Omit<SSEClient, "id" | "send">>) {
    const client = this.clients.get(clientId);
    if (!client) return;
    this.clients.set(clientId, { ...client, ...updates });
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
