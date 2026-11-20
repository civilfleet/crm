"use client";

import type { ColumnDef } from "@tanstack/react-table";
import { CalendarClock, ClipboardList, Hash, Radio, Users } from "lucide-react";
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
  RecordsHeader,
  RecordsPage,
} from "@/components/records/records-layout";
import {
  getSortFields,
  recordListFetcher,
  useRecordList,
} from "@/components/records/use-record-list";
import { useToast } from "@/hooks/use-toast";

/** A form as GET /api/forms sends it. */
export type FormRow = {
  formId: string;
  title: string;
  revision: string;
  submissions: number;
  people: number;
  lastReceivedAt: string;
  publicCount: boolean;
  goal: number | null;
};

/** Every column starts visible. */
const COLUMN_DEFAULTS: Record<string, boolean> = {};

const getRowId = (form: FormRow) => form.formId;

const getColumns = (
  getHref: (form: FormRow) => string,
): ColumnDef<FormRow, unknown>[] => [
  {
    id: "title",
    meta: {
      label: "Form",
      icon: ClipboardList,
      sortField: "title",
      width: 320,
      pinned: true,
      alwaysVisible: true,
    },
    cell: ({ row }) => (
      <RecordNameCell
        kind="record"
        icon={ClipboardList}
        name={row.original.title}
        href={getHref(row.original)}
      />
    ),
  },
  {
    id: "people",
    meta: {
      label: "People",
      icon: Users,
      sortField: "people",
      width: 120,
      align: "right",
    },
    cell: ({ row }) => <TextCell value={row.original.people} />,
  },
  {
    id: "submissions",
    meta: {
      label: "Submissions",
      icon: Hash,
      sortField: "submissions",
      width: 140,
      align: "right",
    },
    cell: ({ row }) => <TextCell value={row.original.submissions} />,
  },
  {
    id: "lastReceivedAt",
    meta: {
      label: "Last received",
      icon: CalendarClock,
      sortField: "lastReceivedAt",
      width: 160,
    },
    cell: ({ row }) => (
      <DateCell value={row.original.lastReceivedAt} withTime />
    ),
  },
  {
    id: "publicCount",
    meta: { label: "Public counter", icon: Radio, width: 170 },
    cell: ({ row }) =>
      row.original.publicCount ? (
        <TextCell
          value={
            row.original.goal
              ? `On, goal ${row.original.goal.toLocaleString()}`
              : "On"
          }
        />
      ) : (
        <TextCell value="Off" muted />
      ),
  },
];

type FormsTableProps = { teamId: string; initialPageSize: number };

/** Every website form the team received, with how many people sent it. */
export default function FormsTable({
  teamId,
  initialPageSize,
}: FormsTableProps) {
  const { toast } = useToast();
  const basePath = `/teams/${teamId}/crm/forms`;
  const columns = useMemo(
    () =>
      getColumns((form) => `${basePath}/${encodeURIComponent(form.formId)}`),
    [basePath],
  );
  const list = useRecordList({
    viewKey: `forms:team:${teamId}`,
    columnDefaults: COLUMN_DEFAULTS,
    initialPageSize,
    sortFields: getSortFields(columns),
  });

  const params = list.getSearchParams({ teamId });
  const { data, error, isLoading, isValidating } = useSWR(
    `/api/forms?${params.toString()}`,
    recordListFetcher,
    { keepPreviousData: true },
  );
  const total = Number(data?.total ?? 0);
  const forms: FormRow[] = Array.isArray(data?.data) ? data.data : [];

  useEffect(() => {
    if (!error) return;
    toast({
      title: "Unable to load forms",
      description: "An unexpected error occurred while fetching them.",
      variant: "destructive",
    });
  }, [error, toast]);

  return (
    <RecordsPage>
      <RecordsHeader
        icon={ClipboardList}
        title="Forms"
        count={isLoading ? undefined : total}
      />
      <RecordListToolbar
        list={list}
        columns={columns}
        searchLabel="Search forms"
        isRefreshing={isValidating && !isLoading}
      />
      <RecordTable
        columns={columns}
        data={forms}
        getRowId={getRowId}
        getRowHref={(form) => `${basePath}/${encodeURIComponent(form.formId)}`}
        isLoading={isLoading}
        emptyState={
          list.isSearching ? (
            <NoMatchState noun="forms" onClear={list.handleClearAll} />
          ) : (
            <EmptyState
              size="page"
              icon={ClipboardList}
              title="No form submissions yet"
              description="Website forms sent to this team appear here with their submissions, once the first one arrives."
            />
          )
        }
        noun={{ one: "form", other: "forms" }}
        sorts={list.sorts}
        onSortsChange={list.setSorts}
        columnVisibility={list.columnVisibility.visibility}
        columnLayout={list.columnVisibility}
        pagination={{ ...list.pagination, total }}
      />
    </RecordsPage>
  );
}
