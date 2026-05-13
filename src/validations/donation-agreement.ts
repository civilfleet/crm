import { z } from "zod";

const createDonationAgreementSchema = z.object({
  fundingRequestId: z.uuid(),
  users: z.array(z.string()).optional(),
  user: z.string().optional(),
  file: z.string().min(1, "File is required"),
  agreement: z.string().min(1, "Agreement is required"),
});

const updateDonationAgreementSchema = z.object({
  file: z.string().optional(),
});

export { createDonationAgreementSchema, updateDonationAgreementSchema };