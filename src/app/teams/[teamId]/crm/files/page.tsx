import { Files } from "lucide-react";
import {
  RecordsHeader,
  RecordsPage,
} from "@/components/records/records-layout";
import FileTable from "@/components/table/file-table";

interface FilesPageProps {
  params: Promise<{ teamId: string }>;
}

export default async function FilesPage({ params }: FilesPageProps) {
  const { teamId } = await params;

  return (
    <RecordsPage>
      <RecordsHeader icon={Files} title="Files" />
      <FileTable teamId={teamId} organizationId="" includeContactFiles />
    </RecordsPage>
  );
}
