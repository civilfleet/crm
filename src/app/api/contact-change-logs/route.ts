import { type NextRequest, NextResponse } from "next/server";
import { handlePrismaError } from "@/lib/utils";
import { getContactChangeLogs } from "@/services/contact-change-logs";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const contactId = searchParams.get("contactId");

    if (!contactId) {
      return NextResponse.json(
        { error: "contactId is required" },
        { status: 400 },
      );
    }

    const logs = await getContactChangeLogs(contactId);

    return NextResponse.json({ data: logs }, { status: 200 });
  } catch (e) {
    const { message } = handlePrismaError(e);
    return NextResponse.json(
      { error: message },
      { status: 400, statusText: message },
    );
  }
}
