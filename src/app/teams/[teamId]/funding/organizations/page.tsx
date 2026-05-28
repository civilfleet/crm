import TeamOrganizationsPage from "@/components/organizations/team-organizations-page";
import prisma from "@/lib/prisma";
import { DEFAULT_TEAM_MODULES } from "@/types";

export default async function FundingOrganizationsPage({
  params,
}: {
  params: Promise<{ teamId: string }>;
}) {
  const { teamId } = await params;
  const team = await prisma.teams.findUnique({
    where: { id: teamId },
    select: { modules: true },
  });
  const teamModules =
    team?.modules && team.modules.length > 0
      ? team.modules
      : [...DEFAULT_TEAM_MODULES];
  const showRegistrationLink = teamModules.includes("FUNDING");

  return (
    <TeamOrganizationsPage
      teamId={teamId}
      scope="funding"
      showRegistrationLink={showRegistrationLink}
    />
  );
}
