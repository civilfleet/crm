import { NextResponse } from "next/server";
import {
  isTagAttributeUpdate,
  updateTagAttribute,
} from "@/app/api/tag-attribute-update";
import { handleApiError, verifyTeamAccess } from "@/lib/api-guard";
import { type RecordSort, readList } from "@/lib/list-request";
import { handlePrismaError } from "@/lib/utils";
import {
  CONTACT_SORT_FIELDS,
  type ContactSortField,
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
    const deletedOnly = searchParams.get("deleted") === "true";
    // Lists page and sort; the trash always pages; other callers get every
    // contact.
    const list = readList(searchParams, {
      sort: CONTACT_SORT_FIELDS,
      paging: deletedOnly ? "always" : "optional",
      pageSize: 10,
    });

    if (!teamId) {
      return NextResponse.json(
        { error: "teamId is required" },
        { status: 400 },
      );
    }

    const session = await verifyTeamAccess(teamId, { requireModule: "CRM" });
    const userId = session.user.userId;

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

    const contactsResult = list
      ? await getTeamContacts(
          teamId,
          query || undefined,
          userId,
          filters,
          roles,
          {
            page: list.page,
            pageSize: list.pageSize,
            deletedOnly,
            sorts: list.sorts as RecordSort<ContactSortField>[],
          },
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
    const page = list?.page ?? 1;
    const pageSize = list?.pageSize ?? Math.max(total, 1);
    const totalPages = Math.max(Math.ceil(total / pageSize), 1);
    return NextResponse.json(
      { data: contacts, total, page, pageSize, totalPages },
      { status: 200 },
    );
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
    const validated = createContactSchema.parse(payload);
    const session = await verifyTeamAccess(validated.teamId, {
      requireModule: "CRM",
    });

    const userId = session?.user?.userId;
    const userName = session?.user?.name ?? undefined;

    const contact = await createContact(validated, userId, userName);

    return NextResponse.json({ data: contact }, { status: 201 });
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

export async function PATCH(req: Request) {
  try {
    const payload = await req.json();
    if (isTagAttributeUpdate(payload)) {
      const tags = await updateTagAttribute(payload, "CONTACT");
      return NextResponse.json({ data: { tags } }, { status: 200 });
    }
    const validated = updateContactSchema.parse(payload);
    const session = await verifyTeamAccess(validated.teamId, {
      requireModule: "CRM",
    });

    const userId = session?.user?.userId;
    const userName = session?.user?.name ?? undefined;

    const contact = await updateContact(
      validated,
      userId,
      userName,
      session?.user?.roles,
    );

    return NextResponse.json({ data: contact }, { status: 200 });
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
    const validated = deleteContactsSchema.parse(payload);
    const session = await verifyTeamAccess(validated.teamId, {
      requireModule: "CRM",
    });

    const count = await deleteContacts(
      validated.teamId,
      validated.ids,
      session.user.userId,
      (session.user.roles ?? []) as Roles[],
    );

    return NextResponse.json({ data: { count } }, { status: 200 });
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
