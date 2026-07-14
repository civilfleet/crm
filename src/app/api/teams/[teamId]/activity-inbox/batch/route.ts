import { NextResponse } from "next/server";
import { z } from "zod";
import { handleApiError } from "@/lib/api-guard";
import { handlePrismaError } from "@/lib/utils";
import { applyActivityInboxBatchAction } from "@/services/activity-inbox";
import { getActivityInboxAccess } from "../access";

const schema = z.object({
  action: z.enum(["mark-unread", "dismiss"]),
  engagementIds: z.array(z.uuid()).min(1).max(100),
});

export async function POST(
  request: Request,
  { params }: { params: Promise<{ teamId: string }> },
) {
  try {
    const { teamId } = await params;
    const [access, body] = await Promise.all([
      getActivityInboxAccess(teamId),
      request.json(),
    ]);
    const { action, engagementIds } = schema.parse(body);
    await applyActivityInboxBatchAction({ access, engagementIds, action });
    return NextResponse.json({ data: { updated: engagementIds.length } });
  } catch (error) {
    const apiError = handleApiError(error);
    if (apiError) return apiError;
    const { message } = handlePrismaError(error);
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
