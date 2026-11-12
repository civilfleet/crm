import { BookUser } from "lucide-react";
import { redirect } from "next/navigation";
import UserForm from "@/components/forms/user";
import { RecordTopBar } from "@/components/records/record-page";
import { verifyOrganizationAccess } from "@/lib/api-guard";

export default async function Page({
  params,
}: {
  params: Promise<{ organizationId: string }>;
}) {
  const organizationId = (await params).organizationId;

  try {
    await verifyOrganizationAccess(organizationId, { requireTeamAdmin: true });
  } catch {
    redirect(`/organizations/${organizationId}/users`);
  }

  return (
    <>
      <RecordTopBar
        list={{
          href: `/organizations/${organizationId}/users`,
          label: "Users",
          icon: BookUser,
        }}
        title="New user"
      />
      <div className="flex flex-col w-2/3 p-4">
        <UserForm teamId={""} organizationId={organizationId} />
      </div>
    </>
  );
}
