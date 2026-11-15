import { cookies } from "next/headers";
import DonationAgreementTable from "@/components/table/donation-agreement-table";
import {
  parseTablePageSize,
  RECORDS_PAGE_SIZE,
  TABLE_PAGE_SIZE_COOKIE,
} from "@/lib/table-page-size";

export default async function OrganizationDonationAgreementsPage({
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
    <DonationAgreementTable
      scope={{ kind: "organization", organizationId }}
      initialPageSize={initialPageSize}
    />
  );
}
