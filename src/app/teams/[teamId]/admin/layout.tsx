import { redirect } from "next/navigation";
import type { PropsWithChildren } from "react";
import { auth } from "@/auth";
import { hasModuleAccess } from "@/lib/permissions";

export default async function AdminLayout({
  children,
  params,
}: PropsWithChildren<{ params: Promise<{ teamId: string }> }>) {
  const { teamId } = await params;
  const session = await auth();

  if (!session) {
    redirect("/");
  }

  const canAccessAdmin = await hasModuleAccess(
    {
      teamId,
      userId: session.user?.userId,
      roles: session.user?.roles,
    },
    "ADMIN",
  );

  if (!canAccessAdmin) {
    return redirect(`/teams/${teamId}`);
  }

  return <>{children}</>;
}
