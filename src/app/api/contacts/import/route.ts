import { NextResponse } from "next/server";
import { handleApiError, verifyTeamAccess } from "@/lib/api-guard";
import { handlePrismaError } from "@/lib/utils";
import { importContactsFromCsv } from "@/services/contacts";

export async function POST(req: Request) {
  try {
    const formData = await req.formData();
    const teamId = formData.get("teamId");
    const file = formData.get("file");
    const rawColumnMapping = formData.get("columnMapping");

    if (typeof teamId !== "string" || !teamId) {
      return NextResponse.json(
        { error: "teamId is required" },
        { status: 400 },
      );
    }

    if (!(file instanceof File)) {
      return NextResponse.json(
        { error: "CSV file is required" },
        { status: 400 },
      );
    }

    if (file.size > 1024 * 1024) {
      return NextResponse.json(
        { error: "CSV file must be 1 MB or smaller" },
        { status: 400 },
      );
    }

    const session = await verifyTeamAccess(teamId, { requireModule: "CRM" });
    const csv = await file.text();
    const columnMapping =
      typeof rawColumnMapping === "string" && rawColumnMapping.trim()
        ? JSON.parse(rawColumnMapping)
        : undefined;

    const result = await importContactsFromCsv({
      teamId,
      csv,
      columnMapping,
      userId: session.user.userId,
      userName: session.user.name ?? undefined,
    });

    return NextResponse.json({ data: result }, { status: 200 });
  } catch (error) {
    const apiError = handleApiError(error);
    if (apiError) {
      return apiError;
    }

    const { message } = handlePrismaError(error);
    return NextResponse.json(
      { error: message },
      { status: 400, statusText: message },
    );
  }
}