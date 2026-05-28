import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { handleApiError, verifyTeamAccess } from "@/lib/api-guard";
import { handlePrismaError } from "@/lib/utils";
import { createGroup, deleteGroups, getTeamGroups } from "@/services/groups";
import { createGroupSchema, deleteGroupsSchema } from "@/validations/groups";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const teamId = searchParams.get("teamId");

    if (!teamId) {
      return NextResponse.json(
        { error: "teamId is required" },
        { status: 400 },
      );
    }

    await verifyTeamAccess(teamId);

    const groups = await getTeamGroups(teamId);

    return NextResponse.json({ data: groups }, { status: 200 });
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

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const validated = createGroupSchema.parse(body);
    await verifyTeamAccess(validated.teamId, { requireAdmin: true });

    const group = await createGroup(validated);

    return NextResponse.json({ data: group }, { status: 201 });
  } catch (e) {
    const apiError = handleApiError(e);
    if (apiError) return apiError;

    if (e instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Validation failed", details: e.issues },
        { status: 400 },
      );
    }

    const { message } = handlePrismaError(e);
    return NextResponse.json(
      { error: message },
      { status: 400, statusText: message },
    );
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const body = await request.json();
    const validated = deleteGroupsSchema.parse(body);
    await verifyTeamAccess(validated.teamId, { requireAdmin: true });

    await deleteGroups(validated.teamId, validated.ids);

    return NextResponse.json({ data: "success" }, { status: 200 });
  } catch (e) {
    const apiError = handleApiError(e);
    if (apiError) return apiError;

    if (e instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Validation failed", details: e.issues },
        { status: 400 },
      );
    }

    const { message } = handlePrismaError(e);
    return NextResponse.json(
      { error: message },
      { status: 400, statusText: message },
    );
  }
}