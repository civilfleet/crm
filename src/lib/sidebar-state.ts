import { cookies } from "next/headers";

// Written by SidebarProvider in components/ui/sidebar.tsx ("1" open, "0" collapsed).
const SIDEBAR_COOKIE_NAME = "sidebar:state";

export const getSidebarDefaultOpen = async () => {
  const cookieStore = await cookies();
  return cookieStore.get(SIDEBAR_COOKIE_NAME)?.value !== "0";
};

// Written by the sidebar's rail when a drag ends (px).
const SIDEBAR_WIDTH_COOKIE_NAME = "sidebar:width";

/** The width the sidebar was dragged to, if any, within its limits. */
export const getSidebarWidth = async () => {
  const cookieStore = await cookies();
  const value = Number(cookieStore.get(SIDEBAR_WIDTH_COOKIE_NAME)?.value);
  return Number.isFinite(value) && value >= 208 && value <= 400
    ? value
    : undefined;
};
