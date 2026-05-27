import fs from "node:fs";
import path from "node:path";
import dotenv from "dotenv";

const loadDotenv = () => {
  const cwd = process.cwd();
  const nodeEnv = process.env.NODE_ENV;
  const candidates = [
    ".env.local",
    ".env",
    nodeEnv ? `.env.${nodeEnv}` : null,
    nodeEnv ? `.env.${nodeEnv}.local` : null,
  ].filter(Boolean) as string[];

  for (const candidate of candidates) {
    const filePath = path.join(cwd, candidate);
    if (fs.existsSync(filePath)) {
      dotenv.config({ path: filePath, override: false });
    }
  }
};

loadDotenv();

const parseArg = (name: string) => {
  const match = process.argv.find((arg) => arg.startsWith(`--${name}=`));
  return match ? match.slice(name.length + 3).trim() : undefined;
};

const maskValue = (value?: string) => {
  if (!value) return undefined;
  if (value.length <= 4) return "*".repeat(value.length);
  return `${value.slice(0, 2)}***${value.slice(-2)}`;
};

const testRecipient = parseArg("to") ?? process.env.SMTP_TEST_TO;
const senderEmail = process.env.SMTP_FROM ?? process.env.SMTP_USER;

const requiredEnv = ["SMTP_HOST", "SMTP_USER", "SMTP_PASS"].filter(
  (name) => !process.env[name]?.trim(),
);

const run = async () => {
  if (requiredEnv.length > 0) {
    throw new Error(
      `Missing required SMTP environment variables: ${requiredEnv.join(", ")}`,
    );
  }

  console.log("Testing SMTP connection with:");
  console.log(
    JSON.stringify(
      {
        host: process.env.SMTP_HOST,
        port: Number(process.env.SMTP_PORT ?? 587),
        secure:
          process.env.SMTP_SECURE ??
          (Number(process.env.SMTP_PORT ?? 587) === 465
            ? "auto:true"
            : "auto:false"),
        requireTLS: process.env.SMTP_REQUIRE_TLS,
        user: maskValue(process.env.SMTP_USER),
        from: senderEmail,
      },
      null,
      2,
    ),
  );

  const { transporter } = await import("@/lib/nodemailer");

  await transporter.verify();
  console.log("SMTP verify succeeded.");

  if (!testRecipient) {
    console.log(
      "No test email sent. Pass --to=recipient@example.com or set SMTP_TEST_TO to send one.",
    );
    return;
  }

  const info = await transporter.sendMail({
    from: senderEmail,
    to: testRecipient,
    subject: "CRM SMTP test",
    text: [
      "This is a test email from the CRM SMTP probe.",
      `Sent at: ${new Date().toISOString()}`,
      `Host: ${process.env.SMTP_HOST}`,
    ].join("\n"),
  });

  console.log("Test email sent.");
  console.log(
    JSON.stringify(
      {
        to: testRecipient,
        messageId: info.messageId,
        response: info.response,
      },
      null,
      2,
    ),
  );
};

run().catch((error) => {
  console.error("SMTP test failed.");
  if (error instanceof Error) {
    console.error(error.message);
  }
  console.error(error);
  process.exit(1);
});