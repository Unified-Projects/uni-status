import { OpenAPIHono } from "@hono/zod-openapi";
import { HTTPException } from "hono/http-exception";
import { nanoid } from "nanoid";
import { db } from "@uni-status/database";
import { monitors, organizationMembers } from "@uni-status/database/schema";
import { and, eq } from "drizzle-orm";
import { realtimeHub, type SSEClient, type SSEEvent } from "../lib/sse-manager";
import { authMiddleware, requireAuth, type AuthContext } from "../middleware/auth";
import { createLogger } from "@uni-status/shared";
import { resolvePublicStatusPageAccessFromHeaders } from "./public";

const log = createLogger({ module: "websocket" });

export const websocketRoutes = new OpenAPIHono();

type WebSocketMessage = string | Uint8Array;
type SubscriptionTarget = {
  organizationId?: string;
  monitorId?: string;
  statusPageSlug?: string;
};
type WebSocketLike = {
  OPEN: number;
  readyState: number;
  send: (data: string) => void;
  addEventListener: (type: "close" | "error", listener: () => void) => void;
};

let initialized = false;
async function ensureInitialized() {
  if (!initialized) {
    await realtimeHub.initialize();
    initialized = true;
  }
}

async function assertOrganizationAccess(auth: AuthContext, organizationId: string) {
  if (auth.apiKey) {
    if (auth.organizationId !== organizationId) {
      throw new HTTPException(403, {
        message: "Organization context does not match your credentials",
      });
    }
    return;
  }

  if (!auth.user) {
    throw new HTTPException(401, { message: "Authentication required" });
  }

  const membership = await db.query.organizationMembers.findFirst({
    where: and(
      eq(organizationMembers.organizationId, organizationId),
      eq(organizationMembers.userId, auth.user.id)
    ),
    columns: {
      organizationId: true,
    },
  });

  if (!membership) {
    throw new HTTPException(403, { message: "Not authorized for this organization" });
  }
}

async function validateMonitorAccess(auth: AuthContext, monitorId: string) {
  const monitor = await db.query.monitors.findFirst({
    where: eq(monitors.id, monitorId),
    columns: {
      id: true,
      organizationId: true,
    },
  });

  if (!monitor) {
    throw new HTTPException(404, { message: "Monitor not found" });
  }

  await assertOrganizationAccess(auth, monitor.organizationId);
  return monitor.organizationId;
}

async function validateStatusPageAccess(headers: Headers, slug: string) {
  const access = await resolvePublicStatusPageAccessFromHeaders(headers, slug);
  if ("denied" in access) {
    throw new HTTPException(access.denied.status as 401 | 403 | 404, {
      message: access.denied.body.error.message,
    });
  }

  return access.page.organizationId;
}

async function authorizeSubscription(
  auth: AuthContext,
  headers: Headers,
  target: SubscriptionTarget
): Promise<SubscriptionTarget> {
  const requestedOrganizationId = target.organizationId;

  if (requestedOrganizationId) {
    await assertOrganizationAccess(auth, requestedOrganizationId);
  }

  if (target.monitorId) {
    const monitorOrganizationId = await validateMonitorAccess(auth, target.monitorId);
    if (requestedOrganizationId && requestedOrganizationId !== monitorOrganizationId) {
      throw new HTTPException(403, {
        message: "Monitor does not belong to the requested organization",
      });
    }
  }

  if (target.statusPageSlug) {
    const pageOrganizationId = await validateStatusPageAccess(headers, target.statusPageSlug);
    if (requestedOrganizationId && requestedOrganizationId !== pageOrganizationId) {
      throw new HTTPException(403, {
        message: "Status page does not belong to the requested organization",
      });
    }
  }

  return {
    organizationId: requestedOrganizationId,
    monitorId: target.monitorId,
    statusPageSlug: target.statusPageSlug,
  };
}

function buildErrorCode(status: number) {
  if (status === 401) return "UNAUTHORIZED";
  if (status === 404) return "NOT_FOUND";
  return "FORBIDDEN";
}

function sendSocketEvent(ws: WebSocketLike, event: string, data: Record<string, unknown>) {
  ws.send(
    JSON.stringify({
      event,
      data,
    })
  );
}

websocketRoutes.use("*", authMiddleware);

websocketRoutes.get("/", async (c) => {
  await ensureInitialized();

  if (!("upgradeWebSocket" in Bun)) {
    return c.json(
      {
        success: false,
        error: {
          code: "UNSUPPORTED",
          message: "WebSockets not supported in this runtime",
        },
      },
      400
    );
  }

  let auth: AuthContext;
  try {
    auth = requireAuth(c);
  } catch (error) {
    if (error instanceof HTTPException) {
      return c.json(
        {
          success: false,
          error: {
            code: buildErrorCode(error.status),
            message: error.message,
          },
        },
        error.status
      );
    }
    throw error;
  }

  const requestedSubscription: SubscriptionTarget = {
    monitorId: c.req.query("monitorId") || undefined,
    statusPageSlug: c.req.query("statusPageSlug") || undefined,
    organizationId:
      c.req.query("organizationId") ||
      c.req.header("X-Organization-Id") ||
      (auth.apiKey ? auth.organizationId || undefined : undefined),
  };

  let initialSubscription: SubscriptionTarget;
  try {
    initialSubscription = await authorizeSubscription(auth, c.req.raw.headers, requestedSubscription);
  } catch (error) {
    if (error instanceof HTTPException) {
      return c.json(
        {
          success: false,
          error: {
            code: buildErrorCode(error.status),
            message: error.message,
          },
        },
        error.status
      );
    }
    throw error;
  }

  const clientId = nanoid();
  let currentSubscription = initialSubscription;

  const upgradeWebSocket = Bun.upgradeWebSocket as unknown as (
    req: Request,
    opts: {
      open: (ws: WebSocketLike) => void;
      message: (ws: WebSocketLike, message: WebSocketMessage) => void;
    }
  ) => { response: Response };

  const { response } = upgradeWebSocket(c.req.raw, {
    open: (ws: WebSocketLike) => {
      const client: SSEClient = {
        id: clientId,
        monitorId: currentSubscription.monitorId,
        statusPageSlug: currentSubscription.statusPageSlug,
        organizationId: currentSubscription.organizationId,
        protocol: "websocket",
        send: async (eventType: string, event: SSEEvent | unknown) => {
          if (ws.readyState !== ws.OPEN) return;
          const payload =
            typeof event === "object" && event !== null && "data" in (event as Record<string, unknown>)
              ? event
              : { type: eventType, data: event, timestamp: new Date().toISOString() };
          sendSocketEvent(ws, eventType, payload as Record<string, unknown>);
        },
      };

      realtimeHub.addClient(client);
      sendSocketEvent(ws, "connected", {
        clientId,
        monitorId: currentSubscription.monitorId ?? null,
        statusPageSlug: currentSubscription.statusPageSlug ?? null,
        organizationId: currentSubscription.organizationId ?? null,
      });

      const heartbeat = setInterval(() => {
        if (ws.readyState === ws.OPEN) {
          sendSocketEvent(ws, "heartbeat", { timestamp: new Date().toISOString() });
        }
      }, 30000);

      ws.addEventListener("close", () => {
        clearInterval(heartbeat);
        realtimeHub.removeClient(clientId);
      });

      ws.addEventListener("error", () => {
        clearInterval(heartbeat);
        realtimeHub.removeClient(clientId);
      });
    },
    message: (ws: WebSocketLike, message: WebSocketMessage) => {
      void (async () => {
        try {
          const data = typeof message === "string" ? JSON.parse(message) : JSON.parse(message.toString());

          if (data?.type === "ping") {
            sendSocketEvent(ws, "pong", { timestamp: new Date().toISOString() });
            return;
          }

          if (data?.type !== "subscribe") {
            return;
          }

          const nextSubscription = await authorizeSubscription(auth, c.req.raw.headers, {
            monitorId: typeof data.monitorId === "string" ? data.monitorId : undefined,
            statusPageSlug: typeof data.statusPageSlug === "string" ? data.statusPageSlug : undefined,
            organizationId: typeof data.organizationId === "string" ? data.organizationId : undefined,
          });

          currentSubscription = nextSubscription;
          realtimeHub.updateClient(clientId, {
            monitorId: currentSubscription.monitorId,
            statusPageSlug: currentSubscription.statusPageSlug,
            organizationId: currentSubscription.organizationId,
          });

          sendSocketEvent(ws, "subscribed", {
            monitorId: currentSubscription.monitorId ?? null,
            statusPageSlug: currentSubscription.statusPageSlug ?? null,
            organizationId: currentSubscription.organizationId ?? null,
          });
        } catch (error) {
          if (error instanceof HTTPException) {
            sendSocketEvent(ws, "error", {
              code: buildErrorCode(error.status),
              message: error.message,
            });
            return;
          }

          log.error({ err: error }, "Failed to process client message");
          sendSocketEvent(ws, "error", {
            code: "INVALID_MESSAGE",
            message: "Failed to process client message",
          });
        }
      })();
    },
  });

  return response;
});
