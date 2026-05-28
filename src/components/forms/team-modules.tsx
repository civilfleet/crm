"use client";

import { useRouter } from "next/navigation";
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
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/hooks/use-toast";
import type { AppModule } from "@/types";

const fetcher = (url: string) => fetch(url).then((res) => res.json());

const TEAM_MODULES: Array<{
  module: AppModule;
  label: string;
  description: string;
}> = [
  {
    module: "CRM",
    label: "CRM",
    description: "Contacts, lists, events, and CRM workflows.",
  },
  {
    module: "FUNDING",
    label: "Funding",
    description: "Funding requests, agreements, transactions, and files.",
  },
];

export default function TeamModulesForm({ teamId }: { teamId: string }) {
  const router = useRouter();
  const { toast } = useToast();
  const { data, mutate, isLoading } = useSWR(
    `/api/teams/${teamId}/modules`,
    fetcher,
  );
  const [selected, setSelected] = useState<AppModule[]>([]);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (data?.data && Array.isArray(data.data)) {
      setSelected(data.data);
    }
  }, [data]);

  const isDirty = useMemo(() => {
    if (!data?.data || !Array.isArray(data.data)) {
      return false;
    }
    const current = [...data.data].sort().join("|");
    const next = [...selected].sort().join("|");
    return current !== next;
  }, [data, selected]);

  const toggleModule = (module: AppModule, checked: boolean) => {
    setSelected((prev) => {
      if (checked) {
        return Array.from(new Set([...prev, module]));
      }
      return prev.filter((item) => item !== module);
    });
  };

  const handleSave = async () => {
    if (!selected.length) {
      toast({
        title: "Select at least one module",
        description: "A team must have at least one enabled module.",
        variant: "destructive",
      });
      return;
    }

    setIsSaving(true);
    try {
      const response = await fetch(`/api/teams/${teamId}/modules`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ modules: selected }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => null);
        throw new Error(errorData?.error || "Failed to update modules");
      }

      await mutate();
      router.refresh();
      toast({
        title: "Modules updated",
        description: "Team module access has been updated successfully.",
      });
    } catch (error) {
      toast({
        title: "Unable to update modules",
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
    <Card>
      <CardHeader>
        <CardTitle>Enabled Modules</CardTitle>
        <CardDescription>
          Disable modules that should not be available for this team.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-2">
          {TEAM_MODULES.map(({ module, label, description }) => (
            <div
              key={module}
              className="flex items-start gap-3 rounded-md border p-3"
            >
              <Checkbox
                checked={selected.includes(module)}
                onCheckedChange={(checked) =>
                  toggleModule(module, checked === true)
                }
              />
              <div className="space-y-1">
                <div className="text-sm font-medium">{label}</div>
                <div className="text-xs text-muted-foreground">
                  {description}
                </div>
              </div>
            </div>
          ))}
        </div>
        <div className="flex justify-end">
          <Button
            type="button"
            onClick={handleSave}
            disabled={isLoading || isSaving || !isDirty}
          >
            {isSaving ? "Saving..." : "Save Modules"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}