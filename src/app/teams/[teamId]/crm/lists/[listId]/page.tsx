import { List } from "lucide-react";
import { ContactListDetail } from "@/components/forms/contact-list-detail";
import { RecordTopBar } from "@/components/records/record-page";

export default async function ContactListDetailPage({
  params,
}: {
  params: Promise<{ teamId: string; listId: string }>;
}) {
  const { teamId, listId } = await params;

  return (
    <>
      <RecordTopBar
        list={{
          href: `/teams/${teamId}/crm/lists`,
          label: "Lists",
          icon: List,
        }}
        title="List"
      />
      <div className="mx-auto w-full max-w-5xl px-4 py-6 sm:px-6 sm:py-8">
        <ContactListDetail teamId={teamId} listId={listId} />
      </div>
    </>
  );
}
