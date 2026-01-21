import IORedis from "ioredis";
import { SSE_CHANNELS } from "@uni-status/shared/constants";
import { getRedisUrl } from "@uni-status/shared/config";

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
      this.handleMessage(channel, message);
    });

    this.initialized = true;
    console.log("[Realtime Hub] Initialized and subscribed to Redis channels");
  }

  /**
   * Handle incoming Redis message and fan-out to relevant clients
   */
  private handleMessage(channel: string, message: string) {
    try {
      const event = JSON.parse(message) as SSEEvent;

      // Add timestamp if not present
      if (!event.timestamp) {
        event.timestamp = new Date().toISOString();
      }

      // Determine which clients should receive this event
      const targetClients = this.getTargetClients(channel, event);

      // Send to all target clients
      for (const client of targetClients) {
        client.send(event.type, event).catch((err) => {
          console.error(`[Realtime Hub] Failed to send to client ${client.id}:`, err);
          this.removeClient(client.id);
        });
      }
    } catch (err) {
      console.error("[Realtime Hub] Failed to parse message:", err);
    }
  }

  /**
   * Get clients that should receive an event based on channel
   */
  private getTargetClients(channel: string, event: SSEEvent): SSEClient[] {
    const targets: SSEClient[] = [];

    // Monitor channel: monitor:${id}
    if (channel.startsWith(SSE_CHANNELS.MONITOR)) {
      const monitorId = channel.replace(SSE_CHANNELS.MONITOR, "");

      for (const client of this.clients.values()) {
        // Direct monitor subscription
        if (client.monitorId === monitorId) {
          targets.push(client);
        }

        // Dashboard subscriptions get all monitor events for their org
        // Note: We'd need organizationId in the event to filter properly
        // For now, dashboard clients receive all monitor events
        if (client.organizationId && !client.monitorId && !client.statusPageSlug) {
          targets.push(client);
        }
      }
    }

    // Organization channel: org:${id}
    if (channel.startsWith(SSE_CHANNELS.ORGANIZATION)) {
      const orgId = channel.replace(SSE_CHANNELS.ORGANIZATION, "");

      for (const client of this.clients.values()) {
        if (client.organizationId === orgId) {
          targets.push(client);
        }
      }
    }

    // Status page channel: status:${slug}
    if (channel.startsWith(SSE_CHANNELS.STATUS_PAGE)) {
      const slug = channel.replace(SSE_CHANNELS.STATUS_PAGE, "");

      for (const client of this.clients.values()) {
        if (client.statusPageSlug === slug) {
          targets.push(client);
        }
      }
    }

    return targets;
  }

  /**
   * Register a new SSE client
   */
  addClient(client: SSEClient) {
    this.clients.set(client.id, client);
    console.log(`[Realtime Hub] Client ${client.id} connected (total: ${this.clients.size})`);
  }

  /**
   * Remove an SSE client
   */
  removeClient(clientId: string) {
    const removed = this.clients.delete(clientId);
    if (removed) {
      console.log(`[Realtime Hub] Client ${clientId} disconnected (total: ${this.clients.size})`);
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
        console.error(`[Realtime Hub] Broadcast failed for client ${client.id}:`, err);
        this.removeClient(client.id);
      }
    }
  }
}

// Singleton instances/aliases for SSE + WebSocket consumers
export const realtimeHub = new SSEConnectionManager();
export const sseManager = realtimeHub;
