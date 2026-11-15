import { NextResponse } from "next/server";
import {
  getAuthenticatedSession,
  handleApiError,
  verifyTeamAccess,
} from "@/lib/api-guard";
import { type RecordSort, readList } from "@/lib/list-request";
import { handlePrismaError } from "@/lib/utils";
import {
  canUserAccessContactScope,
  canUserAccessTeamOrOrgScope,
  FILE_SORT_FIELDS,
  type FileSortField,
  getFiles,
  getFilesPage,
} from "@/services/file";

export async function GET(req: Request) {
  try {
    const session = await getAuthenticatedSession();
    const userId = session.user.userId;
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const searchQuery = searchParams.get("query") || "";
    const teamId = searchParams.get("teamId") || "";
    const organizationId = searchParams.get("organizationId") || "";
    const contactId = searchParams.get("contactId") || "";
    const includeContactFiles =
      searchParams.get("includeContactFiles") === "true";

    if (teamId) {
      await verifyTeamAccess(teamId);
    } else if (organizationId) {
      const hasAccess = await canUserAccessTeamOrOrgScope({
        userId,
        organizationId,
      });
      if (!hasAccess) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }
    } else if (contactId) {
      const hasAccess = await canUserAccessContactScope({
        userId,
        contactId,
      });
      if (!hasAccess) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }
    }

    if (organizationId || teamId || contactId) {
      const scope = { organizationId, teamId, contactId, includeContactFiles };
      const types = (searchParams.get("types") || "")
        .split(",")
        .map((type) => type.trim())
        .filter(Boolean);
      // The Files lists page and sort; other callers get every file.
      const list = readList(searchParams, {
        sort: FILE_SORT_FIELDS,
        fallback: { field: "createdAt", direction: "desc" },
        paging: "optional",
      });
      if (list) {
        const result = await getFilesPage(scope, searchQuery, {
          page: list.page,
          pageSize: list.pageSize,
          sort: (list.sort ?? {
            field: "createdAt",
            direction: "desc",
          }) as RecordSort<FileSortField>,
          types,
        });
        return NextResponse.json(
          { ...result, page: list.page, pageSize: list.pageSize },
          { status: 201 },
        );
      }
      const data = await getFiles(scope, searchQuery, { types });
      return NextResponse.json(
        { data },

        { status: 201 },
      );
    }

    return NextResponse.json(
      { data: [] },

      { status: 201 },
    );
  } catch (e) {
    const apiError = handleApiError(e);
    if (apiError) return apiError;

    const message = handlePrismaError(e);
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
