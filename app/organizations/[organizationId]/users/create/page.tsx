import UserForm from "@/components/forms/user";

export default async function Page({
  params,
}: {
  params: Promise<{ organizationId: string }>;
}) {
  const organizationId = (await params).organizationId;

  return (
    <div className="flex flex-col w-2/3 p-4">
      <UserForm teamId={""} organizationId={organizationId} />
    </div>
  );
}