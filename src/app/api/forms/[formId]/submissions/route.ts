import { type NextRequest, NextResponse } from "next/server";
import { handleApiError, verifyTeamAccess } from "@/lib/api-guard";
import { type RecordSort, readListRequest } from "@/lib/list-request";
import {
  FORM_SUBMISSION_SORT_FIELDS,
  type FormSubmissionSortField,
  getFormSubmissionsPage,
} from "@/services/forms";
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
