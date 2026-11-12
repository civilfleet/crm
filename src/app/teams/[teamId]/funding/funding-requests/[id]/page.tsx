import { HandCoins } from "lucide-react";
import { auth } from "@/auth";
import FundingRequestData from "@/components/data-components/funding-request";
import { RecordTopBar } from "@/components/records/record-page";
import { Roles } from "@/types";

export default async function FundingRequest({
  params,
}: {
  params: Promise<{ id: string; teamId: string }>;
}) {
  const { id, teamId } = await params;
  const session = await auth();
  const isTeam =
    session?.user?.roles?.includes(Roles.Admin) ||
    session?.user?.roles?.includes(Roles.Team);

  return (
    <>
      <RecordTopBar
        list={{
          href: `/teams/${teamId}/funding/funding-requests`,
          label: "Funding Requests",
          icon: HandCoins,
        }}
        title="Funding request"
      />
      <div>
        <div className="container p-8">
          <FundingRequestData fundingRequestId={id} isTeam={isTeam} />
        </div>
      </div>
    </>
  );
}
