import { z } from "zod";
import { CONTACT_SUBMODULES } from "@/constants/contact-submodules";
import { APP_MODULES, DEFAULT_TEAM_MODULES } from "@/types";

export const createGroupSchema = z.object({
  teamId: z.uuid(),
  name: z.string().min(1, "Name is required").max(255),
  description: z.string().optional(),
  canAccessAllContacts: z.boolean().optional().default(false),
  userIds: z.array(z.uuid()).optional(),
  modules: z
    .array(z.enum(APP_MODULES))
    .optional()
    .transform((value) =>
      value?.length
        ? Array.from(new Set(value))
        : Array.from(DEFAULT_TEAM_MODULES),
    ),
  contactSubmodules: z.array(z.enum(CONTACT_SUBMODULES)).optional(),
});

export type CreateGroupInput = z.infer<typeof createGroupSchema>;

export const updateGroupSchema = z.object({
  id: z.uuid(),
  teamId: z.uuid(),
  name: z.string().min(1, "Name is required").max(255).optional(),
  description: z.string().optional(),
  canAccessAllContacts: z.boolean().optional(),
  modules: z
    .array(z.enum(APP_MODULES))
    .optional()
    .transform((value) => (value ? Array.from(new Set(value)) : undefined)),
  contactSubmodules: z
    .array(z.enum(CONTACT_SUBMODULES))
    .optional()
    .transform((value) => (value ? Array.from(new Set(value)) : undefined)),
});

export type UpdateGroupInput = z.infer<typeof updateGroupSchema>;

export const deleteGroupsSchema = z.object({
  teamId: z.uuid(),
  ids: z.array(z.uuid()).min(1, "At least one group ID is required"),
});

export type DeleteGroupsInput = z.infer<typeof deleteGroupsSchema>;

export const manageGroupUsersSchema = z.object({
  groupId: z.uuid(),
  teamId: z.uuid(),
  userIds: z.array(z.uuid()),
});

export type ManageGroupUsersInput = z.infer<typeof manageGroupUsersSchema>;
