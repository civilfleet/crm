import { notFound } from "next/navigation";
import { auth } from "@/auth";
import ContactForm from "@/components/forms/contact";
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
  const contact = await getContactById(id, teamId, userId);

  if (!contact) {
    notFound();
  }

  return (
    <div className="p-4">
      <div className="mx-auto w-full max-w-3xl">
        <ContactForm teamId={teamId} contact={contact} />
      </div>
    </div>
  );
}
