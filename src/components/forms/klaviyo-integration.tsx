"use client";

import { AlertTriangle, CheckCircle2, Loader2, PlugZap } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import useSWR from "swr";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
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

type KlaviyoSyncSummary = {
  contactsCreated?: number;
  contactsMatched?: number;
  changesProposed?: number;
  engagementsUpserted?: number;
  consentsWithdrawn?: number;
  withdrawalsProposed?: number;
  consentsSent?: number;
  consentsFailed?: number;
  consentsWaiting?: string[];
  failures?: number;
  errors?: string[];
};

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
  lastSync?: {
    status: "PENDING" | "RUNNING" | "SUCCEEDED" | "FAILED";
    queuedAt: string;
    finishedAt?: string;
    error?: string;
    result?: KlaviyoSyncSummary;
  };
};

interface KlaviyoIntegrationProps {
  teamId: string;
}

const formatDate = (value?: string) => {
  if (!value) return null;
  try {
    return new Intl.DateTimeFormat("default", {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(new Date(value));
  } catch {
    return value;
  }
};

const describeResult = (result?: KlaviyoSyncSummary) => {
  if (!result) return null;
  return [
    `${result.contactsCreated ?? 0} contacts created`,
    `${result.contactsMatched ?? 0} matched`,
    `${result.changesProposed ?? 0} changes proposed`,
    `${result.engagementsUpserted ?? 0} e-mail events`,
    `${result.consentsSent ?? 0} consents sent`,
    `${result.consentsWithdrawn ?? 0} unsubscribes recorded`,
    `${result.withdrawalsProposed ?? 0} list unsubscribes to review`,
  ].join(", ");
};

export default function KlaviyoIntegration({
  teamId,
}: KlaviyoIntegrationProps) {
  const { toast } = useToast();
  const endpoint = `/api/teams/${teamId}/integrations/klaviyo`;

  const [isSaving, setIsSaving] = useState(false);
  const [isQueueing, setIsQueueing] = useState(false);
  const [isRemoving, setIsRemoving] = useState(false);

  const [apiKey, setApiKey] = useState("");
  const [defaultListId, setDefaultListId] = useState("");
  const [isEnabled, setIsEnabled] = useState(true);

  const fetcher = async (url: string) => {
    const response = await fetch(url);
    const json = await response.json();
    if (!response.ok) {
      throw new Error(json?.error || response.statusText);
    }
    return (json?.data || null) as KlaviyoIntegrationResponse | null;
  };

  const {
    data: integration,
    error: integrationError,
    isLoading,
    mutate,
  } = useSWR(endpoint, fetcher, {
    // Follow a queued or running sync until it is done.
    refreshInterval: (latest) =>
      latest?.lastSync?.status === "PENDING" ||
      latest?.lastSync?.status === "RUNNING"
        ? 5000
        : 0,
  });

  useEffect(() => {
    setIsEnabled(integration?.isEnabled ?? true);
    setDefaultListId(integration?.defaultListId ?? "");
  }, [integration?.isEnabled, integration?.defaultListId]);

  useEffect(() => {
    if (!integrationError) return;
    toast({
      title: "Unable to load Klaviyo integration",
      description: integrationError.message,
      variant: "destructive",
    });
  }, [integrationError, toast]);

  const hasApiKey = Boolean(integration?.hasApiKey);
  const lastSync = integration?.lastSync;
  const syncInProgress =
    lastSync?.status === "PENDING" || lastSync?.status === "RUNNING";

  const handleSave = async () => {
    setIsSaving(true);
    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          apiKey: apiKey || undefined,
          // Sent even when empty: an empty field clears the list.
          defaultListId,
          isEnabled,
        }),
      });
      const json = await response.json();
      if (!response.ok) {
        throw new Error(json?.error || response.statusText);
      }
      const data = json.data as KlaviyoIntegrationResponse;
      await mutate(data, { revalidate: false });
      setApiKey("");
      toast({
        title: "Klaviyo settings saved",
        description: data.connectionMessage,
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
    setIsQueueing(true);
    try {
      const response = await fetch(`${endpoint}/sync`, { method: "POST" });
      const json = await response.json();
      if (!response.ok) {
        throw new Error(json?.error || response.statusText);
      }
      await mutate();
      toast({
        title: "Klaviyo sync queued",
        description: "It runs in the background; this page shows the result.",
      });
    } catch (error) {
      toast({
        title: "Sync could not be queued",
        description: (error as Error).message,
        variant: "destructive",
      });
    } finally {
      setIsQueueing(false);
    }
  };

  const handleRemove = async () => {
    setIsRemoving(true);
    try {
      const response = await fetch(endpoint, { method: "DELETE" });
      const json = await response.json();
      if (!response.ok) {
        throw new Error(json?.error || response.statusText);
      }
      await mutate(null, { revalidate: false });
      setApiKey("");
      toast({ title: "Klaviyo disconnected" });
    } catch (error) {
      toast({
        title: "Failed to disconnect Klaviyo",
        description: (error as Error).message,
        variant: "destructive",
      });
    } finally {
      setIsRemoving(false);
    }
  };

  const canSync = Boolean(integration?.isEnabled) && hasApiKey;

  const status = useMemo(() => {
    if (!hasApiKey) {
      return {
        label: "Not configured",
        dotClass: "bg-amber-500",
        badgeClass: "bg-warning/10 text-warning-strong border-warning/25",
        icon: AlertTriangle,
      };
    }
    if (!integration?.isEnabled) {
      return {
        label: "Disabled",
        dotClass: "bg-muted-foreground",
        badgeClass: "bg-muted text-foreground border-border",
        icon: PlugZap,
      };
    }
    if (lastSync?.status === "FAILED") {
      return {
        label: "Sync failing",
        dotClass: "bg-red-500",
        badgeClass: "bg-destructive/10 text-destructive border-destructive/25",
        icon: AlertTriangle,
      };
    }
    if (integration?.connectionVerified) {
      return {
        label: "Connected",
        dotClass: "bg-emerald-500",
        badgeClass: "bg-success/10 text-success-strong border-success/25",
        icon: CheckCircle2,
      };
    }
    return {
      label: "Configured",
      dotClass: "bg-blue-500",
      badgeClass: "bg-info/10 text-info-strong border-info/25",
      icon: PlugZap,
    };
  }, [
    hasApiKey,
    integration?.isEnabled,
    integration?.connectionVerified,
    lastSync?.status,
  ]);

  const disabled = isLoading || isSaving || isRemoving;

  return (
    <Card className="w-full">
      <CardHeader>
        <div className="flex items-start justify-between gap-4">
          <div>
            <CardTitle>Klaviyo</CardTitle>
            <CardDescription>
              Imports contacts and newsletter activity from Klaviyo every 15
              minutes, sends marketing consents to your Klaviyo list and records
              unsubscribes made in Klaviyo.
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
        <div className="flex items-center justify-between rounded-lg border p-4">
          <div>
            <p className="font-medium" id="klaviyo-enabled-label">
              Enable Klaviyo sync
            </p>
            <p className="text-sm text-muted-foreground">
              While switched off nothing is imported or sent.
            </p>
          </div>
          <Switch
            aria-labelledby="klaviyo-enabled-label"
            checked={isEnabled}
            onCheckedChange={(checked) => setIsEnabled(checked)}
            disabled={disabled}
          />
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="klaviyo-api-key">Private API key</Label>
            <Input
              id="klaviyo-api-key"
              type="password"
              autoComplete="off"
              placeholder={
                hasApiKey && integration?.apiKeyPreview
                  ? `Current key: ${integration.apiKeyPreview}`
                  : "pk_xxx..."
              }
              value={apiKey}
              onChange={(event) => setApiKey(event.target.value)}
              disabled={disabled}
            />
            <p className="text-xs text-muted-foreground">
              Needs read access to profiles, events and metrics, and write
              access to subscriptions, lists and profiles. Saved keys are not
              shown; enter a new one to replace it.
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="klaviyo-list-id">List for marketing consents</Label>
            <Input
              id="klaviyo-list-id"
              placeholder="e.g. XyZ123"
              value={defaultListId}
              onChange={(event) => setDefaultListId(event.target.value)}
              disabled={disabled}
            />
            <p className="text-xs text-muted-foreground">
              Contacts who confirmed marketing consent are subscribed to this
              list. Without a list, only unsubscribes are sent. Leave empty to
              clear.
            </p>
          </div>
        </div>

        {lastSync && (
          <div
            className="space-y-1 rounded-md bg-muted p-3 text-sm"
            aria-live="polite"
          >
            {syncInProgress ? (
              <p className="flex items-center gap-2">
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                {lastSync.status === "RUNNING"
                  ? "Sync running…"
                  : `Sync queued ${formatDate(lastSync.queuedAt)}${
                      lastSync.error ? ", will retry" : ""
                    }`}
              </p>
            ) : (
              <p>
                {lastSync.status === "FAILED" ? "Sync failed" : "Last sync"}{" "}
                {formatDate(lastSync.finishedAt)}
                {lastSync.status === "SUCCEEDED" && lastSync.result
                  ? `: ${describeResult(lastSync.result)}.`
                  : "."}
              </p>
            )}
            {lastSync.error && (
              <p className="text-destructive">{lastSync.error}</p>
            )}
            {lastSync.result?.consentsWaiting?.map((note) => (
              <p key={note} className="text-muted-foreground">
                {note}
              </p>
            ))}
            {(lastSync.result?.failures ?? 0) > 0 && (
              <p className="text-destructive">
                {lastSync.result?.failures} records could not be saved:{" "}
                {lastSync.result?.errors?.join("; ")}
              </p>
            )}
            {(lastSync.result?.consentsFailed ?? 0) > 0 && (
              <p className="text-destructive">
                Klaviyo refused {lastSync.result?.consentsFailed} consents; they
                are retried on the next syncs.
              </p>
            )}
          </div>
        )}

        <div className="flex flex-wrap items-center gap-3">
          <Button onClick={handleSave} disabled={disabled}>
            {isSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Save connection
          </Button>
          <Button
            onClick={handleSync}
            variant="secondary"
            disabled={disabled || isQueueing || syncInProgress || !canSync}
          >
            {isQueueing && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Sync now
          </Button>
          {hasApiKey && (
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="outline" disabled={disabled}>
                  Disconnect
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Disconnect Klaviyo?</AlertDialogTitle>
                  <AlertDialogDescription>
                    The API key is removed and nothing more is imported or sent.
                    Imported contacts, activity and consents stay in the CRM.
                    Connecting again later sends every marketing consent anew.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel disabled={isRemoving}>
                    Cancel
                  </AlertDialogCancel>
                  <AlertDialogAction
                    onClick={handleRemove}
                    disabled={isRemoving}
                  >
                    Disconnect
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          )}
          {integration?.lastSyncedAt && (
            <p className="text-sm text-muted-foreground">
              Up to date as of {formatDate(integration.lastSyncedAt)}
            </p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
