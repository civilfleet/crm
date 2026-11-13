import { FolderOpen } from "lucide-react";
import {
  RecordsHeader,
  RecordsPage,
} from "@/components/records/records-layout";
import FileTable from "@/components/table/file-table";

interface PageProps {
  params: Promise<{
    organizationId: string;
  }>;
}
export default async function Page({ params }: PageProps) {
  const organizationId = (await params).organizationId;
  return (
    <RecordsPage>
      <RecordsHeader icon={FolderOpen} title="Files" />
      <FileTable organizationId={organizationId} teamId="" />
    </RecordsPage>
  );
}
