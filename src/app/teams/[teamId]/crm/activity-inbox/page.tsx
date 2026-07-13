import ActivityInbox from "@/components/activity-inbox";

export default async function ActivityInboxPage({
  params,
}: {
  params: Promise<{ teamId: string }>;
}) {
  const { teamId } = await params;
  return <ActivityInbox teamId={teamId} />;
}
