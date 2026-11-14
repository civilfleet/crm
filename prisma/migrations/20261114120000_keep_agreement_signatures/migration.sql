-- A signature is the record of who signed a donation agreement. Deleting a
-- signer used to delete their signatures with them; now it is refused.

-- DropForeignKey
ALTER TABLE "DonationAgreementSignature" DROP CONSTRAINT "DonationAgreementSignature_userId_fkey";

-- AddForeignKey
ALTER TABLE "DonationAgreementSignature" ADD CONSTRAINT "DonationAgreementSignature_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

