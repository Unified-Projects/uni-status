import { app } from "./app";

const port = parseInt(process.env.API_PORT || "3001");

console.log(`Starting Uni-Status API server on port ${port}`);

export default {
  port,
  fetch: app.fetch,
};
