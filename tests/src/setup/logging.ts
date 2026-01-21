import { beforeEach, afterEach } from "vitest";

const fmt = (ctx: any) => {
  const file = ctx.task?.file?.filepath || ctx.task?.file?.name || "unknown";
  const name = ctx.task?.name || "unnamed";
  return `${file} :: ${name}`;
};

beforeEach((ctx) => {
  console.log(`[test:start] ${fmt(ctx)}`);
});

afterEach((ctx) => {
  console.log(`[test:end]   ${fmt(ctx)} => ${ctx.task.result?.state ?? "unknown"} (${ctx.task.result?.duration ?? "n/a"}ms)`);
});
