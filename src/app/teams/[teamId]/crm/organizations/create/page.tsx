import { Building2 } from "lucide-react";
import TeamOrganizationCreate from "@/components/organizations/team-organization-create";
import { RecordTopBar } from "@/components/records/record-page";

export default async function CrmOrganizationCreatePage({
  params,
}: {
  params: Promise<{ teamId: string }>;
}) {
  const { teamId } = await params;
  return (
    <>
      <RecordTopBar
        list={{
          href: `/teams/${teamId}/crm/organizations`,
          label: "Organizations",
          icon: Building2,
        }}
        title="New organization"
      />
      <TeamOrganizationCreate teamId={teamId} />
    </>
  );
}
