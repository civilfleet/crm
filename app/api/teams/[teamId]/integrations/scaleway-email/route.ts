import { NextResponse } from "next/server";
import { z } from "zod";
import { handlePrismaError } from "@/lib/utils";
import {
  getScalewayEmailIntegration,
  saveScalewayEmailIntegration,
} from "@/services/integrations/scaleway-email";

const updateIntegrationSchema = z.object({
  apiKey: z.string().trim().min(1, "Scaleway secret key is required").optional(),
  region: z.string().trim().min(1).default("fr-par"),
  projectId: z.string().trim().min(1, "Project ID is required").optional(),
  senderEmail: z
    .string()
    .trim()
    .email("Default sender email must be a valid email address")
    .optional(),
  senderName: z.string().trim().optional(),
  isEnabled: z.boolean().optional(),
});

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ teamId: string }> },
) {
  try {
    const { teamId } = await params;
    const integration = await getScalewayEmailIntegration(teamId);

    return NextResponse.json({ data: integration }, { status: 200 });
  } catch (error) {
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
    const payload = await request.json();
    const validated = updateIntegrationSchema.parse(payload);

    const integration = await saveScalewayEmailIntegration({
      teamId,
      apiKey: validated.apiKey,
      region: validated.region,
      projectId: validated.projectId,
      senderEmail: validated.senderEmail,
      senderName: validated.senderName,
      isEnabled: validated.isEnabled,
    });

    return NextResponse.json({ data: integration }, { status: 200 });
  } catch (error) {
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
