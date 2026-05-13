import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { handlePrismaError } from "@/lib/utils";
import {
  canUserAccessTeamOrOrgScope,
  getFileDownloadAudits,
} from "@/services/file";

export async function GET(request: Request) {
  try {
    const session = await auth();
    if (!session?.user?.userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const teamId = searchParams.get("teamId") || "";
    const organizationId = searchParams.get("organizationId") || "";

    if (!teamId && !organizationId) {
      return NextResponse.json(
        { error: "teamId or organizationId is required" },
        { status: 400 },
      );
    }

    const hasScopeAccess = await canUserAccessTeamOrOrgScope({
      userId: session.user.userId,
      teamId: teamId || undefined,
      organizationId: organizationId || undefined,
    });
    if (!hasScopeAccess) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const data = await getFileDownloadAudits({
      teamId: teamId || undefined,
      organizationId: organizationId || undefined,
      limit: 20,
    });

    return NextResponse.json({ data }, { status: 200 });
  } catch (error) {
    const handled = handlePrismaError(error);
    return NextResponse.json({ error: handled.message }, { status: 400 });
  }
}