import Link from "next/link";
import TransactionTable from "@/components/table/transaction-table";
import { Button } from "@/components/ui/button";

interface PageProps {
  params: Promise<{
    teamId: string;
    organizationId: string;
  }>;
}

export default async function Page({ params }: PageProps) {
  const { teamId, organizationId } = await params;

  return (
    <div className="p-4">
      <div className="flex justify-between">
        <h1 className="text-2xl  my-2">Transactions</h1>
        <Button asChild>
          <Link href={`/teams/${teamId}/funding/transactions/create`}>
            Create Transaction
          </Link>
        </Button>
      </div>
      <TransactionTable teamId={teamId} organizationId={organizationId} />
    </div>
  );
}
