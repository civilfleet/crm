"use client";

import { AlertTriangle, CheckCircle2, Loader2, PlugZap } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import useSWR from "swr";
import { useToast } from "@/hooks/use-toast";
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

type ZammadIntegrationResponse = {
  id?: string;
  teamId?: string;
  isEnabled?: boolean;
  hasApiKey?: boolean;
  apiKeyPreview?: string;
  baseUrl?: string;
  webhookSecretSet?: boolean;
  connectionVerified?: boolean;
  connectionMessage?: string;
  lastSyncedAt?: string;
  createdAt?: string;
  updatedAt?: string;
};

type ZammadGroupSetting = {
  groupId: number;
  groupName: string;
  importEnabled: boolean;
  autoCreateContacts: boolean;
};

interface ZammadIntegrationProps {
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

export default function ZammadIntegration({ teamId }: ZammadIntegrationProps) {
  const { toast } = useToast();

  const [isSaving, setIsSaving] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);

  const [apiKey, setApiKey] = useState("");
  const [baseUrl, setBaseUrl] = useState("");
  const [webhookSecret, setWebhookSecret] = useState("");
  const [webhookUrl, setWebhookUrl] = useState("");
  const [isEnabled, setIsEnabled] = useState(true);
  const [hasApiKey, setHasApiKey] = useState(false);
  const [apiKeyPreview, setApiKeyPreview] = useState("");
  const [webhookSecretSet, setWebhookSecretSet] = useState(false);
  const [lastSyncedAt, setLastSyncedAt] = useState<string | undefined>();
  const [connectionVerified, setConnectionVerified] = useState(false);
  const [connectionMessage, setConnectionMessage] = useState<
    string | undefined
  >();
  const [groupSettings, setGroupSettings] = useState<ZammadGroupSetting[]>([]);
  const [isSavingGroups, setIsSavingGroups] = useState(false);

  const fetcher = async (url: string) => {
    const response = await fetch(url);
    const json = await response.json();
    if (!response.ok) {
      throw new Error(json?.error || response.statusText);
    }
    return (json?.data || null) as ZammadIntegrationResponse | null;
  };

  const {
    data: integrationData,
    error: integrationError,
    isLoading,
    mutate,
  } = useSWR(`/api/teams/${teamId}/integrations/zammad`, fetcher);

  const groupsKey =
    integrationData?.hasApiKey && integrationData?.baseUrl
      ? `/api/teams/${teamId}/integrations/zammad/groups`
      : null;


  const {
    data: groupsData,
    error: groupsError,
    isLoading: isGroupsLoading,
    mutate: mutateGroups,
  } = useSWR(groupsKey, fetcher);


  useEffect(() => {
    if (!integrationData) {
      return;
    }
    setIsEnabled(integrationData.isEnabled ?? true);
    setHasApiKey(Boolean(integrationData.hasApiKey));
    setApiKeyPreview(integrationData.apiKeyPreview ?? "");
    setLastSyncedAt(integrationData.lastSyncedAt);
    setConnectionMessage(integrationData.connectionMessage);
    setConnectionVerified(Boolean(integrationData.connectionVerified));
    setBaseUrl(integrationData.baseUrl ?? "");
    setWebhookSecretSet(Boolean(integrationData.webhookSecretSet));
  }, [integrationData]);

  useEffect(() => {
    if (!groupsData) {
      return;
    }
    setGroupSettings((groupsData as ZammadGroupSetting[]) || []);
  }, [groupsData]);

  useEffect(() => {
    if (!integrationError) {
      return;
    }
    toast({
      title: "Unable to load Zammad integration",
      description: integrationError.message,
      variant: "destructive",
    });
  }, [integrationError, toast]);

  useEffect(() => {
    if (!groupsError) {
      return;
    }
    toast({
      title: "Unable to load Zammad groups",
      description: groupsError.message,
      variant: "destructive",
    });
  }, [groupsError, toast]);


  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }
    setWebhookUrl(`${window.location.origin}/api/teams/${teamId}/integrations/zammad/webhook`);
  }, [teamId]);

  const handleSave = async () => {
    setIsSaving(true);
    try {
      const response = await fetch(
        `/api/teams/${teamId}/integrations/zammad`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            apiKey: apiKey || undefined,
            baseUrl: baseUrl || undefined,
            webhookSecret: webhookSecret || undefined,
            isEnabled,
            testConnection: true,
          }),
        },
      );

      const json = await response.json();
      if (!response.ok) {
        throw new Error(json?.error || response.statusText);
      }

      const data = json.data as ZammadIntegrationResponse;
      mutate(data, { revalidate: false });
      setHasApiKey(Boolean(data.hasApiKey));
      setApiKeyPreview(data.apiKeyPreview ?? "");
      setLastSyncedAt(data.lastSyncedAt);
      setConnectionMessage(data.connectionMessage);
      setConnectionVerified(Boolean(data.connectionVerified));
      setWebhookSecretSet(Boolean(data.webhookSecretSet));
      setApiKey("");
      setWebhookSecret("");

      toast({
        title: "Zammad connected",
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

  const handleSync = async (fullSync = false) => {
    setIsSyncing(true);
    try {
      const response = await fetch(
        `/api/teams/${teamId}/integrations/zammad/sync${fullSync ? "?fullSync=1" : ""}`,
        {
          method: "POST",
        },
      );

      const json = await response.json();
      if (!response.ok) {
        throw new Error(json?.error || response.statusText);
      }

      const result = json.data as {
        jobId?: string;
        status?: string;
      };

      setConnectionVerified(true);

      toast({
        title: fullSync ? "Full sync queued" : "Zammad sync queued",
        description: result?.jobId
          ? `Worker job ${result.jobId} is ${result.status?.toLowerCase() ?? "queued"}.`
          : "The worker will sync matching ticket messages into engagement history.",
      });
    } catch (error) {
      toast({
        title: fullSync ? "Full sync failed" : "Sync failed",
        description: (error as Error).message,
        variant: "destructive",
      });
    } finally {
      setIsSyncing(false);
    }
  };

  const handleGroupSettingChange = (
    groupId: number,
    updates: Partial<ZammadGroupSetting>,
  ) => {
    setGroupSettings((prev) =>
      prev.map((group) =>
        group.groupId === groupId ? { ...group, ...updates } : group,
      ),
    );
  };

  const handleSaveGroups = async () => {
    if (!groupsKey) {
      return;
    }
    setIsSavingGroups(true);
    try {
      const response = await fetch(groupsKey, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(groupSettings),
      });
      const json = await response.json();
      if (!response.ok) {
        throw new Error(json?.error || response.statusText);
      }
      await mutateGroups();
      toast({
        title: "Group settings saved",
        description: "Zammad group import settings were updated.",
      });
    } catch (error) {
      toast({
        title: "Failed to save group settings",
        description: (error as Error).message,
        variant: "destructive",
      });
    } finally {
      setIsSavingGroups(false);
    }
  };

  const canSync = useMemo(
    () =>
      isEnabled &&
      (hasApiKey || apiKey.trim().length > 0) &&
      baseUrl.trim().length > 0,
    [apiKey, baseUrl, hasApiKey, isEnabled],
  );

  const status = useMemo(() => {
    if (!hasApiKey || !baseUrl) {
      return {
        label: "Not configured",
        dotClass: "bg-amber-500",
        panelClass: "border-amber-200 bg-amber-50",
        badgeClass: "bg-amber-100 text-amber-900 border-amber-200",
        description: "Add your Zammad base URL and API token to enable syncing.",
        icon: AlertTriangle,
      };
    }
    if (!isEnabled) {
      return {
        label: "Disabled",
        dotClass: "bg-muted-foreground",
        panelClass: "border-border bg-muted/30",
        badgeClass: "bg-muted text-foreground border-border",
        description: "Zammad is configured but currently switched off.",
        icon: PlugZap,
      };
    }
    if (connectionVerified) {
      return {
        label: "Connected",
        dotClass: "bg-emerald-500",
        panelClass: "border-emerald-200 bg-emerald-50",
        badgeClass: "bg-emerald-100 text-emerald-900 border-emerald-200",
        description: "Ready to sync ticket activity into engagement history.",
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
  }, [connectionVerified, hasApiKey, isEnabled, baseUrl]);

  return (
    <Card className="w-full">
      <CardHeader>
        <div className="flex items-start justify-between gap-4">
          <div>
            <CardTitle>Zammad</CardTitle>
            <CardDescription>
              Connect Zammad to sync ticket conversations into contact
              engagement history.
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
            <p className="font-medium">Enable Zammad sync</p>
            <p className="text-sm text-muted-foreground">
              When enabled, webhook updates are captured in engagement history.
            </p>
          </div>
          <Switch
            checked={isEnabled}
            onCheckedChange={(checked) => setIsEnabled(checked)}
            disabled={isLoading || isSaving}
          />
        </div>

        {connectionMessage && (
          <div className="rounded-md bg-muted p-3 text-sm text-muted-foreground">
            {connectionMessage}
          </div>
        )}

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="zammad-base-url">Zammad base URL</Label>
            <Input
              id="zammad-base-url"
              type="url"
              placeholder="https://support.example.org"
              value={baseUrl}
              onChange={(event) => setBaseUrl(event.target.value)}
              disabled={isLoading || isSaving}
            />
            <p className="text-xs text-muted-foreground">
              Example: https://support.example.org
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="zammad-api-key">API token</Label>
            <Input
              id="zammad-api-key"
              type="password"
              placeholder={
                hasApiKey && apiKeyPreview
                  ? `Current token: ${apiKeyPreview}`
                  : "Token from Zammad"}
              value={apiKey}
              onChange={(event) => setApiKey(event.target.value)}
              disabled={isLoading || isSaving}
            />
            <p className="text-xs text-muted-foreground">
              Generated from a Zammad service user profile.
            </p>
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="zammad-webhook-url">Webhook endpoint</Label>
            <Input
              id="zammad-webhook-url"
              value={webhookUrl}
              readOnly
            />
            <p className="text-xs text-muted-foreground">
              Use this URL when configuring the Zammad webhook.
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="zammad-webhook-secret">Webhook secret</Label>
            <Input
              id="zammad-webhook-secret"
              type="password"
              placeholder={
                webhookSecretSet
                  ? "Secret is already set"
                  : "Optional shared secret"
              }
              value={webhookSecret}
              onChange={(event) => setWebhookSecret(event.target.value)}
              disabled={isLoading || isSaving}
            />
            <p className="text-xs text-muted-foreground">
              Provide the same secret in Zammad to sign webhook payloads.
            </p>
          </div>
        </div>

        <div className="rounded-lg border p-4 space-y-4">
          <div>
            <p className="font-medium">Group import settings</p>
            <p className="text-sm text-muted-foreground">
              Choose which Zammad groups should sync into engagement history and
              whether contacts should be created automatically.
            </p>
          </div>
          {isGroupsLoading ? (
            <p className="text-sm text-muted-foreground">Loading groups...</p>
          ) : groupSettings.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No groups found yet. Configure Zammad and try again.
            </p>
          ) : (
            <div className="space-y-3">
              {groupSettings.map((group) => (
                <div
                  key={group.groupId}
                  className="flex flex-col gap-3 rounded-md border p-3 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div>
                    <p className="text-sm font-medium">{group.groupName}</p>
                    <p className="text-xs text-muted-foreground">
                      Group ID {group.groupId}
                    </p>
                  </div>
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                    <div className="flex items-center gap-2">
                      <Switch
                        checked={group.importEnabled}
                        onCheckedChange={(checked) =>
                          handleGroupSettingChange(group.groupId, {
                            importEnabled: checked,
                            autoCreateContacts: checked
                              ? group.autoCreateContacts
                              : false,
                          })
                        }
                        disabled={isSavingGroups}
                      />
                      <span className="text-xs text-muted-foreground">
                        Import
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Switch
                        checked={group.autoCreateContacts}
                        onCheckedChange={(checked) =>
                          handleGroupSettingChange(group.groupId, {
                            autoCreateContacts: checked,
                          })
                        }
                        disabled={isSavingGroups || !group.importEnabled}
                      />
                      <span className="text-xs text-muted-foreground">
                        Auto-create contacts
                      </span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
          <div className="flex justify-end">
            <Button
              variant="outline"
              onClick={handleSaveGroups}
              disabled={isSavingGroups || isGroupsLoading || !groupSettings.length}
            >
              {isSavingGroups && (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              )}
              Save group settings
            </Button>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <Button onClick={handleSave} disabled={isLoading || isSaving}>
            {isSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Save connection
          </Button>
          <Button
            onClick={() => handleSync(false)}
            variant="secondary"
            disabled={isLoading || isSyncing || !canSync}
          >
            {isSyncing && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Sync now
          </Button>
          <Button
            onClick={() => handleSync(true)}
            variant="outline"
            disabled={isLoading || isSyncing || !canSync}
          >
            {isSyncing && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Full sync
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
