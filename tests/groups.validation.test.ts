import assert from "node:assert/strict";
import test from "node:test";
import { CONTACT_SUBMODULES } from "../constants/contact-submodules";
import { DEFAULT_TEAM_MODULES } from "../types";
import {
  createGroupSchema,
  updateGroupSchema,
} from "../validations/groups";

const TEAM_ID = "11111111-1111-4111-8111-111111111111";
const GROUP_ID = "77777777-7777-4777-8777-777777777777";
const USER_ID = "88888888-8888-4888-8888-888888888888";

test("createGroupSchema falls back to default team modules", () => {
  const parsed = createGroupSchema.parse({
    teamId: TEAM_ID,
    name: "Core team",
    userIds: [USER_ID],
  });

  assert.deepEqual(parsed.modules, [...DEFAULT_TEAM_MODULES]);
  assert.equal(parsed.canAccessAllContacts, false);
});

test("createGroupSchema removes duplicate modules", () => {
  const parsed = createGroupSchema.parse({
    teamId: TEAM_ID,
    name: "Organizers",
    modules: ["CRM", "CRM", "ADMIN"],
  });

  assert.deepEqual(parsed.modules, ["CRM", "ADMIN"]);
});

test("updateGroupSchema removes duplicate contact submodules", () => {
  const parsed = updateGroupSchema.parse({
    id: GROUP_ID,
    teamId: TEAM_ID,
    contactSubmodules: [
      CONTACT_SUBMODULES[0],
      CONTACT_SUBMODULES[0],
      CONTACT_SUBMODULES[2],
    ],
  });

  assert.deepEqual(parsed.contactSubmodules, [
    CONTACT_SUBMODULES[0],
    CONTACT_SUBMODULES[2],
  ]);
});
