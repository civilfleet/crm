import { NextResponse } from "next/server";
import { handlePrismaError } from "@/lib/utils";
import { handleZammadWebhook } from "@/services/integrations/zammad";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ teamId: string }> },
) {
  try {
    const { teamId } = await params;
    const rawBody = await request.text();
    const signature = request.headers.get("x-hub-signature");

    const result = await handleZammadWebhook({
      teamId,
      rawBody,
      signature,
    });

    return NextResponse.json({ data: result }, { status: 202 });
  } catch (error) {
    const { message } = handlePrismaError(error);
    return NextResponse.json(
      { error: message },
      { status: 400, statusText: message },
    );
  }
}
