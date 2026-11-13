import { FilePenLine } from "lucide-react";
import {
  RecordsHeader,
  RecordsPage,
} from "@/components/records/records-layout";
import DonationAgreementTable from "@/components/table/donation-agreement-table";

interface PageProps {
  params: Promise<{
    organizationId: string;
  }>;
}
export default async function Organization({ params }: PageProps) {
  const organizationId = (await params).organizationId;
  return (
    <RecordsPage>
      <RecordsHeader icon={FilePenLine} title="Donation Agreements" />
      <DonationAgreementTable teamId="" organizationId={organizationId} />
    </RecordsPage>
  );
}
