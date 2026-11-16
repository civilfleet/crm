import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, beforeEach, test } from "node:test";
import {
  createUser,
  db,
  disconnect,
  loadService,
  resetDatabase,
} from "./helpers";

/*
  The Forms page and the public counter: people are counted once however
  often they send a form, a user sees only submissions of contacts they may
  see, and the public number counts everyone.
*/

type Viewer = { userId?: string; roles?: string[] };
type FormsService = {
  getFormsPage: (
    teamId: string,
    viewer: Viewer,
    options: { page: number; pageSize: number; query?: string },
  ) => Promise<{
    data: Array<{
      formId: string;
      title: string;
      submissions: number;
      people: number;
    }>;
    total: number;
  }>;
  getFormSubmissionsPage: (
    teamId: string,
    formId: string,
    viewer: Viewer,
    options: { page: number; pageSize: number },
  ) => Promise<{ data: Array<{ contact: { name: string } }>; total: number }>;
  updateFormSetting: (
    teamId: string,
    formId: string,
    input: { publicCount?: boolean; goal?: number | null },
  ) => Promise<unknown>;
  getFormCountRows: () => Promise<
    Array<{
      formId: string;
      publicCount: boolean;
      goal: number | null;
      count: number;
    }>
  >;
};

const forms = loadService<FormsService>("src/services/forms/index.ts");

beforeEach(resetDatabase);
after(disconnect);

const setup = async () => {
  const team = await db.teams.create({
    data: { name: "Forms", email: "forms@example.org" },
  });
  const member = await createUser("Member");
  const restricted = await db.group.create({
    data: { teamId: team.id, name: "Restricted" },
  });
  const contact = (name: string, hidden = false) =>
    db.contact.create({
      data: {
        teamId: team.id,
        name,
        ...(hidden ? { groups: { create: { groupId: restricted.id } } } : {}),
      },
    });
  const submit = (
    contactId: string,
    formId: string,
    title: string,
    receivedAt = new Date(),
  ) =>
    db.formSubmission.create({
      data: {
        submissionId: randomUUID(),
        teamId: team.id,
        contactId,
        formId,
        formTitle: title,
        formRevision: "1",
        locale: "it",
        answers: [],
        submittedAt: receivedAt,
        receivedAt,
      },
    });
  const ada = await contact("Ada");
  const ben = await contact("Ben");
  const hidden = await contact("Hidden", true);
  // Ada signs twice: two submissions, one person.
  await submit(ada.id, "petition", "Firma", new Date("2026-11-01"));
  await submit(ada.id, "petition", "Firma la lettera", new Date("2026-11-02"));
  await submit(ben.id, "petition", "Firma la lettera");
  await submit(hidden.id, "petition", "Firma la lettera");
  await submit(ben.id, "volunteer", "Volunteer");
  return { team, member };
};

const page = { page: 1, pageSize: 50 };

test("each form once, people counted once, named by its newest title", async () => {
  const { team } = await setup();
  const { data, total } = await forms.getFormsPage(
    team.id,
    { roles: ["Admin"] },
    page,
  );
  assert.equal(total, 2);
  const petition = data.find((form) => form.formId === "petition");
  assert.deepEqual(
    {
      title: petition?.title,
      submissions: petition?.submissions,
      people: petition?.people,
    },
    { title: "Firma la lettera", submissions: 4, people: 3 },
  );
});

test("a member sees no submission of a contact hidden from them", async () => {
  const { team, member } = await setup();
  const viewer = { userId: member.id, roles: [] };
  const { data } = await forms.getFormsPage(team.id, viewer, page);
  assert.equal(data.find((form) => form.formId === "petition")?.people, 2);
  const submissions = await forms.getFormSubmissionsPage(
    team.id,
    "petition",
    viewer,
    page,
  );
  assert.equal(submissions.total, 3);
  assert.ok(submissions.data.every((row) => row.contact.name !== "Hidden"));
});

test("the public count counts everyone once, only for forms switched on", async () => {
  const { team } = await setup();
  assert.equal(
    await forms.updateFormSetting(team.id, "never-sent", { publicCount: true }),
    null,
    "a form the team never received cannot be set",
  );
  await forms.updateFormSetting(team.id, "petition", {
    publicCount: true,
    goal: 5000,
  });
  await forms.updateFormSetting(team.id, "volunteer", { goal: 10 });

  const rows = await forms.getFormCountRows();
  const byForm = Object.fromEntries(rows.map((row) => [row.formId, row]));
  assert.deepEqual(
    {
      count: byForm.petition.count,
      goal: byForm.petition.goal,
      publicCount: byForm.petition.publicCount,
    },
    { count: 3, goal: 5000, publicCount: true },
  );
  // Not public: published as such, with no number counted.
  assert.equal(byForm.volunteer.publicCount, false);
  assert.equal(byForm.volunteer.count, 0);
});
