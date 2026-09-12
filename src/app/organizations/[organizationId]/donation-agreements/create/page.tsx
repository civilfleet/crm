import { redirect } from "next/navigation";
import DonationAgreement from "@/components/forms/donation-agreement";
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
    <div className="flex flex-col p-4">
      <DonationAgreement teamId={teamId} />
    </div>
  );
}
