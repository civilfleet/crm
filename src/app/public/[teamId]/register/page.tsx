import { notFound } from "next/navigation";
import PublicOrganizationRegistration from "@/components/forms/public-organization-registration";
import prisma from "@/lib/prisma";
import { DEFAULT_TEAM_MODULES } from "@/types";

export default async function RegisterPage({
  params,
}: {
  params: Promise<{ teamId: string }>;
}) {
  const { teamId } = await params;
  const team = await prisma.teams.findUnique({
    where: { id: teamId },
    select: { modules: true },
  });

  if (!team) {
    notFound();
  }

  const teamModules =
    team.modules && team.modules.length > 0
      ? team.modules
      : [...DEFAULT_TEAM_MODULES];

  if (!teamModules.includes("FUNDING")) {
    notFound();
  }

  return <PublicOrganizationRegistration teamId={teamId} />;
}
