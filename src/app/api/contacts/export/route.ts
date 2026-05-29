import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { handleApiError, verifyTeamAccess } from "@/lib/api-guard";
import { handlePrismaError } from "@/lib/utils";
import { exportContacts } from "@/services/contacts";
import type { Roles } from "@/types";

const exportSchema = z.object({
  contactIds: z.array(z.string()).default([]),
  fields: z.array(z.string()).default([]),
  attributes: z.array(z.string()).default([]),
});

export async function POST(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const teamId = searchParams.get("teamId");

    if (!teamId) {
      return NextResponse.json(
        { error: "teamId is required" },
        { status: 400 },
      );
    }

    const session = await verifyTeamAccess(teamId, { requireModule: "CRM" });
    const body = await request.json();
    const validated = exportSchema.parse(body);

    const roles = (session.user.roles ?? []) as Roles[];
    const csvContent = await exportContacts(
      teamId,
      session.user.userId,
      roles,
      {
        contactIds: validated.contactIds,
        fields: validated.fields,
        attributes: validated.attributes,
      },
    );

    return new NextResponse(csvContent, {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="contacts-export.csv"`,
      },
    });
  } catch (e) {
    if (e instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Validation failed", details: e.issues },
        { status: 400 },
      );
    }
    const apiError = handleApiError(e);
    if (apiError) return apiError;

    const { message } = handlePrismaError(e);
    return NextResponse.json(
      { error: message },
      { status: 400, statusText: message },
    );
  }
}
