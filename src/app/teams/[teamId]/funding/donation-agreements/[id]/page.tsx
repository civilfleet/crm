import { redirect } from "next/navigation";
import { auth } from "@/auth";
import SignDonationAgreement from "@/components/forms/sign-donation-agreement";

export default async function Page({
  params,
}: {
  params: Promise<{ id: string; teamId: string }>;
}) {
  const { id, teamId } = await params;
  const session = await auth();

  const donationAgreement = await fetch(
    `${process.env.NEXT_PUBLIC_BASE_URL}/api/donation-agreements/${id}`,
  );
  const { data: donationData } = await donationAgreement.json();
  if (!donationData) {
    // TODO - redirect to the correct page
    redirect("/team/organizations");
  }

  return (
    <div>
      <div className="container px-5 py-1">
        <SignDonationAgreement
          data={donationData}
          teamId={teamId}
          userId={session?.user?.userId ?? null}
          userRoles={session?.user?.roles ?? []}
        />
      </div>
    </div>
  );
}
