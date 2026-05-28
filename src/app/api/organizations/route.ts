import type { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import { z } from "zod";
import { APP_NAME } from "@/constants/app";
import logger from "@/lib/logger";
import { sendEmail } from "@/lib/nodemailer";
import prisma from "@/lib/prisma";
import { getAppUrl, getLoginUrl, handlePrismaError } from "@/lib/utils";
import {
  createOrUpdateOrganization,
  getOrganizations,
} from "@/services/organizations";
import { DEFAULT_TEAM_MODULES } from "@/types";
import { organizationFiltersSchema } from "@/validations/organization-filters";
import {
  createOrganizationSchema,
  updateOrganizationSchema,
} from "@/validations/organizations";

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const searchQuery = searchParams.get("query") || "";
    const teamId = searchParams.get("teamId") || "";
    const filtersParam = searchParams.get("filters");
    const hasPageParam = searchParams.has("page");
    const hasPageSizeParam = searchParams.has("pageSize");
    const hasPagination = hasPageParam || hasPageSizeParam;
    const pageParam = Number(searchParams.get("page") || "1");
    const pageSizeParam = Number(searchParams.get("pageSize") || "10");
    const page =
      Number.isFinite(pageParam) && pageParam > 0 ? Math.floor(pageParam) : 1;
    const pageSize =
      Number.isFinite(pageSizeParam) && pageSizeParam > 0
        ? Math.min(Math.floor(pageSizeParam), 100)
        : 10;
    const parsedFilters = filtersParam
      ? organizationFiltersSchema.parse(JSON.parse(filtersParam))
      : [];

    const { data, total } = await getOrganizations(
      searchQuery,
      teamId,
      parsedFilters,
      hasPagination ? { page, pageSize } : undefined,
    );
    const totalPages = pageSize > 0 ? Math.ceil(total / pageSize) : 1;

    return NextResponse.json(
      {
        data,
        total,
        page,
        pageSize,
        totalPages,
      },
      { status: 200 },
    );
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
    const organizationData = await req.json();
    logger.debug(
      {
        teamId: organizationData?.teamId,
        isFilledByOrg: organizationData?.isFilledByOrg,
      },
      "Organization create request received",
    );
    const validatedData = createOrganizationSchema
      .and(z.object({ teamId: z.uuid() }))
      .and(z.object({ isFilledByOrg: z.boolean() }))
      .parse({ ...organizationData });

    if (validatedData.isFilledByOrg) {
      const team = await prisma.teams.findUnique({
        where: { id: validatedData.teamId },
        select: { modules: true },
      });
      const teamModules =
        team?.modules && team.modules.length > 0
          ? team.modules
          : [...DEFAULT_TEAM_MODULES];

      if (!team || !teamModules.includes("FUNDING")) {
        return NextResponse.json(
          { error: "Organization self-registration is disabled" },
          {
            status: 403,
            statusText: "Organization self-registration is disabled",
          },
        );
      }
    }
    const normalizedData = {
      ...validatedData,
      portalAccessEnabled:
        validatedData.portalAccessEnabled || validatedData.isFilledByOrg,
      profileData: validatedData.profileData as
        | Prisma.InputJsonValue
        | undefined,
    };
    const { organization, user } =
      await createOrUpdateOrganization(normalizedData);

    // if teamId is provided, it means the organization is created by a team
    if (organizationData.teamId) {
      const loginUrl = getLoginUrl();
      const appUrl = getAppUrl();
      const appName = APP_NAME;
      const subject = appUrl
        ? `You're In! Welcome to ${appUrl}.`
        : `You're In! Welcome to ${appName}.`;

      const emails = [
        sendEmail(
          {
            to: organization.email,
            subject,
            template: "welcome",
          },
          {
            name: organization.name,
            email: validatedData.email,
            loginUrl,
            appUrl,
            appName,
          },
        ),
      ];

      if (user?.email) {
        emails.push(
          sendEmail(
            {
              to: user.email,
              subject,
              template: "welcome",
            },
            {
              name: user.name,
              email: user.email,
              loginUrl,
              appUrl,
              appName,
            },
          ),
        );
      }

      await Promise.all(emails);
    }

    return NextResponse.json(
      {
        message: "success",
        data: {
          id: organization.id,
        },
      },
      { status: 201 },
    );
  } catch (e) {
    const { message } = handlePrismaError(e);
    logger.error({ message }, "Organization create failed");
    return NextResponse.json(
      { error: message },
      { status: 400, statusText: message },
    );
  }
}

// ✅ POST (Create Organization)
export async function PUT(req: Request) {
  try {
    const organization = await req.json();
    const validatedData = updateOrganizationSchema
      .and(z.object({ isFilledByOrg: z.boolean() }))
      .parse({ ...organization });
    const normalizedData = {
      ...validatedData,
      profileData: validatedData.profileData as
        | Prisma.InputJsonValue
        | undefined,
    };
    await createOrUpdateOrganization(normalizedData);
    return NextResponse.json(
      {
        message: "success",
      },
      { status: 201 },
    );
  } catch (e) {
    const { message } = handlePrismaError(e);
    return NextResponse.json(
      { error: message },
      { status: 400, statusText: message },
    );
  }
}