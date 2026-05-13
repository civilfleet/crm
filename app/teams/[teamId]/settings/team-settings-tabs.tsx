"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import useSWR from "swr";
import CreateEmailTemplate from "@/components/forms/create-email-template";
import EventRolesManager from "@/components/forms/event-roles-manager";
import EventTypesManager from "@/components/forms/event-types-manager";
import FormConfigurationManager from "@/components/forms/form-configuration-manager";
import KlaviyoIntegration from "@/components/forms/klaviyo-integration";
import OrganizationTypesManager from "@/components/forms/organization-types-manager";
import ScalewayEmailIntegration from "@/components/forms/scaleway-email-integration";
import StrategicPrioritiesForm from "@/components/forms/strategic-priorities";
import TeamModulesForm from "@/components/forms/team-modules";
import TeamSsoSettings from "@/components/forms/team-sso-settings";
import ZammadIntegration from "@/components/forms/zammad-integration";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import type { EmailTemplate } from "@/types";

interface TeamSettingsTabsProps {
  teamId: string;
  currentUserId: string;
  owner: { id: string; name: string | null; email: string } | null;
  templates: EmailTemplate[];
}

const VALID_TABS = [
  "general",
  "email-templates",
  "form-configuration",
  "event-types",
  "event-roles",
  "organization-types",
  "integrations",
] as const;
type TabValue = (typeof VALID_TABS)[number];

const TAB_OPTIONS: Array<{ value: TabValue; label: string }> = [
  { value: "general", label: "General Settings" },
  { value: "email-templates", label: "Email Templates" },
  { value: "form-configuration", label: "Funding Request Form" },
  { value: "event-types", label: "Event Types" },
  { value: "event-roles", label: "Event Roles" },
  { value: "organization-types", label: "Organization Types" },
  { value: "integrations", label: "Integrations" },
];

export default function TeamSettingsTabs({
  teamId,
  currentUserId,
  owner,
  templates,
}: TeamSettingsTabsProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { toast } = useToast();
  const { data: modulesResponse } = useSWR(
    `/api/teams/${teamId}/modules`,
    (url: string) => fetch(url).then((res) => res.json()),
  );
  const hasFundingModule = Array.isArray(modulesResponse?.data)
    ? modulesResponse.data.includes("FUNDING")
    : true;
  const tabOptions = hasFundingModule
    ? TAB_OPTIONS
    : TAB_OPTIONS.filter((option) => option.value !== "form-configuration");

  // Get tab from URL or default to "general"
  const tabFromUrl = searchParams.get("tab");
  const isValidTab = useCallback((tab: string | null): tab is TabValue => {
    return tab !== null && VALID_TABS.includes(tab as TabValue);
  }, []);

  const [activeTab, setActiveTab] = useState<TabValue>(
    isValidTab(tabFromUrl) ? tabFromUrl : "general",
  );

  // Update URL when tab changes
  const handleTabChange = (value: string) => {
    if (isValidTab(value)) {
      setActiveTab(value);

      // Update URL without triggering navigation
      const url = new URL(window.location.href);
      url.searchParams.set("tab", value);
      router.replace(url.pathname + url.search, { scroll: false });
    }
  };

  // Listen for URL changes (e.g., browser back/forward)
  useEffect(() => {
    const handlePopState = () => {
      const currentParams = new URLSearchParams(window.location.search);
      const newTab = currentParams.get("tab");
      if (isValidTab(newTab)) {
        setActiveTab(newTab);
      } else {
        setActiveTab("general");
      }
    };

    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, [isValidTab]);

  useEffect(() => {
    if (!hasFundingModule && activeTab === "form-configuration") {
      setActiveTab("general");
      const url = new URL(window.location.href);
      url.searchParams.set("tab", "general");
      router.replace(url.pathname + url.search, { scroll: false });
    }
  }, [activeTab, hasFundingModule, router]);

  return (
    <Tabs
      value={activeTab}
      onValueChange={handleTabChange}
      className="space-y-8"
    >
      <div className="sm:hidden">
        <Select value={activeTab} onValueChange={handleTabChange}>
          <SelectTrigger>
            <SelectValue placeholder="Select section" />
          </SelectTrigger>
          <SelectContent>
            {tabOptions.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <TabsList
        className={`hidden w-full sm:grid ${
          hasFundingModule ? "grid-cols-7" : "grid-cols-6"
        }`}
      >
        {tabOptions.map((option) => (
          <TabsTrigger key={option.value} value={option.value}>
            {option.label}
          </TabsTrigger>
        ))}
      </TabsList>

      <TabsContent value="general" className="space-y-8">
        <OwnershipCard
          teamId={teamId}
          currentUserId={currentUserId}
          owner={owner}
          onSuccess={() => {
            toast({
              title: "Ownership updated",
              description: "Team owner has been updated successfully.",
            });
            router.refresh();
          }}
        />
        <TeamSsoSettings teamId={teamId} />
        {hasFundingModule ? <StrategicPrioritiesForm teamId={teamId} /> : null}
        <TeamModulesForm teamId={teamId} />
      </TabsContent>

      <TabsContent value="email-templates" className="space-y-8">
        <Card>
          <div className="space-y-4">
            <CreateEmailTemplate teamId={teamId} templates={templates} />
          </div>
        </Card>
      </TabsContent>

      {hasFundingModule ? (
        <TabsContent value="form-configuration" className="space-y-8">
          <FormConfigurationManager teamId={teamId} />
        </TabsContent>
      ) : null}

      <TabsContent value="event-types" className="space-y-8">
        <EventTypesManager teamId={teamId} />
      </TabsContent>

      <TabsContent value="event-roles" className="space-y-8">
        <EventRolesManager teamId={teamId} />
      </TabsContent>

      <TabsContent value="organization-types" className="space-y-8">
        <OrganizationTypesManager teamId={teamId} />
      </TabsContent>

      <TabsContent value="integrations" className="space-y-8">
        <KlaviyoIntegration teamId={teamId} />
        <ScalewayEmailIntegration teamId={teamId} />
        <ZammadIntegration teamId={teamId} />
      </TabsContent>
    </Tabs>
  );
}

type OwnershipCardProps = {
  teamId: string;
  currentUserId: string;
  owner: { id: string; name: string | null; email: string } | null;
  onSuccess: () => void;
};

const OwnershipCard = ({
  teamId,
  currentUserId,
  owner,
  onSuccess,
}: OwnershipCardProps) => {
  const { toast } = useToast();
  const [pending, setPending] = useState(false);
  const [selectedOwnerId, setSelectedOwnerId] = useState(owner?.id ?? "");
  const [ownerState, setOwnerState] = useState(owner);

  const { data: usersResponse, mutate } = useSWR(
    `/api/teams/${teamId}/users`,
    (url: string) => fetch(url).then((res) => res.json()),
  );

  const users: Array<{ id: string; name: string | null; email: string }> =
    usersResponse?.data || [];
  const ownerIdFromApi: string | null = usersResponse?.ownerId ?? null;

  useEffect(() => {
    if (ownerIdFromApi) {
      setSelectedOwnerId(ownerIdFromApi);
      const ownerFromList = users.find((u) => u.id === ownerIdFromApi);
      if (ownerFromList) {
        setOwnerState(ownerFromList);
      }
    }
  }, [ownerIdFromApi, users]);

  const isOwner = (ownerIdFromApi || ownerState?.id) === currentUserId;
  const currentOwner =
    users.find((u) => u.id === (ownerIdFromApi || ownerState?.id)) ||
    ownerState ||
    null;

  const handleTransfer = async () => {
    if (!isOwner || !selectedOwnerId || selectedOwnerId === currentOwner?.id) {
      return;
    }
    setPending(true);
    try {
      const response = await fetch(`/api/teams/${teamId}/owner`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ newOwnerId: selectedOwnerId }),
      });

      if (!response.ok) {
        const errorBody = await response.json().catch(() => ({}));
        throw new Error(errorBody.error || "Failed to transfer ownership");
      }

      const body = (await response.json()) as {
        data?: { ownerId?: string };
      };

      const newOwner =
        users.find((u) => u.id === body.data?.ownerId) ||
        users.find((u) => u.id === selectedOwnerId);
      if (newOwner) {
        setOwnerState(newOwner);
      }
      await mutate();
      onSuccess();
    } catch (error) {
      toast({
        title: "Unable to transfer ownership",
        description:
          error instanceof Error
            ? error.message
            : "An unexpected error occurred.",
        variant: "destructive",
      });
    } finally {
      setPending(false);
    }
  };

  return (
    <Card className="p-4 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold">Team Ownership</h3>
          <p className="text-sm text-muted-foreground">
            Only the owner can transfer ownership. Admins can view the current
            owner but cannot change it.
          </p>
        </div>
      </div>

      <div className="space-y-2">
        <p className="text-sm text-muted-foreground">Current owner</p>
        <div className="rounded-md border p-3">
          {currentOwner ? (
            <div className="flex flex-col">
              <span className="font-medium">
                {currentOwner.name || currentOwner.email}
              </span>
              <span className="text-sm text-muted-foreground">
                {currentOwner.email}
              </span>
            </div>
          ) : (
            <span className="text-sm text-muted-foreground">
              No owner assigned
            </span>
          )}
        </div>
      </div>

      <div className="space-y-2">
        <p className="text-sm text-muted-foreground">Transfer ownership</p>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <select
            className="w-full sm:w-80 rounded-md border border-input bg-background px-3 py-2 text-sm"
            value={selectedOwnerId}
            onChange={(event) => setSelectedOwnerId(event.target.value)}
            disabled={!isOwner || pending || users.length === 0}
          >
            <option value="" disabled>
              Select new owner
            </option>
            {users.map((user) => (
              <option key={user.id} value={user.id}>
                {user.name || user.email}{" "}
                {user.id === currentUserId ? "(You)" : ""}
              </option>
            ))}
          </select>
          <Button
            type="button"
            onClick={handleTransfer}
            disabled={
              !isOwner ||
              pending ||
              !selectedOwnerId ||
              selectedOwnerId === currentOwner?.id
            }
          >
            {pending ? "Transferring..." : "Transfer Ownership"}
          </Button>
        </div>
        {!isOwner && (
          <p className="text-xs text-muted-foreground">
            Only the current owner can transfer ownership.
          </p>
        )}
      </div>
    </Card>
  );
};