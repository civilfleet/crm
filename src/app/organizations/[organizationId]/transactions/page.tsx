import TransactionTable from "@/components/table/transaction-table";

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
      </div>
      <TransactionTable teamId={teamId} organizationId={organizationId} />
    </div>
  );
}
