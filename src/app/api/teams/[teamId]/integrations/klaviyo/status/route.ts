import { NextResponse } from "next/server";
import { handleApiError, verifyTeamAccess } from "@/lib/api-guard";
import prisma from "@/lib/prisma";

/**
 * Whether the team's Klaviyo sync is on, for any team member (the settings
 * themselves are for team admins). The permanent-delete dialog uses it to say
 * what happens in Klaviyo.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ teamId: string }> },
) {
  try {
    const { teamId } = await params;
    await verifyTeamAccess(teamId, { requireModule: "CRM" });
    const integration = await prisma.integrationConnection.findFirst({
      where: { teamId, provider: "KLAVIYO", isEnabled: true },
      select: { id: true },
    });
    return NextResponse.json({ data: { enabled: Boolean(integration) } });
  } catch (error) {
    const apiError = handleApiError(error);
    if (apiError) return apiError;
    return NextResponse.json({ error: "Request failed" }, { status: 400 });
  }
}
