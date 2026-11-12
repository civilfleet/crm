import { BookUser } from "lucide-react";
import { RecordTopBar } from "@/components/records/record-page";
import UserDetails from "@/components/user-details";

export default async function Page({
  params,
}: {
  params: Promise<{ organizationId: string; id: string }>;
}) {
  const { organizationId, id } = await params;

  return (
    <>
      <RecordTopBar
        list={{
          href: `/organizations/${organizationId}/users`,
          label: "Users",
          icon: BookUser,
        }}
        title="User"
      />
      <div className="p-4 w-full">
        <UserDetails userId={id} organizationId={organizationId} />
      </div>
    </>
  );
}
