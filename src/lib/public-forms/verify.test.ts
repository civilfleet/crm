import assert from "node:assert/strict";
import test from "node:test";
import type { PublishedForm } from "@/lib/public-forms/published-form";
import {
  type FormSubmissionPayload,
  formSubmissionPayload,
} from "@/lib/public-forms/submission";
import { verifySubmission } from "@/lib/public-forms/verify";

/* A submission checked against the form the website published. */

const TEAM = "a10957f3-9d42-4b67-b31c-8bed001777ff";

const form: PublishedForm = {
  version: 1,
  formId: "petition",
  locale: "it",
  revision: "r2",
  teamId: TEAM,
  title: "Firma anche tu",
  confirmation: null,
  questions: [
    {
      id: "name",
      label: "Nome e cognome",
      type: "text",
      required: true,
      contactField: "name",
    },
    {
      id: "mail",
      label: "Email",
      type: "email",
      required: true,
      contactField: "email",
    },
    {
      id: "topic",
      label: "Perché firmi?",
      type: "single",
      required: true,
      options: [
        { id: "rights", label: "Diritti" },
        { id: "sea", label: "Soccorso in mare" },
      ],
    },
    {
      id: "why",
      label: "Raccontaci",
      type: "textarea",
      required: true,
      conditional: true,
    },
    {
      id: "privacy",
      label: "Acconsento al trattamento dei dati",
      type: "consent",
      required: true,
    },
    {
      id: "updates",
      label: "Voglio ricevere aggiornamenti da Sea-Watch",
      type: "consent",
      required: false,
      purpose: "marketing",
    },
  ],
};

const submission = (
  overrides: Partial<FormSubmissionPayload> = {},
): FormSubmissionPayload =>
  formSubmissionPayload.parse({
    version: 1,
    teamId: TEAM,
    form: {
      id: "petition",
      title: "Firma anche tu",
      revision: "r2",
      locale: "it",
    },
    submittedAt: "2026-11-17T10:00:00.000Z",
    contact: { email: "giulia@example.org", name: "Giulia Rossi" },
    answers: [
      { id: "topic", label: "Perché firmi?", type: "single", value: "sea" },
      {
        id: "privacy",
        label: "Acconsento al trattamento dei dati",
        type: "consent",
        value: true,
      },
      {
        id: "updates",
        label: "I want updates",
        type: "consent",
        value: true,
        purpose: "marketing",
      },
    ],
    ...overrides,
  });

test("a submission of the published version that fits it is verified", () => {
  const result = verifySubmission(submission(), form);
  assert.deepEqual(result.verification, { status: "verified", issues: [] });
  assert.equal(result.teamMismatch, false);
  const updates = result.answers.find((answer) => answer.id === "updates");
  assert.equal(updates?.purpose, "marketing");
  // The wording recorded is the published one, not what was sent.
  assert.equal(updates?.label, "Voglio ricevere aggiornamenti da Sea-Watch");
});

test("a purpose the form does not have is dropped, and noted", () => {
  const forged = submission({
    answers: [
      ...submission().answers,
      {
        id: "privacy-2",
        label: "Iscrivimi",
        type: "consent",
        value: true,
        purpose: "marketing",
      },
    ],
  });
  const result = verifySubmission(forged, form);
  const added = result.answers.find((answer) => answer.id === "privacy-2");
  assert.equal(added?.purpose, undefined);
  assert.equal(result.verification.status, "mismatch");
  assert.ok(
    result.verification.issues.some((issue) => issue.includes("purpose")),
  );
});

test("unknown questions, offered options and required answers are checked", () => {
  const result = verifySubmission(
    submission({
      answers: [
        { id: "topic", label: "Perché firmi?", type: "single", value: "money" },
        { id: "extra", label: "Hidden field", type: "text", value: "x" },
      ],
    }),
    form,
  );
  assert.equal(result.verification.status, "mismatch");
  const issues = result.verification.issues.join("\n");
  assert.match(issues, /option the form does not offer/);
  assert.match(issues, /"Hidden field" is not a question/);
  assert.match(
    issues,
    /required "Acconsento al trattamento dei dati" is missing/,
  );
  // A conditional question may be missing; a contact question is in the
  // contact block, not the answers.
  assert.doesNotMatch(issues, /Raccontaci|Nome e cognome|Email/);
});

test("another version: only purposes are checked, against today's form", () => {
  const older = submission({
    form: { id: "petition", title: "Firma", revision: "r1", locale: "it" },
    answers: [
      { id: "old-question", label: "Old", type: "text", value: "x" },
      {
        id: "updates",
        label: "I want updates",
        type: "consent",
        value: true,
        purpose: "marketing",
      },
    ],
  });
  const result = verifySubmission(older, form);
  assert.equal(result.verification.status, "other-revision");
  assert.deepEqual(result.verification.issues, []);
  const updates = result.answers.find((answer) => answer.id === "updates");
  assert.equal(updates?.purpose, "marketing");
  // The person saw the older wording; it is kept.
  assert.equal(updates?.label, "I want updates");
});

test("without a published form no purpose holds; another team's form is flagged", () => {
  const unpublished = verifySubmission(submission(), null);
  assert.equal(unpublished.verification.status, "unpublished");
  assert.ok(
    unpublished.answers.every((answer) => answer.purpose === undefined),
  );

  const foreign = verifySubmission(submission(), {
    ...form,
    teamId: "22222222-2222-4222-8222-222222222222",
  });
  assert.equal(foreign.teamMismatch, true);
});
