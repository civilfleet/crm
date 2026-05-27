import { NextResponse } from "next/server";
import {
  getAuthenticatedSession,
  handleApiError,
  verifyTeamAccess,
} from "@/lib/api-guard";
import { handlePrismaError } from "@/lib/utils";
import { uploadFile } from "@/services/file/s3-service";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ teamId: string }> },
) {
  try {
    await getAuthenticatedSession();
    const teamId = (await params).teamId;

    if (!teamId) {
      return NextResponse.json(
        { error: "teamId is required for team file uploads" },
        { status: 400 },
      );
    }

    await verifyTeamAccess(teamId);

    const values = await req.json();

    const putUrl = await uploadFile({
      fileName: values.fileName,
      fileType: values.fileType,
    });

    if (!putUrl) {
      return new Response("Upload failed", { status: 500 });
    }

    return NextResponse.json(
      {
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