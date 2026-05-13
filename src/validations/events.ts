import { z } from "zod";

const preprocessEmptyString = (value: unknown) =>
  typeof value === "string" && value.trim() === "" ? undefined : value;

const optionalText = (schema: z.ZodString) =>
  z.preprocess(preprocessEmptyString, schema.optional());

const numberValue = z.preprocess((value) => {
  if (value === "" || value === undefined || value === null) {
    return undefined;
  }
  if (typeof value === "number") {
    return value;
  }
  if (typeof value === "string") {
    const parsed = Number(value);
    return Number.isNaN(parsed) ? value : parsed;
  }
  return value;
}, z.number());

const eventContactSchema = z.object({
  contactId: z.uuid("Contact id must be a valid UUID"),
  roleIds: z.array(z.uuid("Role id must be a valid UUID")).default([]),
});

export const createEventSchema = z.object({
  teamId: z.uuid("Team id must be a valid UUID"),
  title: z.string().min(1, "Title is required"),
  slug: optionalText(z.string()),
  description: optionalText(z.string()),
  location: optionalText(z.string()),
  eventTypeId: z.preprocess(
    preprocessEmptyString,
    z.uuid("Event type id must be a valid UUID").optional(),
  ),
  isOnline: z
    .preprocess((val) => val === true || val === "true", z.boolean())
    .default(false),
  expectedGuests: numberValue.optional(),
  hasRemuneration: z
    .preprocess((val) => val === true || val === "true", z.boolean())
    .default(false),
  address: optionalText(z.string()),
  city: optionalText(z.string()),
  postalCode: optionalText(z.string()),
  state: optionalText(z.string()),
  timeZone: optionalText(z.string()),
  merchNeeded: z
    .preprocess((val) => val === true || val === "true", z.boolean())
    .default(false),
  startDate: z
    .string()
    .min(1, "Start date is required")
    .refine((value) => !Number.isNaN(Date.parse(value)), {
      message: "Invalid start date",
    }),
  endDate: z.preprocess(preprocessEmptyString, z.string().optional()).refine(
    (value) => {
      if (!value) return true;
      return !Number.isNaN(Date.parse(value));
    },
    { message: "Invalid end date" },
  ),
  isPublic: z
    .preprocess((val) => val === true || val === "true", z.boolean())
    .default(false),
  contacts: z.array(eventContactSchema).default([]),
  listIds: z.array(z.uuid("List id must be a valid UUID")).default([]),
});

export type CreateEventInput = z.infer<typeof createEventSchema>;

export const updateEventSchema = z.object({
  id: z.uuid("Event id must be a valid UUID"),
  teamId: z.uuid("Team id must be a valid UUID"),
  title: z.string().min(1, "Title is required"),
  slug: optionalText(z.string()),
  description: optionalText(z.string()),
  location: optionalText(z.string()),
  eventTypeId: z.preprocess(
    preprocessEmptyString,
    z.uuid("Event type id must be a valid UUID").optional(),
  ),
  isOnline: z
    .preprocess((val) => val === true || val === "true", z.boolean())
    .default(false),
  expectedGuests: numberValue.optional(),
  hasRemuneration: z
    .preprocess((val) => val === true || val === "true", z.boolean())
    .default(false),
  address: optionalText(z.string()),
  city: optionalText(z.string()),
  postalCode: optionalText(z.string()),
  state: optionalText(z.string()),
  timeZone: optionalText(z.string()),
  merchNeeded: z
    .preprocess((val) => val === true || val === "true", z.boolean())
    .default(false),
  startDate: z
    .string()
    .min(1, "Start date is required")
    .refine((value) => !Number.isNaN(Date.parse(value)), {
      message: "Invalid start date",
    }),
  endDate: z.preprocess(preprocessEmptyString, z.string().optional()).refine(
    (value) => {
      if (!value) return true;
      return !Number.isNaN(Date.parse(value));
    },
    { message: "Invalid end date" },
  ),
  isPublic: z
    .preprocess((val) => val === true || val === "true", z.boolean())
    .default(false),
  contacts: z.array(eventContactSchema).default([]),
  listIds: z.array(z.uuid("List id must be a valid UUID")).default([]),
});

export type UpdateEventInput = z.infer<typeof updateEventSchema>;

export const deleteEventsSchema = z.object({
  teamId: z.uuid("Team id must be a valid UUID"),
  ids: z
    .array(z.uuid("Event id must be a valid UUID"))
    .min(1, "Select at least one event"),
});

export type DeleteEventsInput = z.infer<typeof deleteEventsSchema>;

// Event registration validation schemas
export const createEventRegistrationSchema = z.object({
  eventId: z.uuid("Event id must be a valid UUID"),
  name: z.string().trim().min(1, "Name is required"),
  email: z.string().trim().email("Valid email is required"),
  phone: optionalText(z.string()),
  notes: optionalText(z.string()),
  customData: z.record(z.string(), z.unknown()).optional(),
});

export type CreateEventRegistrationInput = z.infer<
  typeof createEventRegistrationSchema
>;