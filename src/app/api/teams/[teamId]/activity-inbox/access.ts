import { verifyTeamAccess } from "@/lib/api-guard";
import { getAllowedContactSubmodules } from "@/services/contacts/submodule-access";
import { getTeamAdminAccess } from "@/services/teams/access";
import type { Roles } from "@/types";

export const getActivityInboxAccess = async (teamId: string) => {
  const session = await verifyTeamAccess(teamId, { requireModule: "CRM" });
  const userId = session.user.userId;
  if (!userId) throw new Error("Authenticated user is required.");
  const roles = (session.user.roles ?? []) as Roles[];
  const [allowedSubmodules, adminAccess] = await Promise.all([
    getAllowedContactSubmodules(teamId, userId, roles),
    getTeamAdminAccess(userId, teamId, roles),
  ]);
  return {
    teamId,
    userId,
    roles,
    allowedSubmodules,
    isAdmin: adminAccess.allowed,
  };
};
