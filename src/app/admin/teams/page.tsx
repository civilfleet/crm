import { cookies } from "next/headers";
import TeamsTable from "@/components/table/teams-table";
import {
  parseTablePageSize,
  RECORDS_PAGE_SIZE,
  TABLE_PAGE_SIZE_COOKIE,
} from "@/lib/table-page-size";

export const dynamic = "force-dynamic";

export default async function AdminTeamsPage() {
  const cookieStore = await cookies();
  const initialPageSize = parseTablePageSize(
    cookieStore.get(TABLE_PAGE_SIZE_COOKIE)?.value,
    RECORDS_PAGE_SIZE,
  );

  return <TeamsTable initialPageSize={initialPageSize} />;
}
