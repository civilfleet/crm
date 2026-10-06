import { getEmailConnectionTimeouts } from "@/lib/email-timeouts";
import { PHASE_PRODUCTION_BUILD } from "next/constants.js";

type MailEnvironment = Partial<
  Pick<
    NodeJS.ProcessEnv,
    | "NODE_ENV"
    | "NEXT_PHASE"
    | "SMTP_HOST"
    | "SMTP_PORT"
    | "SMTP_SECURE"
    | "SMTP_USER"
    | "SMTP_PASS"
    | "SMTP_FROM"
  >
>;

const SMTP_KEYS = ["SMTP_HOST", "SMTP_USER", "SMTP_PASS", "SMTP_FROM"] as const;

export const resolveMailConfiguration = (env: MailEnvironment) => {
  const configuredValues = SMTP_KEYS.filter((key) => env[key]?.trim());
  const isProductionBuild = env.NEXT_PHASE === PHASE_PRODUCTION_BUILD;
  const smtpRequired =
    (env.NODE_ENV === "production" && !isProductionBuild) ||
    configuredValues.length > 0;

  if (!smtpRequired) {
    return {
      mailProvider: "None" as const,
      config: { host: "localhost", port: 25, secure: false },
    };
  }

  const missing = SMTP_KEYS.filter((key) => !env[key]?.trim());
  if (missing.length > 0) {
    throw new Error(
      `Global SMTP configuration is incomplete; missing: ${missing.join(", ")}.`,
    );
  }

  const port = env.SMTP_PORT?.trim() ? Number(env.SMTP_PORT) : 587;
  if (!Number.isInteger(port) || port < 1 || port > 65_535) {
    throw new Error("SMTP_PORT must be an integer between 1 and 65535.");
  }
  if (env.SMTP_SECURE && !["true", "false"].includes(env.SMTP_SECURE)) {
    throw new Error('SMTP_SECURE must be either "true" or "false".');
  }

  return {
    mailProvider: "SMTP" as const,
    config: {
      host: env.SMTP_HOST as string,
      port,
      secure: env.SMTP_SECURE === "true",
      auth: {
        user: env.SMTP_USER as string,
        pass: env.SMTP_PASS as string,
      },
      ...getEmailConnectionTimeouts(),
    },
  };
};

const resolved = resolveMailConfiguration(process.env);

export const mailProvider = resolved.mailProvider;
export default resolved.config;
