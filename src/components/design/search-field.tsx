"use client";

import { Search, X } from "lucide-react";
import * as React from "react";
import { cn } from "@/lib/utils";

type SearchFieldProps = Omit<
  React.InputHTMLAttributes<HTMLInputElement>,
  "type" | "value" | "onChange"
> & {
  value: string;
  onValueChange: (value: string) => void;
  /** Announced, not shown: the position says it is a search. */
  label: string;
};

/**
 * A filter, not a field. Council's rule: a field commits a value you will
 * save; a filter narrows what you see. So it has no visible label, no error
 * state, and a way to clear it in one press.
 */
export const SearchField = React.forwardRef<HTMLInputElement, SearchFieldProps>(
  ({ value, onValueChange, label, placeholder, className, ...props }, ref) => {
    const innerRef = React.useRef<HTMLInputElement | null>(null);

    const handleClear = () => {
      onValueChange("");
      innerRef.current?.focus();
    };

    return (
      <div className={cn("relative w-full sm:max-w-xs", className)}>
        <Search
          aria-hidden="true"
          className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground"
        />
        <input
          ref={(node) => {
            innerRef.current = node;
            if (typeof ref === "function") ref(node);
            else if (ref) ref.current = node;
          }}
          type="search"
          aria-label={label}
          placeholder={placeholder ?? `${label}…`}
          value={value}
          onChange={(event) => onValueChange(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Escape" && value) {
              event.preventDefault();
              handleClear();
            }
          }}
          className={cn(
            "flex h-9 w-full rounded-md border border-input bg-card pr-8 pl-8 text-sm transition-[border-color,box-shadow] duration-150 placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30 focus-visible:outline-hidden disabled:cursor-not-allowed disabled:opacity-50 [&::-webkit-search-cancel-button]:hidden",
          )}
          {...props}
        />
        {value ? (
          <button
            type="button"
            onClick={handleClear}
            aria-label="Clear search"
            className="absolute top-1/2 right-1.5 flex size-6 -translate-y-1/2 items-center justify-center rounded-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-hidden"
          >
            <X aria-hidden="true" className="size-3.5" />
          </button>
        ) : null}
      </div>
    );
  },
);
SearchField.displayName = "SearchField";
