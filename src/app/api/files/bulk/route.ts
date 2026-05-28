import { GetObjectCommand } from "@aws-sdk/client-s3";
import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import prisma from "@/lib/prisma";
import s3Client from "@/lib/s3-client";
import { handlePrismaError } from "@/lib/utils";
import { createZipBuffer } from "@/lib/zip";
import {
  canUserAccessTeamOrOrgScope,
  getFiles,
  recordFileDownloadAudit,
} from "@/services/file";
import { FileDownloadType } from "@/types";

const normalizePathSegment = (value: string) =>
  value
    .trim()
    .replace(/[<>:"\\|?*]/g, "_")
    .split("")
    .map((character) => (character.charCodeAt(0) < 32 ? "_" : character))
    .join("")
    .replace(/\s+/g, "_")
    .slice(0, 80) || "unknown";

const s3BodyToBuffer = async (body: unknown) => {
  if (!body) return Buffer.alloc(0);
  if (Buffer.isBuffer(body)) return body;

  const transformable = body as {
    transformToByteArray?: () => Promise<Uint8Array>;
  };
  if (typeof transformable.transformToByteArray === "function") {
    return Buffer.from(await transformable.transformToByteArray());
  }

  const stream = body as AsyncIterable<Uint8Array | Buffer | string>;
  const chunks: Buffer[] = [];
  for await (const chunk of stream) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
};

const getScopedFiles = async ({
  teamId,
  organizationId,
  includeContactFiles,
  searchQuery,
  ids,
}: {
  teamId: string;
  organizationId: string;
  includeContactFiles: boolean;
  searchQuery: string;
  ids?: string[];
}) => {
  const files = await getFiles(
    { teamId, organizationId, includeContactFiles },
    searchQuery,
  );

  if (!ids?.length) {
    return files;
  }

  const selectedIds = new Set(ids);
  const scopedFiles = files.filter((file) => selectedIds.has(file.id));

  if (scopedFiles.length !== selectedIds.size) {
    throw new Error("One or more selected files could not be found.");
  }

  return scopedFiles;
};

const deleteFilesSchema = z.object({
  teamId: z.preprocess(
    (value) => (value === "" ? undefined : value),
    z.uuid("Team id must be a valid UUID").optional(),
  ),
  organizationId: z.preprocess(
    (value) => (value === "" ? undefined : value),
    z.uuid("Organization id must be a valid UUID").optional(),
  ),
  includeContactFiles: z.boolean().optional().default(false),
  ids: z.array(z.uuid("File id must be a valid UUID")).min(1),
});

export async function GET(req: Request) {
  try {
    const session = await auth();
    if (!session?.user?.userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const teamId = searchParams.get("teamId") || "";
    const organizationId = searchParams.get("organizationId") || "";
    const searchQuery = searchParams.get("query") || "";
    const includeContactFiles =
      searchParams.get("includeContactFiles") === "true";
    const selectedIds = (searchParams.get("ids") || "")
      .split(",")
      .map((id) => id.trim())
      .filter(Boolean);

    if (!teamId && !organizationId) {
      return NextResponse.json(
        { error: "teamId or organizationId is required" },
        { status: 400 },
      );
    }

    const hasScopeAccess = await canUserAccessTeamOrOrgScope({
      userId: session.user.userId,
      teamId: teamId || undefined,
      organizationId: organizationId || undefined,
    });
    if (!hasScopeAccess) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const files = await getScopedFiles({
      teamId,
      organizationId,
      includeContactFiles,
      searchQuery,
      ids: selectedIds,
    });
    if (!files.length) {
      return NextResponse.json({ error: "No files found" }, { status: 404 });
    }

    const usedPaths = new Set<string>();
    const entries = [];

    for (const file of files) {
      const command = new GetObjectCommand({
        Bucket: process.env.NEXT_AWS_S3_BUCKET_NAME,
        Key: file.url,
      });

      const response = await s3Client.send(command);
      const data = await s3BodyToBuffer(response.Body);

      const orgName = normalizePathSegment(
        file.organization?.name ?? file.contact?.name ?? "Unassigned",
      );
      const fileType = normalizePathSegment(file.type || "File");
      const datePart = new Date(file.createdAt).toISOString().slice(0, 10);
      const rawName = file.name || file.url.split("/").pop() || file.id;
      const safeName = normalizePathSegment(rawName);
      let zipPath = `${orgName}/${fileType}/${datePart}_${safeName}`;
      let duplicateCounter = 1;
      while (usedPaths.has(zipPath)) {
        duplicateCounter += 1;
        zipPath = `${orgName}/${fileType}/${datePart}_${duplicateCounter}_${safeName}`;
      }
      usedPaths.add(zipPath);

      entries.push({
        name: zipPath,
        data,
      });
    }

    const zip = createZipBuffer(entries);
    const archiveName = `${includeContactFiles ? "crm" : "funding"}-files-${new Date().toISOString().slice(0, 10)}.zip`;

    await recordFileDownloadAudit({
      userId: session.user.userId,
      type: FileDownloadType.BULK,
      teamId: teamId || undefined,
      organizationId: organizationId || undefined,
      query: searchQuery || undefined,
      fileCount: entries.length,
    });

    return new NextResponse(zip, {
      headers: {
        "Content-Type": "application/zip",
        "Content-Disposition": `attachment; filename=${archiveName}`,
      },
    });
  } catch (e) {
    const { message } = handlePrismaError(e);
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

export async function DELETE(req: Request) {
  try {
    const session = await auth();
    if (!session?.user?.userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const payload = await req.json().catch(() => ({}));
    const { teamId, organizationId, includeContactFiles, ids } =
      deleteFilesSchema.parse(payload);

    if (!teamId && !organizationId) {
      return NextResponse.json(
        { error: "teamId or organizationId is required" },
        { status: 400 },
      );
    }

    const hasScopeAccess = await canUserAccessTeamOrOrgScope({
      userId: session.user.userId,
      teamId: teamId || undefined,
      organizationId: organizationId || undefined,
    });
    if (!hasScopeAccess) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const files = await getScopedFiles({
      teamId: teamId ?? "",
      organizationId: organizationId ?? "",
      includeContactFiles,
      searchQuery: "",
      ids,
    });

    await prisma.file.deleteMany({
      where: {
        id: { in: files.map((file) => file.id) },
      },
    });

    return NextResponse.json(
      { data: { deleted: files.length } },
      { status: 200 },
    );
  } catch (e) {
    const { message } = handlePrismaError(e);
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
