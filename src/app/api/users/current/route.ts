import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { handlePrismaError } from "@/lib/utils";
import { getAdminUser, getUserCurrent } from "@/services/users";
import { Roles } from "@/types";

export async function GET() {
  try {
    const session = await auth();
    const userId = session?.user?.userId;
    if (!session || !userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const data = session.user?.roles?.includes(Roles.Admin)
      ? await getAdminUser(userId)
      : await getUserCurrent(userId);

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
