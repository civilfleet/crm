import { NextResponse } from "next/server";
import logger from "@/lib/logger";
import { handlePrismaError } from "@/lib/utils";
import { deleteUser, getUserById } from "@/services/users";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ userId: string }> },
) {
  try {
    const { userId } = await params;
    const data = await getUserById(userId);
    return NextResponse.json({ data }, { status: 200 });
  } catch (e) {
    const { message } = handlePrismaError(e);
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ userId: string }> },
) {
  try {
    const { userId } = await params;
    const { organizationId, teamId } = await request.json();
    await deleteUser(userId, organizationId, teamId);
    return NextResponse.json({ success: true });
  } catch (error) {
    const { userId } = await params;
    logger.error({ error, userId }, "Error deleting user");
    return NextResponse.json(
      { error: "Failed to delete user" },
      { status: 500 },
    );
  }
}