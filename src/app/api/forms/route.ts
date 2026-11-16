import { type NextRequest, NextResponse } from "next/server";
import { handleApiError, verifyTeamAccess } from "@/lib/api-guard";
import { type RecordSort, readListRequest } from "@/lib/list-request";
import {
  FORM_SORT_FIELDS,
  type FormSortField,
  getFormsPage,
} from "@/services/forms";
import type { Roles } from "@/types";

/** The team's website forms, with their counts (GET ?teamId=). */
export async function GET(request: NextRequest) {
  try {
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
      sort: FORM_SORT_FIELDS,
      fallback: { field: "lastReceivedAt", direction: "desc" },
    });
    const { data, total } = await getFormsPage(
      teamId,
      {
        userId: session.user.userId,
        roles: (session.user.roles ?? []) as Roles[],
      },
      {
        query: searchParams.get("query") ?? "",
        page: list.page,
        pageSize: list.pageSize,
        sorts: list.sorts as RecordSort<FormSortField>[],
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
    return NextResponse.json({ error: "Forms unavailable" }, { status: 500 });
  }
}
