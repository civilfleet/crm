import { NextResponse } from "next/server";
import { handlePrismaError } from "@/lib/utils";
import {
  createEventRole,
  deleteEventRoles,
  getTeamEventRoles,
} from "@/services/event-roles";
import {
  createEventRoleSchema,
  deleteEventRolesSchema,
} from "@/validations/event-roles";

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

    const roles = await getTeamEventRoles(teamId);
    return NextResponse.json({ data: roles }, { status: 200 });
  } catch (e) {
    const { message } = handlePrismaError(e);
    return NextResponse.json(
      { error: message },
      { status: 400, statusText: message },
    );
  }
}

export async function POST(req: Request) {
  try {
    const payload = await req.json();
    const validated = createEventRoleSchema.parse(payload);

    const role = await createEventRole(validated);

    return NextResponse.json({ data: role }, { status: 201 });
  } catch (e) {
    const { message } = handlePrismaError(e);
    return NextResponse.json(
      { error: message },
      { status: 400, statusText: message },
    );
  }
}

export async function DELETE(req: Request) {
  try {
    const payload = await req.json();
    const validated = deleteEventRolesSchema.parse(payload);

    await deleteEventRoles(validated.teamId, validated.ids);

    return NextResponse.json({ data: "success" }, { status: 200 });
  } catch (e) {
    const { message } = handlePrismaError(e);
    return NextResponse.json(
      { error: message },
      { status: 400, statusText: message },
    );
  }
}
