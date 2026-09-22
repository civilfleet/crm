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
  const populatedGroups = useMemo(
    () => results?.groups.filter((group) => group.total > 0) ?? [],
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
              List of tags
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
              <div className="space-y-3 rounded-xl border bg-background/90 p-4 shadow-sm">
                <Skeleton className="h-9 w-56" />
                {["one", "two", "three", "four", "five"].map((key) => (
                  <Skeleton key={key} className="h-12 w-full" />
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
                {populatedGroups.length === 0 ? (
                  <div className="rounded-xl border border-dashed bg-background/60 px-6 py-12 text-center text-sm text-muted-foreground">
                    No CRM records carry this tag.
                  </div>
                ) : (
                  <div className="overflow-hidden rounded-xl border bg-background/90 shadow-sm">
                    <div className="overflow-x-auto">
                      <table className="w-full border-collapse text-sm">
                        <thead className="border-b bg-muted/30 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                          <tr>
                            <th scope="col" className="px-4 py-3 sm:px-5">
                              Name
                            </th>
                            <th
                              scope="col"
                              className="hidden px-5 py-3 md:table-cell"
                            >
                              Details
                            </th>
                            <th
                              scope="col"
                              className="px-4 py-3 text-right sm:px-5"
                            >
                              Type
                            </th>
                          </tr>
                        </thead>
                        {populatedGroups.map((group) => {
                          const meta = sectionMeta[group.section];
                          const Icon = meta.icon;
                          const additionalItems =
                            extraItems[group.section] ?? [];
                          const visibleItems = [
                            ...group.items,
                            ...additionalItems,
                          ];
                          const hasMore = visibleItems.length < group.total;

                          return (
                            <tbody
                              key={group.section}
                              className="border-b last:border-b-0"
                            >
                              <tr className="border-b bg-muted/15">
                                <th
                                  scope="rowgroup"
                                  colSpan={3}
                                  className="px-4 py-3 text-left font-semibold sm:px-5"
                                >
                                  <span className="flex items-center gap-2">
                                    <Icon className="size-4 text-muted-foreground" />
                                    {meta.label}
                                    <Badge variant="outline" className="ml-1">
                                      {group.total}
                                    </Badge>
                                  </span>
                                </th>
                              </tr>
                              {visibleItems.map((item) => (
                                <tr
                                  key={`${item.entityType}-${item.id}`}
                                  className="border-b transition-colors last:border-b-0 hover:bg-muted/30"
                                >
                                  <td className="max-w-52 px-4 py-3 sm:max-w-xs sm:px-5">
                                    <Link
                                      href={item.href}
                                      className="block truncate font-medium text-foreground underline-offset-4 hover:underline focus-visible:rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                                    >
                                      {item.title}
                                    </Link>
                                    {item.description ? (
                                      <p className="mt-1 line-clamp-1 text-xs text-muted-foreground md:hidden">
                                        {item.description}
                                      </p>
                                    ) : null}
                                  </td>
                                  <td className="hidden max-w-md px-5 py-3 text-muted-foreground md:table-cell">
                                    <span className="line-clamp-2">
                                      {item.description || "—"}
                                    </span>
                                  </td>
                                  <td className="px-4 py-3 text-right text-xs text-muted-foreground sm:px-5">
                                    {TAG_ENTITY_LABELS[item.entityType]}
                                  </td>
                                </tr>
                              ))}
                              {hasMore ? (
                                <tr>
                                  <td colSpan={3} className="px-4 py-2 sm:px-5">
                                    <Button
                                      type="button"
                                      variant="ghost"
                                      size="sm"
                                      className="w-full"
                                      disabled={
                                        loadingSection === group.section
                                      }
                                      onClick={() => loadMore(group)}
                                    >
                                      {loadingSection === group.section
                                        ? "Loading…"
                                        : `Load more (${visibleItems.length} of ${group.total})`}
                                    </Button>
                                  </td>
                                </tr>
                              ) : null}
                            </tbody>
                          );
                        })}
                      </table>
                    </div>
                  </div>
                )}
              </div>
            )}
          </main>
        </div>
      </div>
    </div>
  );
}
