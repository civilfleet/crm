import Link from "next/link";
import DonationAgreementTable from "@/components/table/donation-agreement-table";
import { Button } from "@/components/ui/button";

interface PageProps {
  params: Promise<{
    teamId: string;
  }>;
}

export default async function Organization({ params }: PageProps) {
  const teamId = (await params).teamId;

  return (
    <div className="p-4 w-full">
      <div className="flex justify-between">
        <h1 className="text-2xl  my-2">Donations Agreements</h1>
        <Link href={`/teams/${teamId}/funding/donation-agreements/create`}>
          <Button type="button">Create New</Button>
        </Link>
      </div>
      <DonationAgreementTable teamId={teamId} organizationId="" />
    </div>
  );
}
