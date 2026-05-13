import { NextResponse } from "next/server";
import { auth } from "@/auth";
import prisma from "@/lib/prisma";
import { handlePrismaError } from "@/lib/utils";
import {
  createContact,
  deleteContacts,
  getTeamContacts,
  updateContact,
} from "@/services/contacts";
import type { Roles } from "@/types";
import type { ContactFilterInput } from "@/validations/contacts";
import {
  contactFiltersSchema,
  createContactSchema,
  deleteContactsSchema,
  updateContactSchema,
} from "@/validations/contacts";

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const teamId = searchParams.get("teamId");
    const query = searchParams.get("query") || "";
    const filtersParam = searchParams.get("filters");
    const hasPageParam = searchParams.has("page");
    const hasPageSizeParam = searchParams.has("pageSize");
    const hasPagination = hasPageParam || hasPageSizeParam;
    const pageParam = Number(searchParams.get("page") || "1");
    const pageSizeParam = Number(searchParams.get("pageSize") || "10");
    const page =
      Number.isFinite(pageParam) && pageParam > 0 ? Math.floor(pageParam) : 1;
    const pageSize =
      Number.isFinite(pageSizeParam) && pageSizeParam > 0
        ? Math.min(Math.floor(pageSizeParam), 100)
        : 10;

    if (!teamId) {
      return NextResponse.json(
        { error: "teamId is required" },
        { status: 400 },
      );
    }

    const session = await auth();
    let userId = session?.user?.userId ?? undefined;

    if (!userId && session?.user?.email) {
      const user = await prisma.user.findUnique({
        where: { email: session.user.email },
        select: { id: true },
      });
      userId = user?.id;
    }

    let filters: ContactFilterInput[] | undefined;
    if (filtersParam) {
      try {
        const parsed = JSON.parse(filtersParam);
        filters = contactFiltersSchema.parse(parsed);
      } catch (_error) {
        return NextResponse.json(
          { error: "Invalid filters parameter" },
          { status: 400 },
        );
      }
    }

    const roles = (session?.user?.roles ?? []) as Roles[];

    const contactsResult = hasPagination
      ? await getTeamContacts(
          teamId,
          query || undefined,
          userId,
          filters,
          roles,
          { page, pageSize },
        )
      : await getTeamContacts(
          teamId,
          query || undefined,
          userId,
          filters,
          roles,
        );
    const contacts = Array.isArray(contactsResult)
      ? contactsResult
      : contactsResult.data;
    const total = Array.isArray(contactsResult)
      ? contactsResult.length
      : contactsResult.total;
    const totalPages = pageSize > 0 ? Math.ceil(total / pageSize) : 1;
    return NextResponse.json(
      { data: contacts, total, page, pageSize, totalPages },
      { status: 200 },
    );
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
    const session = await auth();
    const payload = await req.json();
    const validated = createContactSchema.parse(payload);

    const userId = session?.user?.userId;
    const userName = session?.user?.name ?? undefined;

    const contact = await createContact(validated, userId, userName);

    return NextResponse.json({ data: contact }, { status: 201 });
  } catch (e) {
    const { message } = handlePrismaError(e);
    return NextResponse.json(
      { error: message },
      { status: 400, statusText: message },
    );
  }
}

export async function PATCH(req: Request) {
  try {
    const session = await auth();
    const payload = await req.json();
    const validated = updateContactSchema.parse(payload);

    const userId = session?.user?.userId;
    const userName = session?.user?.name ?? undefined;

    const contact = await updateContact(validated, userId, userName);

    return NextResponse.json({ data: contact }, { status: 200 });
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
    const validated = deleteContactsSchema.parse(payload);

    await deleteContacts(validated.teamId, validated.ids);

    return NextResponse.json({ data: "success" }, { status: 200 });
  } catch (e) {
    const { message } = handlePrismaError(e);
    return NextResponse.json(
      { error: message },
      { status: 400, statusText: message },
    );
  }
}