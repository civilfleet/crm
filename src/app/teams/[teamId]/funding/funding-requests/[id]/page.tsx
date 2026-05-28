import { auth } from "@/auth";
import FundingRequestData from "@/components/data-components/funding-request";
import { Roles } from "@/types";

export default async function FundingRequest({
  params,
}: {
  params: Promise<{ id: string; teamId: string }>;
}) {
  const { id } = await params;
  const session = await auth();
  const isTeam =
    session?.user?.roles?.includes(Roles.Admin) ||
    session?.user?.roles?.includes(Roles.Team);

  return (
    <div>
      <div className="container p-8">
        <FundingRequestData fundingRequestId={id} isTeam={isTeam} />
      </div>
    </div>
  );
}
