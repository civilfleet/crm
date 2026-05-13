import { z } from "zod";
import { ContactListType } from "@/types";
import { contactFiltersSchema } from "@/validations/contacts";

export const createContactListSchema = z.object({
  teamId: z.string().uuid(),
  name: z.string().min(1, "Name is required").max(255),
  description: z.string().optional(),
  type: z.nativeEnum(ContactListType),
  filters: contactFiltersSchema.optional(),
  contactIds: z.array(z.string().uuid()).default([]),
});

export const updateContactListSchema = z.object({
  id: z.string().uuid(),
  teamId: z.string().uuid(),
  name: z.string().min(1, "Name is required").max(255).optional(),
  description: z.string().optional(),
  type: z.nativeEnum(ContactListType).optional(),
  filters: contactFiltersSchema.optional(),
});

export const addContactsToListSchema = z.object({
  listId: z.string().uuid(),
  teamId: z.string().uuid(),
  contactIds: z
    .array(z.string().uuid())
    .min(1, "At least one contact required"),
});

export const removeContactsFromListSchema = z.object({
  listId: z.string().uuid(),
  teamId: z.string().uuid(),
  contactIds: z
    .array(z.string().uuid())
    .min(1, "At least one contact required"),
});

export const deleteContactListsSchema = z.object({
  teamId: z.string().uuid(),
  ids: z.array(z.string().uuid()).min(1, "At least one list ID required"),
});