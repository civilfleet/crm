import { NextResponse } from "next/server";
import { handleApiError } from "@/lib/api-guard";
import { handlePrismaError } from "@/lib/utils";
import { getActivityInboxUnreadCount } from "@/services/activity-inbox";
import { getActivityInboxAccess } from "../access";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ teamId: string }> },
) {
  try {
    const { teamId } = await params;
    const access = await getActivityInboxAccess(teamId);
    const count = await getActivityInboxUnreadCount(access);
    return NextResponse.json({ data: { count } });
  } catch (error) {
    const apiError = handleApiError(error);
    if (apiError) return apiError;
    const { message } = handlePrismaError(error);
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
