import { cookies } from "next/headers";
import FundingRequestTable from "@/components/table/funding-request-table";
import {
  parseTablePageSize,
  RECORDS_PAGE_SIZE,
  TABLE_PAGE_SIZE_COOKIE,
} from "@/lib/table-page-size";

export default async function FundingRequestsPage({
  params,
}: {
  params: Promise<{ teamId: string }>;
}) {
  const [{ teamId }, cookieStore] = await Promise.all([params, cookies()]);
  const initialPageSize = parseTablePageSize(
    cookieStore.get(TABLE_PAGE_SIZE_COOKIE)?.value,
    RECORDS_PAGE_SIZE,
  );

  return (
    <FundingRequestTable
      scope={{ kind: "team", teamId }}
      initialPageSize={initialPageSize}
    />
  );
}
