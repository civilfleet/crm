import { redirect } from "next/navigation";
import type { PropsWithChildren } from "react";
import { verifyOrganizationAccess } from "@/lib/api-guard";

export default async function OrganizationLayout({
  children,
  params,
}: PropsWithChildren<{ params: Promise<{ organizationId: string }> }>) {
  const { organizationId } = await params;

  try {
    await verifyOrganizationAccess(organizationId);
  } catch {
    redirect("/");
  }

  return <>{children}</>;
}
