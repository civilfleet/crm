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

const requiredEmail = z.email("Invalid email address");

const optionalEmail = z.preprocess(
  preprocessEmptyString,
  z.email("Invalid email address").optional(),
);

const optionalWebsite = z.preprocess(
  preprocessEmptyString,
  z.url("Invalid website URL").optional(),
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
}, z.number());

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

const contactFileSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(255),
  type: z.string().trim().min(1, "Type is required").max(50),
  url: z.string().trim().min(1, "File reference is required"),
  pendingUploadId: z.uuid("Pending upload id must be a valid UUID").optional(),
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
  radiusKm: z.coerce.number().min(1, "Radius must be greater than 0").max(2000),
});

export const contactFilterSchema: z.ZodType<ContactFilter> =
  z.discriminatedUnion("type", [
    contactFieldFilterSchema,
    attributeFilterSchema,
    z.object({
      type: z.literal("group"),
      groupId: z.uuid("Group id must be a valid UUID"),
    }),
    z.object({
      type: z.literal("eventRole"),
      eventRoleId: z.uuid("Event role id must be a valid UUID"),
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
  teamId: z.uuid("Team id must be a valid UUID"),
  name: z.string().trim().min(1, "Name is required"),
  pronouns: optionalText(z.string()),
  gender: z.enum(ContactGender).nullable().optional(),
  genderRequestPreference: z
    .enum(ContactRequestPreference)
    .nullable()
    .optional(),
  isBipoc: z.boolean().nullable().optional(),
  racismRequestPreference: z
    .enum(ContactRequestPreference)
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
  organizationIds: z
    .array(z.uuid("Organization id must be a valid UUID"))
    .default([]),
  profileAttributes: z.array(contactAttributeSchema).default([]),
  files: z.array(contactFileSchema).default([]),
  groupId: z.preprocess(
    preprocessEmptyString,
    z.uuid("Group id must be a valid UUID").optional(),
  ),
});

export type CreateContactInput = z.infer<typeof createContactSchema>;

export type ContactFilterInput = z.infer<typeof contactFilterSchema>;

export const updateContactSchema = z.object({
  contactId: z.uuid("Contact id must be a valid UUID"),
  teamId: z.uuid("Team id must be a valid UUID"),
  name: z.string().min(1, "Name is required").optional(),
  pronouns: optionalText(z.string()),
  gender: z.enum(ContactGender).nullable().optional(),
  genderRequestPreference: z
    .enum(ContactRequestPreference)
    .nullable()
    .optional(),
  isBipoc: z.boolean().nullable().optional(),
  racismRequestPreference: z
    .enum(ContactRequestPreference)
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
  organizationIds: z
    .array(z.uuid("Organization id must be a valid UUID"))
    .optional(),
  profileAttributes: z.array(contactAttributeSchema).optional(),
  files: z.array(contactFileSchema).optional(),
  groupId: z.preprocess(
    preprocessEmptyString,
    z.uuid("Group id must be a valid UUID").optional(),
  ),
});

export type UpdateContactInput = z.infer<typeof updateContactSchema>;

export const deleteContactsSchema = z.object({
  teamId: z.uuid("Team id must be a valid UUID"),
  ids: z
    .array(z.uuid("Contact id must be a valid UUID"))
    .min(1, "Select at least one contact"),
});

export type DeleteContactsInput = z.infer<typeof deleteContactsSchema>;
