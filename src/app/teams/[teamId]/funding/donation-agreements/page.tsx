import { FilePenLine } from "lucide-react";
import Link from "next/link";
import {
  RecordsHeader,
  RecordsPage,
} from "@/components/records/records-layout";
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
    <RecordsPage>
      <RecordsHeader
        icon={FilePenLine}
        title="Donation Agreements"
        action={
          <Button asChild size="sm">
            <Link href={`/teams/${teamId}/funding/donation-agreements/create`}>
              New donation agreement
            </Link>
          </Button>
        }
      />
      <DonationAgreementTable teamId={teamId} organizationId="" />
    </RecordsPage>
  );
}
