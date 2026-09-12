import { NextResponse } from "next/server";
import { APP_NAME } from "@/constants/app";
import {
  ApiError,
  handleApiError,
  verifyFundingRequestAccess,
  requireGlobalAdmin,
  verifyOrganizationAccess,
  verifyTeamAccess,
} from "@/lib/api-guard";
import { sendEmail } from "@/lib/nodemailer";
import { getAppUrl, getLoginUrl, handlePrismaError } from "@/lib/utils";
import { ensureTeamOwner } from "@/services/teams";
import { createUser, getUsers, getUsersForDonation } from "@/services/users";
import { Roles } from "@/types";
import { createUserSchema } from "@/validations/organizations";

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const searchQuery = searchParams.get("query") || "";
    const teamId = searchParams.get("teamId") || "";
    const fundingRequestId = searchParams.get("fundingRequestId") || "";
    const organizationId = searchParams.get("organizationId") || "";
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

    if (teamId) {
      await verifyTeamAccess(teamId);
    } else if (organizationId) {
      await verifyOrganizationAccess(organizationId);
    } else {
      await requireGlobalAdmin();
    }
    if (fundingRequestId) {
      const access = await verifyFundingRequestAccess(fundingRequestId, {
        requireModule: "FUNDING",
      });
      if (
        (teamId && access.fundingRequest.teamId !== teamId) ||
        (organizationId && access.organizationId !== organizationId)
      ) {
        throw new ApiError(404, "Funding request not found in this scope");
      }
    }
    const dataPromise =
      fundingRequestId && teamId
        ? getUsersForDonation({
            teamId,
            fundingRequestId,
          })
        : getUsers(
            {
              teamId: teamId || undefined,
              organizationId: organizationId || undefined,
            },
            searchQuery,
            hasPagination ? { page, pageSize } : undefined,
          );

    const ownerPromise = teamId ? ensureTeamOwner(teamId) : undefined;

    const [result, ownerId] = await Promise.all([
      dataPromise,
      ownerPromise ?? Promise.resolve(undefined),
    ]);

    const data = Array.isArray(result) ? result : result.data;
    const total = Array.isArray(result) ? result.length : result.total;
    const totalPages = pageSize > 0 ? Math.ceil(total / pageSize) : 1;

    return NextResponse.json(
      { data, ownerId: ownerId ?? null, total, page, pageSize, totalPages },

      { status: 200 },
    );
  } catch (e) {
    const apiError = handleApiError(e);
    if (apiError) return apiError;
    const handledError = handlePrismaError(e);
    return NextResponse.json(
      { error: handledError?.message },
      { status: 400, statusText: handledError?.message },
    );
  }
}

export async function POST(req: Request) {
  try {
    const user = await req.json();
    const teamId = user.teamId;
    const organizationId = user.organizationId;
    const validatedData = createUserSchema.parse(user);

    if (!teamId) {
      if (!organizationId) {
        await requireGlobalAdmin();
      } else {
        await verifyOrganizationAccess(organizationId);
      }
      await createUser({
        ...validatedData,
        organizationId: organizationId,
        roles: organizationId
          ? [Roles.Organization]
          : user.roles || [Roles.Organization],
      });
    } else {
      await verifyTeamAccess(teamId, { requireAdmin: true });
      await createUser({
        ...validatedData,
        teamId: teamId,
        roles: [Roles.Team],
      });
    }

    const loginUrl = getLoginUrl();
    const appUrl = getAppUrl();
    const appName = APP_NAME;

    const subject = appUrl
      ? `You're In! Welcome to ${appUrl}.`
      : `You're In! Welcome to ${appName}.`;

    await sendEmail(
      {
        to: validatedData.email,
        subject,
        template: "welcome",
      },
      {
        name: validatedData.name,
        email: validatedData.email,
        loginUrl,
        appUrl,
        appName,
      },
    );

    return NextResponse.json(
      {
        data: "success",
      },

      { status: 201 },
    );
  } catch (e) {
    const apiError = handleApiError(e);
    if (apiError) return apiError;
    const { message } = handlePrismaError(e);
    return NextResponse.json(
      { error: message },
      { status: 400, statusText: message },
    );
  }
}
