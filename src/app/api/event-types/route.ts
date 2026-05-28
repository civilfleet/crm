import { NextResponse } from "next/server";
import { handlePrismaError } from "@/lib/utils";
import {
  createEventType,
  deleteEventTypes,
  getTeamEventTypes,
} from "@/services/event-types";
import {
  createEventTypeSchema,
  deleteEventTypesSchema,
} from "@/validations/event-types";

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

    const types = await getTeamEventTypes(teamId);
    return NextResponse.json({ data: types }, { status: 200 });
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
    const validated = createEventTypeSchema.parse(payload);

    const type = await createEventType(validated);

    return NextResponse.json({ data: type }, { status: 201 });
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
    const validated = deleteEventTypesSchema.parse(payload);

    await deleteEventTypes(validated.teamId, validated.ids);

    return NextResponse.json({ data: "success" }, { status: 200 });
  } catch (e) {
    const { message } = handlePrismaError(e);
    return NextResponse.json(
      { error: message },
      { status: 400, statusText: message },
    );
  }
}
