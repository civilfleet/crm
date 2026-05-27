import { NextResponse } from "next/server";
import { handleApiError, verifyTeamAccess } from "@/lib/api-guard";
import { handlePrismaError } from "@/lib/utils";
import { createEvent, deleteEvents, getTeamEvents } from "@/services/events";
import { createEventSchema, deleteEventsSchema } from "@/validations/events";

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const teamId = searchParams.get("teamId");
    const query = searchParams.get("query") || "";
    const eventTypeId = searchParams.get("eventTypeId");
    const from = searchParams.get("from");
    const to = searchParams.get("to");
    const state = searchParams.get("state");

    if (!teamId) {
      return NextResponse.json(
        { error: "teamId is required" },
        { status: 400 },
      );
    }

    await verifyTeamAccess(teamId, { requireModule: "CRM" });

    const events = await getTeamEvents(teamId, query || undefined, {
      eventTypeId: eventTypeId || undefined,
      from: from || undefined,
      to: to || undefined,
      state: state || undefined,
    });
    return NextResponse.json({ data: events }, { status: 200 });
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

export async function POST(req: Request) {
  try {
    const payload = await req.json();
    const validated = createEventSchema.parse(payload);
    await verifyTeamAccess(validated.teamId, { requireModule: "CRM" });

    const event = await createEvent(validated);

    return NextResponse.json({ data: event }, { status: 201 });
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

export async function DELETE(req: Request) {
  try {
    const payload = await req.json();
    const validated = deleteEventsSchema.parse(payload);
    await verifyTeamAccess(validated.teamId, { requireModule: "CRM" });

    await deleteEvents(validated.teamId, validated.ids);

    return NextResponse.json({ data: "success" }, { status: 200 });
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