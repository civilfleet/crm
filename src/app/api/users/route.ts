import { NextResponse } from "next/server";
import { APP_NAME } from "@/constants/app";
import {
  ApiError,
  handleApiError,
  requireGlobalAdmin,
  verifyFundingRequestAccess,
  verifyOrganizationAccess,
  verifyTeamAccess,
} from "@/lib/api-guard";
import { type RecordSort, readList } from "@/lib/list-request";
import { sendEmail } from "@/lib/nodemailer";
import { getAppUrl, getLoginUrl, handlePrismaError } from "@/lib/utils";
import { ensureTeamOwner } from "@/services/teams";
import {
  createUser,
  getUsers,
  getUsersForDonation,
  USER_SORT_FIELDS,
  type UserSortField,
} from "@/services/users";
import { Roles } from "@/types";
import { createUserSchema } from "@/validations/organizations";

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const searchQuery = searchParams.get("query") || "";
    const searchField = searchParams.get("field") || "all";
    const groupId = searchParams.get("groupId") || undefined;
    const teamId = searchParams.get("teamId") || "";
    const fundingRequestId = searchParams.get("fundingRequestId") || "";
    const organizationId = searchParams.get("organizationId") || "";
    const groupIds = (searchParams.get("groupIds") || "")
      .split(",")
      .map((id) => id.trim())
      .filter(Boolean);
    const roleValues: string[] = Object.values(Roles);
    const roles = (searchParams.get("roles") || "")
      .split(",")
      .filter((role): role is Roles => roleValues.includes(role));
    // Lists page and sort; callers without a page get every user.
    const list = readList(searchParams, {
      sort: USER_SORT_FIELDS,
      paging: "optional",
      pageSize: 10,
    });

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
            list
              ? {
                  page: list.page,
                  pageSize: list.pageSize,
                  sorts: list.sorts as RecordSort<UserSortField>[],
                }
              : undefined,
            {
              field: searchField,
              groupId,
              ...(groupIds.length ? { groupIds } : {}),
              ...(roles.length ? { roles } : {}),
            },
          );

    const ownerPromise = teamId ? ensureTeamOwner(teamId) : undefined;

    const [result, ownerId] = await Promise.all([
      dataPromise,
      ownerPromise ?? Promise.resolve(undefined),
    ]);

    const data = Array.isArray(result) ? result : result.data;
    const total = Array.isArray(result) ? result.length : result.total;
    const page = list?.page ?? 1;
    const pageSize = list?.pageSize ?? Math.max(total, 1);
    const totalPages = Math.max(Math.ceil(total / pageSize), 1);

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
        await verifyOrganizationAccess(organizationId, {
          requireTeamAdmin: true,
        });
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
