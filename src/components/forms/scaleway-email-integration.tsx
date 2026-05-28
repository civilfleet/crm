"use client";

import {
  AlertTriangle,
  CheckCircle2,
  Loader2,
  Mail,
  PlugZap,
} from "lucide-react";
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

type ScalewayEmailIntegrationResponse = {
  id?: string;
  teamId?: string;
  isEnabled?: boolean;
  hasApiKey?: boolean;
  apiKeyPreview?: string;
  connectionVerified?: boolean;
  connectionMessage?: string;
  region?: string;
  projectId?: string;
  senderEmail?: string;
  senderName?: string;
  createdAt?: string;
  updatedAt?: string;
};

type ScalewayEmailIntegrationProps = {
  teamId: string;
};

const fetcher = async (url: string) => {
  const response = await fetch(url);
  const json = await response.json();
  if (!response.ok) {
    throw new Error(json?.error || response.statusText);
  }
  return (json?.data || null) as ScalewayEmailIntegrationResponse | null;
};

export default function ScalewayEmailIntegration({
  teamId,
}: ScalewayEmailIntegrationProps) {
  const { toast } = useToast();
  const [isSaving, setIsSaving] = useState(false);
  const [apiKey, setApiKey] = useState("");
  const [region, setRegion] = useState("fr-par");
  const [projectId, setProjectId] = useState("");
  const [senderEmail, setSenderEmail] = useState("");
  const [senderName, setSenderName] = useState("");
  const [isEnabled, setIsEnabled] = useState(true);
  const [hasApiKey, setHasApiKey] = useState(false);
  const [apiKeyPreview, setApiKeyPreview] = useState("");
  const [connectionVerified, setConnectionVerified] = useState(false);
  const [connectionMessage, setConnectionMessage] = useState<
    string | undefined
  >();

  const {
    data: integrationData,
    error: integrationError,
    isLoading,
    mutate,
  } = useSWR(`/api/teams/${teamId}/integrations/scaleway-email`, fetcher);

  useEffect(() => {
    if (!integrationData) {
      return;
    }
    setIsEnabled(integrationData.isEnabled ?? true);
    setRegion(integrationData.region ?? "fr-par");
    setProjectId(integrationData.projectId ?? "");
    setSenderEmail(integrationData.senderEmail ?? "");
    setSenderName(integrationData.senderName ?? "");
    setHasApiKey(Boolean(integrationData.hasApiKey));
    setApiKeyPreview(integrationData.apiKeyPreview ?? "");
    setConnectionMessage(integrationData.connectionMessage);
    setConnectionVerified(Boolean(integrationData.connectionVerified));
  }, [integrationData]);

  useEffect(() => {
    if (!integrationError) {
      return;
    }
    toast({
      title: "Unable to load Scaleway email integration",
      description: integrationError.message,
      variant: "destructive",
    });
  }, [integrationError, toast]);

  const handleSave = async () => {
    setIsSaving(true);
    try {
      const response = await fetch(
        `/api/teams/${teamId}/integrations/scaleway-email`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            apiKey: apiKey || undefined,
            region,
            projectId: projectId || undefined,
            senderEmail: senderEmail || undefined,
            senderName: senderName || undefined,
            isEnabled,
          }),
        },
      );

      const json = await response.json();
      if (!response.ok) {
        throw new Error(json?.error || response.statusText);
      }

      const data = json.data as ScalewayEmailIntegrationResponse;
      mutate(data, { revalidate: false });
      setHasApiKey(Boolean(data.hasApiKey));
      setApiKeyPreview(data.apiKeyPreview ?? "");
      setConnectionMessage(data.connectionMessage);
      setConnectionVerified(Boolean(data.connectionVerified));
      setApiKey("");

      toast({
        title: "Scaleway email saved",
        description:
          data.connectionMessage || "Transactional email settings saved.",
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

  const status = useMemo(() => {
    if (!hasApiKey || !projectId || !senderEmail) {
      return {
        label: "Not configured",
        dotClass: "bg-amber-500",
        badgeClass: "bg-amber-100 text-amber-900 border-amber-200",
        description:
          "Add Scaleway credentials, project ID, and a verified sender address.",
        icon: AlertTriangle,
      };
    }
    if (!isEnabled) {
      return {
        label: "Disabled",
        dotClass: "bg-muted-foreground",
        badgeClass: "bg-muted text-foreground border-border",
        description: "Scaleway email is configured but switched off.",
        icon: PlugZap,
      };
    }
    if (connectionVerified) {
      return {
        label: "Ready",
        dotClass: "bg-emerald-500",
        badgeClass: "bg-emerald-100 text-emerald-900 border-emerald-200",
        description: "Contacts can be emailed through Scaleway TEM.",
        icon: CheckCircle2,
      };
    }
    return {
      label: "Configured",
      dotClass: "bg-blue-500",
      badgeClass: "bg-blue-100 text-blue-900 border-blue-200",
      description: "Settings are saved.",
      icon: Mail,
    };
  }, [connectionVerified, hasApiKey, isEnabled, projectId, senderEmail]);

  const StatusIcon = status.icon;

  return (
    <Card className="w-full">
      <CardHeader>
        <div className="flex items-start justify-between gap-4">
          <div>
            <CardTitle>Scaleway Transactional Email</CardTitle>
            <CardDescription>
              Configure direct CRM email sending for selected contacts.
            </CardDescription>
          </div>
          <div className="flex items-center gap-2">
            <span
              className={`h-2.5 w-2.5 rounded-full ${status.dotClass}`}
              aria-hidden
            />
            <Badge variant="secondary" className={status.badgeClass}>
              {status.label}
            </Badge>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="rounded-md border bg-muted/30 p-3 text-sm text-muted-foreground">
          <div className="flex items-start gap-2">
            <StatusIcon className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{connectionMessage || status.description}</span>
          </div>
        </div>

        <div className="flex items-center justify-between rounded-lg border p-4">
          <div>
            <p className="font-medium">Enable CRM email sending</p>
            <p className="text-sm text-muted-foreground">
              When enabled, users can send emails to selected contacts from the
              contacts table.
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
            <Label htmlFor="scaleway-api-key">Secret key</Label>
            <Input
              id="scaleway-api-key"
              type="password"
              placeholder={
                hasApiKey && apiKeyPreview
                  ? `Current key: ${apiKeyPreview}`
                  : "Scaleway secret key"
              }
              value={apiKey}
              onChange={(event) => setApiKey(event.target.value)}
              disabled={isLoading || isSaving}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="scaleway-region">Region</Label>
            <Input
              id="scaleway-region"
              placeholder="fr-par"
              value={region}
              onChange={(event) => setRegion(event.target.value)}
              disabled={isLoading || isSaving}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="scaleway-project-id">Project ID</Label>
            <Input
              id="scaleway-project-id"
              placeholder="Scaleway project ID"
              value={projectId}
              onChange={(event) => setProjectId(event.target.value)}
              disabled={isLoading || isSaving}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="scaleway-sender-email">Default sender email</Label>
            <Input
              id="scaleway-sender-email"
              type="email"
              placeholder="crm@example.org"
              value={senderEmail}
              onChange={(event) => setSenderEmail(event.target.value)}
              disabled={isLoading || isSaving}
            />
          </div>

          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor="scaleway-sender-name">
              Default sender name (optional)
            </Label>
            <Input
              id="scaleway-sender-name"
              placeholder="CRM"
              value={senderName}
              onChange={(event) => setSenderName(event.target.value)}
              disabled={isLoading || isSaving}
            />
          </div>
        </div>

        <Button onClick={handleSave} disabled={isLoading || isSaving}>
          {isSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          Save connection
        </Button>
      </CardContent>
    </Card>
  );
}
