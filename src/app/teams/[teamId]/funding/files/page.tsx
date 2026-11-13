import { FolderOpen } from "lucide-react";
import {
  RecordsHeader,
  RecordsPage,
} from "@/components/records/records-layout";
import FileTable from "@/components/table/file-table";

interface PageProps {
  params: Promise<{
    teamId: string;
  }>;
}
export default async function Page({ params }: PageProps) {
  const teamId = (await params).teamId;

  return (
    <RecordsPage>
      <RecordsHeader icon={FolderOpen} title="Files" />
      <FileTable teamId={teamId} organizationId="" />
    </RecordsPage>
  );
}
