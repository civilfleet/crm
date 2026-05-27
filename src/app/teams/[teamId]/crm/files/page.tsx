import FileTable from "@/components/table/file-table";

interface FilesPageProps {
  params: Promise<{ teamId: string }>;
}

export default async function FilesPage({ params }: FilesPageProps) {
  const { teamId } = await params;

  return (
    <div className="p-4 space-y-6">
      <div className="space-y-2">
        <h1 className="text-2xl font-semibold">Files</h1>
        <p className="text-sm text-muted-foreground">
          Browse files attached to contacts and related team records.
        </p>
      </div>

      <FileTable teamId={teamId} organizationId="" includeContactFiles />
    </div>
  );
}
