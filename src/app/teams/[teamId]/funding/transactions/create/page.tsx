import { ArrowLeftRight } from "lucide-react";
import CreateTransaction from "@/components/forms/modal/create-transaction";
import { RecordTopBar } from "@/components/records/record-page";

interface PageProps {
  params: Promise<{ teamId: string }>;
  searchParams: Promise<{ fundingRequestId?: string }>;
}

export default async function Page({ params, searchParams }: PageProps) {
  const { teamId } = await params;
  const { fundingRequestId } = await searchParams;

  return (
    <>
      <RecordTopBar
        list={{
          href: `/teams/${teamId}/funding/transactions`,
          label: "Transactions",
          icon: ArrowLeftRight,
        }}
        title="New transaction"
      />
      <div className="p-4">
        <div className="mb-4 flex items-center justify-between">
          <h1 className="my-2 text-2xl">Create Transaction</h1>
        </div>
        <CreateTransaction
          fundingRequestId={fundingRequestId}
          teamId={teamId}
          inline
          cancelHref={`/teams/${teamId}/funding/transactions`}
        />
      </div>
    </>
  );
}
