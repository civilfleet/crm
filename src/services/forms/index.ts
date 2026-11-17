import { Prisma } from "@prisma/client";
import { chainOrderBy, type RecordSort } from "@/lib/list-request";
import prisma from "@/lib/prisma";
import type { FormCountRow } from "@/lib/public-forms/counts";
import type { FormSubmissionAnswer } from "@/lib/public-forms/submission";
import { getContactVisibility } from "@/services/contacts/access";
import type { Roles } from "@/types";

/*
  Website forms as the team sees them: one row per form id that sent
  submissions, its submissions, and its settings (public counter, goal).
  Submissions are listed only for contacts the user may see.
*/

type Viewer = { userId?: string; roles?: Roles[] };

export const FORM_SORT_FIELDS = [
  "title",
  "submissions",
  "people",
  "lastReceivedAt",
] as const;
export type FormSortField = (typeof FORM_SORT_FIELDS)[number];

export type FormSummary = {
  formId: string;
  title: string;
  revision: string;
  submissions: number;
  /** Unique contacts who sent it. */
  people: number;
  /** Unique contacts with a confirmed e-mail address for it. */
  confirmedPeople: number;
  lastReceivedAt: Date;
  publicCount: boolean;
  goal: number | null;
  countConfirmedOnly: boolean;
};

const visibleSubmissionsWhere = async (
  teamId: string,
  { userId, roles }: Viewer,
): Promise<Prisma.FormSubmissionWhereInput> => {
  // Trashed contacts still sent the form; they stay counted and listed.
  const visibility = await getContactVisibility({
    teamId,
    userId,
    roles,
    deleted: "all",
  });
  return { teamId, contact: visibility.where };
};

/** Every form of the team with its counts, as the user may see them. */
const getFormSummaries = async (
  teamId: string,
  viewer: Viewer,
  formId?: string,
): Promise<FormSummary[]> => {
  const where = {
    ...(await visibleSubmissionsWhere(teamId, viewer)),
    ...(formId ? { formId } : {}),
  };
  const [totals, people, confirmed, latest, settings] = await Promise.all([
    prisma.formSubmission.groupBy({
      by: ["formId"],
      where,
      _count: { _all: true },
      _max: { receivedAt: true },
    }),
    prisma.formSubmission.groupBy({ by: ["formId", "contactId"], where }),
    prisma.formSubmission.groupBy({
      by: ["formId", "contactId"],
      where: { ...where, confirmedAt: { not: null } },
    }),
    // The newest submission names the form: titles change with revisions.
    prisma.formSubmission.findMany({
      where,
      distinct: ["formId"],
      orderBy: [{ formId: "asc" }, { receivedAt: "desc" }],
      select: { formId: true, formTitle: true, formRevision: true },
    }),
    prisma.formSetting.findMany({
      where: { teamId, ...(formId ? { formId } : {}) },
    }),
  ]);

  const peopleByForm = new Map<string, number>();
  for (const row of people)
    peopleByForm.set(row.formId, (peopleByForm.get(row.formId) ?? 0) + 1);
  const confirmedByForm = new Map<string, number>();
  for (const row of confirmed)
    confirmedByForm.set(row.formId, (confirmedByForm.get(row.formId) ?? 0) + 1);
  const latestByForm = new Map(latest.map((row) => [row.formId, row]));
  const settingByForm = new Map(settings.map((row) => [row.formId, row]));

  return totals.map((row) => ({
    formId: row.formId,
    title: latestByForm.get(row.formId)?.formTitle ?? row.formId,
    revision: latestByForm.get(row.formId)?.formRevision ?? "",
    submissions: row._count._all,
    people: peopleByForm.get(row.formId) ?? 0,
    confirmedPeople: confirmedByForm.get(row.formId) ?? 0,
    lastReceivedAt: row._max.receivedAt ?? new Date(0),
    publicCount: settingByForm.get(row.formId)?.publicCount ?? false,
    goal: settingByForm.get(row.formId)?.goal ?? null,
    countConfirmedOnly:
      settingByForm.get(row.formId)?.countConfirmedOnly ?? false,
  }));
};

const compareForms = (
  a: FormSummary,
  b: FormSummary,
  { field, direction }: RecordSort<FormSortField>,
) => {
  const sign = direction === "asc" ? 1 : -1;
  switch (field) {
    case "title":
      return sign * a.title.localeCompare(b.title);
    case "submissions":
      return sign * (a.submissions - b.submissions);
    case "people":
      return sign * (a.people - b.people);
    default:
      return sign * (a.lastReceivedAt.getTime() - b.lastReceivedAt.getTime());
  }
};

/** The team's forms, searched, sorted and paged (a team has few forms). */
export const getFormsPage = async (
  teamId: string,
  viewer: Viewer,
  options: {
    query?: string;
    page: number;
    pageSize: number;
    sorts?: RecordSort<FormSortField>[];
  },
) => {
  const query = options.query?.trim().toLowerCase();
  const sorts = options.sorts?.length
    ? options.sorts
    : [{ field: "lastReceivedAt" as const, direction: "desc" as const }];
  const forms = (await getFormSummaries(teamId, viewer))
    .filter(
      (form) =>
        !query ||
        form.title.toLowerCase().includes(query) ||
        form.formId.toLowerCase().includes(query),
    )
    .sort((a, b) => {
      for (const sort of sorts) {
        const order = compareForms(a, b, sort);
        if (order !== 0) return order;
      }
      return a.formId.localeCompare(b.formId);
    });
  const start = (options.page - 1) * options.pageSize;
  return {
    data: forms.slice(start, start + options.pageSize),
    total: forms.length,
  };
};

/** One form's summary, or null when the user sees no submission of it. */
export const getForm = async (teamId: string, formId: string, viewer: Viewer) =>
  (await getFormSummaries(teamId, viewer, formId))[0] ?? null;

export const FORM_SUBMISSION_SORT_FIELDS = [
  "receivedAt",
  "submittedAt",
  "contact",
  "locale",
] as const;
export type FormSubmissionSortField =
  (typeof FORM_SUBMISSION_SORT_FIELDS)[number];

const submissionOrderStep = ({
  field,
  direction,
}: RecordSort<FormSubmissionSortField>): Prisma.FormSubmissionOrderByWithRelationInput => {
  switch (field) {
    case "contact":
      return { contact: { name: direction } };
    case "submittedAt":
    case "locale":
      return { [field]: direction };
    default:
      return { receivedAt: direction };
  }
};

export type FormSubmissionRow = {
  id: string;
  submissionId: string;
  contact: { id: string; name: string; email: string | null };
  locale: string;
  page: string | null;
  formRevision: string;
  submittedAt: Date;
  receivedAt: Date;
  answers: FormSubmissionAnswer[];
  confirmationRequested: boolean;
  confirmedAt: Date | null;
  verification: { status: string; issues: string[] } | null;
};

/** One form's submissions, newest first unless asked otherwise. */
export const getFormSubmissionsPage = async (
  teamId: string,
  formId: string,
  viewer: Viewer,
  options: {
    query?: string;
    page?: number;
    pageSize?: number;
    sorts?: RecordSort<FormSubmissionSortField>[];
  },
) => {
  const query = options.query?.trim();
  const where: Prisma.FormSubmissionWhereInput = {
    ...(await visibleSubmissionsWhere(teamId, viewer)),
    formId,
    ...(query
      ? {
          OR: [
            { contact: { name: { contains: query, mode: "insensitive" } } },
            {
              contact: {
                primaryEmail: { contains: query, mode: "insensitive" },
              },
            },
          ],
        }
      : {}),
  };
  const paged = options.page && options.pageSize;
  const [rows, total] = await Promise.all([
    prisma.formSubmission.findMany({
      where,
      orderBy: options.sorts?.length
        ? chainOrderBy(options.sorts, submissionOrderStep, { id: "asc" })
        : [{ receivedAt: "desc" }, { id: "asc" }],
      ...(paged
        ? {
            skip: ((options.page ?? 1) - 1) * (options.pageSize ?? 50),
            take: options.pageSize,
          }
        : {}),
      select: {
        id: true,
        submissionId: true,
        locale: true,
        page: true,
        formRevision: true,
        submittedAt: true,
        receivedAt: true,
        answers: true,
        confirmationRequested: true,
        confirmedAt: true,
        verification: true,
        contact: { select: { id: true, name: true, primaryEmail: true } },
      },
    }),
    prisma.formSubmission.count({ where }),
  ]);
  const data: FormSubmissionRow[] = rows.map(({ contact, ...row }) => ({
    ...row,
    answers: (row.answers ?? []) as FormSubmissionAnswer[],
    verification: row.verification as FormSubmissionRow["verification"],
    contact: {
      id: contact.id,
      name: contact.name,
      email: contact.primaryEmail,
    },
  }));
  return { data, total };
};

/**
 * Turns the form's public counter on or off and sets its goal. Only a form
 * the team has received can be set; the counter follows within a minute.
 */
export const updateFormSetting = async (
  teamId: string,
  formId: string,
  input: {
    publicCount?: boolean;
    goal?: number | null;
    countConfirmedOnly?: boolean;
  },
) => {
  const received = await prisma.formSubmission.findFirst({
    where: { teamId, formId },
    select: { id: true },
  });
  if (!received) return null;
  return prisma.formSetting.upsert({
    where: { teamId_formId: { teamId, formId } },
    create: { teamId, formId, ...input },
    update: input,
  });
};

/**
 * Every form with settings, and the number of unique people who sent it,
 * for publishing the public counters. Counts every submission, whoever may
 * see the contact: the number is public, the people are not.
 */
export const getFormCountRows = async (): Promise<FormCountRow[]> => {
  const settings = await prisma.formSetting.findMany({
    select: {
      teamId: true,
      formId: true,
      publicCount: true,
      goal: true,
      countConfirmedOnly: true,
    },
  });
  const shown = settings.filter((setting) => setting.publicCount);
  const counts = new Map<string, number>();
  if (shown.length) {
    const rows = await prisma.$queryRaw<
      Array<{
        teamId: string;
        formId: string;
        count: number;
        confirmed: number;
      }>
    >`
      SELECT "teamId", "formId",
        COUNT(DISTINCT "contactId")::int AS "count",
        COUNT(DISTINCT "contactId") FILTER (WHERE "confirmedAt" IS NOT NULL)::int AS "confirmed"
      FROM "FormSubmission"
      WHERE ("teamId", "formId") IN (${Prisma.join(
        shown.map(({ teamId, formId }) => Prisma.sql`(${teamId}, ${formId})`),
      )})
      GROUP BY "teamId", "formId"
    `;
    const confirmedOnly = new Set(
      shown
        .filter((setting) => setting.countConfirmedOnly)
        .map(({ teamId, formId }) => `${teamId}:${formId}`),
    );
    for (const row of rows) {
      const key = `${row.teamId}:${row.formId}`;
      counts.set(key, confirmedOnly.has(key) ? row.confirmed : row.count);
    }
  }
  return settings.map(({ countConfirmedOnly: _, ...setting }) => ({
    ...setting,
    count: counts.get(`${setting.teamId}:${setting.formId}`) ?? 0,
  }));
};
