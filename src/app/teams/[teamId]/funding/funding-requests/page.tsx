import { HandCoins } from "lucide-react";
import Link from "next/link";
import {
  RecordsHeader,
  RecordsPage,
} from "@/components/records/records-layout";
import FundingRequestTable from "@/components/table/funding-request-table";
import { Button } from "@/components/ui/button";

interface PageProps {
  params: Promise<{
    teamId: string;
  }>;
}
export default async function Page({ params }: PageProps) {
  const teamId = (await params).teamId;

  return (
    <RecordsPage>
      <RecordsHeader
        icon={HandCoins}
        title="Funding Requests"
        action={
          <Button asChild size="sm">
            <Link href={`/teams/${teamId}/funding/funding-requests/create`}>
              New funding request
            </Link>
          </Button>
        }
      />
      <FundingRequestTable teamId={teamId} organizationId="" />
    </RecordsPage>
  );
}
