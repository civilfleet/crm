import { NextResponse } from "next/server";
import { handlePrismaError } from "@/lib/utils";
import {
  getOrganizationTypeById,
  updateOrganizationType,
} from "@/services/organization-types";
import { updateOrganizationTypeSchema } from "@/validations/organization-types";

interface RouteParams {
  params: Promise<{
    id: string;
  }>;
}

export async function GET(req: Request, { params }: RouteParams) {
  try {
    const { id } = await params;
    const { searchParams } = new URL(req.url);
    const teamId = searchParams.get("teamId");

    if (!teamId) {
      return NextResponse.json(
        { error: "teamId is required" },
        { status: 400 },
      );
    }

    const type = await getOrganizationTypeById(id, teamId);

    if (!type) {
      return NextResponse.json(
        { error: "Organization type not found" },
        { status: 404 },
      );
    }

    return NextResponse.json({ data: type }, { status: 200 });
  } catch (e) {
    const { message } = handlePrismaError(e);
    return NextResponse.json(
      { error: message },
      { status: 400, statusText: message },
    );
  }
}

export async function PUT(req: Request, { params }: RouteParams) {
  try {
    const { id } = await params;
    const payload = await req.json();
    const validated = updateOrganizationTypeSchema.parse({ ...payload, id });

    const type = await updateOrganizationType(validated);

    return NextResponse.json({ data: type }, { status: 200 });
  } catch (e) {
    const { message } = handlePrismaError(e);
    return NextResponse.json(
      { error: message },
      { status: 400, statusText: message },
    );
  }
}
