import { NextResponse } from "next/server";
import { handleApiError, verifyTeamAccess } from "@/lib/api-guard";
import { handlePrismaError } from "@/lib/utils";
import {
  permanentlyDeleteContacts,
  restoreContacts,
} from "@/services/contacts";
import type { Roles } from "@/types";
import { deleteContactsSchema } from "@/validations/contacts";

const handleTrashAction = async (
  req: Request,
  action: "restore" | "delete",
) => {
  try {
    const validated = deleteContactsSchema.parse(await req.json());
    const session = await verifyTeamAccess(validated.teamId, {
      requireModule: "CRM",
    });
    const args = [
      validated.teamId,
      validated.ids,
      session.user.userId,
      (session.user.roles ?? []) as Roles[],
    ] as const;
    const count =
      action === "restore"
        ? await restoreContacts(...args)
        : await permanentlyDeleteContacts(...args);

    return NextResponse.json({ data: { count } }, { status: 200 });
  } catch (error) {
    const apiError = handleApiError(error);
    if (apiError) return apiError;
    const { message } = handlePrismaError(error);
    return NextResponse.json(
      { error: message },
      { status: 400, statusText: message },
    );
  }
};

export async function PATCH(req: Request) {
  return handleTrashAction(req, "restore");
}

export async function DELETE(req: Request) {
  return handleTrashAction(req, "delete");
}
