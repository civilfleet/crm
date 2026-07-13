import { NextResponse } from "next/server";
import { z } from "zod";
import { handleApiError } from "@/lib/api-guard";
import { handlePrismaError } from "@/lib/utils";
import { setActivityInboxReadState } from "@/services/activity-inbox";
import { getActivityInboxAccess } from "../access";

const schema = z.object({ isRead: z.boolean() });

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ teamId: string; engagementId: string }> },
) {
  try {
    const { teamId, engagementId } = await params;
    const [access, body] = await Promise.all([
      getActivityInboxAccess(teamId),
      request.json(),
    ]);
    const { isRead } = schema.parse(body);
    await setActivityInboxReadState({ access, engagementId, isRead });
    return NextResponse.json({ data: { engagementId, isRead } });
  } catch (error) {
    const apiError = handleApiError(error);
    if (apiError) return apiError;
    const { message } = handlePrismaError(error);
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
