import { z } from "zod";

const teamLoginMethods = ["EMAIL_MAGIC_LINK", "OIDC"] as const;

const teamSchemaBase = z.object({
  name: z.string().min(1, "Name is required"),
  email: z.string().email("Invalid email address"),
  loginDomain: z
    .string()
    .regex(
      /^$|^@?[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$/i,
      "Invalid domain format",
    )
    .optional(),
  loginMethod: z.enum(teamLoginMethods),
  oidcIssuer: z.string().optional(),
  oidcClientId: z.string().optional(),
  oidcClientSecret: z.string().optional(),
  autoProvisionUsersFromOidc: z.boolean().optional(),
  defaultOidcGroupId: z.string().uuid("Invalid default OIDC group").optional().nullable(),
  registrationPageLogoKey: z.string().optional(),
  bankDetails: z
    .object({
      bankName: z.string().min(1, "Bank name is required"),
      accountHolder: z.string().min(1, "Account holder is required"),
      iban: z.string().min(1, "IBAN is required"),
      bic: z.string().min(1, "BIC is required"),
    })
    .optional(),
  phone: z.string().min(1, "Phone is required"),
  address: z.string().min(1, "Address is required"),
  postalCode: z.string().min(1, "Postal code is required"),
  city: z.string().min(1, "City is required"),
  country: z.string().min(1, "Country is required"),
  website: z.string().min(1, "Website is required"),
  strategicPriorities: z.string().optional(),
  user: z.object({
    name: z.string().min(1, "Name is required"),
    email: z.string().email("Invalid email address"),
    phone: z.string().optional(),
    address: z.string().optional(),
  }),
});

const requireOidcFields = (
  value: {
    loginMethod?: (typeof teamLoginMethods)[number];
    loginDomain?: string;
    oidcIssuer?: string;
    oidcClientId?: string;
    oidcClientSecret?: string;
  },
  ctx: z.RefinementCtx,
  options?: { requireClientSecret?: boolean },
) => {
  const hasDomain = Boolean(value.loginDomain?.trim());
  const hasOidcIssuer = Boolean(value.oidcIssuer?.trim());
  const isOidcIssuerValid = hasOidcIssuer
    ? z.string().url().safeParse(value.oidcIssuer?.trim()).success
    : false;

  if (value.loginMethod === "OIDC" && !hasDomain) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["loginDomain"],
      message: "Login domain is required when login method is OIDC",
    });
  }

  if (value.loginMethod === "OIDC" && !value.oidcIssuer?.trim()) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["oidcIssuer"],
      message: "OIDC issuer is required when login method is OIDC",
    });
  }
  if (value.loginMethod === "OIDC" && hasOidcIssuer && !isOidcIssuerValid) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["oidcIssuer"],
      message: "OIDC issuer must be a valid URL",
    });
  }

  if (value.loginMethod === "OIDC" && !value.oidcClientId?.trim()) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["oidcClientId"],
      message: "OIDC client ID is required when login method is OIDC",
    });
  }

  if (
    options?.requireClientSecret &&
    value.loginMethod === "OIDC" &&
    !value.oidcClientSecret?.trim()
  ) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["oidcClientSecret"],
      message: "OIDC client secret is required when login method is OIDC",
    });
  }
};

const createTeamSchema = teamSchemaBase.superRefine((value, ctx) =>
  requireOidcFields(value, ctx, { requireClientSecret: true }),
);
const updateTeamSchema = teamSchemaBase.partial().superRefine((value, ctx) =>
  requireOidcFields(value, ctx),
);
// Generate TypeScript type
export type CreateTeamInput = z.infer<typeof createTeamSchema>;
export { createTeamSchema, updateTeamSchema };
