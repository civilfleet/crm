import { z } from "zod";

const bankDetailsSchema = z
  .object({
    bankName: z
      .string()
      .min(2, { message: "Bank name must be at least 2 characters." })
      .optional()
      .or(z.literal("")),
    accountHolder: z
      .string()
      .min(2, { message: "Account holder name must be at least 2 characters." })
      .optional()
      .or(z.literal("")),
    iban: z
      .string()
      .min(2, { message: "IBAN must be at least 2 characters." })
      .optional()
      .or(z.literal("")),
    bic: z
      .string()
      .min(2, { message: "SWIFT must be at least 2 characters." })
      .optional()
      .or(z.literal("")),
  })
  .optional();

export default bankDetailsSchema;

const createUserSchema = z.object({
  name: z
    .string()
    .min(2, {
      message: "Name must be at least 2 characters.",
    })
    .optional()
    .or(z.literal("")),
  email: z.email({
    message: "Invalid email address format.",
  }),
  phone: z
    .string()
    .min(2, {
      message: "Phone must be at least 2 characters.",
    })
    .optional()
    .or(z.literal("")),
});

const organizationLoginUserSchema = createUserSchema.extend({
  email: z
    .email({
      message: "Invalid email address format.",
    })
    .optional()
    .or(z.literal("")),
});

const createOrganizationSchema = z.object({
  name: z
    .string()
    .min(2, {
      message: "Name must be at least 2 characters.",
    })
    .optional()
    .or(z.literal("")),
  email: z.email({
    message: "Invalid email address format.",
  }),
  address: z
    .string()
    .min(2, {
      message: "Address must be at least 2 characters.",
    })
    .optional()
    .or(z.literal("")),
  postalCode: z
    .string()
    .min(2, {
      message: "Postal code must be at least 2 characters.",
    })
    .optional()
    .or(z.literal("")),
  city: z
    .string()
    .min(2, {
      message: "City must be at least 2 characters.",
    })
    .optional()
    .or(z.literal("")),
  country: z
    .string()
    .min(2, {
      message: "Country must be at least 2 characters.",
    })
    .optional()
    .or(z.literal("")),
  phone: z
    .string()
    .min(2, {
      message: "Phone must be at least 2 characters.",
    })
    .optional()
    .or(z.literal("")),
  website: z
    .string()
    .min(2, {
      message: "Website must be at least 2 characters.",
    })
    .optional()
    .or(z.literal("")),
  taxExemptionCertificate: z
    .string()
    .min(2, {
      message: "Tax exemption certificate must be at least 2 characters.",
    })
    .optional()
    .or(z.literal("")),
  taxID: z
    .string()
    .min(2, {
      message: "Tax ID must be at least 2 characters.",
    })
    .optional()
    .or(z.literal("")),
  portalAccessEnabled: z.boolean().optional(),
  articlesOfAssociation: z
    .string()
    .min(2, {
      message: "Articles of association is required.",
    })
    .optional()
    .or(z.literal("")),
  logo: z.string().optional().or(z.literal("")),
  orgTypeId: z
    .uuid("Organization type id must be a valid UUID")
    .optional()
    .or(z.literal("")),
  profileData: z.record(z.string(), z.unknown()).optional(),
  contactPersonId: z
    .uuid("Contact id must be a valid UUID")
    .optional()
    .or(z.literal("")),
  bankDetails: bankDetailsSchema,
  user: organizationLoginUserSchema.optional(),
});

const updateOrganizationSchema = createOrganizationSchema;

export {
  bankDetailsSchema,
  createOrganizationSchema,
  createUserSchema,
  updateOrganizationSchema,
};