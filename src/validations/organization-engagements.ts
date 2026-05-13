import { z } from "zod";

export const createOrganizationEngagementSchema = z.object({
  organizationId: z.string().uuid("Organization id must be a valid UUID"),
  teamId: z.string().uuid("Team id must be a valid UUID"),
  type: z.string().min(1, "Engagement type is required"),
  note: z.string().optional(),
  engagedAt: z
    .string()
    .min(1, "Engagement date is required")
    .refine((value) => !Number.isNaN(Date.parse(value)), {
      message: "Invalid engagement date",
    }),
});

export type CreateOrganizationEngagementInput = z.infer<
  typeof createOrganizationEngagementSchema
>;