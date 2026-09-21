import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { TagsExplorer } from "@/components/tags/tags-explorer";
import { hasModuleAccess } from "@/lib/permissions";

export default async function TeamTagsPage({
  params,
}: {
  params: Promise<{ teamId: string }>;
}) {
  const { teamId } = await params;
  const session = await auth();
  const allowed = await hasModuleAccess(
    {
      teamId,
      userId: session?.user?.userId,
      roles: session?.user?.roles,
    },
    "CRM",
  );
  if (!allowed) redirect(`/teams/${teamId}`);
  return <TagsExplorer teamId={teamId} />;
}
