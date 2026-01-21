import { OpenAPIHono } from "@hono/zod-openapi";

export const healthRoutes = new OpenAPIHono();

// Basic health check - no DB dependency
healthRoutes.get("/", (c) => {
    return c.json({
        status: "ok",
        timestamp: new Date().toISOString(),
        version: "1.0.0",
    });
});

// HEAD support for wget --spider health checks
healthRoutes.on("HEAD", "/", (c) => {
    return c.body(null, 200);
});

healthRoutes.get("/ready", async (c) => {
    // Check database connection
    try {
        const { db } = await import("@uni-status/database");
        await db.execute("SELECT 1");

        return c.json({
            status: "ready",
            checks: {
                database: "ok",
            },
        });
    } catch (error) {
        return c.json(
            {
                status: "not_ready",
                checks: {
                    database: "error",
                },
            },
            503
        );
    }
});
