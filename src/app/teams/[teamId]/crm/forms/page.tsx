import { cookies } from "next/headers";
import FormsTable from "@/components/table/forms-table";
import {
  parseTablePageSize,
  RECORDS_PAGE_SIZE,
  TABLE_PAGE_SIZE_COOKIE,
} from "@/lib/table-page-size";

export default async function FormsPage({
  params,
}: {
  params: Promise<{ teamId: string }>;
}) {
  const [{ teamId }, cookieStore] = await Promise.all([params, cookies()]);
  const initialPageSize = parseTablePageSize(
    cookieStore.get(TABLE_PAGE_SIZE_COOKIE)?.value,
    RECORDS_PAGE_SIZE,
  );
  return <FormsTable teamId={teamId} initialPageSize={initialPageSize} />;
}
