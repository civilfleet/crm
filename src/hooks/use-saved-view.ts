"use client";

import { useCallback, useEffect, useMemo, useRef } from "react";
import useSWR from "swr";
import type { ViewPreferenceSettings } from "@/validations/view-preferences";

const fetcher = async (url: string) => {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Could not load the saved view (${response.status})`);
  }
  return response.json();
};

const SAVE_DELAY_MS = 600;

/**
 * How the signed-in user last left one records list, saved on the server so
 * it follows them to any browser. `saved` is null when nothing is saved
 * yet. `isLoaded` is true only once the answer has arrived: if loading
 * fails it stays false, so a list never overwrites a real saved view with
 * its defaults. `save` is debounced: call it on every change. `remember`
 * says how the list opened, so that opening it saves nothing.
 *
 * `initial` is the saved view read on the server (null for none): then the
 * list opens with it at once, with no request first.
 */
export const useSavedView = (
  viewKey: string | null,
  initial?: ViewPreferenceSettings | null,
) => {
  // No key: nothing is loaded or saved, and the list opens with defaults.
  const { data, isLoading, error } = useSWR(
    viewKey ? `/api/view-preferences?key=${encodeURIComponent(viewKey)}` : null,
    fetcher,
    {
      revalidateOnFocus: false,
      revalidateIfStale: false,
      ...(initial !== undefined
        ? { fallbackData: { data: initial }, revalidateOnMount: false }
        : {}),
    },
  );
  const timeoutRef = useRef<number | null>(null);
  const lastSavedRef = useRef<string | null>(null);

  const save = useCallback(
    (settings: ViewPreferenceSettings) => {
      if (!viewKey) return;
      const serialized = JSON.stringify(settings);
      if (serialized === lastSavedRef.current) return;
      if (timeoutRef.current) window.clearTimeout(timeoutRef.current);
      timeoutRef.current = window.setTimeout(() => {
        lastSavedRef.current = serialized;
        void fetch("/api/view-preferences", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ key: viewKey, settings }),
          keepalive: true,
        }).catch(() => {
          // Saving a view is a convenience; a failed save is not worth an error.
          lastSavedRef.current = null;
        });
      }, SAVE_DELAY_MS);
    },
    [viewKey],
  );

  const remember = useCallback((settings: ViewPreferenceSettings) => {
    lastSavedRef.current = JSON.stringify(settings);
  }, []);

  useEffect(
    () => () => {
      if (timeoutRef.current) window.clearTimeout(timeoutRef.current);
    },
    [],
  );

  const saved = (data?.data ?? null) as ViewPreferenceSettings | null;
  const isLoaded = !isLoading && !error;

  return useMemo(
    () => ({ saved, isLoaded, save, remember }),
    [saved, isLoaded, save, remember],
  );
};
