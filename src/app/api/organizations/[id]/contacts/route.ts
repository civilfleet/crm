import { NextResponse } from "next/server";
import { z } from "zod";
import prisma from "@/lib/prisma";
import { handlePrismaError } from "@/lib/utils";

const organizationContactSchema = z.object({
  contactId: z.uuid("Contact id must be a valid UUID"),
});

const getOrganizationAndContact = async (
  organizationId: string,
  contactId: string,
) => {
  const [organization, contact] = await Promise.all([
    prisma.organization.findUnique({
      where: { id: organizationId },
      select: { id: true, teamId: true },
    }),
    prisma.contact.findUnique({
      where: { id: contactId },
      select: {
        id: true,
        teamId: true,
        name: true,
        email: true,
        phone: true,
      },
    }),
  ]);

  if (!organization) {
    throw new Error("Organization not found");
  }

  if (!contact) {
    throw new Error("Contact not found");
  }

  if (organization.teamId !== contact.teamId) {
    throw new Error("Contact and organization must belong to the same team.");
  }

  return contact;
};

export async function POST(
  req: Request,
  {
    params,
  }: {
    params: Promise<{ id: string }>;
  },
) {
  try {
    const organizationId = (await params).id;
    if (!organizationId) {
      return NextResponse.json({ error: "ID is required" }, { status: 400 });
    }

    const payload = await req.json();
    const { contactId } = organizationContactSchema.parse(payload);
    const contact = await getOrganizationAndContact(organizationId, contactId);

    await prisma.contactOrganization.upsert({
      where: {
        contactId_organizationId: {
          contactId,
          organizationId,
        },
      },
      update: {},
      create: {
        contactId,
        organizationId,
      },
    });

    return NextResponse.json({ data: contact }, { status: 201 });
  } catch (e) {
    const { message } = handlePrismaError(e);
    return NextResponse.json(
      { error: message },
      { status: 400, statusText: message },
    );
  }
}

export async function DELETE(
  req: Request,
  {
    params,
  }: {
    params: Promise<{ id: string }>;
  },
) {
  try {
    const organizationId = (await params).id;
    if (!organizationId) {
      return NextResponse.json({ error: "ID is required" }, { status: 400 });
    }

    const payload = await req.json();
    const { contactId } = organizationContactSchema.parse(payload);

    await prisma.contactOrganization.deleteMany({
      where: {
        contactId,
        organizationId,
      },
    });

    return NextResponse.json({ data: "success" }, { status: 200 });
  } catch (e) {
    const { message } = handlePrismaError(e);
    return NextResponse.json(
      { error: message },
      { status: 400, statusText: message },
    );
  }
}