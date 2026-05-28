"use server";

import { signIn } from "@/auth";
import { resolveExpectedProviderByEmail } from "@/lib/auth-routing";
import logger from "@/lib/logger";

export type LoginStrategyResult =
  | {
      strategy: "OIDC";
      provider: `oidc-${string}`;
    }
  | {
      strategy: "EMAIL_MAGIC_LINK";
    };

export async function resolveLoginStrategy(
  formData: FormData,
): Promise<LoginStrategyResult> {
  const email = formData.get("email")?.toString().trim() ?? "";
  const emailDomain = email.split("@")[1]?.toLowerCase() ?? "";

  try {
    const provider = await resolveExpectedProviderByEmail(email);

    if (provider !== "nodemailer") {
      logger.info(
        { emailDomain, provider },
        "Resolved OIDC login strategy for email domain",
      );
      return {
        strategy: "OIDC",
        provider,
      };
    }

    logger.debug(
      { emailDomain },
      "Resolved magic-link login strategy for email domain",
    );
    return {
      strategy: "EMAIL_MAGIC_LINK",
    };
  } catch (error) {
    logger.error(
      { error, emailDomain },
      "Failed to resolve login strategy for email domain",
    );
    throw new Error("Unable to sign in with this email.");
  }
}

export async function sendMagicLoginLink(formData: FormData) {
  const email = formData.get("email")?.toString().trim() ?? "";

  try {
    await signIn("nodemailer", {
      redirect: false,
      redirectTo: "/organizations",
      email,
    });
  } catch {
    throw new Error("Unable to sign in with this email.");
  }
}
