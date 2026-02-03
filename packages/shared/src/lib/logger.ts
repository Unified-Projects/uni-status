import pino from "pino";
import type { LoggerOptions } from "pino";
import type { Logger } from "./logger-types";

const isDevelopment = process.env.NODE_ENV === "development";
const logLevel = process.env.LOG_LEVEL || (isDevelopment ? "debug" : "info");
const logFormat = process.env.LOG_FORMAT || (isDevelopment ? "pretty" : "json");
const serviceName = process.env.SERVICE_NAME || "uni-status";

const baseConfig: LoggerOptions = {
  level: logLevel,
  name: serviceName,
  formatters: {
    level: (label) => {
      return { level: label };
    },
  },
  timestamp: pino.stdTimeFunctions.isoTime,
  serializers: {
    err: pino.stdSerializers.err,
    error: pino.stdSerializers.err,
  },
};

const transportConfig =
  logFormat === "pretty"
    ? {
        transport: {
          target: "pino-pretty",
          options: {
            colorize: true,
            translateTime: "HH:MM:ss.l",
            ignore: "pid,hostname",
            singleLine: false,
            messageFormat: "{msg}",
          },
        },
      }
    : {};

export const logger: Logger = pino({
  ...baseConfig,
  ...transportConfig,
}) as unknown as Logger;

export function createLogger(context: Record<string, unknown>): Logger {
  return logger.child(context) as unknown as Logger;
}

export type { Logger };
