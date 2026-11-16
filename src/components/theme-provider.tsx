"use client";

import * as React from "react";
import {
  DARK_QUERY,
  DEFAULT_THEME,
  isPublicPath,
  isThemePreference,
  THEME_STORAGE_KEY,
  type ThemePreference,
} from "@/lib/theme";

const readStoredTheme = (): ThemePreference => {
  try {
    const stored = window.localStorage.getItem(THEME_STORAGE_KEY);
    return isThemePreference(stored) ? stored : DEFAULT_THEME;
  } catch {
    return DEFAULT_THEME;
  }
};

const applyTheme = (theme: ThemePreference) => {
  const isDark =
    theme === "dark" ||
    (theme === "system" && window.matchMedia(DARK_QUERY).matches);
  const root = document.documentElement;
  root.classList.toggle("dark", isDark);
  root.style.colorScheme = isDark ? "dark" : "light";
};

type ThemeContextValue = {
  /** null until the stored preference has been read on the client. */
  theme: ThemePreference | null;
  setTheme: (theme: ThemePreference) => void;
};

const ThemeContext = React.createContext<ThemeContextValue | null>(null);

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  // The head script has already applied the stored theme; this only mirrors
  // it once we can read storage, so nothing is applied before that.
  const [theme, setThemeState] = React.useState<ThemePreference | null>(null);

  React.useEffect(() => {
    setThemeState(readStoredTheme());
  }, []);

  // Follow the OS while on "system", and keep other tabs in step.
  React.useEffect(() => {
    // Public pages stay light (lib/theme isPublicPath).
    if (!theme || isPublicPath(window.location.pathname)) return;
    applyTheme(theme);
    if (theme !== "system") return;

    const media = window.matchMedia(DARK_QUERY);
    const handleChange = () => applyTheme("system");
    media.addEventListener("change", handleChange);
    return () => media.removeEventListener("change", handleChange);
  }, [theme]);

  React.useEffect(() => {
    const handleStorage = (event: StorageEvent) => {
      if (event.key === THEME_STORAGE_KEY) {
        setThemeState(readStoredTheme());
      }
    };
    window.addEventListener("storage", handleStorage);
    return () => window.removeEventListener("storage", handleStorage);
  }, []);

  const setTheme = React.useCallback((next: ThemePreference) => {
    try {
      window.localStorage.setItem(THEME_STORAGE_KEY, next);
    } catch {
      // Storage can be unavailable (private mode); the choice still applies.
    }
    setThemeState(next);
  }, []);

  const value = React.useMemo(() => ({ theme, setTheme }), [theme, setTheme]);

  return (
    <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
  );
}

export const useTheme = () => {
  const context = React.useContext(ThemeContext);
  if (!context) {
    throw new Error("useTheme must be used within a ThemeProvider.");
  }
  return context;
};
