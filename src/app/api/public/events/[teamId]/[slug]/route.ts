import { NextResponse } from "next/server";
import { handlePrismaError } from "@/lib/utils";
import { getPublicEventBySlug } from "@/services/events";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ teamId: string; slug: string }> },
) {
  try {
    const { teamId, slug } = await params;

    const event = await getPublicEventBySlug(teamId, slug);

    if (!event) {
      return NextResponse.json({ error: "Event not found" }, { status: 404 });
    }

    return NextResponse.json({ data: event }, { status: 200 });
  } catch (e) {
    const { message } = handlePrismaError(e);
    return NextResponse.json(
      { error: message },
      { status: 400, statusText: message },
    );
  }
}
