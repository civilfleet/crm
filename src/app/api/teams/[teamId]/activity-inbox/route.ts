import { NextResponse } from "next/server";
import { handleApiError } from "@/lib/api-guard";
import { handlePrismaError } from "@/lib/utils";
import { getActivityInbox } from "@/services/activity-inbox";
import { EngagementDirection, EngagementSource } from "@/types";
import { getActivityInboxAccess } from "./access";

const parseEnum = <T extends string>(value: string | null, values: T[]) =>
  value && values.includes(value as T) ? (value as T) : undefined;

export async function GET(
  request: Request,
  { params }: { params: Promise<{ teamId: string }> },
) {
  try {
    const { teamId } = await params;
    const access = await getActivityInboxAccess(teamId);
    const { searchParams } = new URL(request.url);
    const rawPage = Number(searchParams.get("page") ?? "1");
    const rawPageSize = Number(searchParams.get("pageSize") ?? "25");
    const page = Number.isFinite(rawPage)
      ? Math.max(1, Math.floor(rawPage))
      : 1;
    const pageSize = Number.isFinite(rawPageSize)
      ? Math.min(100, Math.max(1, Math.floor(rawPageSize)))
      : 25;
    const result = await getActivityInbox(access, {
      status: searchParams.get("status") === "all" ? "all" : "unread",
      page,
      pageSize,
      source: parseEnum(
        searchParams.get("source"),
        Object.values(EngagementSource),
      ),
      direction: parseEnum(
        searchParams.get("direction"),
        Object.values(EngagementDirection),
      ),
      query: searchParams.get("query") ?? undefined,
    });
    return NextResponse.json({ data: result });
  } catch (error) {
    const apiError = handleApiError(error);
    if (apiError) return apiError;
    const { message } = handlePrismaError(error);
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
