"use client";

import type { LucideIcon } from "lucide-react";
import * as React from "react";
import { cn } from "@/lib/utils";

export type SwitcherOption<Value extends string> = {
  value: Value;
  label: string;
  icon?: LucideIcon;
  /** Show only the icon; the label is still announced. */
  iconOnly?: boolean;
};

type SwitcherProps<Value extends string> = {
  /** The question, announced to screen readers: "View", "Period". */
  label: string;
  options: SwitcherOption<Value>[];
  value: Value;
  onValueChange: (value: Value) => void;
  size?: "sm" | "md";
  className?: string;
};

/**
 * Which slice of the same content am I looking at: Table / Cards / Map.
 *
 * Not Tabs: tabs own different panels; a switcher changes the view of one
 * thing. Radios underneath, so arrow keys move the choice and a screen
 * reader hears "View, Cards, 2 of 3".
 */
export const Switcher = <Value extends string>({
  label,
  options,
  value,
  onValueChange,
  size = "md",
  className,
}: SwitcherProps<Value>) => {
  const name = React.useId();

  return (
    <fieldset
      className={cn(
        "inline-flex shrink-0 items-center gap-0.5 rounded-lg border bg-muted p-0.5",
        className,
      )}
    >
      <legend className="sr-only">{label}</legend>
      {options.map((option) => {
        const isSelected = option.value === value;
        const Icon = option.icon;
        return (
          <label
            key={option.value}
            title={option.iconOnly ? option.label : undefined}
            className={cn(
              "relative inline-flex cursor-pointer items-center justify-center gap-1.5 rounded-md font-medium whitespace-nowrap text-muted-foreground transition-colors select-none hover:text-foreground has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring",
              size === "sm" ? "h-7 px-2 text-xs" : "h-8 px-3 text-sm",
              isSelected && "bg-card text-foreground shadow-xs",
            )}
          >
            <input
              type="radio"
              name={name}
              value={option.value}
              checked={isSelected}
              onChange={() => onValueChange(option.value)}
              className="sr-only"
            />
            {Icon ? (
              <Icon aria-hidden="true" className="size-4 shrink-0" />
            ) : null}
            <span className={option.iconOnly ? "sr-only" : undefined}>
              {option.label}
            </span>
          </label>
        );
      })}
    </fieldset>
  );
};
