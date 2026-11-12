import { Users } from "lucide-react";
import ContactForm from "@/components/forms/contact";
import { RecordTopBar } from "@/components/records/record-page";

interface CreateContactPageProps {
  params: Promise<{ teamId: string }>;
}

export default async function CreateContactPage({
  params,
}: CreateContactPageProps) {
  const { teamId } = await params;

  return (
    <>
      <RecordTopBar
        list={{
          href: `/teams/${teamId}/crm/contacts`,
          label: "Contacts",
          icon: Users,
        }}
        title="New contact"
      />
      <div className="p-4">
        <div className="mx-auto w-full max-w-3xl">
          <ContactForm teamId={teamId} />
        </div>
      </div>
    </>
  );
}
