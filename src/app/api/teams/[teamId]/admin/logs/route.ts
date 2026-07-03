import { NextResponse } from "next/server";
import { z } from "zod";
import { handleApiError, verifyTeamAccess } from "@/lib/api-guard";
import { handlePrismaError } from "@/lib/utils";
import { listSystemLogs } from "@/services/system-logs";

const querySchema = z.object({
  level: z.enum(["INFO", "WARN", "ERROR"]).optional(),
  source: z.string().trim().max(64).optional(),
  query: z.string().trim().max(255).optional(),
  limit: z.coerce.number().int().positive().max(250).default(100),
});

export async function GET(
  request: Request,
  { params }: { params: Promise<{ teamId: string }> },
) {
  try {
    const { teamId } = await params;
    await verifyTeamAccess(teamId, { requireAdmin: true });

    const { searchParams } = new URL(request.url);
    const validated = querySchema.parse({
      level: searchParams.get("level") || undefined,
      source: searchParams.get("source") || undefined,
      query: searchParams.get("query") || undefined,
      limit: searchParams.get("limit") || undefined,
    });

    const logs = await listSystemLogs({
      teamId,
      ...validated,
    });

    return NextResponse.json({ data: logs }, { status: 200 });
  } catch (error) {
    const apiError = handleApiError(error);
    if (apiError) return apiError;

    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Validation failed", details: error.issues },
        { status: 400 },
      );
    }

    const { message } = handlePrismaError(error);
    return NextResponse.json(
      { error: message },
      { status: 400, statusText: message },
    );
  }
}
