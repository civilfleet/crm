import { NextResponse } from "next/server";
import { handlePrismaError } from "@/lib/utils";
import { getTeamsUsers } from "@/services/users";
import { handleApiError, verifyTeamAccess } from "@/lib/api-guard";

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const teamId = searchParams.get("teamId");

    if (!teamId) {
      return NextResponse.json(
        { error: "teamId is required" },
        { status: 400 },
      );
    }

    await verifyTeamAccess(teamId);

    const response = await getTeamsUsers(teamId);

    return NextResponse.json(
      {
        data: response,
      },
      { status: 200 },
    );
  } catch (e) {
    const apiError = handleApiError(e);
    if (apiError) return apiError;

    const { message } = handlePrismaError(e);
    return NextResponse.json(
      { error: message },
      { status: 400, statusText: message },
    );
  }
}