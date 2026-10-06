import { NextResponse } from "next/server";
import { z } from "zod";
import { handleApiError, verifyTeamAccess } from "@/lib/api-guard";
import prisma from "@/lib/prisma";
import { handlePrismaError } from "@/lib/utils";
import { createPendingUpload } from "@/services/file/pending-uploads";
import { createFileUpload } from "@/services/file/s3-service";
import {
  isEmailAttachmentBlocked,
  MAX_EMAIL_ATTACHMENT_BYTES,
  sanitizeAttachmentFileName,
} from "@/services/inbound-email/attachments";
import { getTeamAdminAccess } from "@/services/teams/access";
import type { Roles } from "@/types";

const uploadSchema = z.object({
  fileName: z.string().trim().min(1).max(255),
  fileType: z.string().trim().min(1).max(255),
  sizeBytes: z.number().int().positive().max(MAX_EMAIL_ATTACHMENT_BYTES),
});

export async function POST(
  request: Request,
  { params }: { params: Promise<{ teamId: string; inboxId: string }> },
) {
  try {
    const { teamId, inboxId } = await params;
    const session = await verifyTeamAccess(teamId, { requireModule: "CRM" });
    const userId = session.user.userId;
    if (!userId)
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const values = uploadSchema.parse(await request.json());
    const fileName = sanitizeAttachmentFileName(values.fileName);
    const contentType = values.fileType.split(";")[0].trim().toLowerCase();
    if (isEmailAttachmentBlocked(fileName, contentType)) {
      return NextResponse.json(
        { error: "This file type is blocked by the email attachment policy." },
        { status: 400 },
      );
    }

    const roles = (session.user.roles ?? []) as Roles[];
    const admin = await getTeamAdminAccess(userId, teamId, roles);
    const inbox = await prisma.emailInbox.findFirst({
      where: {
        id: inboxId,
        teamId,
        ...(admin.allowed ? {} : { group: { users: { some: { userId } } } }),
      },
      select: { id: true },
    });
    if (!inbox)
      return NextResponse.json(
        { error: "Email inbox not found." },
        { status: 404 },
      );

    const { putUrl, key } = await createFileUpload({
      fileName,
      fileType: contentType,
    });
    const pending = await createPendingUpload({
      key,
      originalName: fileName,
      contentType,
      teamId,
      userId,
    });
    return NextResponse.json({
      putUrl,
      key,
      pendingUploadId: pending.id,
      expiresAt: pending.expiresAt,
    });
  } catch (error) {
    const apiError = handleApiError(error);
    if (apiError) return apiError;
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Invalid attachment.", details: error.issues },
        { status: 400 },
      );
    }
    const { message } = handlePrismaError(error);
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
