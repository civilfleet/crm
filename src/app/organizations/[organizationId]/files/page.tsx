import FileTable from "@/components/table/file-table";

interface PageProps {
  params: Promise<{
    organizationId: string;
  }>;
}
export default async function Page({ params }: PageProps) {
  const organizationId = (await params).organizationId;
  return (
    <div className="p-4 w-full">
      <div className="flex justify-between">
        <h1 className="text-2xl  my-2">Files</h1>
      </div>
      <FileTable organizationId={organizationId} teamId="" />
    </div>
  );
}
