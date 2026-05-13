const DEFAULT_APP_NAME = "Dashboard";

export const APP_NAME =
  process.env.NEXT_PUBLIC_APP_NAME?.trim() || DEFAULT_APP_NAME;