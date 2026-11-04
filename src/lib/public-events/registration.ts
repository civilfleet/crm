import { z } from "zod";

export const registrationPayload = z
  .object({
    eventId: z.uuid(),
    name: z.string().trim().min(1).max(255),
    email: z.email().trim().toLowerCase().max(255),
    phone: z.string().trim().max(80).optional(),
    notes: z.string().max(4000).optional(),
  })
  .strict();
export const registrationMessage = z.object({
  version: z.literal(1),
  submissionId: z.uuid(),
  receivedAt: z.iso.datetime(),
  registration: registrationPayload,
});
export const REGISTRATION_STREAM = "SEAWATCH_EVENT_REGISTRATIONS";
export const REGISTRATION_SUBJECT = "seawatch.events.registrations.v1";
export const REGISTRATION_CONSUMER = "crm-event-registrations-v1";
