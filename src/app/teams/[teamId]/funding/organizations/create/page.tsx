import { HandHeart } from "lucide-react";
import TeamOrganizationCreate from "@/components/organizations/team-organization-create";
import { RecordTopBar } from "@/components/records/record-page";

export default async function FundingOrganizationCreatePage({
  params,
}: {
  params: Promise<{ teamId: string }>;
}) {
  const { teamId } = await params;
  return (
    <>
      <RecordTopBar
        list={{
          href: `/teams/${teamId}/funding/organizations`,
          label: "Organizations",
          icon: HandHeart,
        }}
        title="New organization"
      />
      <TeamOrganizationCreate teamId={teamId} />
    </>
  );
}
