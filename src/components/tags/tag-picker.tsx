"use client";

import { Check, Hash, Loader2, Plus, Tags, X } from "lucide-react";
import { useMemo, useState } from "react";
import useSWR from "swr";
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
import { useDebounce } from "@/hooks/use-debounce";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import type { Tag, TaggableEntityType } from "@/types";

type ApiResponse<T> = { data: T; error?: string };

const fetcher = async <T,>(url: string): Promise<T> => {
  const response = await fetch(url);
  const body = (await response.json()) as ApiResponse<T>;
  if (!response.ok) throw new Error(body.error || "Request failed");
  return body.data;
};

const tagUpdateEndpoint = (
  entityType: TaggableEntityType,
  entityId: string,
) => {
  switch (entityType) {
    case "CONTACT":
      return "/api/contacts";
    case "ORGANIZATION":
      return `/api/organizations/${entityId}`;
    case "CONTACT_LIST":
      return `/api/contact-lists/${entityId}`;
    case "CONTACT_ENGAGEMENT":
      return "/api/contact-engagements";
    case "ORGANIZATION_ENGAGEMENT":
      return "/api/organization-engagements";
    case "EVENT":
      return `/api/events/${entityId}`;
    case "FILE":
      return `/api/files/${entityId}`;
  }
};

export function TagPicker({
  teamId,
  entityType,
  entityId,
  className,
  compact = false,
  initialTags = [],
}: {
  teamId: string;
  entityType: TaggableEntityType;
  entityId: string;
  className?: string;
  compact?: boolean;
  initialTags?: string[];
}) {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [assigned, setAssigned] = useState(initialTags);
  const [pendingName, setPendingName] = useState<string | null>(null);
  const debouncedQuery = useDebounce(query, 180);
  const catalogUrl = open
    ? `/api/teams/${encodeURIComponent(teamId)}/tags?q=${encodeURIComponent(debouncedQuery)}`
    : null;
  const { data: catalog = [], mutate: mutateCatalog } = useSWR<Tag[]>(
    catalogUrl,
    fetcher,
    { keepPreviousData: true, revalidateOnFocus: false },
  );
  const assignedNames = useMemo(() => new Set(assigned), [assigned]);
  const enteredName = query.trim().replace(/^#+/, "").trim();
  const exactMatch = catalog.some(
    (tag) =>
      tag.name.toLocaleLowerCase() === enteredName.toLocaleLowerCase(),
  );

  const saveTags = async (nextTags: string[], pending: string) => {
    setPendingName(pending);
    const previous = assigned;
    setAssigned(nextTags);
    try {
      const response = await fetch(tagUpdateEndpoint(entityType, entityId), {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          teamId,
          entityType,
          entityId,
          tags: nextTags,
        }),
      });
      const body = (await response.json()) as ApiResponse<{ tags: string[] }>;
      if (!response.ok) {
        throw new Error(body.error || "Unable to update tags");
      }
      setAssigned(body.data.tags);
      await mutateCatalog();
      return true;
    } catch (error) {
      setAssigned(previous);
      toast({
        title: "Tag update failed",
        description:
          error instanceof Error ? error.message : "Please try again.",
        variant: "destructive",
      });
      return false;
    } finally {
      setPendingName(null);
    }
  };

  const toggleTag = async (name: string) => {
    const selected = assignedNames.has(name);
    await saveTags(
      selected
        ? assigned.filter((item) => item !== name)
        : [...assigned, name],
      name,
    );
  };

  const createAndAssign = async () => {
    if (!enteredName) return;
    const saved = await saveTags([...assigned, enteredName], enteredName);
    if (saved) {
      setQuery("");
      setOpen(false);
    }
  };

  return (
    <div className={cn("flex flex-wrap items-center gap-2", className)}>
      {assigned.map((name) => (
        <Badge
          key={name}
          variant="secondary"
          className="group h-7 gap-1 border border-border/70 bg-muted/70 px-2 font-medium"
        >
          <span className="text-muted-foreground">#</span>
          {name}
          <button
            type="button"
            className="ml-0.5 rounded-full text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            onClick={() => toggleTag(name)}
            disabled={pendingName === name}
            aria-label={`Remove ${name} tag`}
          >
            {pendingName === name ? (
              <Loader2 className="size-3 animate-spin" />
            ) : (
              <X className="size-3" />
            )}
          </button>
        </Badge>
      ))}

      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="outline"
            size={compact ? "sm" : "default"}
            className={cn("border-dashed", compact && "h-7 px-2 text-xs")}
          >
            {assigned.length ? (
              <Plus className="size-4" />
            ) : (
              <Tags className="size-4" />
            )}
            {compact ? "Tag" : assigned.length ? "Add tag" : "Add tags"}
          </Button>
        </PopoverTrigger>
        <PopoverContent align="start" className="w-72 p-0">
          <Command shouldFilter={false}>
            <CommandInput
              value={query}
              onValueChange={setQuery}
              placeholder="Find or create a tag…"
            />
            <CommandList>
              <CommandEmpty>
                {enteredName ? "No matching tag" : "Start typing to find tags"}
              </CommandEmpty>
              <CommandGroup heading="Team tags">
                {catalog.map((tag) => {
                  const selected = assignedNames.has(tag.name);
                  return (
                    <CommandItem
                      key={tag.id}
                      value={tag.id}
                      onSelect={() => toggleTag(tag.name)}
                      disabled={pendingName === tag.name}
                    >
                      <Hash className="size-4 text-muted-foreground" />
                      <span className="flex-1 truncate">{tag.name}</span>
                      {selected && <Check className="size-4" />}
                    </CommandItem>
                  );
                })}
                {enteredName && !exactMatch && (
                  <CommandItem
                    value={`create-${enteredName}`}
                    onSelect={createAndAssign}
                  >
                    {pendingName === enteredName ? (
                      <Loader2 className="size-4 animate-spin" />
                    ) : (
                      <Plus className="size-4" />
                    )}
                    Create <span className="font-medium">#{enteredName}</span>
                  </CommandItem>
                )}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
    </div>
  );
}
