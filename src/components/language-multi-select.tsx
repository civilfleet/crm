"use client";

import { Check, Languages, X } from "lucide-react";
import { useState } from "react";
import { Badge } from "@/components/ui/badge";
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
import { LANGUAGE_OPTIONS, languageName } from "@/lib/languages";
import { cn } from "@/lib/utils";

type LanguageMultiSelectProps = {
  /** ISO 639-1 codes, in the order chosen. */
  value: string[];
  onChange: (codes: string[]) => void;
  id?: string;
  disabled?: boolean;
};

/** Pick several languages: chips for the chosen ones, a search to add more. */
export const LanguageMultiSelect = ({
  value,
  onChange,
  id,
  disabled,
}: LanguageMultiSelectProps) => {
  const [open, setOpen] = useState(false);
  const chosen = new Set(value);

  const handleToggle = (code: string) =>
    onChange(
      chosen.has(code)
        ? value.filter((entry) => entry !== code)
        : [...value, code],
    );

  return (
    <div className="flex flex-wrap items-center gap-2">
      {value.map((code) => (
        <Badge
          key={code}
          variant="secondary"
          className="h-7 gap-1 border border-border/70 bg-muted/70 px-2 font-medium text-foreground"
        >
          {languageName(code)}
          <button
            type="button"
            onClick={() => handleToggle(code)}
            disabled={disabled}
            aria-label={`Remove ${languageName(code)}`}
            className="rounded-sm text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <X className="size-3.5" />
          </button>
        </Badge>
      ))}
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            id={id}
            type="button"
            variant="outline"
            size="sm"
            disabled={disabled}
            className="h-7"
          >
            <Languages className="size-4" />
            {value.length ? "Add language" : "Choose languages"}
          </Button>
        </PopoverTrigger>
        <PopoverContent align="start" className="w-64 p-0">
          <Command>
            <CommandInput placeholder="Search language..." />
            <CommandList>
              <CommandEmpty>No language found.</CommandEmpty>
              <CommandGroup>
                {LANGUAGE_OPTIONS.map((option) => (
                  <CommandItem
                    key={option.value}
                    value={option.value}
                    keywords={[option.label]}
                    onSelect={() => handleToggle(option.value)}
                  >
                    <Check
                      className={cn(
                        "size-4",
                        chosen.has(option.value) ? "opacity-100" : "opacity-0",
                      )}
                    />
                    {option.label}
                  </CommandItem>
                ))}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
    </div>
  );
};
