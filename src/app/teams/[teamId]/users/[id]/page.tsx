import UserDetails from "@/components/user-details";

export default async function Page({
  params,
}: {
  params: Promise<{ teamId: string; id: string }>;
}) {
  const { id } = await params;

  return (
    <div className="p-4 w-full">
      <UserDetails userId={id} />
    </div>
  );
}
