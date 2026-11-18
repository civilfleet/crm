import { NextResponse } from "next/server";
import { updateTagAttribute } from "@/app/api/tag-attribute-update";
import { handleApiError, verifyOrganizationAccess } from "@/lib/api-guard";
import { handlePrismaError } from "@/lib/utils";
import {
  getOrganizationById,
  trashOrganization,
  updateOrganization,
} from "@/services/organizations";

export async function GET(
  _req: Request,
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

    await verifyOrganizationAccess(organizationId);
    const data = await getOrganizationById(organizationId);
    return NextResponse.json({ data }, { status: 200 });
  } catch (e) {
    const apiError = handleApiError(e);
    if (apiError) return apiError;
    const { message } = handlePrismaError(e);
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

export async function PUT(
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

    const organizationData = await req.json();
    await verifyOrganizationAccess(organizationId);
    const updatedOrganization = await updateOrganization(
      organizationData,
      organizationId,
    );

    return NextResponse.json({ data: updatedOrganization }, { status: 200 });
  } catch (e) {
    const apiError = handleApiError(e);
    if (apiError) return apiError;
    const { message } = handlePrismaError(e);
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

export async function DELETE(
  _req: Request,
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

    await verifyOrganizationAccess(organizationId, { requireTeamAdmin: true });
    // To the trash; deleting for good is /trash (DELETE).
    await trashOrganization(organizationId);
    return NextResponse.json(
      { message: "Organization moved to the trash" },
      { status: 200 },
    );
  } catch (e) {
    const apiError = handleApiError(e);
    if (apiError) return apiError;
    const { message } = handlePrismaError(e);
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const organizationId = (await params).id;
    const tags = await updateTagAttribute(
      await req.json(),
      "ORGANIZATION",
      organizationId,
    );
    return NextResponse.json({ data: { tags } }, { status: 200 });
  } catch (e) {
    const apiError = handleApiError(e);
    if (apiError) return apiError;
    const { message } = handlePrismaError(e);
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
