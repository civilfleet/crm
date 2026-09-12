import { notFound, redirect } from "next/navigation";
import { verifyDonationAgreementAccess } from "@/lib/api-guard";
import SignDonationAgreement from "@/components/forms/sign-donation-agreement";
import { getDonationAgreementById } from "@/services/donation-agreement";
import type { DonationAgreement } from "@/types";

export default async function Page({
  params,
}: {
  params: Promise<{ id: string; organizationId: string }>;
}) {
  const { id, organizationId } = await params;
  const access = await verifyDonationAgreementAccess(id, {
    requireModule: "FUNDING",
  });
  if (access.organizationId !== organizationId) notFound();
  const session = access.session;
  const donationAgreement = await getDonationAgreementById(id);
  if (!donationAgreement) {
    redirect("/organizations");
  }
  const donationData = JSON.parse(
    JSON.stringify(donationAgreement),
  ) as DonationAgreement;

  return (
    <div>
      <div className="container px-5 py-1">
        <SignDonationAgreement
          data={donationData}
          userId={session?.user?.userId ?? null}
        />
      </div>
    </div>
  );
}
