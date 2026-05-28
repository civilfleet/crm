"use client";

import { useEffect, useMemo, useState } from "react";
import useSWR from "swr";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";

type LoginMethod = "EMAIL_MAGIC_LINK" | "OIDC";

type TeamAuthSettings = {
  loginDomain?: string | null;
  loginMethod?: LoginMethod | null;
  oidcIssuer?: string | null;
  oidcClientId?: string | null;
  hasOidcClientSecret?: boolean;
  domainVerificationToken?: string | null;
  domainVerifiedAt?: string | null;
  domainLastCheckedAt?: string | null;
  autoProvisionUsersFromOidc?: boolean | null;
  defaultOidcGroupId?: string | null;
};

type DomainVerificationResponse = {
  data?: {
    loginDomain?: string | null;
    domainVerificationToken?: string | null;
    domainVerifiedAt?: string | null;
    domainLastCheckedAt?: string | null;
    verified?: boolean;
    recordName?: string;
    recordValue?: string;
    observedValues?: string[];
  };
  error?: string;
};

type TeamGroupResponse = {
  data?: Array<{
    id: string;
    name: string;
    isDefaultGroup?: boolean;
  }>;
  error?: string;
};

const fetcher = async (url: string) => {
  const response = await fetch(url);
  const json = (await response.json()) as TeamAuthSettings & { error?: string };
  if (!response.ok) {
    throw new Error(json.error || response.statusText);
  }
  return json;
};

const normalizeDomain = (domain: string) =>
  domain.trim().toLowerCase().replace(/^@+/, "");

export default function TeamSsoSettings({ teamId }: { teamId: string }) {
  const { toast } = useToast();
  const { data, error, isLoading, mutate } = useSWR<TeamAuthSettings>(
    `/api/teams/${teamId}`,
    fetcher,
  );
  const { data: groupsResponse } = useSWR<TeamGroupResponse>(
    `/api/groups?teamId=${teamId}`,
    (url: string) => fetch(url).then((response) => response.json()),
  );

  const [isSaving, setIsSaving] = useState(false);
  const [isStartingVerification, setIsStartingVerification] = useState(false);
  const [isCheckingVerification, setIsCheckingVerification] = useState(false);
  const [loginMethod, setLoginMethod] =
    useState<LoginMethod>("EMAIL_MAGIC_LINK");
  const [loginDomain, setLoginDomain] = useState("");
  const [oidcIssuer, setOidcIssuer] = useState("");
  const [oidcClientId, setOidcClientId] = useState("");
  const [oidcClientSecret, setOidcClientSecret] = useState("");
  const [hasOidcClientSecret, setHasOidcClientSecret] = useState(false);
  const [domainVerificationToken, setDomainVerificationToken] = useState("");
  const [domainVerifiedAt, setDomainVerifiedAt] = useState<string | null>(null);
  const [domainLastCheckedAt, setDomainLastCheckedAt] = useState<string | null>(
    null,
  );
  const [autoProvisionUsersFromOidc, setAutoProvisionUsersFromOidc] =
    useState(false);
  const [defaultOidcGroupId, setDefaultOidcGroupId] = useState("");
  const [observedTxtValues, setObservedTxtValues] = useState<string[]>([]);
  const [initialSnapshot, setInitialSnapshot] = useState("");
  const [origin, setOrigin] = useState("");

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }
    setOrigin(window.location.origin);
  }, []);

  useEffect(() => {
    if (!data) {
      return;
    }

    const nextLoginMethod = (data.loginMethod ||
      "EMAIL_MAGIC_LINK") as LoginMethod;
    const nextLoginDomain = data.loginDomain || "";
    const nextOidcIssuer = data.oidcIssuer || "";
    const nextOidcClientId = data.oidcClientId || "";
    const nextHasOidcClientSecret = Boolean(data.hasOidcClientSecret);

    setLoginMethod(nextLoginMethod);
    setLoginDomain(nextLoginDomain);
    setOidcIssuer(nextOidcIssuer);
    setOidcClientId(nextOidcClientId);
    setOidcClientSecret("");
    setHasOidcClientSecret(nextHasOidcClientSecret);
    setDomainVerificationToken(data.domainVerificationToken || "");
    setDomainVerifiedAt(data.domainVerifiedAt || null);
    setDomainLastCheckedAt(data.domainLastCheckedAt || null);
    setAutoProvisionUsersFromOidc(Boolean(data.autoProvisionUsersFromOidc));
    setDefaultOidcGroupId(data.defaultOidcGroupId || "");

    setInitialSnapshot(
      JSON.stringify({
        loginMethod: nextLoginMethod,
        loginDomain: nextLoginDomain,
        oidcIssuer: nextOidcIssuer,
        oidcClientId: nextOidcClientId,
        autoProvisionUsersFromOidc: Boolean(data.autoProvisionUsersFromOidc),
        defaultOidcGroupId: data.defaultOidcGroupId || "",
      }),
    );
  }, [data]);

  useEffect(() => {
    if (!error) {
      return;
    }

    toast({
      title: "Unable to load SSO settings",
      description: error.message,
      variant: "destructive",
    });
  }, [error, toast]);

  const isOidc = loginMethod === "OIDC";
  const groups = groupsResponse?.data || [];

  const normalizedLoginDomain = normalizeDomain(loginDomain);
  const hasDomain = normalizedLoginDomain.length > 0;

  const providerId = `oidc-${teamId}`;
  const redirectUri = origin ? `${origin}/api/auth/callback/${providerId}` : "";
  const signInUri = origin
    ? `${origin}/api/auth/signin?provider=${providerId}`
    : "";
  const txtRecordName = hasDomain ? `_fm-sso.${normalizedLoginDomain}` : "";
  const txtRecordValue = domainVerificationToken
    ? `fm-verify-${domainVerificationToken}`
    : "";

  const isDomainVerified = Boolean(domainVerifiedAt);

  const verificationStatusText = useMemo(() => {
    if (!hasDomain) {
      return "No domain configured";
    }
    if (isDomainVerified) {
      return "Verified";
    }
    if (domainVerificationToken) {
      return "Pending verification";
    }
    return "Not started";
  }, [domainVerificationToken, hasDomain, isDomainVerified]);

  const isDirty = useMemo(() => {
    const currentSnapshot = JSON.stringify({
      loginMethod,
      loginDomain: loginDomain.trim(),
      oidcIssuer: oidcIssuer.trim(),
      oidcClientId: oidcClientId.trim(),
      autoProvisionUsersFromOidc,
      defaultOidcGroupId,
    });
    return (
      currentSnapshot !== initialSnapshot || oidcClientSecret.trim().length > 0
    );
  }, [
    initialSnapshot,
    loginMethod,
    loginDomain,
    oidcIssuer,
    oidcClientId,
    oidcClientSecret,
    autoProvisionUsersFromOidc,
    defaultOidcGroupId,
  ]);

  const copyValue = async (label: string, value: string) => {
    if (!value) {
      return;
    }

    try {
      await navigator.clipboard.writeText(value);
      toast({
        title: `${label} copied`,
        description: value,
      });
    } catch {
      toast({
        title: "Copy failed",
        description: "Could not copy to clipboard. Please copy manually.",
        variant: "destructive",
      });
    }
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      const response = await fetch(`/api/teams/${teamId}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          loginMethod,
          loginDomain: loginDomain.trim(),
          oidcIssuer: isOidc ? oidcIssuer.trim() : "",
          oidcClientId: isOidc ? oidcClientId.trim() : "",
          oidcClientSecret: isOidc ? oidcClientSecret.trim() : "",
          autoProvisionUsersFromOidc,
          defaultOidcGroupId: defaultOidcGroupId || "",
        }),
      });

      const json = (await response.json()) as TeamAuthSettings & {
        error?: string;
      };
      if (!response.ok) {
        throw new Error(json.error || response.statusText);
      }

      await mutate(json, { revalidate: false });
      setObservedTxtValues([]);
      toast({
        title: "SSO settings saved",
        description: "Team authentication settings were updated.",
      });
    } catch (saveError) {
      toast({
        title: "Unable to save SSO settings",
        description:
          saveError instanceof Error
            ? saveError.message
            : "An unexpected error occurred",
        variant: "destructive",
      });
    } finally {
      setIsSaving(false);
    }
  };

  const handleStartVerification = async () => {
    setIsStartingVerification(true);
    try {
      const response = await fetch(
        `/api/teams/${teamId}/domain-verification/start`,
        {
          method: "POST",
        },
      );

      const json = (await response.json()) as DomainVerificationResponse;
      if (!response.ok) {
        throw new Error(json.error || response.statusText);
      }

      setObservedTxtValues([]);
      await mutate();
      toast({
        title: "Verification token generated",
        description: "Add the TXT record, then click Check verification.",
      });
    } catch (verificationError) {
      toast({
        title: "Unable to start verification",
        description:
          verificationError instanceof Error
            ? verificationError.message
            : "An unexpected error occurred",
        variant: "destructive",
      });
    } finally {
      setIsStartingVerification(false);
    }
  };

  const handleCheckVerification = async () => {
    setIsCheckingVerification(true);
    try {
      const response = await fetch(
        `/api/teams/${teamId}/domain-verification/check`,
        {
          method: "POST",
        },
      );

      const json = (await response.json()) as DomainVerificationResponse;
      if (!response.ok) {
        throw new Error(json.error || response.statusText);
      }

      setObservedTxtValues(json.data?.observedValues || []);
      await mutate();

      if (json.data?.verified) {
        toast({
          title: "Domain verified",
          description: "DNS TXT record verified successfully.",
        });
      } else {
        toast({
          title: "Verification not found",
          description: "TXT record does not match yet. Check DNS and retry.",
          variant: "destructive",
        });
      }
    } catch (verificationError) {
      toast({
        title: "Unable to check verification",
        description:
          verificationError instanceof Error
            ? verificationError.message
            : "An unexpected error occurred",
        variant: "destructive",
      });
    } finally {
      setIsCheckingVerification(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Authentication</CardTitle>
        <CardDescription>
          Configure how team members sign in for your team domain.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="team-login-method">Login method</Label>
          <Select
            value={loginMethod}
            onValueChange={(value) => setLoginMethod(value as LoginMethod)}
          >
            <SelectTrigger id="team-login-method">
              <SelectValue placeholder="Select login method" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="EMAIL_MAGIC_LINK">Email magic link</SelectItem>
              <SelectItem value="OIDC">OIDC</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label htmlFor="team-login-domain">Login domain</Label>
          <Input
            id="team-login-domain"
            placeholder="@example.org"
            value={loginDomain}
            onChange={(event) => setLoginDomain(event.target.value)}
          />
          <p className="text-xs text-muted-foreground">
            Users with this email domain will use the selected login method.
          </p>
        </div>

        <div className="space-y-3 rounded-md border p-3">
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm font-medium">Domain verification (DNS TXT)</p>
            <p className="text-xs text-muted-foreground">
              {verificationStatusText}
            </p>
          </div>
          {!isDomainVerified && isOidc && (
            <p className="text-xs text-amber-600">
              OIDC sign-in remains inactive until the login domain is verified.
            </p>
          )}
          <div className="space-y-2">
            <Label htmlFor="team-domain-txt-name">TXT record name</Label>
            <div className="flex gap-2">
              <Input id="team-domain-txt-name" value={txtRecordName} readOnly />
              <Button
                type="button"
                variant="outline"
                onClick={() => copyValue("TXT name", txtRecordName)}
                disabled={!txtRecordName}
              >
                Copy
              </Button>
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="team-domain-txt-value">TXT record value</Label>
            <div className="flex gap-2">
              <Input
                id="team-domain-txt-value"
                value={txtRecordValue}
                readOnly
              />
              <Button
                type="button"
                variant="outline"
                onClick={() => copyValue("TXT value", txtRecordValue)}
                disabled={!txtRecordValue}
              >
                Copy
              </Button>
            </div>
          </div>
          <div className="flex gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={handleStartVerification}
              disabled={!hasDomain || isSaving || isStartingVerification}
            >
              {isStartingVerification
                ? "Generating..."
                : domainVerificationToken
                  ? "Regenerate Token"
                  : "Generate Token"}
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={handleCheckVerification}
              disabled={
                !hasDomain || !domainVerificationToken || isCheckingVerification
              }
            >
              {isCheckingVerification ? "Checking..." : "Check Verification"}
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            Add this TXT record in your DNS provider, wait for propagation, then
            check verification.
          </p>
          {domainVerifiedAt && (
            <p className="text-xs text-emerald-700">
              Verified at {new Date(domainVerifiedAt).toLocaleString()}
            </p>
          )}
          {!domainVerifiedAt && domainLastCheckedAt && (
            <p className="text-xs text-muted-foreground">
              Last checked at {new Date(domainLastCheckedAt).toLocaleString()}
            </p>
          )}
          {observedTxtValues.length > 0 && (
            <p className="text-xs text-muted-foreground">
              DNS currently returns: {observedTxtValues.join(", ")}
            </p>
          )}
        </div>

        {isOidc && (
          <>
            <div className="space-y-3 rounded-md border p-3">
              <p className="text-sm font-medium">OIDC setup endpoints</p>
              <div className="space-y-2">
                <Label htmlFor="team-oidc-provider-id">Provider ID</Label>
                <div className="flex gap-2">
                  <Input
                    id="team-oidc-provider-id"
                    value={providerId}
                    readOnly
                  />
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => copyValue("Provider ID", providerId)}
                  >
                    Copy
                  </Button>
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="team-oidc-redirect-uri">Redirect URI</Label>
                <div className="flex gap-2">
                  <Input
                    id="team-oidc-redirect-uri"
                    value={redirectUri}
                    readOnly
                  />
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => copyValue("Redirect URI", redirectUri)}
                    disabled={!redirectUri}
                  >
                    Copy
                  </Button>
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="team-oidc-signin-uri">Sign-in endpoint</Label>
                <div className="flex gap-2">
                  <Input id="team-oidc-signin-uri" value={signInUri} readOnly />
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => copyValue("Sign-in endpoint", signInUri)}
                    disabled={!signInUri}
                  >
                    Copy
                  </Button>
                </div>
              </div>
              <p className="text-xs text-muted-foreground">
                Use the redirect URI in your identity provider app settings.
                Start login via the app UI or with the sign-in endpoint query.
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="team-oidc-issuer">OIDC issuer</Label>
              <Input
                id="team-oidc-issuer"
                placeholder="https://idp.example.com"
                value={oidcIssuer}
                onChange={(event) => setOidcIssuer(event.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="team-oidc-client-id">OIDC client ID</Label>
              <Input
                id="team-oidc-client-id"
                placeholder="OIDC client ID"
                value={oidcClientId}
                onChange={(event) => setOidcClientId(event.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="team-oidc-client-secret">
                OIDC client secret
              </Label>
              <Input
                id="team-oidc-client-secret"
                type="password"
                placeholder="OIDC client secret"
                value={oidcClientSecret}
                onChange={(event) => setOidcClientSecret(event.target.value)}
              />
              {hasOidcClientSecret && (
                <p className="text-xs text-muted-foreground">
                  Leave client secret empty to keep the existing secret.
                </p>
              )}
            </div>

            <div className="space-y-3 rounded-md border p-3">
              <div className="flex items-center justify-between gap-3">
                <div className="space-y-1">
                  <Label htmlFor="team-auto-provision-oidc">
                    Auto-provision users from OIDC
                  </Label>
                  <p className="text-xs text-muted-foreground">
                    Create team user accounts automatically on first successful
                    OIDC login for this verified domain.
                  </p>
                </div>
                <Switch
                  id="team-auto-provision-oidc"
                  checked={autoProvisionUsersFromOidc}
                  onCheckedChange={setAutoProvisionUsersFromOidc}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="team-default-oidc-group">
                  Default group for auto-provisioned users
                </Label>
                <Select
                  value={defaultOidcGroupId || "__none__"}
                  onValueChange={(value) =>
                    setDefaultOidcGroupId(value === "__none__" ? "" : value)
                  }
                >
                  <SelectTrigger
                    id="team-default-oidc-group"
                    disabled={!autoProvisionUsersFromOidc}
                  >
                    <SelectValue placeholder="Select a default group" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">
                      Team default access group
                    </SelectItem>
                    {groups.map((group) => (
                      <SelectItem key={group.id} value={group.id}>
                        {group.name}
                        {group.isDefaultGroup ? " (Default Access)" : ""}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  If no group is selected, users are added to the team default
                  access group.
                </p>
              </div>
            </div>
          </>
        )}

        <div className="flex justify-end">
          <Button
            type="button"
            onClick={handleSave}
            disabled={isLoading || isSaving || !isDirty}
          >
            {isSaving ? "Saving..." : "Save Authentication Settings"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
