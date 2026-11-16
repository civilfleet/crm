"use client";

import * as DropdownMenuPrimitive from "@radix-ui/react-dropdown-menu";
import { type LucideIcon, Monitor, Moon, Sun, SunMoon } from "lucide-react";
import { useId } from "react";
import { useTheme } from "@/components/theme-provider";
import { isThemePreference, type ThemePreference } from "@/lib/theme";

const themeOptions: {
  value: ThemePreference;
  label: string;
  icon: LucideIcon;
}[] = [
  { value: "system", label: "System", icon: Monitor },
  { value: "dark", label: "Dark", icon: Moon },
  { value: "light", label: "Light", icon: Sun },
];

/**
 * The theme switch for a dropdown menu: one ordinary row, three icons.
 *
 * Built from the menu's own radio items, so arrow keys, focus and the
 * announced "Dark, 2 of 3, checked" come from Radix rather than from us.
 * Choosing keeps the menu open, so you see the change land.
 */
export function ThemeMenuControl() {
  const { theme, setTheme } = useTheme();
  const labelId = useId();

  const handleValueChange = (value: string) => {
    if (isThemePreference(value)) {
      setTheme(value);
    }
  };

  return (
    <div className="flex items-center gap-2 px-2 py-1 text-sm">
      <SunMoon aria-hidden="true" className="size-4 shrink-0" />
      <span id={labelId} className="flex-1">
        Theme
      </span>
      <DropdownMenuPrimitive.RadioGroup
        aria-labelledby={labelId}
        value={theme ?? ""}
        onValueChange={handleValueChange}
        className="flex items-center gap-0.5"
      >
        {themeOptions.map((option) => (
          <DropdownMenuPrimitive.RadioItem
            key={option.value}
            value={option.value}
            aria-label={option.label}
            title={option.label}
            onSelect={(event) => event.preventDefault()}
            className="flex size-6 cursor-default items-center rounded-sm justify-center text-muted-foreground outline-hidden transition-colors hover:text-foreground data-[highlighted]:bg-accent data-[highlighted]:text-accent-foreground data-[state=checked]:bg-muted data-[state=checked]:text-foreground"
          >
            <option.icon aria-hidden="true" className="size-3.5" />
          </DropdownMenuPrimitive.RadioItem>
        ))}
      </DropdownMenuPrimitive.RadioGroup>
    </div>
  );
}
