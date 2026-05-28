import EmailHistoryView from "@/components/emails/email-history-view";
import { getEmailHistoryBatches } from "@/services/emails";

interface EmailsPageProps {
  params: Promise<{ teamId: string }>;
}

export default async function EmailsPage({ params }: EmailsPageProps) {
  const { teamId } = await params;
  const batches = await getEmailHistoryBatches(teamId);

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
