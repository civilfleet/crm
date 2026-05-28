import DonationAgreement from "@/components/forms/donation-agreement";

export default async function Page({
  params,
}: {
  params: Promise<{ teamId: string }>;
}) {
  const { teamId } = await params;

  return (
    <div className="flex flex-col p-4">
      <DonationAgreement teamId={teamId} />
    </div>
  );
}
