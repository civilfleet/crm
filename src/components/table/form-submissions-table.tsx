"use client";

import type { ColumnDef } from "@tanstack/react-table";
import {
  CalendarClock,
  CircleCheck,
  CircleUserRound,
  Globe,
  Inbox,
  MessageSquareText,
  ShieldCheck,
} from "lucide-react";
import { useEffect, useMemo } from "react";
import useSWR from "swr";
import { EmptyState } from "@/components/design/empty-state";
import {
  DateCell,
  RecordNameCell,
  TextCell,
} from "@/components/records/record-cells";
import {
  NoMatchState,
  RecordListToolbar,
} from "@/components/records/record-list-toolbar";
import { RecordTable } from "@/components/records/record-table";
import {
  getSortFields,
  recordListFetcher,
  useRecordList,
} from "@/components/records/use-record-list";
import { useToast } from "@/hooks/use-toast";
import type {
  FormContactAnswer,
  FormSubmissionAnswer,
} from "@/lib/public-forms/submission";
import { cn } from "@/lib/utils";

/** A submission as GET /api/forms/[formId]/submissions sends it. */
type FormSubmissionRow = {
  id: string;
  contact: { id: string; name: string; email: string | null };
  locale: string;
  page: string | null;
  submittedAt: string;
  receivedAt: string;
  answers: FormSubmissionAnswer[];
  contactAnswers: FormContactAnswer[];
  confirmationRequested: boolean;
  confirmationSentAt: string | null;
  confirmationSkipped: string | null;
  confirmedAt: string | null;
  verification: { status: string; issues: string[] } | null;
};

const VERIFICATION_LABELS: Record<string, string> = {
  verified: "Matches the form",
  mismatch: "Differs from the form",
  "other-revision": "Older version of the form",
  unpublished: "Form not published",
};

/** Every column starts visible. */
const COLUMN_DEFAULTS: Record<string, boolean> = {};

const time = (value: string) =>
  new Date(value).toLocaleString(undefined, {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });

/** Where a submission's e-mail confirmation stands, in words. */
const confirmationState = (
  row: FormSubmissionRow,
): { label: string; hint?: string; tone: "plain" | "muted" | "warning" } => {
  if (row.confirmedAt)
    return { label: `Confirmed ${time(row.confirmedAt)}`, tone: "plain" };
  if (!row.confirmationRequested)
    return {
      label: "Not asked",
      hint: "The form does not ask for confirmation, and no marketing consent was ticked.",
      tone: "muted",
    };
  if (row.confirmationSkipped === "address-limit")
    return {
      label: "Not sent: daily limit for this address",
      hint: "This address already reached its daily number of confirmation e-mails (protection against e-mail bombing). The submission expires unconfirmed after 7 days.",
      tone: "warning",
    };
  if (row.confirmationSkipped)
    return {
      label: "Not sent: no address",
      hint: "The submission has no e-mail address to confirm.",
      tone: "warning",
    };
  if (row.confirmationSentAt)
    return {
      label: `E-mail sent ${time(row.confirmationSentAt)}, waiting for click`,
      tone: "muted",
    };
  return {
    label: "Waiting to be sent",
    hint: "Queued: sent within moments, or later if the hourly limits are reached or the form's published file cannot be read.",
    tone: "muted",
  };
};

const getRowId = (row: FormSubmissionRow) => row.id;

const formatAnswer = (answer?: FormSubmissionAnswer) => {
  if (!answer) return "";
  const shown = answer.display ?? answer.value;
  if (Array.isArray(shown)) return shown.join(", ");
  if (typeof shown === "boolean") return shown ? "Yes" : "No";
  return String(shown);
};

/**
 * One column per contact detail the submissions on the page carry, labelled
 * as the form asked it and marked as saved to the contact.
 */
const getContactAnswerColumns = (
  rows: FormSubmissionRow[],
): ColumnDef<FormSubmissionRow, unknown>[] => {
  const fields = new Map<string, string>();
  for (const row of rows)
    for (const answer of row.contactAnswers)
      if (!fields.has(answer.field)) fields.set(answer.field, answer.label);
  return [...fields].map(([field, label]) => ({
    id: `contact:${field}`,
    meta: { label: `${label} → contact`, icon: CircleUserRound, width: 200 },
    cell: ({ row }) => (
      <TextCell
        value={
          row.original.contactAnswers.find((answer) => answer.field === field)
            ?.value
        }
      />
    ),
  }));
};

/** One column per question of the newest submission on the page. */
const getAnswerColumns = (
  rows: FormSubmissionRow[],
): ColumnDef<FormSubmissionRow, unknown>[] => {
  const questions = new Map<string, string>();
  for (const row of rows)
    for (const answer of row.answers)
      if (!questions.has(answer.id)) questions.set(answer.id, answer.label);
  return [...questions].map(([id, label]) => ({
    id: `answer:${id}`,
    meta: { label, icon: MessageSquareText, width: 220 },
    cell: ({ row }) => (
      <TextCell
        value={formatAnswer(
          row.original.answers.find((answer) => answer.id === id),
        )}
      />
    ),
  }));
};

type FormSubmissionsTableProps = {
  teamId: string;
  formId: string;
  initialPageSize: number;
};

/** What people sent through one website form, newest first. */
export const FormSubmissionsTable = ({
  teamId,
  formId,
  initialPageSize,
}: FormSubmissionsTableProps) => {
  const { toast } = useToast();
  const contactHref = (contactId: string) =>
    `/teams/${teamId}/crm/contacts/${contactId}`;
  const baseColumns = useMemo<ColumnDef<FormSubmissionRow, unknown>[]>(
    () => [
      {
        id: "contact",
        meta: {
          label: "Contact",
          icon: CircleUserRound,
          sortField: "contact",
          width: 240,
          pinned: true,
          alwaysVisible: true,
        },
        cell: ({ row }) => (
          <RecordNameCell
            kind="person"
            name={row.original.contact.name}
            href={`/teams/${teamId}/crm/contacts/${row.original.contact.id}`}
          />
        ),
      },
      {
        id: "receivedAt",
        meta: {
          label: "Received",
          icon: CalendarClock,
          sortField: "receivedAt",
          width: 150,
        },
        cell: ({ row }) => <DateCell value={row.original.receivedAt} />,
      },
      {
        id: "confirmed",
        meta: { label: "E-mail confirmation", icon: CircleCheck, width: 240 },
        cell: ({ row }) => {
          const state = confirmationState(row.original);
          return (
            <span
              title={state.hint}
              className={cn(
                "block truncate",
                state.tone === "muted" && "text-muted-foreground",
                state.tone === "warning" && "text-warning-strong",
              )}
            >
              {state.label}
            </span>
          );
        },
      },
      {
        id: "verification",
        meta: { label: "Checked", icon: ShieldCheck, width: 200 },
        cell: ({ row }) => {
          const verification = row.original.verification;
          if (!verification) return <TextCell value="Not checked" muted />;
          const label =
            VERIFICATION_LABELS[verification.status] ?? verification.status;
          return (
            <span
              title={verification.issues.join("\n") || undefined}
              className={
                verification.status === "verified"
                  ? "block truncate"
                  : "block truncate text-warning-strong"
              }
            >
              {label}
              {verification.issues.length
                ? ` (${verification.issues.length})`
                : ""}
            </span>
          );
        },
      },
      {
        id: "locale",
        meta: {
          label: "Language",
          icon: Globe,
          sortField: "locale",
          width: 120,
        },
        cell: ({ row }) => <TextCell value={row.original.locale} muted />,
      },
    ],
    [teamId],
  );

  const list = useRecordList({
    // Embedded in a form's page: the columns differ per form, so no saved view.
    viewKey: null,
    columnDefaults: COLUMN_DEFAULTS,
    initialPageSize,
    sortFields: getSortFields(baseColumns),
  });

  const params = list.getSearchParams({ teamId });
  const { data, error, isLoading, isValidating } = useSWR(
    `/api/forms/${encodeURIComponent(formId)}/submissions?${params.toString()}`,
    recordListFetcher,
    { keepPreviousData: true },
  );
  const total = Number(data?.total ?? 0);
  const rows = useMemo<FormSubmissionRow[]>(
    () => (Array.isArray(data?.data) ? data.data : []),
    [data],
  );
  const columns = useMemo(
    () => [
      ...baseColumns,
      ...getContactAnswerColumns(rows),
      ...getAnswerColumns(rows),
    ],
    [baseColumns, rows],
  );

  useEffect(() => {
    if (!error) return;
    toast({
      title: "Unable to load submissions",
      description: "An unexpected error occurred while fetching them.",
      variant: "destructive",
    });
  }, [error, toast]);

  return (
    <div className="flex min-h-0 flex-col">
      <RecordListToolbar
        list={list}
        columns={columns}
        searchLabel="Search by name or e-mail"
        isRefreshing={isValidating && !isLoading}
      />
      <RecordTable
        columns={columns}
        data={rows}
        getRowId={getRowId}
        getRowHref={(row) => contactHref(row.contact.id)}
        isLoading={isLoading}
        emptyState={
          list.isSearching ? (
            <NoMatchState noun="submissions" onClear={list.handleClearAll} />
          ) : (
            <EmptyState
              icon={Inbox}
              title="No submissions you can see"
              description="Submissions of contacts in groups you are not part of are hidden."
            />
          )
        }
        noun={{ one: "submission", other: "submissions" }}
        sorts={list.sorts}
        onSortsChange={list.setSorts}
        columnVisibility={list.columnVisibility.visibility}
        pagination={{ ...list.pagination, total }}
      />
    </div>
  );
};
