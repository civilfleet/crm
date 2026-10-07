import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { handleApiError, requireGlobalAdmin } from "@/lib/api-guard";
import { getGlobalSettings, updateGlobalSettings } from "@/lib/global-settings";
import logger from "@/lib/logger";
import { globalSettingsSchema } from "@/validations/global-settings";

export async function GET() {
  try {
    await requireGlobalAdmin();
    return NextResponse.json({ data: await getGlobalSettings() });
  } catch (error) {
    const apiError = handleApiError(error);
    if (apiError) return apiError;
    logger.error({ error }, "Failed to load global settings");
    return NextResponse.json(
      { error: "Failed to load global settings" },
      { status: 500 },
    );
  }
}

export async function PATCH(request: Request) {
  try {
    await requireGlobalAdmin();
    const input = globalSettingsSchema.parse(await request.json());
    return NextResponse.json({ data: await updateGlobalSettings(input) });
  } catch (error) {
    const apiError = handleApiError(error);
    if (apiError) return apiError;
    if (error instanceof ZodError) {
      return NextResponse.json(
        { error: error.issues[0]?.message ?? "Invalid settings" },
        { status: 400 },
      );
    }
    logger.error({ error }, "Failed to update global settings");
    return NextResponse.json(
      { error: "Failed to update global settings" },
      { status: 500 },
    );
  }
}
