import UserDetails from "@/components/user-details";

export default async function Page({
  params,
}: {
  params: Promise<{ organizationId: string; id: string }>;
}) {
  const { organizationId, id } = await params;

  return (
    <div className="p-4 w-full">
      <UserDetails userId={id} organizationId={organizationId} />
    </div>
  );
}
