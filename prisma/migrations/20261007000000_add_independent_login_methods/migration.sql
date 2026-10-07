ALTER TABLE "Teams"
ADD COLUMN "emailLoginEnabled" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN "oidcLoginEnabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "oidcButtonLabel" VARCHAR(80) NOT NULL DEFAULT 'Sign in with SSO';

UPDATE "Teams"
SET
  "emailLoginEnabled" = CASE
    WHEN "loginMethod" = 'EMAIL_MAGIC_LINK' THEN true
    ELSE false
  END,
  "oidcLoginEnabled" = CASE
    WHEN "loginMethod" = 'OIDC' THEN true
    ELSE false
  END;
