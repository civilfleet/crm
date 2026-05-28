import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import prisma from "@/lib/prisma";
import { handlePrismaError } from "@/lib/utils";

const quickCreateOrganizationSchema = z.object({
  teamId: z.uuid("Team id must be a valid UUID"),
  name: z.string().trim().min(2, "Name must be at least 2 characters"),
  email: z.email("Invalid email address"),
});

export async function POST(req: Request) {
  try {
    const session = await auth();

    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const payload = await req.json();
    const validated = quickCreateOrganizationSchema.parse(payload);

    const organization = await prisma.organization.create({
      data: {
        teamId: validated.teamId,
        name: validated.name,
        email: validated.email.trim().toLowerCase(),
        isFilledByOrg: false,
        portalAccessEnabled: false,
      },
      select: {
        id: true,
        name: true,
        email: true,
      },
    });

    return NextResponse.json({ data: organization }, { status: 201 });
  } catch (e) {
    const { message } = handlePrismaError(e);
    return NextResponse.json(
      { error: message },
      { status: 400, statusText: message },
    );
  }
}
