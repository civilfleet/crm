import { NextResponse } from "next/server";
import { auth } from "@/auth";
import logger from "@/lib/logger";
import prisma from "@/lib/prisma";
import { handlePrismaError } from "@/lib/utils";
import { sendTagMentionNotifications } from "@/services/mentions";
import {
  createOrganizationEngagement,
  getOrganizationEngagements,
} from "@/services/organization-engagements";
import { createOrganizationEngagementSchema } from "@/validations/organization-engagements";

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const organizationId = searchParams.get("organizationId");
    const teamId = searchParams.get("teamId");

    if (!organizationId || !teamId) {
      return NextResponse.json(
        { error: "organizationId and teamId are required" },
        { status: 400 },
      );
    }

    const engagements = await getOrganizationEngagements(
      organizationId,
      teamId,
    );
    return NextResponse.json({ data: engagements }, { status: 200 });
  } catch (e) {
    const { message } = handlePrismaError(e);
    return NextResponse.json(
      { error: message },
      { status: 400, statusText: message },
    );
  }
}

export async function POST(req: Request) {
  try {
    const payload = await req.json();
    const validated = createOrganizationEngagementSchema.parse(payload);
    const session = await auth();

    let actorUserId = session?.user?.userId ?? undefined;
    if (!actorUserId && session?.user?.email) {
      const actor = await prisma.user.findUnique({
        where: {
          email: session.user.email,
        },
        select: {
          id: true,
        },
      });
      actorUserId = actor?.id;
    }

    const engagement = await createOrganizationEngagement(validated);

    if (validated.note?.trim()) {
      try {
        const sentCount = await sendTagMentionNotifications({
          teamId: validated.teamId,
          text: validated.note,
          actorUserId,
          actorName: session?.user?.name ?? session?.user?.email,
          itemLabel: "an organization note",
          itemPath: `/teams/${validated.teamId}/funding/organizations/${validated.organizationId}`,
        });

        logger.info(
          {
            teamId: validated.teamId,
            organizationId: validated.organizationId,
            actorUserId,
            sentCount,
          },
          "Organization note mention notifications processed",
        );
      } catch (notificationError) {
        logger.error(
          {
            error: notificationError,
            teamId: validated.teamId,
            organizationId: validated.organizationId,
          },
          "Failed to process organization note mentions",
        );
      }
    }

    return NextResponse.json({ data: engagement }, { status: 201 });
  } catch (e) {
    const { message } = handlePrismaError(e);
    return NextResponse.json(
      { error: message },
      { status: 400, statusText: message },
    );
  }
}
