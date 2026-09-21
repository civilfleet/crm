"use client";

import {
  Building2,
  CalendarDays,
  FileText,
  Hash,
  ListChecks,
  MessageSquareText,
  Search,
  UserRound,
} from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useMemo, useState } from "react";
import useSWR from "swr";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { useDebounce } from "@/hooks/use-debounce";
import { TAG_ENTITY_LABELS } from "@/lib/tags";
import type {
  Tag,
  TagResultGroup,
  TagResultItem,
  TagResultSection,
} from "@/types";

const fetcher = async <T,>(url: string): Promise<T> => {
  const response = await fetch(url);
  const body = await response.json();
  if (!response.ok) throw new Error(body.error || "Request failed");
  return body.data;
};

const sectionMeta: Record<
  TagResultSection,
  { label: string; icon: typeof UserRound }
> = {
  contacts: { label: "Contacts", icon: UserRound },
  organizations: { label: "Organizations", icon: Building2 },
  lists: { label: "Lists", icon: ListChecks },
  interactions: { label: "Interactions", icon: MessageSquareText },
  events: { label: "Events", icon: CalendarDays },
  files: { label: "Files", icon: FileText },
};

export function TagsExplorer({ teamId }: { teamId: string }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const selectedId = searchParams.get("tag");
  const [query, setQuery] = useState("");
  const [extraPages, setExtraPages] = useState<{
    tagId: string | null;
    items: Partial<Record<TagResultSection, TagResultItem[]>>;
  }>({ tagId: selectedId, items: {} });
  const extraItems = extraPages.tagId === selectedId ? extraPages.items : {};
  const [loadingSection, setLoadingSection] = useState<TagResultSection | null>(
    null,
  );
  const debouncedQuery = useDebounce(query, 180);
  const { data: tags = [], isLoading: tagsLoading } = useSWR<Tag[]>(
    `/api/teams/${encodeURIComponent(teamId)}/tags?q=${encodeURIComponent(debouncedQuery)}`,
    fetcher,
    { keepPreviousData: true, revalidateOnFocus: false },
  );
  const { data: results, isLoading: resultsLoading } = useSWR<{
    tag: Tag;
    groups: TagResultGroup[];
  }>(
    selectedId
      ? `/api/teams/${encodeURIComponent(teamId)}/tags/${encodeURIComponent(selectedId)}/results`
      : null,
    fetcher,
    { revalidateOnFocus: false },
  );
  const total = useMemo(
    () => results?.groups.reduce((sum, group) => sum + group.total, 0) ?? 0,
    [results],
  );

  const loadMore = async (group: TagResultGroup) => {
    if (!selectedId) return;
    const currentExtra = extraItems[group.section] ?? [];
    const offset = group.items.length + currentExtra.length;
    setLoadingSection(group.section);
    try {
      const page = await fetcher<{ tag: Tag; groups: TagResultGroup[] }>(
        `/api/teams/${encodeURIComponent(teamId)}/tags/${encodeURIComponent(selectedId)}/results?section=${group.section}&offset=${offset}`,
      );
      const nextGroup = page.groups.find(
        (candidate) => candidate.section === group.section,
      );
      if (nextGroup) {
        setExtraPages((current) => {
          const currentItems =
            current.tagId === selectedId ? current.items : {};
          return {
            tagId: selectedId,
            items: {
              ...currentItems,
              [group.section]: [
                ...(currentItems[group.section] ?? []),
                ...nextGroup.items,
              ],
            },
          };
        });
      }
    } finally {
      setLoadingSection(null);
    }
  };

  const selectTag = (tagId: string) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set("tag", tagId);
    router.replace(`/teams/${teamId}/tags?${params.toString()}`);
  };

  return (
    <div className="min-h-full bg-[radial-gradient(circle_at_top_left,hsl(var(--muted))_0,transparent_34rem)] p-4 sm:p-6 lg:p-8">
      <div className="mx-auto max-w-7xl space-y-8">
        <header className="grid gap-6 border-b pb-7 lg:grid-cols-[1fr_23rem] lg:items-end">
          <div className="space-y-3">
            <div className="flex items-center gap-2 text-sm font-medium uppercase tracking-[0.18em] text-muted-foreground">
              <Hash className="size-4" /> Team index
            </div>
            <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">
              Tags
            </h1>
            <p className="max-w-2xl text-muted-foreground">
              Follow one topic across people, organizations, lists,
              conversations, events, and files.
            </p>
          </div>
          <label htmlFor="tag-search" className="relative block">
            <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              id="tag-search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search team tags…"
              className="h-11 bg-background pl-9 shadow-sm"
            />
          </label>
        </header>

        <div className="grid gap-8 lg:grid-cols-[17rem_1fr]">
          <aside className="space-y-2 lg:sticky lg:top-6 lg:self-start">
            <p className="px-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Shared vocabulary
            </p>
            <div className="max-h-[65vh] space-y-1 overflow-y-auto rounded-xl border bg-background/80 p-2 shadow-sm backdrop-blur">
              {tagsLoading && !tags.length
                ? ["one", "two", "three", "four", "five"].map((key) => (
                    <Skeleton key={key} className="h-9 w-full" />
                  ))
                : tags.map((tag) => (
                    <button
                      key={tag.id}
                      type="button"
                      onClick={() => selectTag(tag.id)}
                      className={`flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm transition-colors ${
                        selectedId === tag.id
                          ? "bg-foreground text-background"
                          : "hover:bg-muted"
                      }`}
                    >
                      <Hash className="size-4 shrink-0 opacity-60" />
                      <span className="truncate">{tag.name}</span>
                    </button>
                  ))}
              {!tagsLoading && tags.length === 0 && (
                <p className="px-3 py-8 text-center text-sm text-muted-foreground">
                  {query
                    ? "No matching tags."
                    : "Tags created on records will appear here."}
                </p>
              )}
            </div>
          </aside>

          <main className="min-w-0">
            {!selectedId ? (
              <div className="flex min-h-72 items-center justify-center rounded-2xl border border-dashed bg-background/60 p-8 text-center">
                <div className="max-w-sm space-y-3">
                  <div className="mx-auto flex size-12 items-center justify-center rounded-full bg-muted">
                    <Hash className="size-6 text-muted-foreground" />
                  </div>
                  <h2 className="text-lg font-semibold">Choose a topic</h2>
                  <p className="text-sm text-muted-foreground">
                    Select a team tag to gather every related CRM record in one
                    place.
                  </p>
                </div>
              </div>
            ) : resultsLoading || !results ? (
              <div className="grid gap-4 md:grid-cols-2">
                {[
                  "contacts",
                  "organizations",
                  "lists",
                  "interactions",
                  "events",
                  "files",
                ].map((key) => (
                  <Skeleton key={key} className="h-52 rounded-xl" />
                ))}
              </div>
            ) : (
              <div className="space-y-6">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <Badge className="px-3 py-1 text-sm">
                        #{results.tag.name}
                      </Badge>
                      <span className="text-sm text-muted-foreground">
                        {total} {total === 1 ? "record" : "records"}
                      </span>
                    </div>
                  </div>
                </div>
                <div className="grid items-start gap-5 xl:grid-cols-2">
                  {results.groups.map((group) => {
                    const meta = sectionMeta[group.section];
                    const Icon = meta.icon;
                    const additionalItems = extraItems[group.section] ?? [];
                    const visibleItems = [...group.items, ...additionalItems];
                    const hasMore = visibleItems.length < group.total;
                    return (
                      <Card
                        key={group.section}
                        className="overflow-hidden bg-background/90 shadow-sm"
                      >
                        <CardHeader className="border-b bg-muted/20 py-4">
                          <CardTitle className="flex items-center justify-between text-base">
                            <span className="flex items-center gap-2">
                              <Icon className="size-4 text-muted-foreground" />
                              {meta.label}
                            </span>
                            <Badge variant="outline">{group.total}</Badge>
                          </CardTitle>
                        </CardHeader>
                        <CardContent className="p-0">
                          {visibleItems.length === 0 ? (
                            <p className="px-5 py-8 text-center text-sm text-muted-foreground">
                              No {meta.label.toLowerCase()} carry this tag.
                            </p>
                          ) : (
                            <div className="divide-y">
                              {visibleItems.map((item) => (
                                <Link
                                  key={`${item.entityType}-${item.id}`}
                                  href={item.href}
                                  className="block px-5 py-4 transition-colors hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
                                >
                                  <div className="flex items-start justify-between gap-4">
                                    <div className="min-w-0">
                                      <p className="truncate font-medium">
                                        {item.title}
                                      </p>
                                      {item.description && (
                                        <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">
                                          {item.description}
                                        </p>
                                      )}
                                    </div>
                                    <span className="shrink-0 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                                      {TAG_ENTITY_LABELS[item.entityType]}
                                    </span>
                                  </div>
                                </Link>
                              ))}
                              {hasMore && (
                                <div className="px-5 py-3">
                                  <Button
                                    type="button"
                                    variant="ghost"
                                    size="sm"
                                    className="w-full"
                                    disabled={loadingSection === group.section}
                                    onClick={() => loadMore(group)}
                                  >
                                    {loadingSection === group.section
                                      ? "Loading…"
                                      : `Load more (${visibleItems.length} of ${group.total})`}
                                  </Button>
                                </div>
                              )}
                            </div>
                          )}
                        </CardContent>
                      </Card>
                    );
                  })}
                </div>
              </div>
            )}
          </main>
        </div>
      </div>
    </div>
  );
}
