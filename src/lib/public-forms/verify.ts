import type { PublishedForm } from "@/lib/public-forms/published-form";
import type {
  FormSubmissionAnswer,
  FormSubmissionPayload,
} from "@/lib/public-forms/submission";

/*
  Checks a submission against the form as the website published it
  (docs/PUBLIC_FORMS_INTAKE.md, "Checking against the published form").
  The browser sends the submission, so anyone can change it; the published
  file comes from our own build. What depends on the form (which consents
  exist, their wording) is taken from the file; anything else that differs
  is recorded, not rejected, so a real person's submission is never lost.
*/

export type VerificationStatus =
  /** Sent with the published version, and it matches. */
  | "verified"
  /** Sent with the published version, but some answers do not fit it. */
  | "mismatch"
  /** Sent with another version than the one published now. */
  | "other-revision"
  /** No published file for this form and language. */
  | "unpublished";

export type Verification = {
  status: VerificationStatus;
  /** Plain-language notes on what did not fit, for the Forms page. */
  issues: string[];
};

export type VerifiedSubmission = {
  verification: Verification;
  /** The answers, with purposes kept only where the form has them. */
  answers: FormSubmissionAnswer[];
  /** The file names another team: the submission must not be stored. */
  teamMismatch: boolean;
};

const isAnswered = (value: FormSubmissionAnswer["value"] | undefined) =>
  value !== undefined &&
  value !== "" &&
  value !== false &&
  !(Array.isArray(value) && value.length === 0);

export const verifySubmission = (
  submission: FormSubmissionPayload,
  form: PublishedForm | null,
): VerifiedSubmission => {
  if (!form) {
    // Without the published form nothing can vouch for a purpose.
    return {
      verification: {
        status: "unpublished",
        issues: ["The form has no published version for this language."],
      },
      answers: submission.answers.map(({ purpose: _, ...answer }) => answer),
      teamMismatch: false,
    };
  }

  const sameRevision = form.revision === submission.form.revision;
  const questions = new Map(form.questions.map((q) => [q.id, q]));
  const issues: string[] = [];

  const answers = submission.answers.map((answer) => {
    const question = questions.get(answer.id);
    // A purpose holds only when the published form asks that consent.
    const backed =
      answer.purpose !== undefined &&
      question?.type === "consent" &&
      question.purpose === answer.purpose;
    const { purpose, ...rest } = answer;
    const checked: FormSubmissionAnswer = backed ? { ...rest, purpose } : rest;
    if (answer.purpose !== undefined && !backed)
      issues.push(
        `"${answer.label}" claims the purpose ${answer.purpose}, which the form does not have.`,
      );
    if (!sameRevision) return checked;

    if (!question) {
      issues.push(`"${answer.label}" is not a question of this form.`);
      return checked;
    }
    if (question.type !== answer.type)
      issues.push(
        `"${question.label}" was sent as ${answer.type}, not ${question.type}.`,
      );
    if (
      question.options &&
      (answer.type === "single" || answer.type === "multiple")
    ) {
      const allowed = new Set(question.options.map((option) => option.id));
      const given = Array.isArray(answer.value)
        ? answer.value
        : [String(answer.value)];
      if (given.some((value) => !allowed.has(value)))
        issues.push(
          `"${question.label}" has an option the form does not offer.`,
        );
    }
    // The wording the person saw is the published one.
    return { ...checked, label: question.label };
  });

  if (sameRevision) {
    const answered = new Map(submission.answers.map((a) => [a.id, a.value]));
    const contactFields = new Set(
      Object.entries(submission.contact)
        .filter(([, value]) => value !== undefined && value !== "")
        .map(([field]) => field),
    );
    for (const question of form.questions) {
      if (!question.required || question.conditional) continue;
      const given = question.contactField
        ? contactFields.has(question.contactField)
        : isAnswered(answered.get(question.id));
      if (!given) issues.push(`The required "${question.label}" is missing.`);
    }
  }

  return {
    verification: {
      status: !sameRevision
        ? "other-revision"
        : issues.length
          ? "mismatch"
          : "verified",
      issues,
    },
    answers,
    teamMismatch: form.teamId !== submission.teamId,
  };
};
