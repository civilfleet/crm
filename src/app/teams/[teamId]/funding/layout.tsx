import { redirect } from "next/navigation";
import type { PropsWithChildren } from "react";
import { auth } from "@/auth";
import { hasModuleAccess } from "@/lib/permissions";

export default async function FundingLayout({
  children,
  params,
}: PropsWithChildren<{ params: Promise<{ teamId: string }> }>) {
  const { teamId } = await params;
  const session = await auth();

  if (!session) {
    redirect("/");
  }

  const canAccessFunding = await hasModuleAccess(
    {
      teamId,
      userId: session.user?.userId,
      roles: session.user?.roles,
    },
    "FUNDING",
  );

  if (!canAccessFunding) {
    return redirect(`/teams/${teamId}`);
  }

  return <>{children}</>;
}
