import { HandHeart } from "lucide-react";
import { auth } from "@/auth";
import TeamOrganizationDetail from "@/components/organizations/team-organization-detail";
import { RecordTopBar } from "@/components/records/record-page";
import { Roles } from "@/types";

export default async function FundingOrganizationDetailPage({
  params,
}: {
  params: Promise<{ id: string; teamId: string }>;
}) {
  const { id, teamId } = await params;
  const session = await auth();
  const isAdminOrTeam =
    session?.user?.roles?.includes(Roles.Admin) ||
    session?.user?.roles?.includes(Roles.Team);

  return (
    <>
      <RecordTopBar
        list={{
          href: `/teams/${teamId}/funding/organizations`,
          label: "Organizations",
          icon: HandHeart,
        }}
        title="Organization"
      />
      <TeamOrganizationDetail
        organizationId={id}
        isAdminOrTeam={isAdminOrTeam}
      />
    </>
  );
}
