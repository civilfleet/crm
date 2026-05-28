import { z } from "zod";

const preprocessEmptyString = (value: unknown) =>
  typeof value === "string" && value.trim() === "" ? undefined : value;

const optionalText = (schema: z.ZodString) =>
  z.preprocess(preprocessEmptyString, schema.optional());

const orgTypeFieldSchema = z.object({
  key: z.string().min(1, "Field key is required"),
  label: z.string().min(1, "Field label is required"),
  type: z.enum([
    "STRING",
    "NUMBER",
    "DATE",
    "BOOLEAN",
    "SELECT",
    "MULTISELECT",
  ]),
  required: z.boolean().optional(),
  options: z
    .array(z.object({ label: z.string(), value: z.string() }))
    .optional(),
});

const schemaValue = z.union([z.array(orgTypeFieldSchema), z.string()]);

export const createOrganizationTypeSchema = z.object({
  teamId: z.uuid("Team id must be a valid UUID"),
  name: z
    .string()
    .min(1, "Type name is required")
    .max(255, "Type name is too long"),
  color: optionalText(z.string().max(50, "Color value is too long")),
  schema: schemaValue.optional(),
});

export type CreateOrganizationTypeInput = z.infer<
  typeof createOrganizationTypeSchema
>;

export const updateOrganizationTypeSchema = z.object({
  id: z.uuid("Organization type id must be a valid UUID"),
  teamId: z.uuid("Team id must be a valid UUID"),
  name: z
    .string()
    .min(1, "Type name is required")
    .max(255, "Type name is too long"),
  color: optionalText(z.string().max(50, "Color value is too long")),
  schema: schemaValue.optional(),
});

export type UpdateOrganizationTypeInput = z.infer<
  typeof updateOrganizationTypeSchema
>;

export const deleteOrganizationTypesSchema = z.object({
  teamId: z.uuid("Team id must be a valid UUID"),
  ids: z
    .array(z.uuid("Organization type id must be a valid UUID"))
    .min(1, "Select at least one type"),
});

export type DeleteOrganizationTypesInput = z.infer<
  typeof deleteOrganizationTypesSchema
>;