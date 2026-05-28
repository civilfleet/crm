// Check if SMTP is configured
const isSMTPConfigured =
  process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS;

const mailConfig = isSMTPConfigured
  ? {
      host: process.env.SMTP_HOST as string,
      port: Number(process.env.SMTP_PORT) || 587,
      secure: process.env.SMTP_SECURE === "true", // true for 465, false for other ports
      auth: {
        user: process.env.SMTP_USER as string,
        pass: process.env.SMTP_PASS as string,
      },
    }
  : {
      // Fallback configuration (will fail if no provider is configured)
      host: "localhost",
      port: 25,
      secure: false,
    };

// Export mail provider info for logging
export const mailProvider = isSMTPConfigured ? "SMTP" : "None";

export default mailConfig;
