import { auth } from "@/auth";
import HybridFundingRequestForm from "@/components/forms/hybrid-funding-request-form";

export default async function Page({
  params,
}: {
  params: Promise<{ teamId: string }>;
}) {
  const { teamId } = await params;
  const session = await auth();

  return (
    <div className="flex flex-col w-2/3 p-4">
      <div className="mb-6">
        <h1 className="text-3xl font-bold tracking-tight">
          Create Funding Request
        </h1>
        <p className="text-muted-foreground mt-2">
          Create a funding request on behalf of an organization.
        </p>
      </div>

      <HybridFundingRequestForm
        teamId={teamId}
        userEmail={session?.user?.email ?? null}
        returnToTeamView
      />
    </div>
  );
}
