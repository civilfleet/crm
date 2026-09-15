"use client";

import { useSearchParams } from "next/navigation";
import { signIn as authSignIn } from "next-auth/react";
import { useEffect, useMemo, useState } from "react";
import { resolveLoginStrategy, sendMagicLoginLink } from "@/app/actions/auth";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function LoginForm({
  className,
  ...props
}: React.ComponentPropsWithoutRef<"form">) {
  const searchParams = useSearchParams();
  const [isLoading, setIsLoading] = useState(false);
  const [isLinkSent, setIsLinkSent] = useState(false);
  const [error, setError] = useState("");

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
          Enter your work email to continue.
        </p>
      </div>

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
            const strategy = await resolveLoginStrategy(formData);

            if (strategy.strategy === "OIDC") {
              await authSignIn(strategy.provider, {
                callbackUrl: "/organizations",
                login_hint: email,
              });
              return;
            }

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
              aria-describedby={error ? "email-error" : undefined}
              autoComplete="email"
              inputMode="email"
              className="flex h-11 w-full min-w-0 rounded-md border border-input bg-background px-3 py-2 text-base shadow-xs transition-colors placeholder:text-muted-foreground focus-visible:outline-hidden focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 sm:text-sm"
            />
            {error && (
              <div
                id="email-error"
                className="mt-1 break-words text-left text-sm text-red-600"
                role="alert"
              >
                {error}
              </div>
            )}
            <Button
              variant="outline"
              className="w-full sm:mx-auto sm:w-44"
              disabled={isLoading}
            >
              {isLoading ? "Sending..." : "Login"}
            </Button>
          </>
        ) : (
          <div className="break-words text-sm font-medium text-green-600">
            Login link has been sent to your email!
          </div>
        )}
      </form>

      <div className="text-center text-sm leading-relaxed">
        <div>Don&apos;t have an account?</div>
        <a
          href="mailto:it@sea-watch.org"
          className="underline underline-offset-4"
        >
          Please contact us to create one
        </a>
      </div>
    </div>
  );
}
