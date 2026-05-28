import { NextResponse } from "next/server";
import {
  getAuthenticatedSession,
  handleApiError,
  verifyTeamAccess,
} from "@/lib/api-guard";
import { handlePrismaError } from "@/lib/utils";
import { createPendingUpload } from "@/services/file/pending-uploads";
import { createFileUpload } from "@/services/file/s3-service";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ teamId: string }> },
) {
  try {
    const session = await getAuthenticatedSession();
    const userId = session.user.userId;
    const teamId = (await params).teamId;

    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (!teamId) {
      return NextResponse.json(
        { error: "teamId is required for team file uploads" },
        { status: 400 },
      );
    }

    await verifyTeamAccess(teamId);

    const values = await req.json();

    const { putUrl, key } = await createFileUpload({
      fileName: values.fileName,
      fileType: values.fileType,
    });
    const pendingUpload = await createPendingUpload({
      key,
      originalName: values.fileName,
      contentType: values.fileType,
      teamId,
      userId,
    });

    if (!putUrl) {
      return new Response("Upload failed", { status: 500 });
    }

    return NextResponse.json(
      {
        key,
        pendingUploadId: pendingUpload.id,
        expiresAt: pendingUpload.expiresAt,
        putUrl,
      },
      {
        status: 200,
      },
    );
  } catch (error) {
    const apiError = handleApiError(error);
    if (apiError) return apiError;

    const { message } = handlePrismaError(error);
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
