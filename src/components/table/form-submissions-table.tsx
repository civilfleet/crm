"use client";

import type { ColumnDef } from "@tanstack/react-table";
import {
  CalendarClock,
  CircleUserRound,
  Globe,
  Inbox,
  Mail,
  MessageSquareText,
} from "lucide-react";
import { useEffect, useMemo } from "react";
import useSWR from "swr";
import { EmptyState } from "@/components/design/empty-state";
import {
  DateCell,
  EmailCell,
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
import type { FormSubmissionAnswer } from "@/lib/public-forms/submission";

/** A submission as GET /api/forms/[formId]/submissions sends it. */
type FormSubmissionRow = {
  id: string;
  contact: { id: string; name: string; email: string | null };
  locale: string;
  page: string | null;
  submittedAt: string;
  receivedAt: string;
  answers: FormSubmissionAnswer[];
};

/** Every column starts visible. */
const COLUMN_DEFAULTS: Record<string, boolean> = {};

const getRowId = (row: FormSubmissionRow) => row.id;

const formatAnswer = (answer?: FormSubmissionAnswer) => {
  if (!answer) return "";
  const shown = answer.display ?? answer.value;
  if (Array.isArray(shown)) return shown.join(", ");
  if (typeof shown === "boolean") return shown ? "Yes" : "No";
  return String(shown);
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
        id: "email",
        meta: { label: "Email", icon: Mail, width: 240 },
        cell: ({ row }) => <EmailCell email={row.original.contact.email} />,
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
    () => [...baseColumns, ...getAnswerColumns(rows)],
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
