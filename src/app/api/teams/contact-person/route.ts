import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { handlePrismaError } from "@/lib/utils";
import { getTeamsUsers } from "@/services/users";

export async function GET() {
  try {
    const session = await auth();
    const response = await getTeamsUsers(session?.user.teamId as string);

    return NextResponse.json(
      {
        data: response,
      },
      { status: 201 },
    );
  } catch (e) {
    const { message } = handlePrismaError(e);
    return NextResponse.json(
      { error: message },
      { status: 400, statusText: message },
    );
  }
}