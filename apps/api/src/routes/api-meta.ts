import { OpenAPIHono } from "@hono/zod-openapi";
import { API_CHANGELOG, API_DEPRECATIONS, API_VERSIONS } from "../lib/api-metadata";

export const apiMetaRoutes = new OpenAPIHono();

apiMetaRoutes.get("/", (c) => {
  return c.json({
    success: true,
    data: {
      versions: {
        latest: API_VERSIONS.latest,
        supported: API_VERSIONS.supported,
        default: API_VERSIONS.default,
        preview: API_VERSIONS.preview,
        changelogUrl: API_VERSIONS.changelogUrl,
      },
      changelog: API_CHANGELOG,
      deprecations: API_DEPRECATIONS,
      realtime: {
        sse: "/api/v1/sse",
        websocket: "/api/v1/ws",
        graphqlSubscriptions: "/api/graphql",
      },
    },
  });
});

apiMetaRoutes.get("/changelog", (c) => {
  return c.json({
    success: true,
    data: API_CHANGELOG,
  });
});

apiMetaRoutes.get("/deprecations", (c) => {
  return c.json({
    success: true,
    data: API_DEPRECATIONS,
  });
});
