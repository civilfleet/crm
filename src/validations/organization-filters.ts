import { z } from "zod";
import { isLanguageCode } from "@/lib/languages";

export const organizationFieldFilterSchema = z.object({
  type: z.literal("field"),
  key: z.string().min(1, "Field key is required"),
  operator: z.enum([
    "contains",
    "equals",
    "gt",
    "lt",
    "before",
    "after",
    "isTrue",
    "isFalse",
  ]),
  value: z.string().optional(),
});

/** Works in this language (ISO 639-1). */
export const organizationLanguageFilterSchema = z.object({
  type: z.literal("language"),
  language: z.string().trim().toLowerCase().refine(isLanguageCode, {
    message: "Unknown language",
  }),
});

export const organizationFilterSchema = z.discriminatedUnion("type", [
  organizationFieldFilterSchema,
  organizationLanguageFilterSchema,
]);

export const organizationFiltersSchema = z
  .array(organizationFilterSchema)
  .default([]);

export type OrganizationFieldFilter = z.infer<
  typeof organizationFieldFilterSchema
>;

export type OrganizationFilter = z.infer<typeof organizationFilterSchema>;
