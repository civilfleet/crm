"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2 } from "lucide-react";
import { useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import useSWR from "swr";
import type { z } from "zod";
import MentionText from "@/components/mention-text";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { createOrganizationEngagementSchema } from "@/validations/organization-engagements";

type OrganizationEngagement = {
  id: string;
  type: string;
  note?: string | null;
  engagedAt: string;
};

type TeamUser = {
  id: string;
  name?: string | null;
  email: string;
};

type MentionMatch = {
  query: string;
  start: number;
  end: number;
};

interface OrganizationEngagementsProps {
  organizationId: string;
  teamId: string;
}

const fetcher = (url: string) => fetch(url).then((res) => res.json());

const formatDateForInput = (date: Date = new Date()) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

export default function OrganizationEngagements({
  organizationId,
  teamId,
}: OrganizationEngagementsProps) {
  const { toast } = useToast();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [mentionMatch, setMentionMatch] = useState<MentionMatch | null>(null);
  const [activeMentionIndex, setActiveMentionIndex] = useState(0);

  const { data: engagementsData, mutate } = useSWR(
    `/api/organization-engagements?organizationId=${organizationId}&teamId=${teamId}`,
    fetcher,
  );
  const { data: teamUsersData } = useSWR(`/api/teams/${teamId}/users`, fetcher);

  const engagements = useMemo<OrganizationEngagement[]>(
    () => engagementsData?.data || [],
    [engagementsData],
  );
  const teamUsers = useMemo<TeamUser[]>(
    () => teamUsersData?.data || [],
    [teamUsersData],
  );
  const teamUsersByEmail = useMemo(
    () => new Map(teamUsers.map((user) => [user.email.toLowerCase(), user])),
    [teamUsers],
  );
  const mentionSuggestions = useMemo(() => {
    if (!mentionMatch) {
      return [];
    }

    const query = mentionMatch.query.trim().toLowerCase();
    return teamUsers
      .filter((user) => {
        if (!query) {
          return true;
        }
        const name = user.name?.toLowerCase() || "";
        return name.includes(query) || user.email.toLowerCase().includes(query);
      })
      .slice(0, 6);
  }, [mentionMatch, teamUsers]);

  const form = useForm<z.infer<typeof createOrganizationEngagementSchema>>({
    resolver: zodResolver(createOrganizationEngagementSchema),
    defaultValues: {
      organizationId,
      teamId,
      type: "",
      note: "",
      engagedAt: formatDateForInput(),
    },
  });

  const onSubmit = async (
    values: z.infer<typeof createOrganizationEngagementSchema>,
  ) => {
    setIsSubmitting(true);
    try {
      const response = await fetch("/api/organization-engagements", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(values),
      });

      if (!response.ok) {
        const errorBody = await response.json().catch(() => ({}));
        throw new Error(errorBody.error || "Failed to add engagement");
      }

      toast({
        title: "Engagement added",
        description: "Cooperation history updated.",
      });

      form.reset({
        organizationId,
        teamId,
        type: "",
        note: "",
        engagedAt: formatDateForInput(),
      });
      mutate();
    } catch (error) {
      toast({
        title: "Unable to add engagement",
        description:
          error instanceof Error
            ? error.message
            : "An unexpected error occurred.",
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const findMentionMatch = (
    value: string,
    caretIndex: number,
  ): MentionMatch | null => {
    const beforeCaret = value.slice(0, caretIndex);
    const match = beforeCaret.match(/(^|\s)@([^\s@]*)$/);
    if (!match) {
      return null;
    }

    const matchIndex = match.index ?? 0;
    const leadingPart = match[1] || "";
    const query = match[2] || "";
    const start = matchIndex + leadingPart.length;

    return {
      query,
      start,
      end: caretIndex,
    };
  };

  const updateMentionState = (value: string, caretIndex: number) => {
    const nextMatch = findMentionMatch(value, caretIndex);
    setMentionMatch(nextMatch);
    setActiveMentionIndex(0);
  };

  const applyMention = (
    user: TeamUser,
    fieldValue: string,
    onChange: (value: string) => void,
  ) => {
    if (!mentionMatch) {
      return;
    }

    const nextValue = `${fieldValue.slice(0, mentionMatch.start)}@${user.email} ${fieldValue.slice(mentionMatch.end)}`;
    onChange(nextValue);
    setMentionMatch(null);
    setActiveMentionIndex(0);
  };

  return (
    <Card>
      <CardHeader className="border-b">
        <CardTitle>Cooperation History</CardTitle>
        <CardDescription>
          Track collaborations and important touchpoints with this organization.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6 pt-6">
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="type"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Type</FormLabel>
                  <FormControl>
                    <Input placeholder="Type of engagement" {...field} />
                  </FormControl>
                  <FormDescription>
                    e.g., Workshop, support request, meeting
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="engagedAt"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Date</FormLabel>
                  <FormControl>
                    <Input type="date" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="note"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Notes</FormLabel>
                  <FormControl>
                    <div className="relative">
                      <Textarea
                        placeholder="Add details about this collaboration..."
                        {...field}
                        value={field.value ?? ""}
                        onChange={(event) => {
                          const value = event.target.value;
                          field.onChange(value);
                          updateMentionState(
                            value,
                            event.target.selectionStart,
                          );
                        }}
                        onClick={(event) => {
                          const target = event.currentTarget;
                          updateMentionState(
                            target.value,
                            target.selectionStart,
                          );
                        }}
                        onKeyUp={(event) => {
                          const target = event.currentTarget;
                          updateMentionState(
                            target.value,
                            target.selectionStart,
                          );
                        }}
                        onBlur={() => {
                          window.setTimeout(() => {
                            setMentionMatch(null);
                            setActiveMentionIndex(0);
                          }, 120);
                        }}
                        onKeyDown={(event) => {
                          if (mentionSuggestions.length === 0) {
                            return;
                          }

                          if (event.key === "ArrowDown") {
                            event.preventDefault();
                            setActiveMentionIndex((current) =>
                              current + 1 >= mentionSuggestions.length
                                ? 0
                                : current + 1,
                            );
                            return;
                          }

                          if (event.key === "ArrowUp") {
                            event.preventDefault();
                            setActiveMentionIndex((current) =>
                              current - 1 < 0
                                ? mentionSuggestions.length - 1
                                : current - 1,
                            );
                            return;
                          }

                          if (event.key === "Enter") {
                            event.preventDefault();
                            const selectedUser =
                              mentionSuggestions[activeMentionIndex];
                            if (selectedUser) {
                              applyMention(
                                selectedUser,
                                field.value ?? "",
                                field.onChange,
                              );
                            }
                            return;
                          }

                          if (event.key === "Escape") {
                            setMentionMatch(null);
                            setActiveMentionIndex(0);
                          }
                        }}
                      />
                      {mentionSuggestions.length > 0 && (
                        <div className="absolute z-20 mt-1 max-h-52 w-full overflow-auto rounded-md border bg-popover p-1 shadow-md">
                          {mentionSuggestions.map((user, index) => (
                            <button
                              key={user.id}
                              type="button"
                              className={`flex w-full items-start justify-between rounded-sm px-2 py-1.5 text-left text-sm transition-colors ${
                                index === activeMentionIndex
                                  ? "bg-accent text-accent-foreground"
                                  : "hover:bg-accent/70"
                              }`}
                              onMouseDown={(event) => {
                                event.preventDefault();
                                applyMention(
                                  user,
                                  field.value ?? "",
                                  field.onChange,
                                );
                              }}
                            >
                              <span className="truncate pr-3">
                                {user.name?.trim() || user.email}
                              </span>
                              <span className="truncate text-xs text-muted-foreground">
                                {user.email}
                              </span>
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  </FormControl>
                  <FormDescription>
                    Type @ to mention a teammate and notify them.
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Saving...
                </>
              ) : (
                "Add entry"
              )}
            </Button>
          </form>
        </Form>

        {engagements.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No cooperation history recorded yet.
          </p>
        ) : (
          <div className="space-y-3">
            {engagements.map((engagement) => (
              <div
                key={engagement.id}
                className="rounded-md border p-4 space-y-2"
              >
                <div className="flex items-center justify-between">
                  <Badge variant="outline">{engagement.type}</Badge>
                  <span className="text-xs text-muted-foreground">
                    {new Date(engagement.engagedAt).toLocaleDateString()}
                  </span>
                </div>
                {engagement.note && (
                  <p className="text-sm text-muted-foreground whitespace-pre-wrap break-words leading-relaxed">
                    <MentionText
                      text={engagement.note}
                      teamId={teamId}
                      usersByEmail={teamUsersByEmail}
                    />
                  </p>
                )}
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
