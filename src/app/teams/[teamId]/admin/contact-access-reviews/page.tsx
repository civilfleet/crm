import ContactAccessReviews from "@/components/admin/contact-access-reviews";

type PageProps = {
  params: Promise<{ teamId: string }>;
};

export default async function ContactAccessReviewsPage({ params }: PageProps) {
  const { teamId } = await params;

  return (
    <div className="p-4">
      <ContactAccessReviews teamId={teamId} />
    </div>
  );
}
