import { NextResponse } from "next/server";
import { z } from "zod";
import { handlePrismaError } from "@/lib/utils";
import {
  getZammadGroups,
  saveZammadGroups,
} from "@/services/integrations/zammad";

const groupSchema = z.object({
  groupId: z.number().int(),
  groupName: z.string().trim().min(1),
  importEnabled: z.boolean(),
  autoCreateContacts: z.boolean(),
});

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ teamId: string }> },
) {
  try {
    const { teamId } = await params;
    const groups = await getZammadGroups(teamId);

    return NextResponse.json({ data: groups }, { status: 200 });
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
    const validated = z.array(groupSchema).parse(payload);

    const result = await saveZammadGroups(teamId, validated);

    return NextResponse.json({ data: result }, { status: 200 });
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
