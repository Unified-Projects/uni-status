import { OpenAPIHono } from "@hono/zod-openapi";
import { nanoid } from "nanoid";
import { realtimeHub, type SSEClient, type SSEEvent } from "../lib/sse-manager";
import { authMiddleware } from "../middleware/auth";

export const websocketRoutes = new OpenAPIHono();

type WebSocketMessage = string | Uint8Array;
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

websocketRoutes.use("*", authMiddleware);

websocketRoutes.get("/", async (c) => {
  await ensureInitialized();

  if (!("upgradeWebSocket" in Bun)) {
    return c.json({ success: false, error: { code: "UNSUPPORTED", message: "WebSockets not supported in this runtime" } }, 400);
  }

  const monitorId = c.req.query("monitorId") || undefined;
  const statusPageSlug = c.req.query("statusPageSlug") || undefined;
  const requestedOrg = c.req.query("organizationId") || c.req.header("X-Organization-Id") || undefined;
  const auth = c.get("auth");

  if (requestedOrg && auth?.organizationId && auth.organizationId !== requestedOrg) {
    return c.json(
      {
        success: false,
        error: {
          code: "ORG_MISMATCH",
          message: "Organization context does not match your session",
        },
      },
      403
    );
  }

  const clientId = nanoid();

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
        monitorId,
        statusPageSlug,
        organizationId: requestedOrg || auth?.organizationId || undefined,
        protocol: "websocket",
        send: async (eventType: string, event: SSEEvent | unknown) => {
          if (ws.readyState !== ws.OPEN) return;
          const payload =
            typeof event === "object" && event !== null && "data" in (event as Record<string, unknown>)
              ? event
              : { type: eventType, data: event, timestamp: new Date().toISOString() };
          ws.send(
            JSON.stringify({
              event: eventType,
              data: payload,
            })
          );
        },
      };

      realtimeHub.addClient(client);
      ws.send(
        JSON.stringify({
          event: "connected",
          data: {
            clientId,
            monitorId,
            statusPageSlug,
            organizationId: requestedOrg || auth?.organizationId || null,
          },
        })
      );

      const heartbeat = setInterval(() => {
        if (ws.readyState === ws.OPEN) {
          ws.send(JSON.stringify({ event: "heartbeat", data: { timestamp: new Date().toISOString() } }));
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
    message: (_ws: WebSocketLike, message: WebSocketMessage) => {
      try {
        const data = typeof message === "string" ? JSON.parse(message) : JSON.parse(message.toString());
        if (data?.type === "ping") {
          _ws.send(JSON.stringify({ event: "pong", data: { timestamp: new Date().toISOString() } }));
        }
        if (data?.type === "subscribe") {
          realtimeHub.updateClient(clientId, {
            monitorId: data.monitorId,
            statusPageSlug: data.statusPageSlug,
            organizationId: data.organizationId || requestedOrg || auth?.organizationId,
          });
          _ws.send(
            JSON.stringify({
              event: "subscribed",
              data: {
                monitorId: data.monitorId,
                statusPageSlug: data.statusPageSlug,
                organizationId: data.organizationId || requestedOrg || auth?.organizationId || null,
              },
            })
          );
        }
      } catch (err) {
        console.error("[WebSocket] Failed to parse client message", err);
      }
    },
  });

  return response;
});
