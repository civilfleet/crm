import { z } from "zod";
import type { ContactFilter } from "@/types";
import {
  ContactAttributeType,
  ContactGender,
  ContactRequestPreference,
} from "@/types";

const preprocessEmptyString = (value: unknown) =>
  typeof value === "string" && value.trim() === "" ? undefined : value;

const optionalText = (schema: z.ZodString) =>
  z.preprocess(preprocessEmptyString, schema.optional());

const requiredEmail = z
  .string()
  .trim()
  .min(1, "Email is required")
  .email("Invalid email address");

const optionalEmail = z.preprocess(
  preprocessEmptyString,
  z.string().trim().email("Invalid email address").optional(),
);

const optionalWebsite = z.preprocess(
  preprocessEmptyString,
  z.string().trim().url("Invalid website URL").optional(),
);

const optionalDate = z.preprocess(
  preprocessEmptyString,
  z
    .string()
    .trim()
    .refine((value) => !Number.isNaN(Date.parse(value)), {
      message: "Invalid date",
    })
    .optional(),
);

const numberValue = z.preprocess((value) => {
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (trimmed === "") {
      return undefined;
    }

    const parsed = Number(trimmed);
    return Number.isNaN(parsed) ? value : parsed;
  }
  return value;
}, z.number().finite());

const contactLocationSchema = z
  .object({
    label: optionalText(z.string().min(1)),
    latitude: numberValue.optional(),
    longitude: numberValue.optional(),
  })
  .partial()
  .transform((value) => {
    const result: Record<string, unknown> = {};
    if (typeof value.label === "string" && value.label.trim() !== "") {
      result.label = value.label.trim();
    }
    if (typeof value.latitude === "number" && !Number.isNaN(value.latitude)) {
      result.latitude = value.latitude;
    }
    if (typeof value.longitude === "number" && !Number.isNaN(value.longitude)) {
      result.longitude = value.longitude;
    }
    return result;
  });

const contactAttributeSchema = z.discriminatedUnion("type", [
  z.object({
    key: z.string().min(1, "Attribute label is required"),
    type: z.literal(ContactAttributeType.STRING),
    value: z.string().min(1, "Value is required"),
  }),
  z.object({
    key: z.string().min(1, "Attribute label is required"),
    type: z.literal(ContactAttributeType.DATE),
    value: z
      .string()
      .min(1, "Value is required")
      .refine((value) => !Number.isNaN(Date.parse(value)), {
        message: "Invalid date",
      }),
  }),
  z.object({
    key: z.string().min(1, "Attribute label is required"),
    type: z.literal(ContactAttributeType.NUMBER),
    value: numberValue,
  }),
  z.object({
    key: z.string().min(1, "Attribute label is required"),
    type: z.literal(ContactAttributeType.LOCATION),
    value: contactLocationSchema,
  }),
]);

const contactSocialLinkSchema = z.object({
  platform: z.string().trim().min(1, "Platform is required").max(50),
  handle: z.string().trim().min(1, "Handle is required").max(255),
});

const contactFieldFilterSchema = z
  .object({
    type: z.literal("contactField"),
    field: z.enum([
      "email",
      "phone",
      "signal",
      "name",
      "pronouns",
      "address",
      "postalCode",
      "state",
      "city",
      "country",
      "website",
    ]),
    operator: z.enum(["has", "missing", "contains"]),
    value: z.string().optional(),
  })
  .refine(
    (data) => {
      if (data.operator === "contains") {
        return Boolean(data.value?.trim());
      }
      return true;
    },
    {
      message: "Provide a value for contains filters",
      path: ["value"],
    },
  );

const attributeFilterSchema = z.object({
  type: z.literal("attribute"),
  key: z.string().trim().min(1, "Attribute key is required"),
  operator: z.enum(["contains", "equals"]),
  value: z.string().trim().min(1, "Attribute value is required"),
});

const distanceFilterSchema = z.object({
  type: z.literal("distance"),
  postalCode: z.string().trim().min(1, "Postal code is required"),
  countryCode: z
    .string()
    .trim()
    .length(2, "Country code must be a 2-letter ISO code"),
  radiusKm: z.coerce
    .number()
    .finite()
    .min(1, "Radius must be greater than 0")
    .max(2000),
});

export const contactFilterSchema: z.ZodType<ContactFilter> =
  z.discriminatedUnion("type", [
    contactFieldFilterSchema,
    attributeFilterSchema,
    z.object({
      type: z.literal("group"),
      groupId: z.string().uuid("Group id must be a valid UUID"),
    }),
    z.object({
      type: z.literal("eventRole"),
      eventRoleId: z.string().uuid("Event role id must be a valid UUID"),
    }),
    distanceFilterSchema,
    z
      .object({
        type: z.literal("createdAt"),
        from: z.string().optional(),
        to: z.string().optional(),
      })
      .refine((value) => Boolean(value.from) || Boolean(value.to), {
        message: "Provide at least a start or end date",
      }),
  ]);

export const contactFiltersSchema: z.ZodType<ContactFilter[]> = z
  .array(contactFilterSchema)
  .default([]);

export const createContactSchema = z.object({
  teamId: z.string().uuid("Team id must be a valid UUID"),
  name: z.string().trim().min(1, "Name is required"),
  pronouns: optionalText(z.string()),
  gender: z.nativeEnum(ContactGender).nullable().optional(),
  genderRequestPreference: z
    .nativeEnum(ContactRequestPreference)
    .nullable()
    .optional(),
  isBipoc: z.boolean().nullable().optional(),
  racismRequestPreference: z
    .nativeEnum(ContactRequestPreference)
    .nullable()
    .optional(),
  otherMargins: optionalText(z.string()),
  onboardingDate: optionalDate,
  breakUntil: optionalDate,
  address: optionalText(z.string()),
  postalCode: optionalText(z.string()),
  state: optionalText(z.string()),
  city: optionalText(z.string()),
  country: optionalText(z.string()),
  email: requiredEmail,
  phone: optionalText(z.string()),
  signal: optionalText(z.string()),
  website: optionalWebsite,
  socialLinks: z.array(contactSocialLinkSchema).default([]),
  profileAttributes: z.array(contactAttributeSchema).default([]),
  groupId: z.preprocess(
    preprocessEmptyString,
    z.string().uuid("Group id must be a valid UUID").optional(),
  ),
});

export type CreateContactInput = z.infer<typeof createContactSchema>;

export type ContactFilterInput = z.infer<typeof contactFilterSchema>;

export const updateContactSchema = z.object({
  contactId: z.string().uuid("Contact id must be a valid UUID"),
  teamId: z.string().uuid("Team id must be a valid UUID"),
  name: z.string().min(1, "Name is required").optional(),
  pronouns: optionalText(z.string()),
  gender: z.nativeEnum(ContactGender).nullable().optional(),
  genderRequestPreference: z
    .nativeEnum(ContactRequestPreference)
    .nullable()
    .optional(),
  isBipoc: z.boolean().nullable().optional(),
  racismRequestPreference: z
    .nativeEnum(ContactRequestPreference)
    .nullable()
    .optional(),
  otherMargins: optionalText(z.string()),
  onboardingDate: optionalDate,
  breakUntil: optionalDate,
  address: optionalText(z.string()),
  postalCode: optionalText(z.string()),
  state: optionalText(z.string()),
  city: optionalText(z.string()),
  country: optionalText(z.string()),
  email: optionalEmail,
  phone: optionalText(z.string()),
  signal: optionalText(z.string()),
  website: optionalWebsite,
  socialLinks: z.array(contactSocialLinkSchema).optional(),
  profileAttributes: z.array(contactAttributeSchema).optional(),
  groupId: z.preprocess(
    preprocessEmptyString,
    z.string().uuid("Group id must be a valid UUID").optional(),
  ),
});

export type UpdateContactInput = z.infer<typeof updateContactSchema>;

export const deleteContactsSchema = z.object({
  teamId: z.string().uuid("Team id must be a valid UUID"),
  ids: z
    .array(z.string().uuid("Contact id must be a valid UUID"))
    .min(1, "Select at least one contact"),
});

export type DeleteContactsInput = z.infer<typeof deleteContactsSchema>;