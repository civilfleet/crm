import { cookies } from "next/headers";
import TeamOrganizationsPage from "@/components/organizations/team-organizations-page";
import prisma from "@/lib/prisma";
import {
  parseTablePageSize,
  TABLE_PAGE_SIZE_COOKIE,
} from "@/lib/table-page-size";
import { DEFAULT_TEAM_MODULES } from "@/types";

export default async function CrmOrganizationsPage({
  params,
}: {
  params: Promise<{ teamId: string }>;
}) {
  const [{ teamId }, cookieStore] = await Promise.all([params, cookies()]);
  const initialPageSize = parseTablePageSize(
    cookieStore.get(TABLE_PAGE_SIZE_COOKIE)?.value,
  );
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
      scope="crm"
      showRegistrationLink={showRegistrationLink}
      initialPageSize={initialPageSize}
    />
  );
}
