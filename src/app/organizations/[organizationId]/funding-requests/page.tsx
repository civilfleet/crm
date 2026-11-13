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
    organizationId: string;
  }>;
}
export default async function Page({ params }: PageProps) {
  const organizationId = (await params).organizationId;

  return (
    <RecordsPage>
      <RecordsHeader
        icon={HandCoins}
        title="Funding Requests"
        action={
          <Button asChild size="sm">
            <Link
              href={`/organizations/${organizationId}/funding-requests/create`}
            >
              New funding request
            </Link>
          </Button>
        }
      />
      <FundingRequestTable organizationId={organizationId} teamId="" />
    </RecordsPage>
  );
}
