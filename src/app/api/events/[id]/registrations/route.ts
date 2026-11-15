import { NextResponse } from "next/server";
import { ApiError, handleApiError, verifyTeamAccess } from "@/lib/api-guard";
import { type RecordSort, readListRequest } from "@/lib/list-request";
import {
  EVENT_REGISTRATION_SORT_FIELDS,
  type EventRegistrationSortField,
  getEventRegistrationsPage,
} from "@/services/events";

/** One page of an event's registrations, for the event page. */
export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const { searchParams } = new URL(req.url);
    const teamId = searchParams.get("teamId");
    if (!teamId) {
      throw new ApiError(400, "teamId is required");
    }
    await verifyTeamAccess(teamId, { requireModule: "CRM" });

    const list = readListRequest(searchParams, {
      sort: EVENT_REGISTRATION_SORT_FIELDS,
      fallback: { field: "createdAt", direction: "desc" },
      pageSize: 10,
    });
    const { data, total } = await getEventRegistrationsPage(
      id,
      teamId,
      searchParams.get("query") || "",
      {
        page: list.page,
        pageSize: list.pageSize,
        sort: (list.sort ?? {
          field: "createdAt",
          direction: "desc",
        }) as RecordSort<EventRegistrationSortField>,
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
    const message =
      error instanceof Error && error.message === "Event not found"
        ? error.message
        : "Could not load the registrations";
    return NextResponse.json(
      { error: message },
      { status: message === "Event not found" ? 404 : 500 },
    );
  }
}
