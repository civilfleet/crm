import { auth } from "@/auth";
import OrganizationData from "@/components/data-components/organization";
import { Roles } from "@/types";

export default async function Page({
  params,
}: {
  params: Promise<{ organizationId: string }>;
}) {
  const id = (await params).organizationId as string;
  const session = await auth();
  const isAdminOrTeam =
    session?.user?.roles?.includes(Roles.Admin) ||
    session?.user?.roles?.includes(Roles.Team);

  return (
    <div>
      <div className="container">
        <OrganizationData organizationId={id} isAdminOrTeam={isAdminOrTeam} />
      </div>
    </div>
  );
}