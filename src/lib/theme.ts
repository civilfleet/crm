export type ThemePreference = "light" | "dark" | "system";

export const THEME_STORAGE_KEY = "theme";
/** Until someone chooses, the app stays light. */
export const DEFAULT_THEME: ThemePreference = "light";
export const DARK_QUERY = "(prefers-color-scheme: dark)";

/**
 * Public pages (/public/…, for website visitors) keep their own light design,
 * whatever theme the person chose inside the app.
 */
export const isPublicPath = (pathname: string) =>
  pathname === "/public" || pathname.startsWith("/public/");

// The same test, as source for the head script below.
const PUBLIC_PATH_TEST =
  '(location.pathname==="/public"||location.pathname.indexOf("/public/")===0)';

export const isThemePreference = (value: unknown): value is ThemePreference =>
  value === "light" || value === "dark" || value === "system";

/*
  Runs in <head> before the body paints, so the page never flashes the wrong
  theme. Keep it in step with applyTheme in components/theme-provider.tsx; it
  is a string because it has to execute before any of our JavaScript loads.
*/
export const themeInitScript = `(function(){try{var r=document.documentElement;if(${PUBLIC_PATH_TEST}){r.classList.remove("dark");r.style.colorScheme="light";return;}var t=localStorage.getItem("${THEME_STORAGE_KEY}");if(t!=="dark"&&t!=="system")t="${DEFAULT_THEME}";var d=t==="dark"||(t==="system"&&matchMedia("${DARK_QUERY}").matches);r.classList.toggle("dark",d);r.style.colorScheme=d?"dark":"light";}catch(e){}})();`;
