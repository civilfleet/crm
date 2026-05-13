import { NextResponse } from "next/server";
import { handlePrismaError } from "@/lib/utils";
import { getFiles } from "@/services/file";

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const searchQuery = searchParams.get("query") || "";
    const teamId = searchParams.get("teamId") || "";
    const organizationId = searchParams.get("organizationId") || "";

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
    const message = handlePrismaError(e);
    return NextResponse.json({ error: message }, { status: 400 });
  }
}