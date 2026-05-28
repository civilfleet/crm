import fs from "node:fs";
import path from "node:path";
import handlebars from "handlebars";
import nodemailer from "nodemailer";
import logger from "@/lib/logger";
import type { EMAIL_CONTENT } from "@/types";
import config, { mailProvider } from "../config/mail";

const transporter = nodemailer.createTransport({
  ...config,
});

// Log the email provider being used
logger.info({ provider: mailProvider }, "Email provider configured");
if (mailProvider === "None") {
  logger.warn("SMTP is not configured; email delivery will fail");
}

const templateCache = new Map<string, handlebars.TemplateDelegate>();

const compileTemplate = (
  templateName: string,
  data: Record<string, unknown>,
) => {
  const cached = templateCache.get(templateName);
  if (cached) {
    return cached(data);
  }

  const filePath = path.join(
    process.cwd(),
    "templates",
    `${templateName}.handlebars`,
  );
  const source = fs.readFileSync(filePath, "utf-8");
  const compiled = handlebars.compile(source);
  templateCache.set(templateName, compiled);
  return compiled(data);
};

async function sendEmail(
  emailContent: EMAIL_CONTENT,
  data: Record<string, unknown>,
) {
  try {
    const html = emailContent.content
      ? handlebars.compile(emailContent.content)(data)
      : compileTemplate(emailContent.template, {
          ...data,
        });

    const { to, subject, template } = {
      to: emailContent.to,
      subject: emailContent.subject,
      template: emailContent.template ?? "inline-content",
    };

    logger.info(
      {
        to,
        subject,
        template,
        hasContent: Boolean(emailContent.content),
      },
      "Dispatching email",
    );

    // Determine sender email
    const senderEmail =
      emailContent?.from ?? process.env.SMTP_FROM ?? process.env.SMTP_USER;

    const info = await transporter.sendMail({
      from: senderEmail,
      to: emailContent.to,
      subject: emailContent.subject,
      html,
    });

    logger.info(
      {
        to,
        subject,
        messageId: info.messageId,
        response: info.response,
      },
      "Email dispatched",
    );

    return info;
  } catch (error) {
    const errorDetails =
      error && typeof error === "object"
        ? {
            code: "code" in error ? error.code : undefined,
            command: "command" in error ? error.command : undefined,
            responseCode:
              "responseCode" in error ? error.responseCode : undefined,
            response: "response" in error ? error.response : undefined,
            errno: "errno" in error ? error.errno : undefined,
            syscall: "syscall" in error ? error.syscall : undefined,
            hostname: "hostname" in error ? error.hostname : undefined,
          }
        : undefined;

    logger.error(
      {
        to: emailContent.to,
        subject: emailContent.subject,
        template: emailContent.template ?? "inline-content",
        error,
        errorDetails,
      },
      "Error sending email",
    );
    throw error;
  }
}

export { sendEmail, transporter };