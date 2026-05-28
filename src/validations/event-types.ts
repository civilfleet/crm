import { z } from "zod";

const preprocessEmptyString = (value: unknown) =>
  typeof value === "string" && value.trim() === "" ? undefined : value;

const optionalText = (schema: z.ZodString) =>
  z.preprocess(preprocessEmptyString, schema.optional());

export const createEventTypeSchema = z.object({
  teamId: z.uuid("Team id must be a valid UUID"),
  name: z
    .string()
    .min(1, "Type name is required")
    .max(255, "Type name is too long"),
  color: optionalText(z.string().max(50, "Color value is too long")),
});

export type CreateEventTypeInput = z.infer<typeof createEventTypeSchema>;

export const updateEventTypeSchema = z.object({
  id: z.uuid("Event type id must be a valid UUID"),
  teamId: z.uuid("Team id must be a valid UUID"),
  name: z
    .string()
    .min(1, "Type name is required")
    .max(255, "Type name is too long"),
  color: optionalText(z.string().max(50, "Color value is too long")),
});

export type UpdateEventTypeInput = z.infer<typeof updateEventTypeSchema>;

export const deleteEventTypesSchema = z.object({
  teamId: z.uuid("Team id must be a valid UUID"),
  ids: z
    .array(z.uuid("Event type id must be a valid UUID"))
    .min(1, "Select at least one type"),
});

export type DeleteEventTypesInput = z.infer<typeof deleteEventTypesSchema>;
