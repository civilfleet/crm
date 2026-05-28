"use client";

import { useEffect, useState } from "react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

export type ContactResponsiveTabItem = {
  value: string;
  label: string;
  content: React.ReactNode;
  contentClassName?: string;
};

interface ContactResponsiveTabsProps {
  defaultValue: string;
  items: ContactResponsiveTabItem[];
}

export default function ContactResponsiveTabs({
  defaultValue,
  items,
}: ContactResponsiveTabsProps) {
  const initialValue =
    items.find((item) => item.value === defaultValue)?.value ?? items[0]?.value;
  const [value, setValue] = useState(initialValue ?? "");

  useEffect(() => {
    if (!items.some((item) => item.value === value)) {
      setValue(items[0]?.value ?? "");
    }
  }, [items, value]);

  if (!value) {
    return null;
  }

  return (
    <Tabs value={value} onValueChange={setValue} className="w-full">
      <div className="mb-4 mt-2 sm:hidden">
        <Select value={value} onValueChange={setValue}>
          <SelectTrigger>
            <SelectValue placeholder="Select section" />
          </SelectTrigger>
          <SelectContent>
            {items.map((item) => (
              <SelectItem key={item.value} value={item.value}>
                {item.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <TabsList className="mb-6 mt-4 hidden h-9 w-full flex-wrap sm:flex">
        {items.map((item) => (
          <TabsTrigger key={item.value} value={item.value}>
            {item.label}
          </TabsTrigger>
        ))}
      </TabsList>

      {items.map((item) => (
        <TabsContent
          key={item.value}
          value={item.value}
          className={item.contentClassName}
        >
          {item.content}
        </TabsContent>
      ))}
    </Tabs>
  );
}
