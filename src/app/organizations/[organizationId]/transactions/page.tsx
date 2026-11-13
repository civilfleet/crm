import { ArrowLeftRight } from "lucide-react";
import {
  RecordsHeader,
  RecordsPage,
} from "@/components/records/records-layout";
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
    <RecordsPage>
      <RecordsHeader icon={ArrowLeftRight} title="Transactions" />
      <TransactionTable teamId={teamId} organizationId={organizationId} />
    </RecordsPage>
  );
}
