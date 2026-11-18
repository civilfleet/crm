"use client";

import { formatDistanceToNow } from "date-fns";
import { ArrowRight, GitPullRequestArrow } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import useSWR, { useSWRConfig } from "swr";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";

/** A pending proposal as GET /api/contact-proposals sends it. */
export type ProposalRow = {
  id: string;
  contact: { id: string; name: string };
  field: "name" | "phone" | "postalCode" | "city" | "country" | "email";
  currentValue: string | null;
  proposedValue: string | null;
  isCurrent: boolean;
  source: string | null;
  formTitle: string | null;
  createdAt: string;
  /** The submissions proposing this same value; deciding decides them all. */
  proposedBy: Array<{
    source: string | null;
    formTitle: string | null;
    createdAt: string;
  }>;
};

type Decision = "apply" | "apply-alias" | "decline";

const FIELD_LABELS: Record<ProposalRow["field"], string> = {
  name: "Name",
  phone: "Phone",
  postalCode: "Postal code",
  city: "City",
  country: "Country",
  email: "E-mail",
};

const fetcher = async (url: string) => {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Request failed (${response.status})`);
  return response.json() as Promise<{ data: ProposalRow[]; total: number }>;
};

const Value = ({ value }: { value: string | null }) =>
  value ? (
    <span className="break-all">{value}</span>
  ) : (
    <span className="text-muted-foreground italic">empty</span>
  );

type ProposalListProps = {
  teamId: string;
  rows: ProposalRow[];
  /** On a team-wide list, each row names and links its contact. */
  showContact?: boolean;
  onDecided: (row: ProposalRow) => void;
};

/** Proposed changes with their current and proposed values, and the choices. */
export const ProposalList = ({
  teamId,
  rows,
  showContact = false,
  onDecided,
}: ProposalListProps) => {
  const { toast } = useToast();
  const [busyId, setBusyId] = useState<string | null>(null);

  const handleDecide = async (row: ProposalRow, decision: Decision) => {
    setBusyId(row.id);
    try {
      const response = await fetch(`/api/contact-proposals/${row.id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ teamId, decision }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error ?? "Not saved");
      onDecided(row);
      toast({
        title:
          decision === "decline"
            ? "Change declined"
            : decision === "apply-alias"
              ? "Address added"
              : "Change applied",
      });
    } catch (error) {
      toast({
        title: "Not saved",
        description:
          error instanceof Error ? error.message : "Try again in a moment.",
        variant: "destructive",
      });
    } finally {
      setBusyId(null);
    }
  };

  return (
    <ul className="divide-y">
      {rows.map((row) => {
        const isBusy = busyId === row.id;
        const label = FIELD_LABELS[row.field];
        return (
          <li key={row.id} className="space-y-2 py-3 first:pt-0 last:pb-0">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
              {showContact ? (
                <Link
                  href={`/teams/${teamId}/crm/contacts/${row.contact.id}`}
                  className="font-medium hover:underline"
                >
                  {row.contact.name}
                </Link>
              ) : null}
              <Badge variant="outline">{label}</Badge>
              <span className="text-xs text-muted-foreground">
                {row.formTitle
                  ? `${row.source ?? "Website form"}: ${row.formTitle}`
                  : (row.source ?? "Intake")}
                ,{" "}
                {formatDistanceToNow(new Date(row.createdAt), {
                  addSuffix: true,
                })}
                {row.proposedBy.length > 1 ? (
                  <span
                    title={row.proposedBy
                      .map(
                        (by) =>
                          `${by.formTitle ?? by.source ?? "Intake"}, ${new Date(by.createdAt).toLocaleString()}`,
                      )
                      .join("\n")}
                  >
                    {` · proposed by ${row.proposedBy.length} submissions`}
                  </span>
                ) : null}
              </span>
            </div>
            <p className="flex flex-wrap items-center gap-2 text-sm">
              <Value value={row.currentValue} />
              <ArrowRight
                aria-label="would become"
                className="size-4 shrink-0 text-muted-foreground"
              />
              <span className="font-medium">
                <Value value={row.proposedValue} />
              </span>
            </p>
            {row.isCurrent ? (
              <p className="text-xs text-muted-foreground">
                The contact already has this value.
              </p>
            ) : null}
            <div className="flex flex-wrap gap-2">
              {row.field === "email" ? (
                <>
                  <Button
                    size="sm"
                    disabled={isBusy}
                    onClick={() => handleDecide(row, "apply")}
                  >
                    Make primary address
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={isBusy}
                    onClick={() => handleDecide(row, "apply-alias")}
                  >
                    Add as additional address
                  </Button>
                </>
              ) : (
                <Button
                  size="sm"
                  disabled={isBusy}
                  onClick={() => handleDecide(row, "apply")}
                >
                  {row.isCurrent
                    ? "Mark as done"
                    : `Apply ${label.toLowerCase()}`}
                </Button>
              )}
              <Button
                size="sm"
                variant="ghost"
                disabled={isBusy}
                onClick={() => handleDecide(row, "decline")}
              >
                Decline
              </Button>
            </div>
          </li>
        );
      })}
    </ul>
  );
};

/** The contact page's card: its pending changes, if any. */
export const ContactPendingChanges = ({
  teamId,
  contactId,
}: {
  teamId: string;
  contactId: string;
}) => {
  const { mutate } = useSWRConfig();
  const key = `/api/contact-proposals?teamId=${teamId}&contactId=${contactId}`;
  const { data, mutate: refresh } = useSWR(key, fetcher);
  const rows = data?.data ?? [];
  if (rows.length === 0) return null;

  return (
    <Card className="w-full border-warning/40 shadow-sm">
      <CardHeader className="border-b pb-3">
        <CardTitle className="flex items-center gap-2 text-lg font-semibold">
          <GitPullRequestArrow aria-hidden="true" className="size-5" />
          Pending changes
        </CardTitle>
        <CardDescription>
          A website form or event registration sent values that differ from this
          contact&apos;s. Nothing changes until you decide.
        </CardDescription>
      </CardHeader>
      <CardContent className="pt-4">
        <ProposalList
          teamId={teamId}
          rows={rows}
          onDecided={() => {
            void refresh();
            void mutate(`/api/contact-change-logs?contactId=${contactId}`);
          }}
        />
      </CardContent>
    </Card>
  );
};
