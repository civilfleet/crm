import { NextResponse } from "next/server";
import { handleApiError } from "@/lib/api-guard";
import { enforcePublicRateLimit } from "@/lib/public-rate-limit";
import { handlePrismaError } from "@/lib/utils";
import { createEventRegistration } from "@/services/events";
import { createEventRegistrationSchema } from "@/validations/events";

export async function POST(req: Request) {
  try {
    enforcePublicRateLimit(req, "public-event-registration", {
      limit: 10,
      windowMs: 60 * 60 * 1000,
    });
    const payload = await req.json();
    const validated = createEventRegistrationSchema.parse(payload);

    const registration = await createEventRegistration(validated);

    return NextResponse.json({ data: registration }, { status: 201 });
  } catch (e) {
    const apiError = handleApiError(e);
    if (apiError) return apiError;
    const { message } = handlePrismaError(e);
    return NextResponse.json(
      { error: message },
      { status: 400, statusText: message },
    );
  }
}
