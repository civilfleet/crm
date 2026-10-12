const isValidEmail = (email: string) =>
  /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);

type BootstrapAdminEnvironment = {
  BOOTSTRAP_ADMIN_EMAIL?: string;
  BOOTSTRAP_ADMIN_EMAILS?: string;
};

export function resolveBootstrapAdminEmails(
  env: BootstrapAdminEnvironment,
): string[] {
  const candidates = [
    env.BOOTSTRAP_ADMIN_EMAIL,
    ...(env.BOOTSTRAP_ADMIN_EMAILS?.split(",") ?? []),
  ]
    .map((email) => email?.trim())
    .filter((email): email is string => Boolean(email));

  const emails = Array.from(
    new Map(candidates.map((email) => [email.toLowerCase(), email])).values(),
  );
  const invalidEmail = emails.find((email) => !isValidEmail(email));

  if (invalidEmail) {
    throw new Error(
      "BOOTSTRAP_ADMIN_EMAIL and BOOTSTRAP_ADMIN_EMAILS must contain valid email addresses",
    );
  }

  return emails;
}
