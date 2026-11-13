import { cookies } from "next/headers";
import {
  parseSidebarOpen,
  parseSidebarWidth,
  SIDEBAR_COOKIE_NAME,
  SIDEBAR_WIDTH_COOKIE_NAME,
} from "@/lib/sidebar-state-values";

/** Whether the sidebar was left open (the default) or collapsed. */
export const getSidebarDefaultOpen = async () => {
  const cookieStore = await cookies();
  return parseSidebarOpen(cookieStore.get(SIDEBAR_COOKIE_NAME)?.value);
};

/** The width the sidebar was dragged to, if any, within its limits. */
export const getSidebarWidth = async () => {
  const cookieStore = await cookies();
  return parseSidebarWidth(cookieStore.get(SIDEBAR_WIDTH_COOKIE_NAME)?.value);
};
