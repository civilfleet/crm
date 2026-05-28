import { NextResponse } from "next/server";
import { handlePrismaError } from "@/lib/utils";
import { createEventRegistration } from "@/services/events";
import { createEventRegistrationSchema } from "@/validations/events";

export async function POST(req: Request) {
  try {
    const payload = await req.json();
    const validated = createEventRegistrationSchema.parse(payload);

    const registration = await createEventRegistration(validated);

    return NextResponse.json({ data: registration }, { status: 201 });
  } catch (e) {
    const { message } = handlePrismaError(e);
    return NextResponse.json(
      { error: message },
      { status: 400, statusText: message },
    );
  }
}
