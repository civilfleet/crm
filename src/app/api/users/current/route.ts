import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { handlePrismaError } from "@/lib/utils";
import { getCurrentUserProfile } from "@/services/users";
import { Roles } from "@/types";

export async function GET() {
  try {
    const session = await auth();
    const userId = session?.user?.userId;
    if (!session || !userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const data = await getCurrentUserProfile(
      userId,
      Boolean(session.user?.roles?.includes(Roles.Admin)),
    );

    return NextResponse.json(
      {
        data,
      },
      { status: 201 },
    );
  } catch (e) {
    const errorMessage = handlePrismaError(e);
    return NextResponse.json(
      { error: errorMessage?.message },
      { status: 400, statusText: errorMessage?.message },
    );
  }
}
