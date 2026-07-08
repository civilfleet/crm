import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { handlePrismaError } from "@/lib/utils";
import { mergeContacts, previewContactMerge } from "@/services/contacts";
import {
  mergeContactsPreviewSchema,
  mergeContactsSchema,
} from "@/validations/contacts";

export async function POST(req: Request) {
  try {
    const session = await auth();
    if (!session?.user?.userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const payload = await req.json();
    const validated = mergeContactsPreviewSchema.parse(payload);
    const preview = await previewContactMerge(validated);

    return NextResponse.json({ data: preview }, { status: 200 });
  } catch (e) {
    const { message } = handlePrismaError(e);
    return NextResponse.json(
      { error: message },
      { status: 400, statusText: message },
    );
  }
}

export async function PATCH(req: Request) {
  try {
    const session = await auth();
    if (!session?.user?.userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const payload = await req.json();
    const validated = mergeContactsSchema.parse(payload);
    const contact = await mergeContacts(
      validated,
      session.user.userId,
      session.user.name ?? undefined,
    );

    return NextResponse.json({ data: contact }, { status: 200 });
  } catch (e) {
    const { message } = handlePrismaError(e);
    return NextResponse.json(
      { error: message },
      { status: 400, statusText: message },
    );
  }
}
