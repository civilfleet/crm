"use client";

import { useSyncExternalStore } from "react";
import { themeInitScript } from "@/lib/theme";

const subscribe = () => () => undefined;

/**
 * The theme bootstrap in <head>: it runs from the server's HTML, before the
 * page paints. React reuses that element when hydrating; when it renders
 * the page anew in the browser (after a hydration error, or a dev server
 * restart) a script element would never run and React warns about it, so
 * there it renders nothing: the theme is already set.
 */
export const ThemeScript = () => {
  // The server snapshot (true) during server rendering and hydration; the
  // client's (false) for anything React renders in the browser on its own.
  const fromServer = useSyncExternalStore(
    subscribe,
    () => false,
    () => true,
  );
  if (!fromServer) return null;
  return (
    <script
      // biome-ignore lint/security/noDangerouslySetInnerHtml: static, first-party theme bootstrap; must run before paint to avoid a theme flash
      dangerouslySetInnerHTML={{ __html: themeInitScript }}
    />
  );
};
