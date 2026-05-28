export const CONTACT_SUBMODULES = ["SUPERVISION", "EVENTS", "SHOP"] as const;

export type ContactSubmodule = (typeof CONTACT_SUBMODULES)[number];

export const CONTACT_SUBMODULE_LABELS: Record<ContactSubmodule, string> = {
  SUPERVISION: "Supervision",
  EVENTS: "Events",
  SHOP: "Shop",
};

export const CONTACT_SUBMODULE_FIELDS: Record<ContactSubmodule, string[]> = {
  SUPERVISION: [
    "gender",
    "genderRequestPreference",
    "isBipoc",
    "racismRequestPreference",
    "otherMargins",
    "onboardingDate",
    "breakUntil",
  ],
  EVENTS: [],
  SHOP: [],
};
