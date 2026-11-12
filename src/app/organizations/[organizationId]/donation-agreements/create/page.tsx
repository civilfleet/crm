import { FilePenLine } from "lucide-react";
import { redirect } from "next/navigation";
import DonationAgreement from "@/components/forms/donation-agreement";
import { RecordTopBar } from "@/components/records/record-page";
import { getOrganizationById } from "@/services/organizations";

export default async function Page({
  params,
}: {
  params: Promise<{ organizationId: string }>;
}) {
  const { organizationId } = await params;
  const organizationData = await getOrganizationById(organizationId);
  const teamId = organizationData?.teamId;
  if (!teamId) redirect("/organizations");

  return (
    <>
      <RecordTopBar
        list={{
          href: `/organizations/${organizationId}/donation-agreements`,
          label: "Donation Agreements",
          icon: FilePenLine,
        }}
        title="New donation agreement"
      />
      <div className="flex flex-col p-4">
        <DonationAgreement teamId={teamId} />
      </div>
    </>
  );
}
