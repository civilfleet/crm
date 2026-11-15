"use client";

import { useCallback, useRef } from "react";

/*
  Shift-click selects a range, as in a mail client or a file manager: from
  the row clicked last to this one, all on or all off (as this row
  becomes). A plain click only remembers where the range starts.

    const select = useRangeSelect(ids, isSelected, setSelected);
    <Checkbox onClick={(event) => select(event, row.id)} … />

  On a Radix checkbox, a shift-click is handled here and its own toggle is
  prevented; any other click toggles as usual.
*/

export const useRangeSelect = (
  /** The rows in the order they're shown. */
  ids: readonly string[],
  isSelected: (id: string) => boolean,
  /** Puts these rows on (or off), leaving the others as they are. */
  setSelected: (ids: string[], selected: boolean) => void,
) => {
  const anchor = useRef<string | null>(null);
  return useCallback(
    (event: { shiftKey: boolean; preventDefault: () => void }, id: string) => {
      const from = anchor.current ? ids.indexOf(anchor.current) : -1;
      const to = ids.indexOf(id);
      if (event.shiftKey && from !== -1 && to !== -1 && from !== to) {
        event.preventDefault();
        const [start, end] = from < to ? [from, to] : [to, from];
        setSelected(ids.slice(start, end + 1), !isSelected(id));
      }
      anchor.current = id;
    },
    [ids, isSelected, setSelected],
  );
};
