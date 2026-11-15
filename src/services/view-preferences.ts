import prisma from "@/lib/prisma";
import type { ViewPreferenceSettings } from "@/validations/view-preferences";

/**
 * How a user last left one records list, or null. Read on the server so a
 * list can open the way they left it without a second round trip.
 */
export const getViewPreference = async (
  userId: string | undefined,
  viewKey: string,
): Promise<ViewPreferenceSettings | null> => {
  if (!userId) return null;
  const preference = await prisma.userViewPreference.findUnique({
    where: { userId_viewKey: { userId, viewKey } },
    select: { settings: true },
  });
  return (preference?.settings ?? null) as ViewPreferenceSettings | null;
};
