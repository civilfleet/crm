import Link from "next/link";
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
    <div className="p-4 w-full ">
      <div className="flex justify-between">
        <h1 className="text-2xl  my-2">Funding Request</h1>
        <Link href="funding-requests/create">
          <Button type="button">Create New</Button>
        </Link>
      </div>
      <FundingRequestTable organizationId={organizationId} teamId="" />
    </div>
  );
}
