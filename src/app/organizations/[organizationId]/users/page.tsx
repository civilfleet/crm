import Link from "next/link";
import UserTable from "@/components/table/user-table";
import { Button } from "@/components/ui/button";

interface PageProps {
  params: Promise<{
    organizationId: string;
  }>;
}

export default async function Organization({ params }: PageProps) {
  const { organizationId } = await params;

  return (
    <div className="p-4 w-full">
      <div className="flex justify-between">
        <h1 className="text-2xl  my-2">Users</h1>
        <Link href="users/create">
          <Button type="button">Create New</Button>
        </Link>
      </div>
      <UserTable teamId="" organizationId={organizationId} />
    </div>
  );
}
