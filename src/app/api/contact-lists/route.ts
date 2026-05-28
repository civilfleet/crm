import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import { handlePrismaError } from "@/lib/utils";
import {
  createContactList,
  deleteContactLists,
  getTeamContactLists,
} from "@/services/contact-lists";
import type { Roles } from "@/types";
import {
  createContactListSchema,
  deleteContactListsSchema,
} from "@/validations/contact-lists";

export async function GET(request: NextRequest) {
  try {
    const session = await auth();

    if (!session?.user?.userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const teamId = searchParams.get("teamId");

    if (!teamId) {
      return NextResponse.json(
        { error: "teamId is required" },
        { status: 400 },
      );
    }

    const roles = (session.user.roles ?? []) as Roles[];
    const lists = await getTeamContactLists(teamId, session.user.userId, roles);

    return NextResponse.json({ data: lists }, { status: 200 });
  } catch (e) {
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
    const validated = createContactListSchema.parse(body);

    const list = await createContactList(validated);

    return NextResponse.json({ data: list }, { status: 201 });
  } catch (e) {
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
    const validated = deleteContactListsSchema.parse(body);

    await deleteContactLists(validated.teamId, validated.ids);

    return NextResponse.json({ data: "success" }, { status: 200 });
  } catch (e) {
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
