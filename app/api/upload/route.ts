import { NextResponse } from "next/server";
import { handlePrismaError } from "@/lib/utils";
import { uploadFile } from "@/services/file/s3-service";

export async function POST(req: Request) {
  const values = await req.json();
  try {
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
    const { message } = handlePrismaError(error);
    return NextResponse.json({ error: message }, { status: 400 });
  }
}