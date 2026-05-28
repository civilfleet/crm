import { z } from "zod";

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

export const organizationFiltersSchema = z
  .array(organizationFieldFilterSchema)
  .default([]);

export type OrganizationFieldFilter = z.infer<
  typeof organizationFieldFilterSchema
>;
