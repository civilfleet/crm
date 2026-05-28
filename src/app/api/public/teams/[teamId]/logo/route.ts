import { GetObjectCommand } from "@aws-sdk/client-s3";
import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import s3Client from "@/lib/s3-client";
import { DEFAULT_TEAM_MODULES } from "@/types";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ teamId: string }> },
) {
  const { teamId } = await params;

  const team = await prisma.teams.findUnique({
    where: { id: teamId },
    select: {
      registrationPageLogoKey: true,
      modules: true,
    },
  });

  if (!team?.registrationPageLogoKey) {
    return NextResponse.json({ error: "Logo not found" }, { status: 404 });
  }

  const teamModules =
    team.modules && team.modules.length > 0
      ? team.modules
      : [...DEFAULT_TEAM_MODULES];

  if (!teamModules.includes("FUNDING")) {
    return NextResponse.json({ error: "Logo not found" }, { status: 404 });
  }

  const command = new GetObjectCommand({
    Bucket: process.env.NEXT_AWS_S3_BUCKET_NAME,
    Key: team.registrationPageLogoKey,
  });

  const { Body, ContentType } = await s3Client.send(command);
  if (!Body) {
    return NextResponse.json({ error: "Logo not found" }, { status: 404 });
  }

  return new NextResponse(Body as ReadableStream, {
    headers: {
      "Content-Type": ContentType || "application/octet-stream",
      "Cache-Control": "public, max-age=300",
    },
  });
}
