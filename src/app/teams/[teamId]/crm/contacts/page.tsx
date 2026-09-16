import { cookies } from "next/headers";
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
    <div className="p-4 space-y-6">
      <div className="space-y-2">
        <h1 className="text-2xl font-semibold">Contacts</h1>
        <p className="text-sm text-muted-foreground">
          Manage the relationships and key stakeholders associated with your
          team.
        </p>
      </div>

      <ContactTable teamId={teamId} initialPageSize={initialPageSize} />
    </div>
  );
}
