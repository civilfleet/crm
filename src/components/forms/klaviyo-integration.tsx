"use client";

import { AlertTriangle, CheckCircle2, Loader2, PlugZap } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import useSWR from "swr";
import { Badge } from "@/components/ui/badge";
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
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";

type KlaviyoIntegrationResponse = {
  id?: string;
  teamId?: string;
  isEnabled?: boolean;
  defaultListId?: string;
  hasApiKey?: boolean;
  apiKeyPreview?: string;
  connectionVerified?: boolean;
  connectionMessage?: string;
  lastSyncedAt?: string;
  createdAt?: string;
  updatedAt?: string;
};

interface KlaviyoIntegrationProps {
  teamId: string;
}

const formatDate = (value?: string) => {
  if (!value) {
    return null;
  }
  try {
    return new Intl.DateTimeFormat("default", {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(new Date(value));
  } catch {
    return value;
  }
};

export default function KlaviyoIntegration({
  teamId,
}: KlaviyoIntegrationProps) {
  const { toast } = useToast();

  const [isSaving, setIsSaving] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);

  const [apiKey, setApiKey] = useState("");
  const [defaultListId, setDefaultListId] = useState("");
  const [isEnabled, setIsEnabled] = useState(true);
  const [hasApiKey, setHasApiKey] = useState(false);
  const [apiKeyPreview, setApiKeyPreview] = useState("");
  const [lastSyncedAt, setLastSyncedAt] = useState<string | undefined>();
  const [connectionVerified, setConnectionVerified] = useState(false);
  const [connectionMessage, setConnectionMessage] = useState<
    string | undefined
  >();

  const fetcher = async (url: string) => {
    const response = await fetch(url);
    const json = await response.json();
    if (!response.ok) {
      throw new Error(json?.error || response.statusText);
    }
    return (json?.data || null) as KlaviyoIntegrationResponse | null;
  };

  const {
    data: integrationData,
    error: integrationError,
    isLoading,
    mutate,
  } = useSWR(`/api/teams/${teamId}/integrations/klaviyo`, fetcher);

  useEffect(() => {
    if (!integrationData) {
      return;
    }
    setIsEnabled(integrationData.isEnabled ?? true);
    setDefaultListId(integrationData.defaultListId ?? "");
    setHasApiKey(Boolean(integrationData.hasApiKey));
    setApiKeyPreview(integrationData.apiKeyPreview ?? "");
    setLastSyncedAt(integrationData.lastSyncedAt);
    setConnectionMessage(integrationData.connectionMessage);
    setConnectionVerified(Boolean(integrationData.connectionVerified));
  }, [integrationData]);

  useEffect(() => {
    if (!integrationError) {
      return;
    }
    toast({
      title: "Unable to load Klaviyo integration",
      description: integrationError.message,
      variant: "destructive",
    });
  }, [integrationError, toast]);

  const handleSave = async () => {
    setIsSaving(true);
    try {
      const response = await fetch(
        `/api/teams/${teamId}/integrations/klaviyo`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            apiKey: apiKey || undefined,
            defaultListId: defaultListId || undefined,
            isEnabled,
            testConnection: true,
          }),
        },
      );

      const json = await response.json();
      if (!response.ok) {
        throw new Error(json?.error || response.statusText);
      }

      const data = json.data as KlaviyoIntegrationResponse;
      mutate(data, { revalidate: false });
      setHasApiKey(Boolean(data.hasApiKey));
      setApiKeyPreview(data.apiKeyPreview ?? "");
      setLastSyncedAt(data.lastSyncedAt);
      setConnectionMessage(data.connectionMessage);
      setConnectionVerified(Boolean(data.connectionVerified));
      setApiKey("");

      toast({
        title: "Klaviyo connected",
        description: data.connectionMessage || "Integration settings saved",
      });
    } catch (error) {
      toast({
        title: "Failed to save integration",
        description: (error as Error).message,
        variant: "destructive",
      });
    } finally {
      setIsSaving(false);
    }
  };

  const handleSync = async () => {
    setIsSyncing(true);
    try {
      const response = await fetch(
        `/api/teams/${teamId}/integrations/klaviyo/sync`,
        {
          method: "POST",
        },
      );

      const json = await response.json();
      if (!response.ok) {
        throw new Error(json?.error || response.statusText);
      }

      const result = json.data as {
        contactsCreated?: number;
        contactsUpdated?: number;
        engagementsUpserted?: number;
        lastSyncedAt?: string;
      };

      const syncedAt = result?.lastSyncedAt;
      setLastSyncedAt(syncedAt);
      setConnectionVerified(true);

      toast({
        title: "Klaviyo sync finished",
        description: `Created ${result?.contactsCreated ?? 0}, updated ${result?.contactsUpdated ?? 0}, synced ${result?.engagementsUpserted ?? 0} engagements.`,
      });
    } catch (error) {
      toast({
        title: "Sync failed",
        description: (error as Error).message,
        variant: "destructive",
      });
    } finally {
      setIsSyncing(false);
    }
  };

  const canSync = useMemo(
    () => isEnabled && (hasApiKey || apiKey.trim().length > 0),
    [apiKey, hasApiKey, isEnabled],
  );

  const status = useMemo(() => {
    if (!hasApiKey) {
      return {
        label: "Not configured",
        dotClass: "bg-amber-500",
        panelClass: "border-amber-200 bg-amber-50",
        badgeClass: "bg-amber-100 text-amber-900 border-amber-200",
        description: "Add your Klaviyo private key to enable syncing.",
        icon: AlertTriangle,
      };
    }
    if (!isEnabled) {
      return {
        label: "Disabled",
        dotClass: "bg-muted-foreground",
        panelClass: "border-border bg-muted/30",
        badgeClass: "bg-muted text-foreground border-border",
        description: "Klaviyo is configured but currently switched off.",
        icon: PlugZap,
      };
    }
    if (connectionVerified) {
      return {
        label: "Connected",
        dotClass: "bg-emerald-500",
        panelClass: "border-emerald-200 bg-emerald-50",
        badgeClass: "bg-emerald-100 text-emerald-900 border-emerald-200",
        description: "Ready to sync contacts and email engagement.",
        icon: CheckCircle2,
      };
    }
    return {
      label: "Configured",
      dotClass: "bg-blue-500",
      panelClass: "border-blue-200 bg-blue-50",
      badgeClass: "bg-blue-100 text-blue-900 border-blue-200",
      description: "Saved settings, but connection not verified yet.",
      icon: PlugZap,
    };
  }, [connectionVerified, hasApiKey, isEnabled]);

  return (
    <Card className="w-full">
      <CardHeader>
        <div className="flex items-start justify-between gap-4">
          <div>
            <CardTitle>Klaviyo</CardTitle>
            <CardDescription>
              Connect Klaviyo to import contacts and email engagements into your
              CRM.
            </CardDescription>
          </div>
          <div className="flex items-center gap-2">
            <span
              className={`h-2.5 w-2.5 rounded-full ${status.dotClass}`}
              aria-hidden
            />
            <Badge
              variant={hasApiKey ? "default" : "secondary"}
              className={status.badgeClass}
            >
              {status.label}
            </Badge>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        {connectionMessage && (
          <div className="rounded-md bg-muted p-3 text-sm text-muted-foreground">
            {connectionMessage}
          </div>
        )}

        <div className="flex items-center justify-between rounded-lg border p-4">
          <div>
            <p className="font-medium">Enable Klaviyo sync</p>
            <p className="text-sm text-muted-foreground">
              When enabled, you can pull contacts and email engagement from
              Klaviyo.
            </p>
          </div>
          <Switch
            checked={isEnabled}
            onCheckedChange={(checked) => setIsEnabled(checked)}
            disabled={isLoading || isSaving}
          />
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="klaviyo-api-key">Private API key</Label>
            <Input
              id="klaviyo-api-key"
              type="password"
              placeholder={
                hasApiKey && apiKeyPreview
                  ? `Current key: ${apiKeyPreview}`
                  : "pk_xxx..."
              }
              value={apiKey}
              onChange={(event) => setApiKey(event.target.value)}
              disabled={isLoading || isSaving}
            />
            <p className="text-xs text-muted-foreground">
              We do not display saved keys. Enter a new key to rotate or update
              the connection.
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="klaviyo-list-id">Default list ID (optional)</Label>
            <Input
              id="klaviyo-list-id"
              placeholder="List to use for subscriptions"
              value={defaultListId}
              onChange={(event) => setDefaultListId(event.target.value)}
              disabled={isLoading || isSaving}
            />
            <p className="text-xs text-muted-foreground">
              Used when creating new contacts that should be tied to a Klaviyo
              list.
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <Button onClick={handleSave} disabled={isLoading || isSaving}>
            {isSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Save connection
          </Button>
          <Button
            onClick={handleSync}
            variant="secondary"
            disabled={isLoading || isSyncing || !canSync}
          >
            {isSyncing && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Sync now
          </Button>
          {lastSyncedAt && (
            <p className="text-sm text-muted-foreground">
              Last synced {formatDate(lastSyncedAt)}
            </p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}