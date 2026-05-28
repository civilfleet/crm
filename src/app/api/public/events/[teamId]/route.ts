import { NextResponse } from "next/server";
import { handlePrismaError } from "@/lib/utils";
import { getPublicEvents } from "@/services/events";

export async function GET(
  req: Request,
  { params }: { params: Promise<{ teamId: string }> },
) {
  try {
    const { teamId } = await params;
    const { searchParams } = new URL(req.url);
    const query = searchParams.get("query") || undefined;
    const eventTypeId = searchParams.get("eventTypeId") || undefined;
    const from = searchParams.get("from") || undefined;
    const to = searchParams.get("to") || undefined;
    const state = searchParams.get("state") || undefined;
    const isOnlineParam = searchParams.get("isOnline");
    const postalCode = searchParams.get("postalCode") || undefined;
    const countryCode = searchParams.get("countryCode") || undefined;
    const radiusKmParam = searchParams.get("radiusKm");
    const pageParam = searchParams.get("page");
    const pageSizeParam = searchParams.get("pageSize");

    if (!teamId) {
      return NextResponse.json(
        { error: "teamId is required" },
        { status: 400 },
      );
    }

    const isOnline =
      isOnlineParam === null || isOnlineParam === "all"
        ? undefined
        : isOnlineParam === "true";

    const radiusKm = radiusKmParam ? Number(radiusKmParam) : undefined;
    const page = pageParam ? Number(pageParam) : 1;
    const pageSize = pageSizeParam ? Number(pageSizeParam) : 12;

    const result = await getPublicEvents(
      teamId,
      {
        query,
        eventTypeId,
        from,
        to,
        state,
        isOnline,
        postalCode,
        countryCode,
        radiusKm,
      },
      Number.isFinite(page) ? page : 1,
      Number.isFinite(pageSize) ? pageSize : 12,
    );

    const totalPages = result.pageSize
      ? Math.ceil(result.total / result.pageSize)
      : 0;

    return NextResponse.json(
      {
        data: result.items,
        meta: {
          total: result.total,
          page: result.page,
          pageSize: result.pageSize,
          totalPages,
        },
      },
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
