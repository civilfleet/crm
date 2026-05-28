import { NextResponse } from "next/server";
import { getAuthenticatedSession, handleApiError } from "@/lib/api-guard";
import { handlePrismaError } from "@/lib/utils";
import { uploadFile } from "@/services/file/s3-service";

export async function POST(req: Request) {
  try {
    await getAuthenticatedSession();
    const values = (await req.json()) as {
      fileName: string;
      fileType: string;
      teamId?: string;
    };

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
