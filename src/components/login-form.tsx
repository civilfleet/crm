"use client";

import { useSearchParams } from "next/navigation";
import { signIn as authSignIn } from "next-auth/react";
import { useEffect, useMemo, useState } from "react";
import { sendMagicLoginLink } from "@/app/actions/auth";
import { Button } from "@/components/ui/button";
import type { PublicLoginOptions } from "@/lib/auth-routing";
import { cn } from "@/lib/utils";

export function LoginForm({
  className,
  loginOptions,
  ...props
}: React.ComponentPropsWithoutRef<"form"> & {
  loginOptions: PublicLoginOptions;
}) {
  const searchParams = useSearchParams();
  const [isLoading, setIsLoading] = useState(false);
  const [isLinkSent, setIsLinkSent] = useState(false);
  const [pendingOidcProvider, setPendingOidcProvider] = useState<string | null>(
    null,
  );
  const [error, setError] = useState("");
  const {
    accountCreationContactUrl,
    emailLoginEnabled,
    oidc: oidcLoginOptions,
  } = loginOptions;

  const authError = searchParams.get("error");
  const authErrorMessage = useMemo(() => {
    if (!authError) {
      return "";
    }

    const messages: Record<string, string> = {
      OAuthSignin: "Could not start OIDC sign-in. Please try again.",
      OAuthCallback:
        "OIDC login failed during callback. Please check your OIDC settings.",
      OAuthCreateAccount: "Unable to create a user from OIDC profile.",
      EmailCreateAccount: "Unable to create your user account.",
      Callback: "Sign-in callback failed. Please contact support.",
      OAuthAccountNotLinked:
        "This email is already linked to a different sign-in method.",
      EmailSignin: "Failed to send email sign-in link.",
      SessionRequired: "Please sign in to continue.",
      AccessDenied:
        "Access denied. Your account may not be allowed for this team.",
      Verification: "The sign-in link is invalid or has expired.",
      Default: "Login failed. Please try again.",
      Configuration:
        "OIDC is not configured correctly for this domain. Contact your team admin.",
    };

    return messages[authError] || messages.Default;
  }, [authError]);

  useEffect(() => {
    if (!authErrorMessage) {
      return;
    }
    setError(authErrorMessage);
  }, [authErrorMessage]);

  const validateEmail = (email: string) => {
    // Simple email regex
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  };

  return (
    <div className="flex min-w-0 flex-col items-center gap-5 text-center">
      <div className="space-y-1.5">
        <h1 className="text-xl font-bold sm:text-2xl">Login to your account</h1>
        <p className="text-sm text-muted-foreground">
          {emailLoginEnabled && oidcLoginOptions.length > 0
            ? "Choose single sign-on or request a login link by email."
            : emailLoginEnabled
              ? "Enter your work email to request a login link."
              : "Continue with your organization's single sign-on."}
        </p>
      </div>

      {oidcLoginOptions.length > 0 ? (
        <div className="flex w-full min-w-0 flex-col gap-3">
          {oidcLoginOptions.map((option) => (
            <Button
              key={option.providerId}
              type="button"
              className="w-full"
              disabled={pendingOidcProvider !== null || isLoading}
              onClick={async () => {
                setError("");
                setPendingOidcProvider(option.providerId);
                try {
                  await authSignIn(option.providerId, {
                    callbackUrl: "/organizations",
                  });
                } catch {
                  setError("Could not start OIDC sign-in. Please try again.");
                  setPendingOidcProvider(null);
                }
              }}
            >
              {pendingOidcProvider === option.providerId
                ? "Redirecting..."
                : option.label}
            </Button>
          ))}

          {emailLoginEnabled ? (
            <div className="flex items-center gap-3" aria-hidden="true">
              <div className="h-px flex-1 bg-border" />
              <span className="text-xs uppercase text-muted-foreground">
                or
              </span>
              <div className="h-px flex-1 bg-border" />
            </div>
          ) : null}
        </div>
      ) : null}

      {error ? (
        <div
          id="login-error"
          className="w-full break-words text-left text-sm text-destructive"
          role="alert"
        >
          {error}
        </div>
      ) : null}

      {emailLoginEnabled ? (
        <form
          className={cn("flex w-full min-w-0 flex-col gap-3", className)}
          action={async (formData) => {
            setIsLoading(true);
            const email = formData.get("email") as string;
            if (!validateEmail(email)) {
              setError("Please enter a valid email address.");
              setIsLoading(false);
              return;
            }
            setError("");
            try {
              await sendMagicLoginLink(formData);
              setIsLinkSent(true);
            } catch (loginError) {
              setError(
                loginError instanceof Error
                  ? loginError.message
                  : "Unable to sign in with this email.",
              );
            } finally {
              setIsLoading(false);
            }
          }}
          {...props}
        >
          {!isLinkSent ? (
            <>
              <input
                type="email"
                name="email"
                placeholder="name@organization.org"
                disabled={isLoading}
                aria-label="Email address"
                aria-invalid={!!error}
                aria-describedby={error ? "login-error" : undefined}
                autoComplete="email"
                inputMode="email"
                className="flex h-11 w-full min-w-0 rounded-md border border-input bg-background px-3 py-2 text-base shadow-xs transition-colors placeholder:text-muted-foreground focus-visible:outline-hidden focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 sm:text-sm"
              />
              <Button
                variant="outline"
                className="w-full sm:mx-auto sm:w-44"
                disabled={isLoading}
              >
                {isLoading ? "Sending..." : "Send login link"}
              </Button>
            </>
          ) : (
            <div className="break-words text-sm font-medium text-success">
              Login link has been sent to your email!
            </div>
          )}
        </form>
      ) : null}

      <div className="text-center text-sm leading-relaxed">
        <div>Don&apos;t have an account?</div>
        <a
          href={accountCreationContactUrl}
          className="underline underline-offset-4"
        >
          Please contact us to create one
        </a>
      </div>
    </div>
  );
}
