import DonationAgreement from "@/components/forms/donation-agreement";

export default async function Page({
  params,
}: {
  params: Promise<{ organizationId: string }>;
}) {
  const { organizationId } = await params;
  const organization = await fetch(
    `${process.env.NEXT_PUBLIC_BASE_URL}/api/organizations/${organizationId}`,
  );

  const { data: organizationData } = await organization.json();
  const teamId = organizationData?.teamId;

  return (
    <div className="flex flex-col p-4">
      <DonationAgreement teamId={teamId} />
    </div>
  );
}