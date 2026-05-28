import { redirect } from "next/navigation";
import type { PropsWithChildren } from "react";
import { auth } from "@/auth";
import { hasModuleAccess } from "@/lib/permissions";

export default async function CrmLayout({
  children,
  params,
}: PropsWithChildren<{ params: Promise<{ teamId: string }> }>) {
  const { teamId } = await params;
  const session = await auth();

  if (!session) {
    redirect("/");
  }

  const canAccessCrm = await hasModuleAccess(
    {
      teamId,
      userId: session.user?.userId,
      roles: session.user?.roles,
    },
    "CRM",
  );

  if (!canAccessCrm) {
    return redirect(`/teams/${teamId}`);
  }

  return <>{children}</>;
}
