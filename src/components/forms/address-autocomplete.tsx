"use client";

import { Loader2, MapPin } from "lucide-react";
import { type KeyboardEvent, type Ref, useId, useRef, useState } from "react";
import useSWR from "swr";
import { Input } from "@/components/ui/input";
import { useDebounce } from "@/hooks/use-debounce";
import type { AddressSuggestion } from "@/lib/address-suggestions";
import { cn } from "@/lib/utils";

type AddressSuggestionsResponse = {
  data?: AddressSuggestion[];
  error?: string;
};

const fetchSuggestions = async (
  url: string,
): Promise<AddressSuggestionsResponse> => {
  const response = await fetch(url);
  const body = (await response.json().catch(() => ({}))) as {
    data?: AddressSuggestion[];
    error?: string;
  };
  if (!response.ok) {
    throw new Error(body.error || "Address suggestions are unavailable");
  }
  return body;
};

type AddressAutocompleteProps = {
  id?: string;
  value: string;
  onValueChange: (value: string) => void;
  onSuggestionSelect: (suggestion: AddressSuggestion) => void;
  onBlur?: () => void;
  inputRef?: Ref<HTMLInputElement>;
  name?: string;
  teamId?: string;
  organizationId?: string;
  country?: string;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  "aria-describedby"?: string;
  "aria-invalid"?: boolean | "true" | "false";
};

export function AddressAutocomplete({
  id,
  value,
  onValueChange,
  onSuggestionSelect,
  onBlur,
  inputRef,
  name,
  teamId,
  organizationId,
  country,
  placeholder = "Street address",
  disabled = false,
  className,
  "aria-describedby": ariaDescribedBy,
  "aria-invalid": ariaInvalid,
}: AddressAutocompleteProps) {
  const listboxId = useId();
  const wrapperRef = useRef<HTMLDivElement>(null);
  const [isFocused, setIsFocused] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(0);
  const debouncedQuery = useDebounce(value.trim(), 350);
  const canSearch =
    isFocused &&
    debouncedQuery.length >= 3 &&
    Boolean(teamId || organizationId);

  const params = new URLSearchParams();
  if (canSearch) {
    params.set("query", debouncedQuery);
    if (teamId) params.set("teamId", teamId);
    if (organizationId) params.set("organizationId", organizationId);
    if (country?.trim()) params.set("country", country.trim());
  }
  const requestUrl = canSearch
    ? `/api/address-suggestions?${params.toString()}`
    : null;
  const { data, error, isLoading } = useSWR(requestUrl, fetchSuggestions, {
    keepPreviousData: false,
    revalidateOnFocus: false,
  });
  const suggestions = data?.data ?? [];
  const showPanel =
    canSearch &&
    (isLoading || Boolean(error) || Boolean(data) || suggestions.length > 0);

  const selectSuggestion = (suggestion: AddressSuggestion) => {
    onSuggestionSelect(suggestion);
    setIsFocused(false);
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (!showPanel || suggestions.length === 0) {
      if (event.key === "Escape") setIsFocused(false);
      return;
    }
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setHighlightedIndex((current) =>
        Math.min(current + 1, suggestions.length - 1),
      );
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setHighlightedIndex((current) => Math.max(current - 1, 0));
    } else if (event.key === "Enter") {
      event.preventDefault();
      const suggestion = suggestions[highlightedIndex];
      if (suggestion) selectSuggestion(suggestion);
    } else if (event.key === "Escape") {
      event.preventDefault();
      setIsFocused(false);
    }
  };

  return (
    <div ref={wrapperRef} className="relative">
      <Input
        id={id}
        ref={inputRef}
        name={name}
        value={value}
        onChange={(event) => {
          onValueChange(event.target.value);
          setHighlightedIndex(0);
          setIsFocused(true);
        }}
        onFocus={() => setIsFocused(true)}
        onBlur={(event) => {
          if (wrapperRef.current?.contains(event.relatedTarget)) return;
          setIsFocused(false);
          onBlur?.();
        }}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        disabled={disabled}
        autoComplete="street-address"
        role="combobox"
        aria-autocomplete="list"
        aria-haspopup="listbox"
        aria-controls={listboxId}
        aria-expanded={showPanel}
        aria-describedby={ariaDescribedBy}
        aria-invalid={ariaInvalid}
        aria-activedescendant={
          showPanel && suggestions[highlightedIndex]
            ? `${listboxId}-${highlightedIndex}`
            : undefined
        }
        className={className}
      />
      {showPanel ? (
        <div
          id={listboxId}
          role="listbox"
          aria-live="polite"
          className="absolute z-50 mt-1 max-h-72 w-full overflow-y-auto rounded-lg border bg-popover p-1 text-popover-foreground shadow-md"
        >
          {isLoading ? (
            <div className="flex items-center gap-2 px-3 py-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Searching addresses...
            </div>
          ) : error ? (
            <div className="px-3 py-2 text-sm text-muted-foreground">
              {error instanceof Error
                ? error.message
                : "Address suggestions are unavailable. Enter the address manually."}
            </div>
          ) : suggestions.length === 0 ? (
            <div className="px-3 py-2 text-sm text-muted-foreground">
              No matching addresses. Continue entering the address manually.
            </div>
          ) : (
            suggestions.map((suggestion, index) => (
              <button
                key={suggestion.id}
                id={`${listboxId}-${index}`}
                type="button"
                role="option"
                aria-selected={index === highlightedIndex}
                className={cn(
                  "flex w-full items-start gap-2 rounded-md px-3 py-2 text-left text-sm",
                  index === highlightedIndex &&
                    "bg-accent text-accent-foreground",
                )}
                onMouseDown={(event) => event.preventDefault()}
                onMouseEnter={() => setHighlightedIndex(index)}
                onClick={() => selectSuggestion(suggestion)}
              >
                <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                <span>{suggestion.label}</span>
              </button>
            ))
          )}
        </div>
      ) : null}
      <p className="mt-1 text-xs text-muted-foreground">
        Address suggestions by ChibiGeo ·{" "}
        <a
          href="https://www.openstreetmap.org/copyright"
          target="_blank"
          rel="noreferrer"
          className="underline underline-offset-2"
        >
          © OpenStreetMap contributors
        </a>
      </p>
    </div>
  );
}
