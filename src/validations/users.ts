import { z } from "zod";

const optionalProfileField = z.string().trim().max(255).optional();

export const updateTeamUserSchema = z
  .object({
    teamId: z.uuid(),
    name: z
      .string()
      .trim()
      .min(2, "Name must be at least 2 characters")
      .max(255)
      .optional(),
    phone: optionalProfileField,
    address: optionalProfileField,
    postalCode: optionalProfileField,
    city: optionalProfileField,
    country: optionalProfileField,
    groupIds: z.array(z.uuid()),
  })
  .strict();

export type UpdateTeamUserInput = z.infer<typeof updateTeamUserSchema>;
