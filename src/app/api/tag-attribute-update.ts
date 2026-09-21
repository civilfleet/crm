import { verifyTeamAccess } from "@/lib/api-guard";
import { updateEntityTags } from "@/services/tags";
import type { Roles, TaggableEntityType } from "@/types";
import { tagAttributeUpdateSchema } from "@/validations/tags";

const tagOnlyKeys = new Set(["teamId", "entityId", "entityType", "tags"]);

export const isTagAttributeUpdate = (payload: unknown) => {
  if (!payload || typeof payload !== "object" || !("tags" in payload)) {
    return false;
  }
  return Object.keys(payload).every((key) => tagOnlyKeys.has(key));
};

export const updateTagAttribute = async (
  payload: unknown,
  expectedEntityType: TaggableEntityType,
  routeEntityId?: string,
) => {
  const input = tagAttributeUpdateSchema.parse({
    ...(payload as Record<string, unknown>),
    entityId:
      routeEntityId ?? (payload as Record<string, unknown> | null)?.entityId,
    entityType: expectedEntityType,
  });
  const session = await verifyTeamAccess(input.teamId, {
    requireModule: "CRM",
  });
  const userId = session.user.userId;
  if (!userId) throw new Error("User id is missing");

  return updateEntityTags(
    {
      teamId: input.teamId,
      userId,
      roles: (session.user.roles ?? []) as Roles[],
    },
    expectedEntityType,
    input.entityId,
    input.tags,
  );
};
