import { z } from "zod";
import {
  DEFAULT_INTERNAL_COPY_MODE,
  INTERNAL_COPY_MODES,
} from "@/constants/email";

const emailAddressSchema = z
  .string()
  .trim()
  .toLowerCase()
  .email("Internal copy recipient must be a valid email address");

export const sendMassEmailSchema = z
  .object({
    contactIds: z
      .array(z.uuid("Contact ID must be a valid UUID"))
      .max(100, "You can send to at most 100 contacts at once")
      .optional()
      .default([]),
    eventIds: z
      .array(z.uuid("Event ID must be a valid UUID"))
      .max(100, "You can send to registrants of at most 100 events at once")
      .optional()
      .default([]),
    subject: z.string().trim().min(1, "Subject is required").max(500),
    html: z.string().trim().min(1, "Email body is required"),
    bccEmails: z.array(emailAddressSchema).max(20).optional().default([]),
    internalCopyMode: z
      .enum(INTERNAL_COPY_MODES)
      .optional()
      .default(DEFAULT_INTERNAL_COPY_MODE),
    senderLabelMode: z.enum(["default", "user"]).default("default"),
  })
  .refine((value) => value.contactIds.length > 0 || value.eventIds.length > 0, {
    message: "Select at least one contact or event",
    path: ["contactIds"],
  });
