"use client";

import { ArrowLeftRight, Plus } from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import useSWR from "swr";
import { EmptyState } from "@/components/design/empty-state";
import type { FundingListScope } from "@/components/funding/funding-scope";
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
  getTransactionColumns,
  TRANSACTION_COLUMN_DEFAULTS,
  type TransactionRow,
} from "@/components/table/transaction-columns";
import { Button } from "@/components/ui/button";
import { UploadReceiptModal } from "@/components/upload-receipt-modal";
import { useToast } from "@/hooks/use-toast";
import { TABLE_PAGE_SIZES } from "@/lib/table-page-size";

const FILTERS: OptionFilterDefinition[] = [
  {
    key: "receipt",
    label: "Receipt",
    options: [
      { value: "missing", label: "Missing" },
      { value: "uploaded", label: "Uploaded" },
    ],
  },
];
const FILTER_MODEL = optionFilters(FILTERS);
const FILTER_DEFINITIONS = FILTERS.map(optionFilter);

const getRowId = (transaction: TransactionRow) => transaction.id;

type TransactionTableProps = {
  /** A team's or an organization's list, or the payouts of one funding request. */
  scope:
    | FundingListScope
    | { kind: "fundingRequest"; fundingRequestId: string };
  initialPageSize?: number;
  canCreate?: boolean;
};

export default function TransactionTable({
  scope,
  initialPageSize = TABLE_PAGE_SIZES[0],
  canCreate = false,
}: TransactionTableProps) {
  const { toast } = useToast();
  const [receiptFor, setReceiptFor] = useState<TransactionRow | null>(null);
  const isEmbedded = scope.kind === "fundingRequest";
  const teamId = scope.kind === "team" ? scope.teamId : null;
  const fundingRequestBase =
    scope.kind === "team"
      ? `/teams/${scope.teamId}/funding/funding-requests`
      : scope.kind === "organization"
        ? `/organizations/${scope.organizationId}/funding-requests`
        : null;
  const scopeParams: Record<string, string> =
    scope.kind === "team"
      ? { teamId: scope.teamId }
      : scope.kind === "organization"
        ? { organizationId: scope.organizationId }
        : { fundingRequestId: scope.fundingRequestId };

  const columns = useMemo(
    () =>
      getTransactionColumns({
        getFundingRequestHref: fundingRequestBase
          ? (fundingRequestId) => `${fundingRequestBase}/${fundingRequestId}`
          : undefined,
        getOrganizationHref: teamId
          ? (organizationId) =>
              `/teams/${teamId}/funding/organizations/${organizationId}`
          : undefined,
        showFundingRequest: !isEmbedded,
        showOrganization: Boolean(teamId),
        onUploadReceipt: setReceiptFor,
      }),
    [fundingRequestBase, teamId, isEmbedded],
  );

  const list = useRecordList({
    // Inside a funding request the list keeps no view of its own.
    viewKey:
      scope.kind === "team"
        ? `transactions:team:${scope.teamId}`
        : scope.kind === "organization"
          ? `transactions:org:${scope.organizationId}`
          : null,
    initialPageSize,
    columnDefaults: TRANSACTION_COLUMN_DEFAULTS,
    sortFields: getSortFields(columns),
    filters: FILTER_MODEL,
  });

  const params = list.getSearchParams(scopeParams);
  for (const filter of list.activeFilters) {
    for (const value of filter.values) params.append(filter.key, value);
  }
  const { data, error, isLoading, isValidating, mutate } = useSWR(
    `/api/transactions?${params.toString()}`,
    recordListFetcher,
    { keepPreviousData: true },
  );
  const total = Number(data?.total ?? 0);
  const transactions: TransactionRow[] = Array.isArray(data?.data)
    ? data.data
    : [];

  useEffect(() => {
    if (!error) return;
    toast({
      title: "Unable to load transactions",
      description: "An unexpected error occurred while fetching them.",
      variant: "destructive",
    });
  }, [error, toast]);

  const newHref = teamId ? `/teams/${teamId}/funding/transactions/create` : "";
  const showCreate = canCreate && Boolean(teamId);

  return (
    <RecordsPage fill={!isEmbedded}>
      {isEmbedded ? null : (
        <RecordsHeader
          icon={ArrowLeftRight}
          title="Transactions"
          count={isLoading ? undefined : total}
          action={
            showCreate ? (
              <Button asChild variant="action" size="sm">
                <Link href={newHref}>
                  <Plus /> New transaction
                </Link>
              </Button>
            ) : undefined
          }
        />
      )}

      <RecordListToolbar
        list={list}
        columns={columns}
        filters={FILTER_DEFINITIONS}
        searchLabel="Search transactions"
        isRefreshing={isValidating && !isLoading}
      />

      <RecordTable
        columns={columns}
        data={transactions}
        getRowId={getRowId}
        getRowHref={(transaction) =>
          fundingRequestBase && transaction.fundingRequest
            ? `${fundingRequestBase}/${transaction.fundingRequest.id}`
            : undefined
        }
        isLoading={isLoading}
        emptyState={
          list.isSearching ? (
            <NoMatchState noun="transactions" onClear={list.handleClearAll} />
          ) : (
            <EmptyState
              size={isEmbedded ? "inline" : "page"}
              icon={ArrowLeftRight}
              title="No transactions yet"
              description={
                isEmbedded
                  ? "Payouts for this request appear here once funds are sent."
                  : teamId
                    ? "Record a payout once a funding request is approved and its funds go out."
                    : "Payouts to your organization appear here, each with its receipt."
              }
              action={
                showCreate ? (
                  <Button asChild variant="action">
                    <Link href={newHref}>
                      <Plus /> New transaction
                    </Link>
                  </Button>
                ) : undefined
              }
            />
          )
        }
        noun={{ one: "transaction", other: "transactions" }}
        sorts={list.sorts}
        onSortsChange={list.setSorts}
        columnVisibility={list.columnVisibility.visibility}
        pagination={{ ...list.pagination, total }}
      />

      {receiptFor ? (
        <UploadReceiptModal
          key={receiptFor.id}
          isOpen
          onClose={() => setReceiptFor(null)}
          onUpload={() => {
            void mutate();
          }}
          transactionId={receiptFor.id}
        />
      ) : null}
    </RecordsPage>
  );
}
