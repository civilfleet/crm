import { z } from "zod";

const preprocessEmptyString = (value: unknown) =>
  typeof value === "string" && value.trim() === "" ? undefined : value;

const optionalText = (schema: z.ZodString) =>
  z.preprocess(preprocessEmptyString, schema.optional());

export const createEventRoleSchema = z.object({
  teamId: z.uuid("Team id must be a valid UUID"),
  name: z
    .string()
    .min(1, "Role name is required")
    .max(255, "Role name is too long"),
  color: optionalText(z.string().max(50, "Color value is too long")),
});

export type CreateEventRoleInput = z.infer<typeof createEventRoleSchema>;

export const updateEventRoleSchema = z.object({
  id: z.uuid("Event role id must be a valid UUID"),
  teamId: z.uuid("Team id must be a valid UUID"),
  name: z
    .string()
    .min(1, "Role name is required")
    .max(255, "Role name is too long"),
  color: optionalText(z.string().max(50, "Color value is too long")),
});

export type UpdateEventRoleInput = z.infer<typeof updateEventRoleSchema>;

export const deleteEventRolesSchema = z.object({
  teamId: z.uuid("Team id must be a valid UUID"),
  ids: z
    .array(z.uuid("Event role id must be a valid UUID"))
    .min(1, "Select at least one role"),
});

export type DeleteEventRolesInput = z.infer<typeof deleteEventRolesSchema>;
