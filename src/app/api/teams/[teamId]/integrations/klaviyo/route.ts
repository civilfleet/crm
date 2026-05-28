import { NextResponse } from "next/server";
import { z } from "zod";
import { handleApiError, verifyTeamAccess } from "@/lib/api-guard";
import { handlePrismaError } from "@/lib/utils";
import {
  getKlaviyoIntegration,
  saveKlaviyoIntegration,
} from "@/services/integrations/klaviyo";

const updateIntegrationSchema = z.object({
  apiKey: z.string().trim().min(1, "API key is required").optional(),
  defaultListId: z.string().trim().optional(),
  isEnabled: z.boolean().optional(),
  testConnection: z.boolean().optional(),
});

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ teamId: string }> },
) {
  try {
    const { teamId } = await params;
    await verifyTeamAccess(teamId, { requireAdmin: true });

    const integration = await getKlaviyoIntegration(teamId);

    return NextResponse.json({ data: integration }, { status: 200 });
  } catch (error) {
    const apiError = handleApiError(error);
    if (apiError) return apiError;

    const { message } = handlePrismaError(error);
    return NextResponse.json(
      { error: message },
      { status: 400, statusText: message },
    );
  }
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ teamId: string }> },
) {
  try {
    const { teamId } = await params;
    await verifyTeamAccess(teamId, { requireAdmin: true });

    const payload = await request.json();
    const validated = updateIntegrationSchema.parse(payload);

    const integration = await saveKlaviyoIntegration({
      teamId,
      apiKey: validated.apiKey,
      defaultListId: validated.defaultListId,
      isEnabled: validated.isEnabled,
      shouldTestConnection: validated.testConnection ?? true,
    });

    return NextResponse.json({ data: integration }, { status: 200 });
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
