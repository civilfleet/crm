import { ContactListDetail } from "@/components/forms/contact-list-detail";

export default async function NewContactListPage({
  params,
}: {
  params: Promise<{ teamId: string }>;
}) {
  const { teamId } = await params;

  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-6 sm:px-6 sm:py-8">
      <ContactListDetail teamId={teamId} listId="new" />
    </div>
  );
}
