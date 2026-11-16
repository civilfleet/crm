"use client";

import { HandCoins, Plus } from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo } from "react";
import useSWR from "swr";
import { EmptyState } from "@/components/design/empty-state";
import {
  type FundingListScope,
  getFundingScopeParams,
} from "@/components/funding/funding-scope";
import { FUNDING_STATUS_OPTIONS } from "@/components/funding/funding-status";
import {
  NoMatchState,
  optionFilter,
  RecordListToolbar,
} from "@/components/records/record-list-toolbar";
import { RecordTable } from "@/components/records/record-table";
import {
  RecordsHeader,
  RecordsPage,
} from "@/components/records/records-layout";
import {
  getSortFields,
  type OptionFilterDefinition,
  optionFilters,
  recordListFetcher,
  useRecordList,
} from "@/components/records/use-record-list";
import {
  FUNDING_REQUEST_COLUMN_DEFAULTS,
  type FundingRequestRow,
  getFundingRequestColumns,
} from "@/components/table/funding-request-columns";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";

const FILTERS: OptionFilterDefinition[] = [
  { key: "status", label: "Status", options: FUNDING_STATUS_OPTIONS },
];
const FILTER_MODEL = optionFilters(FILTERS);
const FILTER_DEFINITIONS = FILTERS.map(optionFilter);

const getRowId = (request: FundingRequestRow) => request.id;

type FundingRequestTableProps = {
  scope: FundingListScope;
  initialPageSize: number;
  canCreate?: boolean;
};

export default function FundingRequestTable({
  scope,
  initialPageSize,
  canCreate = true,
}: FundingRequestTableProps) {
  const { toast } = useToast();
  const teamId = scope.kind === "team" ? scope.teamId : null;
  const basePath =
    scope.kind === "team"
      ? `/teams/${scope.teamId}/funding/funding-requests`
      : `/organizations/${scope.organizationId}/funding-requests`;

  const columns = useMemo(
    () =>
      getFundingRequestColumns({
        getHref: (request) => `${basePath}/${request.id}`,
        getOrganizationHref: teamId
          ? (organizationId) =>
              `/teams/${teamId}/funding/organizations/${organizationId}`
          : undefined,
        showOrganization: Boolean(teamId),
      }),
    [basePath, teamId],
  );

  const list = useRecordList({
    viewKey:
      scope.kind === "team"
        ? `funding-requests:team:${scope.teamId}`
        : `funding-requests:org:${scope.organizationId}`,
    initialPageSize,
    columnDefaults: FUNDING_REQUEST_COLUMN_DEFAULTS,
    sortFields: getSortFields(columns),
    filters: FILTER_MODEL,
  });

  const params = list.getSearchParams(getFundingScopeParams(scope));
  for (const filter of list.activeFilters) {
    for (const value of filter.values) params.append(filter.key, value);
  }
  const { data, error, isLoading, isValidating } = useSWR(
    `/api/funding-requests?${params.toString()}`,
    recordListFetcher,
    { keepPreviousData: true },
  );
  const total = Number(data?.total ?? 0);
  const requests: FundingRequestRow[] = Array.isArray(data?.data)
    ? data.data
    : [];

  useEffect(() => {
    if (!error) return;
    toast({
      title: "Unable to load funding requests",
      description: "An unexpected error occurred while fetching them.",
      variant: "destructive",
    });
  }, [error, toast]);

  const newHref = `${basePath}/create`;

  return (
    <RecordsPage>
      <RecordsHeader
        icon={HandCoins}
        title="Funding requests"
        count={isLoading ? undefined : total}
        action={
          canCreate ? (
            <Button asChild variant="action" size="sm">
              <Link href={newHref}>
                <Plus /> New funding request
              </Link>
            </Button>
          ) : undefined
        }
      />

      <RecordListToolbar
        list={list}
        columns={columns}
        filters={FILTER_DEFINITIONS}
        searchLabel="Search funding requests"
        isRefreshing={isValidating && !isLoading}
      />

      <RecordTable
        columns={columns}
        data={requests}
        getRowId={getRowId}
        getRowHref={(request) => `${basePath}/${request.id}`}
        isLoading={isLoading}
        emptyState={
          list.isSearching ? (
            <NoMatchState
              noun="funding requests"
              onClear={list.handleClearAll}
            />
          ) : (
            <EmptyState
              size="page"
              icon={HandCoins}
              title="No funding requests yet"
              description={
                teamId
                  ? "Requests appear here when organizations apply, or when you add one for them."
                  : "Apply for funding, then follow your request here from review to payout."
              }
              action={
                canCreate ? (
                  <Button asChild variant="action">
                    <Link href={newHref}>
                      <Plus /> New funding request
                    </Link>
                  </Button>
                ) : undefined
              }
            />
          )
        }
        noun={{ one: "funding request", other: "funding requests" }}
        sorts={list.sorts}
        onSortsChange={list.setSorts}
        columnVisibility={list.columnVisibility.visibility}
        pagination={{ ...list.pagination, total }}
      />
    </RecordsPage>
  );
}
