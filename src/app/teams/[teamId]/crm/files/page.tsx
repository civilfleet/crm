import { cookies } from "next/headers";
import FileTable from "@/components/table/file-table";
import {
  parseTablePageSize,
  RECORDS_PAGE_SIZE,
  TABLE_PAGE_SIZE_COOKIE,
} from "@/lib/table-page-size";

interface FilesPageProps {
  params: Promise<{ teamId: string }>;
}

export default async function FilesPage({ params }: FilesPageProps) {
  const [{ teamId }, cookieStore] = await Promise.all([params, cookies()]);
  const initialPageSize = parseTablePageSize(
    cookieStore.get(TABLE_PAGE_SIZE_COOKIE)?.value,
    RECORDS_PAGE_SIZE,
  );

  return (
    <FileTable scope="crm" teamId={teamId} initialPageSize={initialPageSize} />
  );
}
