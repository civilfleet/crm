import { z } from "zod";
import { EMAIL_TEMPLATES_TYPES } from "@/constants";

const createEmailTemplateSchema = z.object({
  id: z.string().optional(),
  name: z.string().min(1, "Name is required"),
  type: z.enum(Object.values(EMAIL_TEMPLATES_TYPES) as [string, ...string[]]),
  subject: z.string().min(1, "Subject is required"),
  content: z.string().min(1, "Content is required"),
});

export { createEmailTemplateSchema };
