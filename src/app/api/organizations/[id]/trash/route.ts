import { NextResponse } from "next/server";
import { handleApiError, verifyOrganizationAccess } from "@/lib/api-guard";
import { handlePrismaError } from "@/lib/utils";
import {
  permanentlyDeleteOrganization,
  restoreOrganization,
} from "@/services/organizations";

/*
  An organization in the trash: PATCH restores it, DELETE deletes it for
  good with its funding requests, agreements and files. Team admins only
  (docs/DATA_RULES.md, "Organizations in the trash").
*/

type Context = { params: Promise<{ id: string }> };

const handleTrashAction = async (
  { params }: Context,
  action: "restore" | "delete",
) => {
  try {
    const organizationId = (await params).id;
    await verifyOrganizationAccess(organizationId, {
      requireTeamAdmin: true,
      allowTrashed: true,
    });
    if (action === "restore") await restoreOrganization(organizationId);
    else await permanentlyDeleteOrganization(organizationId);
    return NextResponse.json({ data: { id: organizationId } });
  } catch (error) {
    const apiError = handleApiError(error);
    if (apiError) return apiError;
    const { message } = handlePrismaError(error);
    return NextResponse.json({ error: message }, { status: 400 });
  }
};

export async function PATCH(_req: Request, context: Context) {
  return handleTrashAction(context, "restore");
}

export async function DELETE(_req: Request, context: Context) {
  return handleTrashAction(context, "delete");
}
