import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import logger from "@/lib/logger";
import prisma from "@/lib/prisma";

const fieldOptionSchema = z.object({
  label: z.string(),
  value: z.string(),
});

const formFieldSchema = z.object({
  id: z.string().optional(),
  key: z.string(),
  label: z.string(),
  description: z.string().nullish(),
  type: z.enum([
    "TEXT",
    "TEXTAREA",
    "NUMBER",
    "DATE",
    "EMAIL",
    "URL",
    "SELECT",
    "MULTISELECT",
    "CHECKBOX",
    "RADIO",
    "FILE",
  ]),
  placeholder: z.string().nullish(),
  defaultValue: z.string().nullish(),
  isRequired: z.boolean().default(false),
  order: z.number().default(1),
  minLength: z.number().min(0).nullish(),
  maxLength: z.number().min(1).nullish(),
  minValue: z.number().nullish(),
  maxValue: z.number().nullish(),
  pattern: z.string().nullish(),
  options: z.array(fieldOptionSchema).optional(),
});

const formSectionSchema = z.object({
  id: z.string().optional(),
  name: z.string(),
  description: z.string().nullish(),
  order: z.number().default(1),
  fields: z.array(formFieldSchema).default([]),
});

const formConfigSchema = z.object({
  sections: z.array(formSectionSchema).default([]),
});

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ teamId: string }> },
) {
  try {
    const session = await auth();
    const { teamId } = await params;

    if (!session?.user?.email) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Verify user has access to this team or is an admin
    const user = await prisma.user.findUnique({
      where: { email: session.user.email },
      include: { teams: true },
    });

    const isAdmin = user?.roles.includes("Admin");
    const hasTeamAccess = user?.teams.some((team) => team.id === teamId);

    if (!user || (!isAdmin && !hasTeamAccess)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    // Get form configuration for the team
    const formSections = await prisma.formSection.findMany({
      where: { teamId },
      include: {
        fields: {
          orderBy: { order: "asc" },
        },
      },
      orderBy: { order: "asc" },
    });

    // Convert options from JSON to proper format
    const sectionsWithParsedOptions = formSections.map((section) => ({
      ...section,
      fields: section.fields.map((field) => ({
        ...field,
        options: field.options
          ? JSON.parse(field.options as string)
          : undefined,
      })),
    }));

    return NextResponse.json({ sections: sectionsWithParsedOptions });
  } catch (error) {
    logger.error({ error }, "Error fetching form configuration");
    return NextResponse.json(
      { error: "Failed to fetch form configuration" },
      { status: 500 },
    );
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ teamId: string }> },
) {
  try {
    const session = await auth();
    const { teamId } = await params;

    if (!session?.user?.email) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Verify user has access to this team or is an admin
    const user = await prisma.user.findUnique({
      where: { email: session.user.email },
      include: { teams: true },
    });

    const isAdmin = user?.roles.includes("Admin");
    const hasTeamAccess = user?.teams.some((team) => team.id === teamId);

    if (!user || (!isAdmin && !hasTeamAccess)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const body = await request.json();
    const validatedData = formConfigSchema.parse(body);

    // Use transaction to update form configuration
    await prisma.$transaction(async (tx) => {
      // Delete existing configuration for this team
      await tx.formSection.deleteMany({
        where: { teamId },
      });

      // Create new configuration
      for (const sectionData of validatedData.sections) {
        const section = await tx.formSection.create({
          data: {
            name: sectionData.name,
            description: sectionData.description,
            order: sectionData.order,
            teamId,
          },
        });

        for (const fieldData of sectionData.fields) {
          await tx.formField.create({
            data: {
              key: fieldData.key,
              label: fieldData.label,
              description: fieldData.description,
              type: fieldData.type,
              placeholder: fieldData.placeholder,
              defaultValue: fieldData.defaultValue,
              isRequired: fieldData.isRequired,
              order: fieldData.order,
              minLength: fieldData.minLength,
              maxLength: fieldData.maxLength,
              minValue: fieldData.minValue,
              maxValue: fieldData.maxValue,
              pattern: fieldData.pattern,
              options: fieldData.options
                ? JSON.stringify(fieldData.options)
                : undefined,
              sectionId: section.id,
            },
          });
        }
      }
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    logger.error({ error }, "Error updating form configuration");

    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Invalid form configuration data", details: error.issues },
        { status: 400 },
      );
    }

    return NextResponse.json(
      { error: "Failed to update form configuration" },
      { status: 500 },
    );
  }
}
