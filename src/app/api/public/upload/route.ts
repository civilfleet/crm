import { NextResponse } from "next/server";
import { handleApiError } from "@/lib/api-guard";
import { readBoundedFormData } from "@/lib/bounded-request-body";
import prisma from "@/lib/prisma";
import { enforcePublicRateLimit } from "@/lib/public-rate-limit";
import { handlePrismaError } from "@/lib/utils";
import { storeFile } from "@/services/file/s3-service";
import { DEFAULT_TEAM_MODULES } from "@/types";

const MAX_PUBLIC_UPLOAD_BYTES = 10 * 1024 * 1024;
const ALLOWED_PUBLIC_UPLOAD_TYPES = new Set([
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp",
]);

export async function POST(req: Request) {
  try {
    enforcePublicRateLimit(req, "public-upload", {
      limit: 12,
      windowMs: 15 * 60 * 1000,
    });
    // Allow a small multipart overhead in addition to the maximum file size.
    const formData = await readBoundedFormData(
      req,
      MAX_PUBLIC_UPLOAD_BYTES + 64 * 1024,
    );
    const file = formData.get("file");
    const teamId = formData.get("teamId");

    if (!(file instanceof File) || typeof teamId !== "string") {
      return NextResponse.json(
        { error: "file and teamId are required" },
        { status: 400 },
      );
    }

    enforcePublicRateLimit(req, `public-upload:${teamId}`, {
      limit: 12,
      windowMs: 15 * 60 * 1000,
    });

    if (!ALLOWED_PUBLIC_UPLOAD_TYPES.has(file.type)) {
      return NextResponse.json(
        { error: "Only PDF, JPEG, PNG, and WebP files are allowed" },
        { status: 415 },
      );
    }
    if (file.size <= 0 || file.size > MAX_PUBLIC_UPLOAD_BYTES) {
      return NextResponse.json(
        { error: "Files must be no larger than 10 MB" },
        { status: 413 },
      );
    }

    const team = await prisma.teams.findUnique({
      where: { id: teamId },
      select: { modules: true },
    });
    const modules =
      team?.modules && team.modules.length > 0
        ? team.modules
        : DEFAULT_TEAM_MODULES;
    if (!team || !modules.includes("FUNDING")) {
      return NextResponse.json(
        { error: "Organization self-registration is disabled" },
        { status: 403 },
      );
    }

    const key = await storeFile({
      body: new Uint8Array(await file.arrayBuffer()),
      fileName: file.name,
      fileType: file.type,
      prefix: `public-registrations/${teamId}`,
    });

    return NextResponse.json({ fileUrl: key }, { status: 201 });
  } catch (error) {
    const apiError = handleApiError(error);
    if (apiError) return apiError;

    const { message } = handlePrismaError(error);
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
