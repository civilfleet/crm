"use client";

import { ExternalLink, LifeBuoy, RotateCcw } from "lucide-react";
import { useState } from "react";
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
import { DEFAULT_ACCOUNT_CREATION_CONTACT_URL } from "@/constants/global-settings";
import { useToast } from "@/hooks/use-toast";

type GlobalSettingsFormProps = {
  initialContactUrl: string;
};

export function GlobalSettingsForm({
  initialContactUrl,
}: GlobalSettingsFormProps) {
  const { toast } = useToast();
  const [contactUrl, setContactUrl] = useState(initialContactUrl);
  const [savedContactUrl, setSavedContactUrl] = useState(initialContactUrl);
  const [isSaving, setIsSaving] = useState(false);

  const normalizedContactUrl = contactUrl.trim();
  const isDirty = normalizedContactUrl !== savedContactUrl;
  const isValidProtocol =
    normalizedContactUrl.startsWith("https://") ||
    normalizedContactUrl.startsWith("mailto:");

  const handleSave = async () => {
    setIsSaving(true);
    try {
      const response = await fetch("/api/admin/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          accountCreationContactUrl: normalizedContactUrl,
        }),
      });
      const json = (await response.json()) as {
        data?: { accountCreationContactUrl: string };
        error?: string;
      };
      if (!response.ok || !json.data) {
        throw new Error(json.error || "Unable to save global settings");
      }

      setContactUrl(json.data.accountCreationContactUrl);
      setSavedContactUrl(json.data.accountCreationContactUrl);
      toast({
        title: "Global settings saved",
        description: "The account-creation contact link is now live.",
      });
    } catch (error) {
      toast({
        title: "Unable to save global settings",
        description:
          error instanceof Error
            ? error.message
            : "An unexpected error occurred",
        variant: "destructive",
      });
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Card className="overflow-hidden border-border/70 shadow-sm">
      <CardHeader className="border-b bg-muted/30 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-1.5">
          <CardTitle className="flex items-center gap-2 text-xl">
            <LifeBuoy className="size-5 text-primary" aria-hidden="true" />
            Account creation contact
          </CardTitle>
          <CardDescription className="max-w-2xl leading-relaxed">
            Choose where prospective users go when they select “Please contact
            us to create one” on the public login screen.
          </CardDescription>
        </div>
        <span className="mt-1 inline-flex w-fit rounded-full border bg-background px-2.5 py-1 text-xs font-medium text-muted-foreground">
          Public login
        </span>
      </CardHeader>
      <CardContent className="space-y-6 p-5 sm:p-6">
        <div className="space-y-2">
          <Label htmlFor="account-creation-contact-url">Destination URL</Label>
          <Input
            id="account-creation-contact-url"
            value={contactUrl}
            onChange={(event) => setContactUrl(event.target.value)}
            placeholder="mailto:support@example.org or https://support.example.org"
            autoComplete="url"
            aria-describedby="account-creation-contact-help"
          />
          <p
            id="account-creation-contact-help"
            className="text-xs leading-relaxed text-muted-foreground"
          >
            Use a secure HTTPS page or a mailto link. Changes apply to the login
            page immediately after saving.
          </p>
        </div>

        <div className="rounded-lg border border-dashed bg-muted/20 p-4">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Login-page preview
          </p>
          {isValidProtocol ? (
            <a
              href={normalizedContactUrl}
              className="inline-flex items-center gap-1.5 text-sm font-medium text-primary underline underline-offset-4"
            >
              Please contact us to create one
              <ExternalLink className="size-3.5" aria-hidden="true" />
            </a>
          ) : (
            <p className="text-sm text-destructive">
              Enter an HTTPS or mailto destination to preview the link.
            </p>
          )}
        </div>

        <div className="flex flex-col-reverse gap-2 border-t pt-5 sm:flex-row sm:justify-between">
          <Button
            type="button"
            variant="ghost"
            onClick={() => setContactUrl(DEFAULT_ACCOUNT_CREATION_CONTACT_URL)}
            disabled={isSaving}
          >
            <RotateCcw className="size-4" aria-hidden="true" />
            Restore default
          </Button>
          <Button
            type="button"
            onClick={handleSave}
            disabled={!isDirty || !isValidProtocol || isSaving}
          >
            {isSaving ? "Saving..." : "Save global settings"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
