import {
  DEFAULT_ACCOUNT_CREATION_CONTACT_URL,
  GLOBAL_SETTINGS_ID,
} from "@/constants/global-settings";
import prisma from "@/lib/prisma";
import type { GlobalSettingsInput } from "@/validations/global-settings";

export type PublicGlobalSettings = {
  accountCreationContactUrl: string;
};

export const getGlobalSettings = async (): Promise<PublicGlobalSettings> => {
  const settings = await prisma.globalSettings.findUnique({
    where: { id: GLOBAL_SETTINGS_ID },
    select: { accountCreationContactUrl: true },
  });

  return {
    accountCreationContactUrl:
      settings?.accountCreationContactUrl ??
      DEFAULT_ACCOUNT_CREATION_CONTACT_URL,
  };
};

export const updateGlobalSettings = async (
  input: GlobalSettingsInput,
): Promise<PublicGlobalSettings> => {
  return prisma.globalSettings.upsert({
    where: { id: GLOBAL_SETTINGS_ID },
    create: {
      id: GLOBAL_SETTINGS_ID,
      accountCreationContactUrl: input.accountCreationContactUrl,
    },
    update: {
      accountCreationContactUrl: input.accountCreationContactUrl,
    },
    select: { accountCreationContactUrl: true },
  });
};
