import Link from "next/link";
import CreateTransaction from "@/components/forms/modal/create-transaction";
import { Button } from "@/components/ui/button";

interface PageProps {
  params: Promise<{ teamId: string }>;
  searchParams: Promise<{ fundingRequestId?: string }>;
}

export default async function Page({ params, searchParams }: PageProps) {
  const { teamId } = await params;
  const { fundingRequestId } = await searchParams;

  return (
    <div className="p-4">
      <div className="mb-4 flex items-center justify-between">
        <h1 className="my-2 text-2xl">Create Transaction</h1>
        <Button asChild variant="outline">
          <Link href={`/teams/${teamId}/funding/transactions`}>Back</Link>
        </Button>
      </div>
      <CreateTransaction
        fundingRequestId={fundingRequestId}
        teamId={teamId}
        inline
        cancelHref={`/teams/${teamId}/funding/transactions`}
      />
    </div>
  );
}
