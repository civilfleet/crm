import ContactTable from "@/components/table/contact-table";

interface ContactsPageProps {
  params: Promise<{ teamId: string }>;
}

export default async function ContactsPage({ params }: ContactsPageProps) {
  const { teamId } = await params;

  return (
    <div className="p-4 space-y-6">
      <div className="space-y-2">
        <h1 className="text-2xl font-semibold">Contacts</h1>
        <p className="text-sm text-muted-foreground">
          Manage the relationships and key stakeholders associated with your
          team.
        </p>
      </div>

      <ContactTable teamId={teamId} />
    </div>
  );
}
