import { NextResponse } from "next/server";
import { verifyTeamAccess } from "@/lib/api-guard";
import prisma from "@/lib/prisma";
import { getContactVisibility } from "@/services/contacts/access";
import { getStoredFile } from "@/services/file/s3-service";
import { SAFE_INLINE_IMAGE_MIME_TYPES } from "@/services/inbound-email/attachments";
import type { Roles } from "@/types";

const contentDisposition = (type: "inline" | "attachment", fileName: string) =>
  `${type}; filename*=UTF-8''${encodeURIComponent(fileName)}`;

export async function GET(
  request: Request,
  { params }: { params: Promise<{ teamId: string; attachmentId: string }> },
) {
  const { teamId, attachmentId } = await params;
  const session = await verifyTeamAccess(teamId, { requireModule: "CRM" });
  const userId = session.user.userId;
  if (!userId)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const attachment = await prisma.emailAttachment.findFirst({
    where: { id: attachmentId, teamId },
    include: {
      inboundEmailMessage: { select: { contactId: true } },
      engagement: { select: { contactId: true } },
    },
  });
  if (
    !attachment ||
    attachment.status !== "AVAILABLE" ||
    !attachment.storageKey
  ) {
    return NextResponse.json(
      { error: "Attachment not found." },
      { status: 404 },
    );
  }
  const contactId =
    attachment.inboundEmailMessage?.contactId ??
    attachment.engagement?.contactId;
  if (!contactId)
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const visibility = await getContactVisibility({
    teamId,
    userId,
    roles: (session.user.roles ?? []) as Roles[],
  });
  const contact = await prisma.contact.findFirst({
    where: { id: contactId, ...visibility.where },
    select: { id: true },
  });
  if (!contact)
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const requestedInline =
    new URL(request.url).searchParams.get("inline") === "true";
  const inline =
    requestedInline &&
    attachment.direction === "INBOUND" &&
    Boolean(attachment.contentId) &&
    SAFE_INLINE_IMAGE_MIME_TYPES.has(attachment.contentType);
  if (
    attachment.direction === "INBOUND" &&
    !inline &&
    new URL(request.url).searchParams.get("acknowledgeRisk") !== "true"
  ) {
    return NextResponse.json(
      { error: "Acknowledge the inbound attachment malware warning first." },
      { status: 400 },
    );
  }
  const stored = await getStoredFile(attachment.storageKey);
  return new NextResponse(stored.body, {
    headers: {
      "Cache-Control": "private, no-store",
      "Content-Disposition": contentDisposition(
        inline ? "inline" : "attachment",
        attachment.fileName,
      ),
      "Content-Type": attachment.contentType || "application/octet-stream",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
