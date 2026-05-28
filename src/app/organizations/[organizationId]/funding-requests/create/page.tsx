import { auth } from "@/auth";
import HybridFundingRequestForm from "@/components/forms/hybrid-funding-request-form";
import prisma from "@/lib/prisma";

export default async function Page({
  params,
}: {
  params: Promise<{ organizationId: string }>;
}) {
  const id = (await params).organizationId as string;
  const session = await auth();

  // Get the organization's team to load the correct form configuration
  const organization = await prisma.organization.findUnique({
    where: { id },
    select: { teamId: true },
  });

  return (
    <div className="flex flex-col w-2/3 p-4">
      <div className="mb-6">
        <h1 className="text-3xl font-bold tracking-tight">
          Create Funding Request
        </h1>
        <p className="text-muted-foreground mt-2">
          Complete the form below to submit your funding request. All required
          fields marked with * must be filled out.
        </p>
      </div>

      <HybridFundingRequestForm
        organizationId={id}
        teamId={organization?.teamId || undefined}
        userEmail={session?.user?.email ?? null}
      />
    </div>
  );
}