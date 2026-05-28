import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { handlePrismaError } from "@/lib/utils";
import { addUsersToGroup, removeUsersFromGroup } from "@/services/groups";
import { manageGroupUsersSchema } from "@/validations/groups";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const body = await request.json();
    const validated = manageGroupUsersSchema.parse({ ...body, groupId: id });

    await addUsersToGroup(validated);

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

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const body = await request.json();
    const validated = manageGroupUsersSchema.parse({ ...body, groupId: id });

    await removeUsersFromGroup(validated);

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
