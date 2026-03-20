import { OpenAPIHono } from "@hono/zod-openapi";
import { streamSSE } from "hono/streaming";
import { nanoid } from "nanoid";
import { db, monitors } from "@uni-status/database";
import { and, eq } from "drizzle-orm";
import { sseManager, type SSEClient, type SSEEvent } from "../lib/sse-manager";
import { authMiddleware, requireAuth, requireOrganization, requireRole } from "../middleware/auth";

export const sseRoutes = new OpenAPIHono();

sseRoutes.use("/dashboard", authMiddleware);
sseRoutes.use("/monitors/*", authMiddleware);

// Initialize SSE manager on first request
let initialized = false;
async function ensureInitialized() {
  if (!initialized) {
    await sseManager.initialize();
    initialized = true;
  }
}

// Monitor status updates
sseRoutes.get("/monitors/:id", async (c) => {
  await ensureInitialized();
  const { id } = c.req.param();
  await requireRole(c, ["owner", "admin", "member", "viewer"]);
  const organizationId = await requireOrganization(c);

  const monitor = await db.query.monitors.findFirst({
    where: and(eq(monitors.id, id), eq(monitors.organizationId, organizationId)),
    columns: { id: true },
  });

  if (!monitor) {
    return c.json(
      {
        success: false,
        error: {
          code: "MONITOR_NOT_FOUND",
          message: "Monitor not found in organization",
        },
      },
      404
    );
  }

  return streamSSE(c, async (stream) => {
    const clientId = nanoid();

    // Create SSE client
    const client: SSEClient = {
      id: clientId,
      monitorId: id,
      send: async (eventType: string, event: SSEEvent | unknown) => {
        const data = typeof event === "object" && event !== null && "data" in event
          ? event
          : { type: eventType, data: event, timestamp: new Date().toISOString() };
        await stream.writeSSE({
          event: eventType,
          data: JSON.stringify(data),
        });
      },
    };

    // Register client
    sseManager.addClient(client);

    // Send connection confirmation
    await stream.writeSSE({
      event: "connected",
      data: JSON.stringify({
        message: "Connected to monitor updates",
        monitorId: id,
        clientId,
      }),
    });

    // Keep connection open with heartbeats
    let running = true;
    const heartbeat = setInterval(async () => {
      if (running) {
        try {
          await stream.writeSSE({
            event: "heartbeat",
            data: JSON.stringify({ timestamp: new Date().toISOString() }),
          });
        } catch {
          running = false;
          clearInterval(heartbeat);
        }
      }
    }, 30000);

    // Wait for disconnect
    await new Promise<void>((resolve) => {
      stream.onAbort(() => {
        running = false;
        clearInterval(heartbeat);
        sseManager.removeClient(clientId);
        resolve();
      });
    });
  });
});

// Status page updates (public)
sseRoutes.get("/status-pages/:slug", async (c) => {
  await ensureInitialized();
  const { slug } = c.req.param();

  return streamSSE(c, async (stream) => {
    const clientId = nanoid();

    const client: SSEClient = {
      id: clientId,
      statusPageSlug: slug,
      send: async (eventType: string, event: SSEEvent | unknown) => {
        const data = typeof event === "object" && event !== null && "data" in event
          ? event
          : { type: eventType, data: event, timestamp: new Date().toISOString() };
        await stream.writeSSE({
          event: eventType,
          data: JSON.stringify(data),
        });
      },
    };

    sseManager.addClient(client);

    await stream.writeSSE({
      event: "connected",
      data: JSON.stringify({
        message: "Connected to status page updates",
        slug,
        clientId,
      }),
    });

    let running = true;
    const heartbeat = setInterval(async () => {
      if (running) {
        try {
          await stream.writeSSE({
            event: "heartbeat",
            data: JSON.stringify({ timestamp: new Date().toISOString() }),
          });
        } catch {
          running = false;
          clearInterval(heartbeat);
        }
      }
    }, 30000);

    await new Promise<void>((resolve) => {
      stream.onAbort(() => {
        running = false;
        clearInterval(heartbeat);
        sseManager.removeClient(clientId);
        resolve();
      });
    });
  });
});

// Dashboard updates (authenticated)
sseRoutes.get("/dashboard", async (c) => {
  await ensureInitialized();
  await requireRole(c, ["owner", "admin", "member", "viewer"]);
  const auth = requireAuth(c);
  const orgId = auth.organizationId;

  if (!orgId) {
    return c.json(
      {
        success: false,
        error: {
          code: "ORGANIZATION_REQUIRED",
          message: "Active organization context is required",
        },
      },
      400
    );
  }

  return streamSSE(c, async (stream) => {
    const clientId = nanoid();

    const client: SSEClient = {
      id: clientId,
      organizationId: orgId,
      send: async (eventType: string, event: SSEEvent | unknown) => {
        const data = typeof event === "object" && event !== null && "data" in event
          ? event
          : { type: eventType, data: event, timestamp: new Date().toISOString() };
        await stream.writeSSE({
          event: eventType,
          data: JSON.stringify(data),
        });
      },
    };

    sseManager.addClient(client);

    await stream.writeSSE({
      event: "connected",
      data: JSON.stringify({
        message: "Connected to dashboard updates",
        organizationId: orgId,
        clientId,
      }),
    });

    let running = true;
    const heartbeat = setInterval(async () => {
      if (running) {
        try {
          await stream.writeSSE({
            event: "heartbeat",
            data: JSON.stringify({ timestamp: new Date().toISOString() }),
          });
        } catch {
          running = false;
          clearInterval(heartbeat);
        }
      }
    }, 30000);

    await new Promise<void>((resolve) => {
      stream.onAbort(() => {
        running = false;
        clearInterval(heartbeat);
        sseManager.removeClient(clientId);
        resolve();
      });
    });
  });
});

// Health check for SSE manager
sseRoutes.get("/health", (c) => {
  return c.json({
    success: true,
    data: {
      clients: sseManager.getClientCount(),
      initialized,
    },
  });
});
