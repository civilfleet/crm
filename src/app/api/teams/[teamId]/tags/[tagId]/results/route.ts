import { type NextRequest, NextResponse } from "next/server";
import { handleApiError, verifyTeamAccess } from "@/lib/api-guard";
import { handlePrismaError } from "@/lib/utils";
import { getTagResults } from "@/services/tags";
import type { Roles, TagResultSection } from "@/types";

const sections = new Set<TagResultSection>([
  "contacts",
  "organizations",
  "lists",
  "interactions",
  "events",
  "files",
]);

export async function GET(
  request: NextRequest,
  {
    params,
  }: { params: Promise<{ teamId: string; tagId: string }> },
) {
  try {
    const { teamId, tagId } = await params;
    const session = await verifyTeamAccess(teamId, { requireModule: "CRM" });
    const userId = session.user.userId;
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const requestedSection = request.nextUrl.searchParams.get("section");
    const section = sections.has(requestedSection as TagResultSection)
      ? (requestedSection as TagResultSection)
      : undefined;
    const rawOffset = Number(request.nextUrl.searchParams.get("offset") ?? 0);
    const offset =
      Number.isSafeInteger(rawOffset) && rawOffset > 0 ? rawOffset : 0;
    const data = await getTagResults(
      { teamId, userId, roles: (session.user.roles ?? []) as Roles[] },
      tagId,
      20,
      section ? { [section]: offset } : {},
    );
    return NextResponse.json({ data });
  } catch (error) {
    const apiError = handleApiError(error);
    if (apiError) return apiError;
    const { message } = handlePrismaError(error);
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
