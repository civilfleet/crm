import { NextResponse } from "next/server";
import { handlePrismaError } from "@/lib/utils";
import {
  deleteOrganization,
  getOrganizationById,
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

    const data = await getOrganizationById(organizationId);
    return NextResponse.json({ data }, { status: 200 });
  } catch (e) {
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
    const updatedOrganization = await updateOrganization(
      organizationData,
      organizationId,
    );

    return NextResponse.json({ data: updatedOrganization }, { status: 200 });
  } catch (e) {
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

    await deleteOrganization(organizationId);
    return NextResponse.json(
      { message: "Organization deleted successfully" },
      { status: 200 },
    );
  } catch (e) {
    const { message } = handlePrismaError(e);
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
