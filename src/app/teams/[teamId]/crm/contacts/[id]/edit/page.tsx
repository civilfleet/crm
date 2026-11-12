import { Users } from "lucide-react";
import { notFound } from "next/navigation";
import { auth } from "@/auth";
import ContactForm from "@/components/forms/contact";
import { RecordTopBar } from "@/components/records/record-page";
import { getContactById } from "@/services/contacts";

interface EditContactPageProps {
  params: Promise<{
    teamId: string;
    id: string;
  }>;
}

export default async function EditContactPage({
  params,
}: EditContactPageProps) {
  const { teamId, id } = await params;
  const session = await auth();
  const userId = session?.user?.userId;
  const contact = await getContactById(
    id,
    teamId,
    userId,
    session?.user?.roles,
  );

  if (!contact) {
    notFound();
  }

  return (
    <>
      <RecordTopBar
        list={{
          href: `/teams/${teamId}/crm/contacts`,
          label: "Contacts",
          icon: Users,
        }}
        parent={{
          href: `/teams/${teamId}/crm/contacts/${id}`,
          label: contact.name,
        }}
        title="Edit"
      />
      <div className="p-4">
        <div className="mx-auto w-full max-w-3xl">
          <ContactForm teamId={teamId} contact={contact} />
        </div>
      </div>
    </>
  );
}
