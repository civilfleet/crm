"use client";

import { GitPullRequestArrow } from "lucide-react";
import { useState } from "react";
import useSWR from "swr";
import { ProposalList, type ProposalRow } from "@/components/contact-proposals";
import { EmptyState } from "@/components/design/empty-state";
import {
  RecordsHeader,
  RecordsPage,
} from "@/components/records/records-layout";
import { Button } from "@/components/ui/button";

const PAGE_SIZE = 25;

const fetcher = async (url: string) => {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Request failed (${response.status})`);
  return response.json() as Promise<{ data: ProposalRow[]; total: number }>;
};

/** Every pending proposed change of the team, oldest first. */
export const PendingChangesPage = ({ teamId }: { teamId: string }) => {
  const [page, setPage] = useState(1);
  const { data, isLoading, mutate } = useSWR(
    `/api/contact-proposals?teamId=${teamId}&page=${page}&pageSize=${PAGE_SIZE}`,
    fetcher,
    { keepPreviousData: true },
  );
  const rows = data?.data ?? [];
  const total = data?.total ?? 0;
  const pages = Math.max(Math.ceil(total / PAGE_SIZE), 1);

  return (
    <RecordsPage>
      <RecordsHeader
        icon={GitPullRequestArrow}
        title="Pending changes"
        count={isLoading ? undefined : total}
      />
      <div className="mx-auto w-full max-w-4xl px-4 py-4">
        <p className="mb-4 text-sm text-muted-foreground">
          Website forms and event registrations never overwrite what a contact
          already has; a different value waits here until someone applies or
          declines it. Changes from submissions still waiting for their e-mail
          confirmation appear once the address is confirmed.
        </p>
        {!isLoading && rows.length === 0 ? (
          <EmptyState
            icon={GitPullRequestArrow}
            title="Nothing to review"
            description="All proposed changes are decided."
          />
        ) : (
          <ProposalList
            teamId={teamId}
            rows={rows}
            showContact
            onDecided={() => void mutate()}
          />
        )}
        {pages > 1 ? (
          <div className="mt-4 flex items-center justify-between text-sm">
            <Button
              variant="outline"
              size="sm"
              disabled={page <= 1}
              onClick={() => setPage(page - 1)}
            >
              Previous
            </Button>
            <span className="text-muted-foreground">
              Page {page} of {pages}
            </span>
            <Button
              variant="outline"
              size="sm"
              disabled={page >= pages}
              onClick={() => setPage(page + 1)}
            >
              Next
            </Button>
          </div>
        ) : null}
      </div>
    </RecordsPage>
  );
};
