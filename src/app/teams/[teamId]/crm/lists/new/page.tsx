import { List } from "lucide-react";
import { ContactListDetail } from "@/components/forms/contact-list-detail";
import { RecordTopBar } from "@/components/records/record-page";

export default async function NewContactListPage({
  params,
}: {
  params: Promise<{ teamId: string }>;
}) {
  const { teamId } = await params;

  return (
    <>
      <RecordTopBar
        list={{
          href: `/teams/${teamId}/crm/lists`,
          label: "Lists",
          icon: List,
        }}
        title="New list"
      />
      <div className="mx-auto w-full max-w-5xl px-4 py-6 sm:px-6 sm:py-8">
        <ContactListDetail teamId={teamId} listId="new" />
      </div>
    </>
  );
}
