import { redirect } from "next/navigation";
import { getUserModuleAccess } from "@/services/groups";
import { type AppModule, Roles } from "@/types";

interface TeamModuleAccessArgs {
  teamId: string;
  userId?: string;
  roles?: Roles[];
}

export const assertTeamModuleAccess = async (
  { teamId, userId, roles }: TeamModuleAccessArgs,
  module: AppModule,
) => {
  if (!userId) {
    redirect("/");
  }

  if (roles?.includes(Roles.Admin)) {
    return;
  }

  const resolvedUserId = userId ?? redirect("/");
  const modules = await getUserModuleAccess(resolvedUserId, teamId);

  if (!modules.includes(module)) {
    redirect("/");
  }
};

export const hasModuleAccess = async (
  { teamId, userId, roles }: TeamModuleAccessArgs,
  module: AppModule,
): Promise<boolean> => {
  if (!userId) {
    return false;
  }

  if (roles?.includes(Roles.Admin)) {
    return true;
  }

  const modules = await getUserModuleAccess(userId, teamId);
  return modules.includes(module);
};
