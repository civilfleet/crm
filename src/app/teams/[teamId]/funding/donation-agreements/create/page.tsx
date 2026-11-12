import { FilePenLine } from "lucide-react";
import DonationAgreement from "@/components/forms/donation-agreement";
import { RecordTopBar } from "@/components/records/record-page";

export default async function Page({
  params,
}: {
  params: Promise<{ teamId: string }>;
}) {
  const { teamId } = await params;

  return (
    <>
      <RecordTopBar
        list={{
          href: `/teams/${teamId}/funding/donation-agreements`,
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
