import { type NextRequest, NextResponse } from "next/server";
import { handleApiError, verifyTeamAccess } from "@/lib/api-guard";
import { readListRequest } from "@/lib/list-request";
import { getPendingProposals } from "@/services/contact-proposals";
import type { Roles } from "@/types";

/** Pending proposed changes (GET ?teamId=[&contactId=][&page=&pageSize=]). */
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
    const contactId = searchParams.get("contactId") ?? undefined;
    const list = readListRequest(searchParams, { sort: [] as const });
    const { data, total } = await getPendingProposals(
      teamId,
      {
        userId: session.user.userId,
        roles: (session.user.roles ?? []) as Roles[],
      },
      contactId ? { contactId } : { page: list.page, pageSize: list.pageSize },
    );
    return NextResponse.json({ data, total });
  } catch (error) {
    const apiError = handleApiError(error);
    if (apiError) return apiError;
    return NextResponse.json(
      { error: "Proposed changes unavailable" },
      { status: 500 },
    );
  }
}
