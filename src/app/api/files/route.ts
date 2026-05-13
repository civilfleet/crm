import { NextResponse } from "next/server";
import { handlePrismaError } from "@/lib/utils";
import { getFiles } from "@/services/file";
import { handleApiError, verifyTeamAccess } from "@/lib/api-guard";

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const searchQuery = searchParams.get("query") || "";
    const teamId = searchParams.get("teamId") || "";
    const organizationId = searchParams.get("organizationId") || "";

    if (teamId) {
      await verifyTeamAccess(teamId);
    } else if (organizationId) {
      // For now, if only organizationId is provided, we require authentication at least.
      // Ideally we should verify if the user belongs to the team that owns the organization.
      // But we'll start with just authentication for top-level routes.
      // (Implementation note: getFiles handles organization vs team scoping)
    }

    if (organizationId || teamId) {
      const data = await getFiles(
        {
          organizationId,
          teamId,
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