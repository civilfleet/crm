import { NextResponse } from "next/server";
import {
  getAuthenticatedSession,
  handleApiError,
  verifyTeamAccess,
} from "@/lib/api-guard";
import { handlePrismaError } from "@/lib/utils";
import {
  canUserAccessContactScope,
  canUserAccessTeamOrOrgScope,
  getFiles,
} from "@/services/file";

export async function GET(req: Request) {
  try {
    const session = await getAuthenticatedSession();
    const userId = session.user.userId;
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const searchQuery = searchParams.get("query") || "";
    const teamId = searchParams.get("teamId") || "";
    const organizationId = searchParams.get("organizationId") || "";
    const contactId = searchParams.get("contactId") || "";

    if (teamId) {
      await verifyTeamAccess(teamId);
    } else if (organizationId) {
      const hasAccess = await canUserAccessTeamOrOrgScope({
        userId,
        organizationId,
      });
      if (!hasAccess) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }
    } else if (contactId) {
      const hasAccess = await canUserAccessContactScope({
        userId,
        contactId,
      });
      if (!hasAccess) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }
    }

    if (organizationId || teamId || contactId) {
      const data = await getFiles(
        {
          organizationId,
          teamId,
          contactId,
        },
        searchQuery,
      );
      return NextResponse.json(
        { data },

        { status: 201 },
      );
    }

    return NextResponse.json(
      { data: [] },

      { status: 201 },
    );
  } catch (e) {
    const apiError = handleApiError(e);
    if (apiError) return apiError;

    const message = handlePrismaError(e);
    return NextResponse.json({ error: message }, { status: 400 });
  }
}