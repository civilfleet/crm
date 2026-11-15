import { cookies } from "next/headers";
import TransactionTable from "@/components/table/transaction-table";
import {
  parseTablePageSize,
  RECORDS_PAGE_SIZE,
  TABLE_PAGE_SIZE_COOKIE,
} from "@/lib/table-page-size";

export default async function TransactionsPage({
  params,
}: {
  params: Promise<{ organizationId: string }>;
}) {
  const [{ organizationId }, cookieStore] = await Promise.all([
    params,
    cookies(),
  ]);
  const initialPageSize = parseTablePageSize(
    cookieStore.get(TABLE_PAGE_SIZE_COOKIE)?.value,
    RECORDS_PAGE_SIZE,
  );

  return (
    <TransactionTable
      scope={{ kind: "organization", organizationId }}
      initialPageSize={initialPageSize}
    />
  );
}
