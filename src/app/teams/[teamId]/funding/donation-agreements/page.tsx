import { cookies } from "next/headers";
import DonationAgreementTable from "@/components/table/donation-agreement-table";
import {
  parseTablePageSize,
  RECORDS_PAGE_SIZE,
  TABLE_PAGE_SIZE_COOKIE,
} from "@/lib/table-page-size";

export default async function DonationAgreementsPage({
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
    <DonationAgreementTable
      scope={{ kind: "team", teamId }}
      initialPageSize={initialPageSize}
      canCreate
    />
  );
}
