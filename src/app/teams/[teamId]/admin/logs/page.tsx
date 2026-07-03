import SystemLogsView from "@/components/admin/system-logs-view";

type PageProps = {
  params: Promise<{ teamId: string }>;
};

export default async function LogsPage({ params }: PageProps) {
  const { teamId } = await params;

  return <SystemLogsView teamId={teamId} />;
}
