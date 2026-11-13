// Written by SidebarProvider in components/ui/sidebar.tsx ("1" open, "0" collapsed).
export const SIDEBAR_COOKIE_NAME = "sidebar:state";

// Written by the sidebar's rail when a drag ends (px).
export const SIDEBAR_WIDTH_COOKIE_NAME = "sidebar:width";

/** The widths the rail may be dragged to (SIDEBAR_WIDTH_PX in ui/sidebar). */
export const SIDEBAR_WIDTH_LIMITS = { min: 208, max: 400 } as const;

/** Open unless it was explicitly collapsed. */
export const parseSidebarOpen = (value: string | undefined) => value !== "0";

/** A stored width within the limits, otherwise none (the default width). */
export const parseSidebarWidth = (value: string | undefined) => {
  if (!value) return undefined;
  const width = Number(value);
  return Number.isFinite(width) &&
    width >= SIDEBAR_WIDTH_LIMITS.min &&
    width <= SIDEBAR_WIDTH_LIMITS.max
    ? width
    : undefined;
};
