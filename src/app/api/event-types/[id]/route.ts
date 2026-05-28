import { NextResponse } from "next/server";
import { handlePrismaError } from "@/lib/utils";
import { getEventTypeById, updateEventType } from "@/services/event-types";
import { updateEventTypeSchema } from "@/validations/event-types";

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

    const type = await getEventTypeById(id, teamId);

    if (!type) {
      return NextResponse.json(
        { error: "Event type not found" },
        { status: 404 },
      );
    }

    return NextResponse.json({ data: type }, { status: 200 });
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
    const validated = updateEventTypeSchema.parse({ ...payload, id });

    const type = await updateEventType(validated);

    return NextResponse.json({ data: type }, { status: 200 });
  } catch (e) {
    const { message } = handlePrismaError(e);
    return NextResponse.json(
      { error: message },
      { status: 400, statusText: message },
    );
  }
}
