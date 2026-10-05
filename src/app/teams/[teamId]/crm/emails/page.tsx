import EmailHistoryView from "@/components/emails/email-history-view";
import { verifyTeamAccess } from "@/lib/api-guard";
import { getEmailHistoryBatches } from "@/services/emails";
import type { Roles } from "@/types";

interface EmailsPageProps {
  params: Promise<{ teamId: string }>;
}

export default async function EmailsPage({ params }: EmailsPageProps) {
  const { teamId } = await params;
  const session = await verifyTeamAccess(teamId, { requireModule: "CRM" });
  const userId = session.user.userId;
  if (!userId) {
    throw new Error("Authenticated user is required.");
  }
  const batches = await getEmailHistoryBatches(teamId, {
    userId,
    roles: (session.user.roles ?? []) as Roles[],
  });

  return (
    <div className="p-4 space-y-6">
      <div className="space-y-2">
        <h1 className="text-2xl font-semibold">Emails</h1>
        <p className="text-sm text-muted-foreground">
          Review CRM-sent email batches, recipients, and delivery outcomes.
        </p>
      </div>

      <EmailHistoryView teamId={teamId} batches={batches} />
    </div>
  );
}
