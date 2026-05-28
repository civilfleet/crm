import { type NextRequest, NextResponse } from "next/server";
import type { Session } from "next-auth";
import { z } from "zod";
import { auth } from "@/auth";
import {
  CONTACT_SUBMODULE_FIELDS,
  CONTACT_SUBMODULES,
  type ContactSubmodule,
} from "@/constants/contact-submodules";
import logger from "@/lib/logger";
import prisma from "@/lib/prisma";
import { handlePrismaError } from "@/lib/utils";
import {
  createEngagement,
  getContactEngagements,
  updateEngagement,
} from "@/services/contact-engagements";
import { sendTagMentionNotifications } from "@/services/mentions";
import {
  EngagementDirection,
  EngagementSource,
  Roles,
  TodoStatus,
} from "@/types";

const resolveUserId = async (session: Session | null) => {
  let userId = session?.user?.userId ?? undefined;

  if (!userId && session?.user?.email) {
    const user = await prisma.user.findUnique({
      where: { email: session.user.email },
      select: { id: true },
    });
    userId = user?.id;
  }

  return userId;
};

const getAllowedSubmodules = async (
  teamId: string,
  userId?: string,
  roles: Roles[] = [],
) => {
  if (!userId) {
    return [] as ContactSubmodule[];
  }

  if (roles.includes(Roles.Admin)) {
    return [...CONTACT_SUBMODULES] as ContactSubmodule[];
  }

  const [accessEntries, userGroups] = await Promise.all([
    prisma.contactFieldAccess.findMany({
      where: { teamId },
      select: {
        fieldKey: true,
        groupId: true,
      },
    }),
    prisma.userGroup.findMany({
      where: {
        userId,
        group: {
          teamId,
        },
      },
      select: {
        groupId: true,
      },
    }),
  ]);

  const accessMap = new Map<string, Set<string>>();
  accessEntries.forEach((entry) => {
    const existing = accessMap.get(entry.fieldKey);
    if (existing) {
      existing.add(entry.groupId);
      return;
    }
    accessMap.set(entry.fieldKey, new Set([entry.groupId]));
  });

  const userGroupIds = new Set(userGroups.map((group) => group.groupId));

  const isFieldVisible = (fieldKey: string) => {
    const allowedGroups = accessMap.get(fieldKey);
    if (!allowedGroups || allowedGroups.size === 0) {
      return true;
    }
    for (const groupId of userGroupIds) {
      if (allowedGroups.has(groupId)) {
        return true;
      }
    }
    return false;
  };

  return CONTACT_SUBMODULES.filter((submodule) => {
    const fields = CONTACT_SUBMODULE_FIELDS[submodule];
    if (!fields.length) {
      return false;
    }
    return fields.some((fieldKey) => isFieldVisible(fieldKey));
  }) as ContactSubmodule[];
};

const createEngagementSchema = z.object({
  contactId: z.uuid(),
  teamId: z.uuid(),
  direction: z.enum([
    EngagementDirection.INBOUND,
    EngagementDirection.OUTBOUND,
  ]),
  source: z.enum([
    EngagementSource.EMAIL,
    EngagementSource.PHONE,
    EngagementSource.SMS,
    EngagementSource.MEETING,
    EngagementSource.EVENT,
    EngagementSource.TODO,
    EngagementSource.NOTE,
    EngagementSource.OTHER,
  ]),
  subject: z.string().optional(),
  message: z.string().min(1),
  userId: z.string().optional(),
  userName: z.string().optional(),
  assignedToUserId: z.string().optional(),
  assignedToUserName: z.string().optional(),
  todoStatus: z
    .enum([
      TodoStatus.PENDING,
      TodoStatus.IN_PROGRESS,
      TodoStatus.COMPLETED,
      TodoStatus.CANCELLED,
    ])
    .optional(),
  dueDate: z
    .string()
    .refine((date) => !Number.isNaN(Date.parse(date)), {
      message: "Invalid date format",
    })
    .optional(),
  engagedAt: z.string().refine((date) => !Number.isNaN(Date.parse(date)), {
    message: "Invalid date format",
  }),
  restrictedToSubmodule: z.enum(CONTACT_SUBMODULES).optional(),
});

const updateEngagementSchema = z.object({
  id: z.uuid(),
  teamId: z.uuid(),
  subject: z.string().optional(),
  message: z.string().min(1).optional(),
  assignedToUserId: z.string().optional(),
  assignedToUserName: z.string().optional(),
  todoStatus: z
    .enum([
      TodoStatus.PENDING,
      TodoStatus.IN_PROGRESS,
      TodoStatus.COMPLETED,
      TodoStatus.CANCELLED,
    ])
    .optional(),
  dueDate: z
    .string()
    .refine((date) => !Number.isNaN(Date.parse(date)), {
      message: "Invalid date format",
    })
    .optional()
    .nullable(),
  restrictedToSubmodule: z.enum(CONTACT_SUBMODULES).optional().nullable(),
});

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const contactId = searchParams.get("contactId");
    const teamId = searchParams.get("teamId");

    if (!contactId || !teamId) {
      return NextResponse.json(
        { error: "contactId and teamId are required" },
        { status: 400 },
      );
    }

    const session = await auth();
    const userId = await resolveUserId(session);
    const roles = (session?.user?.roles ?? []) as Roles[];
    const allowedSubmodules = await getAllowedSubmodules(teamId, userId, roles);

    const engagements = await getContactEngagements(
      contactId,
      teamId,
      allowedSubmodules,
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

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const validatedData = createEngagementSchema.parse(body);

    const session = await auth();
    const userId = await resolveUserId(session);
    const roles = (session?.user?.roles ?? []) as Roles[];
    const allowedSubmodules = await getAllowedSubmodules(
      validatedData.teamId,
      userId,
      roles,
    );

    if (
      validatedData.restrictedToSubmodule &&
      validatedData.source !== EngagementSource.NOTE
    ) {
      return NextResponse.json(
        { error: "Submodule restrictions are only supported for notes." },
        { status: 400 },
      );
    }

    if (validatedData.restrictedToSubmodule) {
      if (!userId) {
        return NextResponse.json(
          { error: "You must be signed in to restrict notes." },
          { status: 403 },
        );
      }
      if (!allowedSubmodules.includes(validatedData.restrictedToSubmodule)) {
        return NextResponse.json(
          { error: "You do not have access to that submodule." },
          { status: 403 },
        );
      }
    }

    const engagement = await createEngagement({
      ...validatedData,
      engagedAt: new Date(validatedData.engagedAt),
      dueDate: validatedData.dueDate
        ? new Date(validatedData.dueDate)
        : undefined,
    });

    if (validatedData.source === EngagementSource.NOTE) {
      try {
        const sentCount = await sendTagMentionNotifications({
          teamId: validatedData.teamId,
          text: validatedData.message,
          actorUserId: userId,
          actorName: session?.user?.name ?? session?.user?.email,
          itemLabel: "a contact note",
          itemPath: `/teams/${validatedData.teamId}/crm/contacts/${validatedData.contactId}`,
        });

        logger.info(
          {
            teamId: validatedData.teamId,
            contactId: validatedData.contactId,
            actorUserId: userId,
            sentCount,
          },
          "Contact note mention notifications processed",
        );
      } catch (notificationError) {
        logger.error(
          {
            error: notificationError,
            teamId: validatedData.teamId,
            contactId: validatedData.contactId,
          },
          "Failed to process contact note mentions",
        );
      }
    }

    return NextResponse.json({ data: engagement }, { status: 201 });
  } catch (e) {
    if (e instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Validation failed", details: e.issues },
        { status: 400 },
      );
    }

    const { message } = handlePrismaError(e);
    return NextResponse.json(
      { error: message },
      { status: 400, statusText: message },
    );
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const body = await request.json();
    const validatedData = updateEngagementSchema.parse(body);

    const engagement = await updateEngagement({
      ...validatedData,
      dueDate: validatedData.dueDate
        ? new Date(validatedData.dueDate)
        : undefined,
    });

    return NextResponse.json({ data: engagement }, { status: 200 });
  } catch (e) {
    if (e instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Validation failed", details: e.issues },
        { status: 400 },
      );
    }

    const { message } = handlePrismaError(e);
    return NextResponse.json(
      { error: message },
      { status: 400, statusText: message },
    );
  }
}
