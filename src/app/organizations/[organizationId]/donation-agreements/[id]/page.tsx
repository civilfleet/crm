import { redirect } from "next/navigation";
import { auth } from "@/auth";
import SignDonationAgreement from "@/components/forms/sign-donation-agreement";

export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const session = await auth();
  const donationAgreement = await fetch(
    `${process.env.NEXT_PUBLIC_BASE_URL}/api/donation-agreements/${id}`,
  );
  const { data: donationData } = await donationAgreement.json();
  if (!donationData) {
    redirect("/team/organization");
  }

  return (
    <div>
      <div className="container px-5 py-1">
        <SignDonationAgreement
          data={donationData}
          userId={session?.user?.userId ?? null}
          userRoles={session?.user?.roles ?? []}
        />
      </div>
    </div>
  );
}
