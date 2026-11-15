import type { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import {
  ApiError,
  getAuthenticatedSession,
  handleApiError,
  requireGlobalAdmin,
  verifyOrganizationAccess,
  verifyTeamAccess,
} from "@/lib/api-guard";
import prisma from "@/lib/prisma";
import { getViewPreference } from "@/services/view-preferences";
import {
  getViewKeyScope,
  MAX_VIEW_SETTINGS_BYTES,
  saveViewPreferenceSchema,
  viewKeySchema,
} from "@/validations/view-preferences";

/*
  The signed-in user's own saved view of one records list (columns, sort,
  filters). A person only ever reads and writes their own rows, and only for
  a team, organization or admin list they can open.
*/

const assertScopeAccess = async (key: string) => {
  const scope = getViewKeyScope(key);
  if (scope.kind === "admin") {
    await requireGlobalAdmin();
  } else if (scope.kind === "org") {
    await verifyOrganizationAccess(scope.id);
  } else {
    await verifyTeamAccess(scope.id);
  }
};

const errorResponse = (error: unknown) =>
  handleApiError(error) ??
  NextResponse.json(
    { error: "Could not handle the saved view" },
    { status: 500 },
  );

export async function GET(req: Request) {
  try {
    const { userId } = (await getAuthenticatedSession()).user;
    const key = viewKeySchema.safeParse(
      new URL(req.url).searchParams.get("key"),
    );
    if (!key.success) {
      throw new ApiError(400, "Invalid view key");
    }
    await assertScopeAccess(key.data);

    return NextResponse.json({
      data: await getViewPreference(userId, key.data),
    });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function PUT(req: Request) {
  try {
    const { userId } = (await getAuthenticatedSession()).user;
    if (!userId) {
      throw new ApiError(401, "Unauthorized");
    }
    const body = await req.json().catch(() => null);
    const parsed = saveViewPreferenceSchema.safeParse(body);
    if (!parsed.success) {
      throw new ApiError(400, "Invalid view settings");
    }
    if (JSON.stringify(parsed.data.settings).length > MAX_VIEW_SETTINGS_BYTES) {
      throw new ApiError(413, "View settings are too large");
    }
    await assertScopeAccess(parsed.data.key);

    // Validated above, and it came in as JSON, so it goes back out as JSON.
    const settings = parsed.data.settings as Prisma.InputJsonValue;
    await prisma.userViewPreference.upsert({
      where: { userId_viewKey: { userId, viewKey: parsed.data.key } },
      create: { userId, viewKey: parsed.data.key, settings },
      update: { settings },
    });

    return NextResponse.json({ data: parsed.data.settings });
  } catch (error) {
    return errorResponse(error);
  }
}
