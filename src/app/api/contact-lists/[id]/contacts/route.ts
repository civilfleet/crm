import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { ApiError, handleApiError, verifyTeamAccess } from "@/lib/api-guard";
import prisma from "@/lib/prisma";
import { handlePrismaError } from "@/lib/utils";
import {
  addContactsToList,
  removeContactsFromList,
} from "@/services/contact-lists";
import {
  addContactsToListSchema,
  removeContactsFromListSchema,
} from "@/validations/contact-lists";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const list = await prisma.contactList.findUnique({
      where: { id },
      select: { teamId: true },
    });
    if (!list) throw new ApiError(404, "Contact list not found");
    await verifyTeamAccess(list.teamId, { requireModule: "CRM" });
    const body = await request.json();
    const validated = addContactsToListSchema.parse({ ...body, listId: id });

    await addContactsToList(validated);

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

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const list = await prisma.contactList.findUnique({
      where: { id },
      select: { teamId: true },
    });
    if (!list) throw new ApiError(404, "Contact list not found");
    await verifyTeamAccess(list.teamId, { requireModule: "CRM" });
    const body = await request.json();
    const validated = removeContactsFromListSchema.parse({
      ...body,
      listId: id,
    });

    await removeContactsFromList(validated);

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
