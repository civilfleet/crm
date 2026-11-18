import assert from "node:assert/strict";
import { after, beforeEach, test } from "node:test";
import {
  createUser,
  db,
  disconnect,
  loadService,
  resetDatabase,
} from "./helpers";

/*
  Languages (docs/DATA_RULES.md, "Languages"): what a contact speaks, how
  well, and what an organization works in; edited, logged, filtered and
  merged.
*/

class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

// biome-ignore lint/suspicious/noExplicitAny: each service has its own shape
type Service = Record<string, any>;
const boundaries = {
  "@/lib/api-guard": { ApiError },
  "@/auth": { auth: async () => null },
  "@/lib/utils": { handlePrismaError: (error: unknown) => error },
};
const contacts = loadService<Service>(
  "src/services/contacts/index.ts",
  boundaries,
);
const organizations = loadService<Service>(
  "src/services/organizations/index.ts",
  boundaries,
);

beforeEach(resetDatabase);
after(disconnect);

const setup = async () => {
  const editor = await createUser("Editor");
  const team = await db.teams.create({
    data: { name: "Languages", email: "languages@example.org" },
  });
  const person = (name: string, email: string) =>
    db.contact.create({
      data: {
        teamId: team.id,
        name,
        emails: { create: { teamId: team.id, email, kind: "PRIMARY" } },
      },
    });
  return { editor, team, person };
};

const spoken = async (contactId: string) =>
  (
    await db.contactLanguage.findMany({
      where: { contactId },
      orderBy: { language: "asc" },
      select: { language: true, level: true },
    })
  ).map(({ language, level }) => `${language}:${level ?? "-"}`);

const history = async (contactId: string) =>
  (
    await db.contactChangeLog.findMany({
      where: { contactId },
      orderBy: [{ createdAt: "asc" }, { fieldName: "asc" }],
      select: { fieldName: true, oldValue: true, newValue: true },
    })
  ).map(
    ({ fieldName, oldValue, newValue }) =>
      `${fieldName}: ${oldValue ?? "-"} → ${newValue ?? "-"}`,
  );

test("a contact's languages are set, re-levelled and removed, each change logged", async () => {
  const { editor, team, person } = await setup();
  const giulia = await person("Giulia", "giulia@example.org");
  const edit = (languages: unknown) =>
    contacts.updateContact(
      { contactId: giulia.id, teamId: team.id, languages },
      editor.id,
      "Editor",
    );

  await edit([
    { language: "AR", level: "NATIVE" },
    { language: "en" },
    { language: "klingon", level: "FLUENT" },
  ]);
  assert.deepEqual(await spoken(giulia.id), ["ar:NATIVE", "en:-"]);

  // The same list again leaves no history.
  await edit([{ language: "ar", level: "NATIVE" }, { language: "en" }]);
  // English gets a level, Arabic goes, Italian comes.
  await edit([
    { language: "en", level: "FLUENT" },
    { language: "it", level: "BASIC" },
  ]);
  assert.deepEqual(await spoken(giulia.id), ["en:FLUENT", "it:BASIC"]);

  assert.deepEqual(await history(giulia.id), [
    'language.ar: - → "Native"',
    'language.en: - → "Spoken"',
    'language.ar: "Native" → -',
    'language.en: "Spoken" → "Fluent"',
    'language.it: - → "Basic"',
  ]);

  // Leaving languages out of an edit keeps them.
  await contacts.updateContact(
    { contactId: giulia.id, teamId: team.id, name: "Giulia C." },
    editor.id,
  );
  assert.deepEqual(await spoken(giulia.id), ["en:FLUENT", "it:BASIC"]);
});

test("speaks: a language, optionally at least a level; several must all hold", async () => {
  const { editor, team, person } = await setup();
  const native = await person("Native", "native@example.org");
  const basic = await person("Basic", "basic@example.org");
  const unknown = await person("Unknown", "unknown@example.org");
  const both = await person("Both", "both@example.org");
  await db.contactLanguage.createMany({
    data: [
      { contactId: native.id, language: "ar", level: "NATIVE" },
      { contactId: basic.id, language: "ar", level: "BASIC" },
      { contactId: unknown.id, language: "ar" },
      { contactId: both.id, language: "ar", level: "FLUENT" },
      { contactId: both.id, language: "en", level: "FLUENT" },
    ],
  });
  const names = async (filters: unknown[]) =>
    (
      await contacts.getTeamContacts(
        team.id,
        undefined,
        editor.id,
        filters,
        ["Admin"],
      )
    )
      .map(({ name }: { name: string }) => name)
      .sort();

  assert.deepEqual(await names([{ type: "language", language: "ar" }]), [
    "Basic",
    "Both",
    "Native",
    "Unknown",
  ]);
  assert.deepEqual(
    await names([{ type: "language", language: "ar", minLevel: "FLUENT" }]),
    ["Both", "Native"],
  );
  assert.deepEqual(
    await names([
      { type: "language", language: "ar" },
      { type: "language", language: "en" },
    ]),
    ["Both"],
  );
});

test("merging keeps every language, the higher level where both speak it", async () => {
  const { editor, team, person } = await setup();
  const target = await person("Target", "target@example.org");
  const source = await person("Source", "source@example.org");
  await db.contactLanguage.createMany({
    data: [
      { contactId: target.id, language: "ar", level: "BASIC" },
      { contactId: target.id, language: "de", level: "NATIVE" },
      { contactId: source.id, language: "ar", level: "FLUENT" },
      { contactId: source.id, language: "de", level: "BASIC" },
      { contactId: source.id, language: "fa" },
    ],
  });

  await contacts.mergeContacts(
    {
      teamId: team.id,
      targetContactId: target.id,
      sourceContactIds: [source.id],
      primaryEmail: "target@example.org",
      preservedEmails: [],
    },
    editor.id,
    "Editor",
  );

  assert.deepEqual(await spoken(target.id), [
    "ar:FLUENT",
    "de:NATIVE",
    "fa:-",
  ]);
});

test("an organization's languages are saved as codes and filtered", async () => {
  const { team } = await setup();
  const create = (name: string, languages: string[]) =>
    organizations.createOrUpdateOrganization({
      name,
      email: `${name.toLowerCase()}@example.org`,
      teamId: team.id,
      isFilledByOrg: false,
      languages,
    });
  await create("Bilingual", ["IT", "en", "it", "klingon"]);
  await create("Italian", ["it"]);
  await create("None", []);

  const bilingual = await db.organization.findUniqueOrThrow({
    where: { email: "bilingual@example.org" },
  });
  assert.deepEqual(bilingual.languages, ["it", "en"]);

  const names = async (filters: unknown[]) =>
    (await organizations.getOrganizations("", team.id, filters)).data
      .map(({ name }: { name: string }) => name)
      .sort();
  assert.deepEqual(await names([{ type: "language", language: "it" }]), [
    "Bilingual",
    "Italian",
  ]);
  assert.deepEqual(
    await names([
      { type: "language", language: "it" },
      { type: "language", language: "en" },
    ]),
    ["Bilingual"],
  );
});
