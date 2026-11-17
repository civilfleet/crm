"use client";

import { Check, ClipboardList, Copy } from "lucide-react";
import { useId, useState } from "react";
import useSWR from "swr";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";

type Setting = { teamId: string; enabled: boolean };

const fetcher = async (url: string): Promise<{ data: Setting }> => {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Request failed (${response.status})`);
  return response.json();
};

/**
 * Whether forms on the website may send submissions to this team, and the
 * team id their CRM destination in Strapi needs.
 */
const WebsiteFormsSettings = ({ teamId }: { teamId: string }) => {
  const { toast } = useToast();
  const switchId = useId();
  const url = `/api/teams/${teamId}/website-forms`;
  const { data, error, isLoading, mutate } = useSWR(url, fetcher);
  const [isSaving, setIsSaving] = useState(false);
  const [isCopied, setIsCopied] = useState(false);
  const enabled = data?.data.enabled ?? false;

  const handleToggle = async (checked: boolean) => {
    setIsSaving(true);
    try {
      const response = await fetch(url, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled: checked }),
      });
      if (!response.ok) throw new Error();
      await mutate(await response.json(), { revalidate: false });
      toast({
        title: checked ? "Website forms accepted" : "Website forms turned off",
        description: checked
          ? "Submissions from website forms now reach this team."
          : "New submissions are no longer accepted; they are kept for review.",
      });
    } catch {
      toast({
        title: "Not saved",
        description: "The setting could not be changed. Try again.",
        variant: "destructive",
      });
    } finally {
      setIsSaving(false);
    }
  };

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(teamId);
      setIsCopied(true);
      window.setTimeout(() => setIsCopied(false), 2000);
    } catch {
      toast({
        title: "Not copied",
        description: "Select the team id and copy it by hand.",
        variant: "destructive",
      });
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <ClipboardList aria-hidden="true" className="size-5" />
          Website forms
        </CardTitle>
        <CardDescription>
          Forms built in the website&apos;s CMS can send what people fill in to
          this team: new contacts, their answers and consents. They appear under
          CRM → Forms.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="flex items-start justify-between gap-4">
          <div className="space-y-1">
            <Label htmlFor={switchId} className="text-sm font-medium">
              Accept submissions from website forms
            </Label>
            <p className="text-sm text-muted-foreground">
              {error
                ? "The setting could not be loaded."
                : enabled
                  ? "On: submissions for this team are accepted."
                  : "Off: submissions for this team are set aside for review, not added."}
            </p>
          </div>
          <Switch
            id={switchId}
            checked={enabled}
            disabled={isLoading || isSaving || Boolean(error)}
            onCheckedChange={handleToggle}
          />
        </div>

        <div className="space-y-2">
          <p className="text-sm font-medium">
            Team id for the form destination
          </p>
          <p className="text-sm text-muted-foreground">
            In the CMS, a form&apos;s CRM destination needs this id to reach
            this team.
          </p>
          <div className="flex items-center gap-2">
            <code className="min-w-0 flex-1 truncate rounded-md bg-muted px-2 py-1.5 text-sm">
              {teamId}
            </code>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleCopy}
              aria-label="Copy team id"
            >
              {isCopied ? (
                <Check aria-hidden="true" />
              ) : (
                <Copy aria-hidden="true" />
              )}
              {isCopied ? "Copied" : "Copy"}
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

export default WebsiteFormsSettings;
