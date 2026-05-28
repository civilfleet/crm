import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { getEmailTemplates } from "@/services/email-templates";
import { getTeamOwner } from "@/services/teams";
import { getTeamAdminAccess } from "@/services/teams/access";
import type { EmailTemplate } from "@/types";
import TeamSettingsTabs from "./team-settings-tabs";

interface PageProps {
  params: Promise<{
    teamId: string;
  }>;
}

export default async function Page({ params }: PageProps) {
  const { teamId } = await params;
  const session = await auth();
  if (!session?.user?.userId) {
    return redirect("/login");
  }

  const access = await getTeamAdminAccess(
    session.user.userId,
    teamId,
    session.user.roles,
  );
  if (!access.allowed) {
    return redirect(`/teams/${teamId}`);
  }

  const templates = await getEmailTemplates(teamId);
  const owner = await getTeamOwner(teamId);

  return (
    <div className="container mx-auto py-8 px-4">
      <div className="mb-8">
        <h1 className="text-3xl font-bold">Team Settings</h1>
        <p className="text-muted-foreground mt-2">{`Manage your team's settings, email templates, and funding request forms`}</p>
      </div>

      <TeamSettingsTabs
        teamId={teamId}
        currentUserId={session.user.userId}
        owner={owner}
        templates={
          templates.filter(
            (template) => template.teamId !== null,
          ) as EmailTemplate[]
        }
      />
    </div>
  );
}
