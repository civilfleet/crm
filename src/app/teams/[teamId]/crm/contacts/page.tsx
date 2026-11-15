import { cookies } from "next/headers";
import ContactTable from "@/components/table/contact-table";
import {
  parseTablePageSize,
  RECORDS_PAGE_SIZE,
  TABLE_PAGE_SIZE_COOKIE,
} from "@/lib/table-page-size";

interface ContactsPageProps {
  params: Promise<{ teamId: string }>;
}

export default async function ContactsPage({ params }: ContactsPageProps) {
  const [{ teamId }, cookieStore] = await Promise.all([params, cookies()]);
  const initialPageSize = parseTablePageSize(
    cookieStore.get(TABLE_PAGE_SIZE_COOKIE)?.value,
    RECORDS_PAGE_SIZE,
  );

  return <ContactTable teamId={teamId} initialPageSize={initialPageSize} />;
}
