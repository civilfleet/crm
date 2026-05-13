import { auth } from "@/auth";
import TeamOrganizationDetail from "@/components/organizations/team-organization-detail";
import { Roles } from "@/types";

export default async function FundingOrganizationDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const session = await auth();
  const isAdminOrTeam =
    session?.user?.roles?.includes(Roles.Admin) ||
    session?.user?.roles?.includes(Roles.Team);

  return (
    <TeamOrganizationDetail organizationId={id} isAdminOrTeam={isAdminOrTeam} />
  );
}