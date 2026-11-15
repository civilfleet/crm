"use client";

import { FilePenLine, Plus } from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo } from "react";
import useSWR from "swr";
import { EmptyState } from "@/components/design/empty-state";
import {
  type FundingListScope,
  getFundingScopeParams,
} from "@/components/funding/funding-scope";
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
  DONATION_AGREEMENT_COLUMN_DEFAULTS,
  type DonationAgreementRow,
  getDonationAgreementColumns,
} from "@/components/table/donation-agreement-columns";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";

const FILTERS: OptionFilterDefinition[] = [
  {
    key: "signatures",
    label: "Signatures",
    options: [
      { value: "pending", label: "Waiting for signatures" },
      { value: "signed", label: "Signed" },
    ],
  },
];
const FILTER_MODEL = optionFilters(FILTERS);
const FILTER_DEFINITIONS = FILTERS.map(optionFilter);

const getRowId = (agreement: DonationAgreementRow) => agreement.id;

type DonationAgreementTableProps = {
  scope: FundingListScope;
  initialPageSize: number;
  canCreate?: boolean;
};

export default function DonationAgreementTable({
  scope,
  initialPageSize,
  canCreate = false,
}: DonationAgreementTableProps) {
  const { toast } = useToast();
  const teamId = scope.kind === "team" ? scope.teamId : null;
  const basePath =
    scope.kind === "team"
      ? `/teams/${scope.teamId}/funding/donation-agreements`
      : `/organizations/${scope.organizationId}/donation-agreements`;

  const columns = useMemo(
    () =>
      getDonationAgreementColumns({
        getHref: (agreement) => `${basePath}/${agreement.id}`,
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
        ? `donation-agreements:team:${scope.teamId}`
        : `donation-agreements:org:${scope.organizationId}`,
    initialPageSize,
    columnDefaults: DONATION_AGREEMENT_COLUMN_DEFAULTS,
    sortFields: getSortFields(columns),
    filters: FILTER_MODEL,
  });

  const params = list.getSearchParams(getFundingScopeParams(scope));
  for (const filter of list.activeFilters) {
    for (const value of filter.values) params.append(filter.key, value);
  }
  const { data, error, isLoading, isValidating } = useSWR(
    `/api/donation-agreements?${params.toString()}`,
    recordListFetcher,
    { keepPreviousData: true },
  );
  const total = Number(data?.total ?? 0);
  const agreements: DonationAgreementRow[] = Array.isArray(data?.data)
    ? data.data
    : [];

  useEffect(() => {
    if (!error) return;
    toast({
      title: "Unable to load donation agreements",
      description: "An unexpected error occurred while fetching them.",
      variant: "destructive",
    });
  }, [error, toast]);

  const newHref = `${basePath}/create`;

  return (
    <RecordsPage grid>
      <RecordsHeader
        icon={FilePenLine}
        title="Donation agreements"
        count={isLoading ? undefined : total}
        action={
          canCreate ? (
            <Button asChild variant="action" size="sm">
              <Link href={newHref}>
                <Plus /> New donation agreement
              </Link>
            </Button>
          ) : undefined
        }
      />

      <RecordListToolbar
        list={list}
        columns={columns}
        filters={FILTER_DEFINITIONS}
        searchLabel="Search donation agreements"
        isRefreshing={isValidating && !isLoading}
      />

      <RecordTable
        columns={columns}
        data={agreements}
        getRowId={getRowId}
        getRowHref={(agreement) => `${basePath}/${agreement.id}`}
        isLoading={isLoading}
        emptyState={
          list.isSearching ? (
            <NoMatchState
              noun="donation agreements"
              onClear={list.handleClearAll}
            />
          ) : (
            <EmptyState
              size="page"
              icon={FilePenLine}
              title="No donation agreements yet"
              description={
                teamId
                  ? "Once a funding request is accepted, draw up its agreement here and send it out for signatures."
                  : "When a funding request of yours is accepted, its agreement appears here for signing."
              }
              action={
                canCreate ? (
                  <Button asChild variant="action">
                    <Link href={newHref}>
                      <Plus /> New donation agreement
                    </Link>
                  </Button>
                ) : undefined
              }
            />
          )
        }
        noun={{ one: "donation agreement", other: "donation agreements" }}
        sort={list.sort}
        onSortChange={list.setSort}
        columnVisibility={list.columnVisibility.visibility}
        pagination={{ ...list.pagination, total }}
      />
    </RecordsPage>
  );
}
