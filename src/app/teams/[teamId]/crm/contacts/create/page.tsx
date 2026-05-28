import ContactForm from "@/components/forms/contact";

interface CreateContactPageProps {
  params: Promise<{ teamId: string }>;
}

export default async function CreateContactPage({
  params,
}: CreateContactPageProps) {
  const { teamId } = await params;

  return (
    <div className="p-4">
      <div className="mx-auto w-full max-w-3xl">
        <ContactForm teamId={teamId} />
      </div>
    </div>
  );
}
