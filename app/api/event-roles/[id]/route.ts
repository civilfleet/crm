import { NextResponse } from "next/server";
import { handlePrismaError } from "@/lib/utils";
import { getEventRoleById, updateEventRole } from "@/services/event-roles";
import { updateEventRoleSchema } from "@/validations/eventRoles";

interface RouteParams {
  params: Promise<{
    id: string;
  }>;
}

export async function GET(req: Request, { params }: RouteParams) {
  try {
    const { id } = await params;
    const { searchParams } = new URL(req.url);
    const teamId = searchParams.get("teamId");

    if (!teamId) {
      return NextResponse.json(
        { error: "teamId is required" },
        { status: 400 },
      );
    }

    const role = await getEventRoleById(id, teamId);

    if (!role) {
      return NextResponse.json(
        { error: "Event role not found" },
        { status: 404 },
      );
    }

    return NextResponse.json({ data: role }, { status: 200 });
  } catch (e) {
    const { message } = handlePrismaError(e);
    return NextResponse.json(
      { error: message },
      { status: 400, statusText: message },
    );
  }
}

export async function PUT(req: Request, { params }: RouteParams) {
  try {
    const { id } = await params;
    const payload = await req.json();
    const validated = updateEventRoleSchema.parse({ ...payload, id });

    const role = await updateEventRole(validated);

    return NextResponse.json({ data: role }, { status: 200 });
  } catch (e) {
    const { message } = handlePrismaError(e);
    return NextResponse.json(
      { error: message },
      { status: 400, statusText: message },
    );
  }
}