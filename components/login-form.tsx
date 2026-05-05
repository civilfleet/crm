"use client";

import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { signIn as authSignIn } from "next-auth/react";
import {
  resolveLoginStrategy,
  sendMagicLoginLink,
} from "@/app/actions/auth";
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
    <div className="flex flex-col items-center gap-2 text-center">
      <h1 className="text-2xl font-bold">Login to your account</h1>

      <form
        className={cn("flex flex-col gap-3 w-full text-center", className)}
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
              placeholder="Email"
              disabled={isLoading}
              aria-label="Email address"
              aria-invalid={!!error}
              aria-describedby={error ? "email-error" : undefined}
              className={cn(
                "flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-base shadow-xs transition-colors file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-muted-foreground focus-visible:outline-hidden focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 md:text-sm",
                className,
              )}
            />
            {error && (
              <div
                id="email-error"
                className="text-red-600 text-sm mt-1 text-left"
                role="alert"
              >
                {error}
              </div>
            )}
            <Button
              variant="outline"
              className="w-44 mx-auto"
              disabled={isLoading}
            >
              {isLoading ? "Sending..." : "Login"}
            </Button>
          </>
        ) : (
          <div className="text-green-600 font-medium">
            Login link has been sent to your email!
          </div>
        )}
      </form>

      <div className="text-center text-sm">
        Don&apos;t have an account?{" "}
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
