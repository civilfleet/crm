import ContactListsManager from "@/components/forms/contact-lists-manager";

export default async function ContactListsPage({
  params,
}: {
  params: Promise<{ teamId: string }>;
}) {
  const { teamId } = await params;

  return (
    <div className="p-4">
      <ContactListsManager teamId={teamId} />
    </div>
  );
}
