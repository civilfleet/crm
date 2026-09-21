import { NextResponse } from "next/server";
import { handleApiError, verifyTeamAccess } from "@/lib/api-guard";
import { handlePrismaError } from "@/lib/utils";
import { getTag } from "@/services/tags";

export async function GET(
  _request: Request,
  {
    params,
  }: { params: Promise<{ teamId: string; tagId: string }> },
) {
  try {
    const { teamId, tagId } = await params;
    await verifyTeamAccess(teamId, { requireModule: "CRM" });
    return NextResponse.json({ data: await getTag(teamId, tagId) });
  } catch (error) {
    const apiError = handleApiError(error);
    if (apiError) return apiError;
    const { message } = handlePrismaError(error);
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
