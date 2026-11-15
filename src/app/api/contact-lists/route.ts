import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import { handleApiError, verifyTeamAccess } from "@/lib/api-guard";
import { type RecordSort, readList } from "@/lib/list-request";
import { handlePrismaError } from "@/lib/utils";
import {
  CONTACT_LIST_SORT_FIELDS,
  type ContactListSortField,
  createContactList,
  deleteContactLists,
  getTeamContactLists,
  getTeamContactListsPage,
} from "@/services/contact-lists";
import { ContactListType, type Roles } from "@/types";
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
    await verifyTeamAccess(teamId, { requireModule: "CRM" });

    const roles = (session.user.roles ?? []) as Roles[];
    // The Lists screen pages and sorts; pickers get every list.
    const list = readList(searchParams, {
      sort: CONTACT_LIST_SORT_FIELDS,
      fallback: { field: "updatedAt", direction: "desc" },
      paging: "optional",
    });
    if (list) {
      const listTypes: string[] = Object.values(ContactListType);
      const { data, total } = await getTeamContactListsPage(
        teamId,
        session.user.userId,
        roles,
        {
          query: searchParams.get("query") || "",
          types: (searchParams.get("types") || "")
            .split(",")
            .filter((type): type is ContactListType =>
              listTypes.includes(type),
            ),
        },
        {
          page: list.page,
          pageSize: list.pageSize,
          sort: (list.sort ?? {
            field: "updatedAt",
            direction: "desc",
          }) as RecordSort<ContactListSortField>,
        },
      );
      return NextResponse.json(
        { data, total, page: list.page, pageSize: list.pageSize },
        { status: 200 },
      );
    }

    const lists = await getTeamContactLists(teamId, session.user.userId, roles);

    return NextResponse.json({ data: lists }, { status: 200 });
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

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const validated = createContactListSchema.parse(body);
    await verifyTeamAccess(validated.teamId, { requireModule: "CRM" });

    const list = await createContactList(validated);

    return NextResponse.json({ data: list }, { status: 201 });
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

export async function DELETE(request: NextRequest) {
  try {
    const body = await request.json();
    const validated = deleteContactListsSchema.parse(body);
    await verifyTeamAccess(validated.teamId, { requireModule: "CRM" });

    await deleteContactLists(validated.teamId, validated.ids);

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
