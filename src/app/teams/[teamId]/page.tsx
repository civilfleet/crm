import { auth } from "@/auth";
import RecentActivity from "@/components/recent-activity";
import { hasModuleAccess } from "@/lib/permissions";
import prisma from "@/lib/prisma";

interface TeamPageProps {
  params: Promise<{
    teamId: string;
  }>;
}

export default async function TeamPage({ params }: TeamPageProps) {
  const { teamId } = await params;

  const session = await auth();
  const userId = session?.user?.userId;

  const team = await prisma.teams.findUnique({
    where: { id: teamId },
    select: { name: true },
  });

  let crmStats: { contacts: number; lists: number; events: number } | null =
    null;

  if (userId) {
    const canAccessCrm = await hasModuleAccess(
      {
        teamId,
        userId,
        roles: session?.user?.roles,
      },
      "CRM",
    );

    if (canAccessCrm) {
      const [contactsCount, listsCount, eventsCount] = await Promise.all([
        prisma.contact.count({
          where: { teamId },
        }),
        prisma.contactList.count({
          where: { teamId },
        }),
        prisma.event.count({
          where: { teamId },
        }),
      ]);

      crmStats = {
        contacts: contactsCount,
        lists: listsCount,
        events: eventsCount,
      };
    }
  }

  return (
    <div className="space-y-6 p-6">
      <div>
        <h1 className="text-3xl font-bold">{team?.name || "Team"} Dashboard</h1>
        <p className="mt-2 text-muted-foreground">
          Jump into your team tools from the sidebar or review the latest
          activity below.
        </p>
      </div>
      {crmStats && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div className="rounded-lg border bg-background p-4">
            <p className="text-sm text-muted-foreground">Contacts</p>
            <p className="mt-1 text-2xl font-semibold">
              {crmStats.contacts.toLocaleString()}
            </p>
          </div>
          <div className="rounded-lg border bg-background p-4">
            <p className="text-sm text-muted-foreground">Lists</p>
            <p className="mt-1 text-2xl font-semibold">
              {crmStats.lists.toLocaleString()}
            </p>
          </div>
          <div className="rounded-lg border bg-background p-4">
            <p className="text-sm text-muted-foreground">Events</p>
            <p className="mt-1 text-2xl font-semibold">
              {crmStats.events.toLocaleString()}
            </p>
          </div>
        </div>
      )}
      <div className="rounded-lg border bg-background p-4">
        <RecentActivity scope="team" scopeId={teamId} title="Team Activity" />
      </div>
    </div>
  );
}