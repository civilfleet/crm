import { Users } from "lucide-react";
import { cookies } from "next/headers";
import {
  RecordsHeader,
  RecordsPage,
} from "@/components/records/records-layout";
import ContactTable from "@/components/table/contact-table";
import {
  parseTablePageSize,
  TABLE_PAGE_SIZE_COOKIE,
} from "@/lib/table-page-size";

interface ContactsPageProps {
  params: Promise<{ teamId: string }>;
}

export default async function ContactsPage({ params }: ContactsPageProps) {
  const [{ teamId }, cookieStore] = await Promise.all([params, cookies()]);
  const initialPageSize = parseTablePageSize(
    cookieStore.get(TABLE_PAGE_SIZE_COOKIE)?.value,
  );

  return (
    <RecordsPage>
      <RecordsHeader icon={Users} title="Contacts" />
      <ContactTable teamId={teamId} initialPageSize={initialPageSize} />
    </RecordsPage>
  );
}
