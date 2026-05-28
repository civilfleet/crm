"use client";

import { Check, ChevronsUpDown, X } from "lucide-react";
import * as React from "react";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";

export type ComboboxOption = {
  value: string;
  label: string;
};

interface ComboboxProps {
  options: ComboboxOption[];
  value: string;
  onChange: (value: string) => void;
  onBlur?: () => void;
  placeholder?: string;
  searchPlaceholder?: string;
  emptyStateText?: string;
  allowCustomValue?: boolean;
  isLoading?: boolean;
  disabled?: boolean;
  className?: string;
  size?: "default" | "sm";
  clearLabel?: string;
  renderButtonValue?: React.ReactNode;
}

export function Combobox({
  options,
  value,
  onChange,
  placeholder = "Select option...",
  searchPlaceholder = "Search...",
  emptyStateText = "No results found.",
  allowCustomValue = false,
  isLoading = false,
  disabled = false,
  className,
  size = "default",
  clearLabel = "Clear selection",
  renderButtonValue,
  onBlur,
}: ComboboxProps) {
  const [open, setOpen] = React.useState(false);
  const [searchTerm, setSearchTerm] = React.useState("");

  const selectedOption = options.find((option) => option.value === value);

  const handleSelect = (currentValue: string) => {
    if (allowCustomValue) {
      onChange(currentValue);
    } else {
      onChange(currentValue === value ? "" : currentValue);
    }
    onBlur?.();
    setOpen(false);
    setSearchTerm("");
  };

  const handleCustomValue = () => {
    const trimmed = searchTerm.trim();
    if (!trimmed) {
      return;
    }
    onChange(trimmed);
    onBlur?.();
    setOpen(false);
    setSearchTerm("");
  };

  const filteredOptions =
    searchTerm.trim().length === 0
      ? options
      : options.filter((option) =>
          option.label.toLowerCase().includes(searchTerm.toLowerCase()),
        );

  return (
    <Popover
      open={open}
      onOpenChange={(nextOpen) => {
        setOpen(nextOpen);
        if (!nextOpen) {
          onBlur?.();
        }
      }}
    >
      <div className="relative w-full">
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="outline"
            role="combobox"
            aria-expanded={open}
            className={cn(
              "w-full justify-between truncate",
              size === "sm" && "h-9 px-3 text-sm",
              value && allowCustomValue && "pr-10",
              className,
            )}
            disabled={disabled}
          >
            <span className="truncate">
              {renderButtonValue ??
                selectedOption?.label ??
                (value && allowCustomValue ? value : placeholder)}
            </span>
            <ChevronsUpDown className="ml-1 h-4 w-4 opacity-50" />
          </Button>
        </PopoverTrigger>
        {value && allowCustomValue && (
          <button
            type="button"
            aria-label={clearLabel}
            className="absolute right-2 top-1/2 flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded-sm text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary disabled:pointer-events-none disabled:opacity-50"
            onClick={(event) => {
              event.stopPropagation();
              onChange("");
              onBlur?.();
            }}
            disabled={disabled}
          >
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
      <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0">
        <Command>
          <CommandInput
            placeholder={searchPlaceholder}
            value={searchTerm}
            onValueChange={setSearchTerm}
            className="h-9"
            onKeyDown={(event) => {
              if (
                allowCustomValue &&
                event.key === "Enter" &&
                searchTerm.trim()
              ) {
                event.preventDefault();
                handleCustomValue();
              }
            }}
          />
          <CommandList>
            {isLoading ? (
              <CommandEmpty className="py-3 text-center text-sm text-muted-foreground">
                Loading...
              </CommandEmpty>
            ) : filteredOptions.length === 0 ? (
              <CommandEmpty className="py-3 text-center text-sm text-muted-foreground">
                {allowCustomValue && searchTerm.trim()
                  ? `No matches. Use the button below to add “${searchTerm.trim()}”.`
                  : emptyStateText}
              </CommandEmpty>
            ) : (
              <CommandGroup>
                {filteredOptions.map((option) => (
                  <CommandItem
                    key={option.value}
                    value={option.value}
                    onSelect={handleSelect}
                  >
                    {option.label}
                    <Check
                      className={cn(
                        "ml-auto h-4 w-4",
                        value === option.value ? "opacity-100" : "opacity-0",
                      )}
                    />
                  </CommandItem>
                ))}
              </CommandGroup>
            )}
          </CommandList>
          {allowCustomValue && searchTerm.trim() && (
            <div className="border-t bg-muted/30 p-2">
              <Button
                type="button"
                variant="secondary"
                className="w-full"
                onClick={handleCustomValue}
              >
                Use “{searchTerm.trim()}”
              </Button>
            </div>
          )}
        </Command>
      </PopoverContent>
    </Popover>
  );
}