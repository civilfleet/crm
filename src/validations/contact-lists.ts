import { z } from "zod";
import { ContactListType } from "@/types";
import { contactFiltersSchema } from "@/validations/contacts";

export const createContactListSchema = z.object({
  teamId: z.uuid(),
  name: z.string().min(1, "Name is required").max(255),
  description: z.string().optional(),
  type: z.enum(ContactListType),
  filters: contactFiltersSchema.optional(),
  contactIds: z.array(z.uuid()).default([]),
});

export const updateContactListSchema = z.object({
  id: z.uuid(),
  teamId: z.uuid(),
  name: z.string().min(1, "Name is required").max(255).optional(),
  description: z.string().optional(),
  type: z.enum(ContactListType).optional(),
  filters: contactFiltersSchema.optional(),
});

export const addContactsToListSchema = z.object({
  listId: z.uuid(),
  teamId: z.uuid(),
  contactIds: z.array(z.uuid()).min(1, "At least one contact required"),
});

export const removeContactsFromListSchema = z.object({
  listId: z.uuid(),
  teamId: z.uuid(),
  contactIds: z.array(z.uuid()).min(1, "At least one contact required"),
});

export const deleteContactListsSchema = z.object({
  teamId: z.uuid(),
  ids: z.array(z.uuid()).min(1, "At least one list ID required"),
});