import {
  MAX_COLUMN_WIDTH,
  MIN_COLUMN_WIDTH,
} from "@/validations/view-preferences";

/*
  A records grid's column layout as the user dragged it: widths within
  bounds, and an order that keeps pinned columns first and copes with
  columns added or removed since it was saved.
*/

export const clampWidth = (width: number) =>
  Math.min(MAX_COLUMN_WIDTH, Math.max(MIN_COLUMN_WIDTH, Math.round(width)));

/**
 * Every column id in display order: the pinned ones first (they never move),
 * then the user's order, then any column it does not know yet, as listed.
 */
export const displayOrder = (
  ids: string[],
  pinned: Set<string>,
  saved: string[],
) => {
  const known = new Set(ids);
  const fromSaved = saved.filter((id) => known.has(id) && !pinned.has(id));
  const placed = new Set(fromSaved);
  return [
    ...ids.filter((id) => pinned.has(id)),
    ...fromSaved,
    ...ids.filter((id) => !pinned.has(id) && !placed.has(id)),
  ];
};

/** `order` with `id` moved next to `targetId` (before or after it). */
export const moveColumnId = (
  order: string[],
  id: string,
  targetId: string,
  side: "before" | "after",
) => {
  if (id === targetId) return order;
  const rest = order.filter((entry) => entry !== id);
  const at = rest.indexOf(targetId);
  if (at < 0) return order;
  rest.splice(side === "before" ? at : at + 1, 0, id);
  return rest;
};
