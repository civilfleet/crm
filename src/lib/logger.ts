import pino from "pino";

const isServer = typeof window === "undefined";
const isProd = process.env.NODE_ENV === "production";
const level = process.env.LOG_LEVEL ?? (isProd ? "info" : "debug");

const transport =
  isServer && !isProd
    ? pino.transport({
        target: "pino-pretty",
        options: {
          colorize: true,
          translateTime: "SYS:standard",
          ignore: "pid,hostname",
        },
      })
    : undefined;

const logger = pino({ level }, transport);

export default logger;
