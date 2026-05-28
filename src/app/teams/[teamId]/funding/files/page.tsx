import FileTable from "@/components/table/file-table";

interface PageProps {
  params: Promise<{
    teamId: string;
  }>;
}
export default async function Page({ params }: PageProps) {
  const teamId = (await params).teamId;

  return (
    <div className="p-4 w-full">
      <div className="flex justify-between">
        <h1 className="text-2xl  my-2">Files</h1>
      </div>
      <FileTable teamId={teamId} organizationId="" />
    </div>
  );
}
