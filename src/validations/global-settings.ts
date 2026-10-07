import { z } from "zod";

const contactUrlSchema = z
  .string()
  .trim()
  .min(1, "Contact link is required")
  .max(2048, "Contact link must be 2048 characters or fewer")
  .superRefine((value, ctx) => {
    try {
      const url = new URL(value);
      if (url.protocol !== "https:" && url.protocol !== "mailto:") {
        ctx.addIssue({
          code: "custom",
          message: "Contact link must use HTTPS or mailto",
        });
      }
    } catch {
      ctx.addIssue({
        code: "custom",
        message: "Contact link must be a valid URL",
      });
    }
  });

export const globalSettingsSchema = z.object({
  accountCreationContactUrl: contactUrlSchema,
});

export type GlobalSettingsInput = z.infer<typeof globalSettingsSchema>;
