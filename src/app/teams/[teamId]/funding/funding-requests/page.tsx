import Link from "next/link";
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
    <div className="p-4 w-full ">
      <div className="flex justify-between">
        <h1 className="text-2xl  my-2">Funding Requests</h1>
        <Link href={`/teams/${teamId}/funding/funding-requests/create`}>
          <Button type="button">Create New</Button>
        </Link>
      </div>

      <FundingRequestTable teamId={teamId} organizationId="" />
    </div>
  );
}
