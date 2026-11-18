import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { handleApiError, verifyTeamAccess } from "@/lib/api-guard";
import {
  dismissDuplicateHint,
  getDuplicateHints,
} from "@/services/contact-duplicates";
import type { Roles } from "@/types";

type Context = { params: Promise<{ contactId: string }> };

/** Possible duplicates of a contact (GET ?teamId=). */
export async function GET(request: NextRequest, { params }: Context) {
  try {
    const { contactId } = await params;
    const teamId = new URL(request.url).searchParams.get("teamId");
    if (!teamId) {
      return NextResponse.json(
        { error: "teamId is required" },
        { status: 400 },
      );
    }
    const session = await verifyTeamAccess(teamId, { requireModule: "CRM" });
    const data = await getDuplicateHints(teamId, contactId, {
      userId: session.user.userId,
      roles: (session.user.roles ?? []) as Roles[],
    });
    return NextResponse.json({ data });
  } catch (error) {
    const apiError = handleApiError(error);
    if (apiError) return apiError;
    return NextResponse.json({ error: "Unavailable" }, { status: 500 });
  }
}

const dismissSchema = z
  .object({ teamId: z.string().min(1), duplicateOfId: z.string().min(1) })
  .strict();

/** Dismisses one note: the two are different people (POST). */
export async function POST(request: NextRequest, { params }: Context) {
  try {
    const { contactId } = await params;
    const parsed = dismissSchema.safeParse(
      await request.json().catch(() => null),
    );
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid request" }, { status: 400 });
    }
    const session = await verifyTeamAccess(parsed.data.teamId, {
      requireModule: "CRM",
    });
    const saved = await dismissDuplicateHint(
      parsed.data.teamId,
      contactId,
      parsed.data.duplicateOfId,
      {
        userId: session.user.userId,
        userName: session.user.name ?? session.user.email ?? undefined,
        roles: (session.user.roles ?? []) as Roles[],
      },
    );
    if (!saved) {
      return NextResponse.json({ error: "Contact not found" }, { status: 404 });
    }
    return NextResponse.json({ data: { dismissed: true } });
  } catch (error) {
    const apiError = handleApiError(error);
    if (apiError) return apiError;
    return NextResponse.json({ error: "Not saved" }, { status: 500 });
  }
}
