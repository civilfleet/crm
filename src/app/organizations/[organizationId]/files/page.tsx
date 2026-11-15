import { cookies } from "next/headers";
import FileTable from "@/components/table/file-table";
import {
  parseTablePageSize,
  RECORDS_PAGE_SIZE,
  TABLE_PAGE_SIZE_COOKIE,
} from "@/lib/table-page-size";

interface PageProps {
  params: Promise<{
    organizationId: string;
  }>;
}

export default async function Page({ params }: PageProps) {
  const [{ organizationId }, cookieStore] = await Promise.all([
    params,
    cookies(),
  ]);
  const initialPageSize = parseTablePageSize(
    cookieStore.get(TABLE_PAGE_SIZE_COOKIE)?.value,
    RECORDS_PAGE_SIZE,
  );

  return (
    <FileTable
      scope="org"
      organizationId={organizationId}
      initialPageSize={initialPageSize}
    />
  );
}
