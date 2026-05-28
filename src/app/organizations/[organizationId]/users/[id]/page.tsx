import UserDetails from "@/components/user-details";

export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const id = (await params).id;

  return (
    <div className="p-4 w-full">
      <UserDetails userId={id} />
    </div>
  );
}
