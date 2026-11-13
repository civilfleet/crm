import { ArrowLeftRight } from "lucide-react";
import Link from "next/link";
import {
  RecordsHeader,
  RecordsPage,
} from "@/components/records/records-layout";
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
    <RecordsPage>
      <RecordsHeader
        icon={ArrowLeftRight}
        title="Transactions"
        action={
          <Button asChild size="sm">
            <Link href={`/teams/${teamId}/funding/transactions/create`}>
              New transaction
            </Link>
          </Button>
        }
      />
      <TransactionTable teamId={teamId} organizationId={organizationId} />
    </RecordsPage>
  );
}
