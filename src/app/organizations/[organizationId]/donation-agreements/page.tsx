import DonationAgreementTable from "@/components/table/donation-agreement-table";

interface PageProps {
  params: Promise<{
    organizationId: string;
  }>;
}
export default async function Organization({ params }: PageProps) {
  const organizationId = (await params).organizationId;
  return (
    <div className="p-4 w-full">
      <div className="flex justify-between">
        <h1 className="text-2xl  my-2">Donations Agreements</h1>
      </div>

      <DonationAgreementTable teamId="" organizationId={organizationId} />
    </div>
  );
}
