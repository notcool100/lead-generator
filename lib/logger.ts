import pino from "pino";

/** Structured JSON logger shared by the web app and workers. */
export const logger = pino({
  level: process.env.LOG_LEVEL ?? "info",
  base: { service: process.env.SERVICE_NAME ?? "web" },
  redact: {
    paths: ["*.password", "*.passwordHash", "*.apiKey", "*.authorization", "*.token"],
    censor: "[redacted]",
  },
  timestamp: pino.stdTimeFunctions.isoTime,
});

export type Logger = typeof logger;
