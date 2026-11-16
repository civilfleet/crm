import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { handleApiError, verifyTeamAccess } from "@/lib/api-guard";
import { getForm, updateFormSetting } from "@/services/forms";
import type { Roles } from "@/types";

type Context = { params: Promise<{ formId: string }> };

/** One form's summary and settings (GET ?teamId=). */
export async function GET(request: NextRequest, { params }: Context) {
  try {
    const { formId } = await params;
    const teamId = new URL(request.url).searchParams.get("teamId");
    if (!teamId) {
      return NextResponse.json(
        { error: "teamId is required" },
        { status: 400 },
      );
    }
    const session = await verifyTeamAccess(teamId, { requireModule: "CRM" });
    const form = await getForm(teamId, formId, {
      userId: session.user.userId,
      roles: (session.user.roles ?? []) as Roles[],
    });
    if (!form) {
      return NextResponse.json({ error: "Form not found" }, { status: 404 });
    }
    return NextResponse.json({ data: form });
  } catch (error) {
    const apiError = handleApiError(error);
    if (apiError) return apiError;
    return NextResponse.json({ error: "Form unavailable" }, { status: 500 });
  }
}

const settingsSchema = z
  .object({
    teamId: z.string().min(1),
    publicCount: z.boolean().optional(),
    goal: z.number().int().positive().max(100_000_000).nullable().optional(),
    countConfirmedOnly: z.boolean().optional(),
  })
  .strict();

/** The public counter and its goal (PATCH {teamId, publicCount?, goal?}). */
export async function PATCH(request: NextRequest, { params }: Context) {
  try {
    const { formId } = await params;
    const parsed = settingsSchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid settings" }, { status: 400 });
    }
    const { teamId, ...settings } = parsed.data;
    await verifyTeamAccess(teamId, { requireModule: "CRM" });
    const saved = await updateFormSetting(teamId, formId, settings);
    if (!saved) {
      return NextResponse.json({ error: "Form not found" }, { status: 404 });
    }
    return NextResponse.json({ data: saved });
  } catch (error) {
    const apiError = handleApiError(error);
    if (apiError) return apiError;
    return NextResponse.json({ error: "Settings not saved" }, { status: 500 });
  }
}
