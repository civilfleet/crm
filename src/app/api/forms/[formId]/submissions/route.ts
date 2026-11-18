import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import { handleApiError, verifyTeamAccess } from "@/lib/api-guard";
import { type RecordSort, readListRequest } from "@/lib/list-request";
import { deleteFormSubmissions } from "@/services/form-confirmations";
import {
  FORM_SUBMISSION_SORT_FIELDS,
  type FormSubmissionSortField,
  getFormSubmissionsPage,
} from "@/services/forms";
import { recordSystemLog } from "@/services/system-logs";
import { getTeamAdminAccess } from "@/services/teams/access";
import type { Roles } from "@/types";

type Context = { params: Promise<{ formId: string }> };

/** One form's submissions, for contacts the user may see (GET ?teamId=). */
export async function GET(request: NextRequest, { params }: Context) {
  try {
    const { formId } = await params;
    const { searchParams } = new URL(request.url);
    const teamId = searchParams.get("teamId");
    if (!teamId) {
      return NextResponse.json(
        { error: "teamId is required" },
        { status: 400 },
      );
    }
    const session = await verifyTeamAccess(teamId, { requireModule: "CRM" });
    const list = readListRequest(searchParams, {
      sort: FORM_SUBMISSION_SORT_FIELDS,
      fallback: { field: "receivedAt", direction: "desc" },
    });
    const { data, total } = await getFormSubmissionsPage(
      teamId,
      formId,
      {
        userId: session.user.userId,
        roles: (session.user.roles ?? []) as Roles[],
      },
      {
        query: searchParams.get("query") ?? "",
        page: list.page,
        pageSize: list.pageSize,
        sorts: list.sorts as RecordSort<FormSubmissionSortField>[],
      },
    );
    return NextResponse.json({
      data,
      total,
      page: list.page,
      pageSize: list.pageSize,
    });
  } catch (error) {
    const apiError = handleApiError(error);
    if (apiError) return apiError;
    return NextResponse.json(
      { error: "Submissions unavailable" },
      { status: 500 },
    );
  }
}

const deleteSchema = z
  .object({ ids: z.array(z.uuid()).min(1).max(100) })
  .strict();

/**
 * Deletes submissions of this form for good, with what they made
 * (DELETE ?teamId=, body {ids}). Team admins only; written to the team's
 * system log without the answers. docs/DATA_RULES.md, "Website forms".
 */
export async function DELETE(request: NextRequest, { params }: Context) {
  const { formId } = await params;
  const teamId = new URL(request.url).searchParams.get("teamId");
  if (!teamId) {
    return NextResponse.json({ error: "teamId is required" }, { status: 400 });
  }
  const session = await auth();
  if (!session?.user?.userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const access = await getTeamAdminAccess(
    session.user.userId,
    teamId,
    session.user.roles,
  );
  if (!access.allowed) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const parsed = deleteSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid selection" }, { status: 400 });
  }

  const result = await deleteFormSubmissions(teamId, formId, parsed.data.ids);
  const who = session.user.name ?? session.user.email ?? session.user.userId;
  await recordSystemLog({
    teamId,
    event: "form_submissions_deleted",
    source: "WEBSITE_FORMS",
    message: `${result.submissionsRemoved} submission(s) of form ${formId} deleted, ${result.contactsRemoved} contact(s) only they made removed (by ${who}).`,
    entityType: "Form",
    entityId: formId,
    metadata: { ...result, ids: parsed.data.ids, userId: session.user.userId },
  });
  return NextResponse.json({ data: result });
}
