import { redirect } from "next/navigation";
import type { PropsWithChildren } from "react";
import { auth } from "@/auth";
import { hasModuleAccess } from "@/lib/permissions";
import type { AppModule } from "@/types";

export default async function TeamLayout({
  children,
  params,
}: PropsWithChildren<{ params: Promise<{ teamId: string }> }>) {
  const { teamId } = await params;

  const session = await auth();
  if (!session) {
    return redirect("/");
  }

  const [canAccessCrm, canAccessFunding, canAccessAdmin] = await Promise.all([
    hasModuleAccess(
      {
        teamId,
        userId: session.user?.userId,
        roles: session.user?.roles,
      },
      "CRM" satisfies AppModule,
    ),
    hasModuleAccess(
      {
        teamId,
        userId: session.user?.userId,
        roles: session.user?.roles,
      },
      "FUNDING" satisfies AppModule,
    ),
    hasModuleAccess(
      {
        teamId,
        userId: session.user?.userId,
        roles: session.user?.roles,
      },
      "ADMIN" satisfies AppModule,
    ),
  ]);

  if (!canAccessCrm && !canAccessFunding && !canAccessAdmin) {
    return redirect("/");
  }

  return <>{children}</>;
}
