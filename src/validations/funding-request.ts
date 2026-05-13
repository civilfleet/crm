import { z } from "zod";
import { FundingStatus } from "@/types";

// Schema for static/core fields that are always required
const staticFundingRequestSchema = z.object({
  name: z.string().min(3, "Name must be at least 3 characters."),
  description: z
    .string()
    .min(10, "Description must be at least 10 characters."),
  purpose: z.string().min(10, "Purpose must be at least 10 characters."),
  amountRequested: z.coerce
    .number()
    .positive("Amount must be a positive number."),
  refinancingConcept: z
    .string()
    .min(10, "Refinancing concept must be at least 10 characters."),
  sustainability: z
    .string()
    .min(10, "Sustainability details must be at least 10 characters."),
  expectedCompletionDate: z
    .string()
    .refine((date) => !Number.isNaN(Date.parse(date)), {
      message: "Invalid date format.",
    }),
});

// Schema for dynamic fields (anything can be added)
const dynamicFieldsSchema = z.record(z.string(), z.unknown());

// Combined schema for creating funding requests
const createFundingRequestSchema = staticFundingRequestSchema.merge(
  z.object({
    // System fields
    organizationId: z.uuid().optional(),
    submittedBy: z.string().email().optional().or(z.literal("")),
    // File uploads
    files: z
      .array(
        z.object({
          name: z.string(),
          url: z.string(),
        }),
      )
      .optional()
      .default([]),
    // Dynamic fields
    customFields: dynamicFieldsSchema.optional(),
  }),
);

// Legacy schema for backward compatibility - includes fields set by teams/system
const legacyCreateFundingRequestSchema = createFundingRequestSchema.merge(
  z.object({
    amountAgreed: z.coerce.number().optional(),
    remainingAmount: z.coerce.number().optional(),
    status: z
      .enum([
        FundingStatus.Submitted,
        FundingStatus.Accepted,
        FundingStatus.Approved,
        FundingStatus.Rejected,
      ])
      .optional(),
  }),
);

const updateFundingRequestSchema = legacyCreateFundingRequestSchema.partial();

export {
  createFundingRequestSchema,
  dynamicFieldsSchema,
  legacyCreateFundingRequestSchema,
  staticFundingRequestSchema,
  updateFundingRequestSchema,
};