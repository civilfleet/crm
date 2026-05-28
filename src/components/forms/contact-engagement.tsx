"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import useSWR from "swr";
import { z } from "zod";
import { Button } from "@/components/ui/button";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  CONTACT_SUBMODULE_LABELS,
  CONTACT_SUBMODULES,
  type ContactSubmodule,
} from "@/constants/contact-submodules";
import { useToast } from "@/hooks/use-toast";
import { EngagementDirection, EngagementSource, TodoStatus } from "@/types";

const fetcher = (url: string) => fetch(url).then((res) => res.json());

const engagementSchema = z.object({
  direction: z.enum([
    EngagementDirection.INBOUND,
    EngagementDirection.OUTBOUND,
  ]),
  source: z.enum([
    EngagementSource.EMAIL,
    EngagementSource.PHONE,
    EngagementSource.SMS,
    EngagementSource.MEETING,
    EngagementSource.EVENT,
    EngagementSource.TODO,
    EngagementSource.NOTE,
    EngagementSource.OTHER,
  ]),
  subject: z.string().optional(),
  message: z.string().min(1, "Message is required"),
  engagedAt: z.string().refine((date) => !Number.isNaN(Date.parse(date)), {
    message: "Invalid date format",
  }),
  assignedToUserId: z.string().optional(),
  restrictedToSubmodule: z.enum(CONTACT_SUBMODULES).optional(),
  todoStatus: z
    .enum([
      TodoStatus.PENDING,
      TodoStatus.IN_PROGRESS,
      TodoStatus.COMPLETED,
      TodoStatus.CANCELLED,
    ])
    .optional(),
  dueDate: z.string().optional(),
});

type EngagementFormValues = z.infer<typeof engagementSchema>;
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

interface ContactEngagementFormProps {
  contactId: string;
  teamId: string;
  onSuccess?: () => void;
  currentUser?: {
    id?: string | null;
    name?: string | null;
    email?: string | null;
  };
}

const formatDateForInput = (date: Date = new Date()) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  return `${year}-${month}-${day}T${hours}:${minutes}`;
};

export default function ContactEngagementForm({
  contactId,
  teamId,
  onSuccess,
  currentUser,
}: ContactEngagementFormProps) {
  const { toast } = useToast();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [mentionMatch, setMentionMatch] = useState<MentionMatch | null>(null);
  const [activeMentionIndex, setActiveMentionIndex] = useState(0);
  const [shouldLoadMentionUsers, setShouldLoadMentionUsers] = useState(false);

  const form = useForm<EngagementFormValues>({
    resolver: zodResolver(engagementSchema),
    defaultValues: {
      direction: EngagementDirection.OUTBOUND,
      source: EngagementSource.EMAIL,
      subject: "",
      message: "",
      engagedAt: formatDateForInput(),
      todoStatus: TodoStatus.PENDING,
    },
  });

  const selectedSource = form.watch("source");
  const isTodo = selectedSource === EngagementSource.TODO;
  const isNote = selectedSource === EngagementSource.NOTE;
  const showEngagedAt = !isTodo && !isNote;
  const shouldLoadTeamUsers = isTodo || shouldLoadMentionUsers;

  const { data: usersData } = useSWR(
    shouldLoadTeamUsers ? `/api/teams/${teamId}/users` : null,
    fetcher,
  );
  const teamUsers = useMemo<TeamUser[]>(
    () => usersData?.data || [],
    [usersData],
  );
  const { data: submodulesData } = useSWR(
    `/api/contacts/submodules?teamId=${teamId}`,
    fetcher,
  );
  const availableSubmodules = (submodulesData?.data ||
    []) as ContactSubmodule[];
  const mentionSuggestions = useMemo(() => {
    if (!isNote || !mentionMatch) {
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
  }, [isNote, mentionMatch, teamUsers]);

  useEffect(() => {
    if (isNote) {
      form.setValue("direction", EngagementDirection.OUTBOUND);
    }
  }, [form, isNote]);

  useEffect(() => {
    if (!isNote) {
      setMentionMatch(null);
      setActiveMentionIndex(0);
    }
  }, [isNote]);

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
    if (!isNote) {
      setMentionMatch(null);
      setActiveMentionIndex(0);
      return;
    }

    const nextMatch = findMentionMatch(value, caretIndex);
    if (nextMatch && !shouldLoadMentionUsers) {
      setShouldLoadMentionUsers(true);
    }
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

  const onSubmit = async (values: EngagementFormValues) => {
    try {
      setIsSubmitting(true);

      const assignedUser = values.assignedToUserId
        ? teamUsers.find(
            (u: { id: string }) => u.id === values.assignedToUserId,
          )
        : null;

      const response = await fetch("/api/contact-engagements", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          contactId,
          teamId,
          ...values,
          engagedAt: isNote ? formatDateForInput(new Date()) : values.engagedAt,
          restrictedToSubmodule: isNote
            ? values.restrictedToSubmodule
            : undefined,
          userId: currentUser?.id,
          userName: currentUser?.name || currentUser?.email,
          assignedToUserName: assignedUser?.name || assignedUser?.email,
        }),
      });

      if (!response.ok) {
        const errorBody = await response.json().catch(() => ({}));
        throw new Error(errorBody.error || "Failed to create engagement");
      }

      toast({
        title: isTodo
          ? "Todo created"
          : isNote
            ? "Note added"
            : "Engagement recorded",
        description: isTodo
          ? "Internal todo has been successfully created."
          : isNote
            ? "Contact note has been successfully recorded."
            : "Contact engagement has been successfully recorded.",
      });

      form.reset({
        direction: EngagementDirection.OUTBOUND,
        source: EngagementSource.EMAIL,
        subject: "",
        message: "",
        engagedAt: formatDateForInput(),
        todoStatus: TodoStatus.PENDING,
        assignedToUserId: undefined,
        dueDate: undefined,
        restrictedToSubmodule: undefined,
      });
      setMentionMatch(null);
      setActiveMentionIndex(0);

      if (onSuccess) {
        onSuccess();
      }
    } catch (error) {
      toast({
        title: "Unable to record engagement",
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

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          {!isNote && (
            <FormField
              control={form.control}
              name="direction"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Direction *</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Select direction" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value={EngagementDirection.OUTBOUND}>
                        Outbound (Sent to contact)
                      </SelectItem>
                      <SelectItem value={EngagementDirection.INBOUND}>
                        Inbound (Received from contact)
                      </SelectItem>
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />
          )}

          <FormField
            control={form.control}
            name="source"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Source *</FormLabel>
                <Select onValueChange={field.onChange} value={field.value}>
                  <FormControl>
                    <SelectTrigger>
                      <SelectValue placeholder="Select source" />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    <SelectItem value={EngagementSource.EMAIL}>
                      Email
                    </SelectItem>
                    <SelectItem value={EngagementSource.PHONE}>
                      Phone Call
                    </SelectItem>
                    <SelectItem value={EngagementSource.SMS}>SMS</SelectItem>
                    <SelectItem value={EngagementSource.MEETING}>
                      Meeting
                    </SelectItem>
                    <SelectItem value={EngagementSource.EVENT}>
                      Event
                    </SelectItem>
                    <SelectItem value={EngagementSource.TODO}>
                      Internal Todo
                    </SelectItem>
                    <SelectItem value={EngagementSource.NOTE}>
                      Internal Note
                    </SelectItem>
                    <SelectItem value={EngagementSource.OTHER}>
                      Other
                    </SelectItem>
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        {showEngagedAt && (
          <FormField
            control={form.control}
            name="engagedAt"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Engagement Date & Time *</FormLabel>
                <FormControl>
                  <Input type="datetime-local" {...field} />
                </FormControl>
                <FormDescription>
                  When did this engagement occur?
                </FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />
        )}

        {isTodo && (
          <div className="grid gap-4 sm:grid-cols-2">
            <FormField
              control={form.control}
              name="todoStatus"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Status</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Select status" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value={TodoStatus.PENDING}>
                        Pending
                      </SelectItem>
                      <SelectItem value={TodoStatus.IN_PROGRESS}>
                        In Progress
                      </SelectItem>
                      <SelectItem value={TodoStatus.COMPLETED}>
                        Completed
                      </SelectItem>
                      <SelectItem value={TodoStatus.CANCELLED}>
                        Cancelled
                      </SelectItem>
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="dueDate"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Due Date</FormLabel>
                  <FormControl>
                    <Input type="datetime-local" {...field} />
                  </FormControl>
                  <FormDescription>Optional due date</FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>
        )}

        {isTodo && (
          <FormField
            control={form.control}
            name="assignedToUserId"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Assign To</FormLabel>
                <Select
                  onValueChange={(value) =>
                    field.onChange(value === "none" ? undefined : value)
                  }
                  value={field.value || "none"}
                >
                  <FormControl>
                    <SelectTrigger>
                      <SelectValue placeholder="Select team member (optional)" />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    <SelectItem value="none">None</SelectItem>
                    {teamUsers.map((user: TeamUser) => (
                      <SelectItem key={user.id} value={user.id}>
                        {user.name || user.email}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FormDescription>
                  Optional team member assignment
                </FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />
        )}

        {isNote && (
          <FormField
            control={form.control}
            name="restrictedToSubmodule"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Visibility</FormLabel>
                <Select
                  onValueChange={(value) =>
                    field.onChange(value === "all" ? undefined : value)
                  }
                  value={field.value || "all"}
                  disabled={availableSubmodules.length === 0}
                >
                  <FormControl>
                    <SelectTrigger>
                      <SelectValue placeholder="Select visibility" />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    <SelectItem value="all">Visible to all users</SelectItem>
                    {availableSubmodules.map((submodule) => (
                      <SelectItem key={submodule} value={submodule}>
                        {CONTACT_SUBMODULE_LABELS[submodule]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FormDescription>
                  {availableSubmodules.length === 0
                    ? "No submodule access available for restrictions."
                    : "Optionally restrict this note to a contact submodule."}
                </FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />
        )}

        <FormField
          control={form.control}
          name="subject"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{isNote ? "Title" : "Subject"}</FormLabel>
              <FormControl>
                <Input
                  placeholder={
                    isTodo
                      ? "e.g., Follow up with contact"
                      : isNote
                        ? "e.g., Quick note about the contact"
                        : "e.g., Follow-up on funding request"
                  }
                  {...field}
                />
              </FormControl>
              <FormDescription>
                {isTodo
                  ? "Optional title for the todo"
                  : isNote
                    ? "Optional title for this note"
                    : "Optional subject or title for the engagement"}
              </FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="message"
          render={({ field }) => (
            <FormItem>
              <FormLabel>
                {isTodo ? "Description" : isNote ? "Note" : "Message"} *
              </FormLabel>
              <FormControl>
                <div className="relative">
                  <Textarea
                    placeholder={
                      isTodo
                        ? "Describe what needs to be done..."
                        : isNote
                          ? "Write your internal note..."
                          : "Enter details about this engagement..."
                    }
                    className="min-h-24"
                    {...field}
                    onChange={(event) => {
                      const value = event.target.value;
                      field.onChange(value);
                      updateMentionState(value, event.target.selectionStart);
                    }}
                    onClick={(event) => {
                      const target = event.currentTarget;
                      updateMentionState(target.value, target.selectionStart);
                    }}
                    onKeyUp={(event) => {
                      const target = event.currentTarget;
                      updateMentionState(target.value, target.selectionStart);
                    }}
                    onBlur={() => {
                      window.setTimeout(() => {
                        setMentionMatch(null);
                        setActiveMentionIndex(0);
                      }, 120);
                    }}
                    onKeyDown={(event) => {
                      if (!isNote || mentionSuggestions.length === 0) {
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
                            field.value,
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
                  {isNote && mentionSuggestions.length > 0 && (
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
                            applyMention(user, field.value, field.onChange);
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
                {isTodo
                  ? "Describe the todo task and any relevant details"
                  : isNote
                    ? "This note is internal and visible based on the selected visibility. Type @ to tag someone."
                    : "Describe the content or outcome of this engagement"}
              </FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />

        <div className="flex justify-end gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={() => form.reset()}
            disabled={isSubmitting}
          >
            Clear
          </Button>
          <Button type="submit" disabled={isSubmitting}>
            {isSubmitting ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                {isTodo ? "Creating..." : isNote ? "Saving..." : "Recording..."}
              </>
            ) : isTodo ? (
              "Create Todo"
            ) : isNote ? (
              "Add Note"
            ) : (
              "Record Engagement"
            )}
          </Button>
        </div>
      </form>
    </Form>
  );
}
