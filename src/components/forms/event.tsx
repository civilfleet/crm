"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Check, Copy, ExternalLink, Loader2, Plus, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { type ReactNode, useEffect, useMemo, useState } from "react";
import { type Resolver, useForm } from "react-hook-form";
import useSWR from "swr";
import type { z } from "zod";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
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
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { generateSlug } from "@/lib/slug";
import { createEventSchema, updateEventSchema } from "@/validations/events";

type CreateEventFormValues = z.infer<typeof createEventSchema>;
type UpdateEventFormValues = z.infer<typeof updateEventSchema>;

interface EventFormProps {
  teamId: string;
  publicBaseUrl?: string;
  rightRailAppend?: ReactNode;
  event?: {
    id: string;
    eventTypeId?: string;
    eventType?: {
      id: string;
      name: string;
      color?: string;
    };
    title: string;
    slug?: string;
    description?: string;
    location?: string;
    isOnline?: boolean;
    expectedGuests?: number;
    hasRemuneration?: boolean;
    address?: string;
    city?: string;
    postalCode?: string;
    state?: string;
    timeZone?: string;
    merchNeeded?: boolean;
    startDate: Date;
    endDate?: Date;
    isPublic: boolean;
    contacts: Array<{
      id: string;
      name: string;
      email?: string;
      phone?: string;
      roles: Array<{
        id: string;
        name: string;
        color?: string;
      }>;
    }>;
    lists?: Array<{
      id: string;
      name: string;
      description?: string;
    }>;
  };
}

const fetcher = (url: string) => fetch(url).then((res) => res.json());

type ContactSummary = {
  id: string;
  name: string;
  email?: string;
  phone?: string;
};

type ContactListSummary = {
  id: string;
  name: string;
  description?: string;
  contactCount?: number;
};

const formatDateForInput = (date?: Date) => {
  if (!date) return "";
  const d = new Date(date);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  const hours = String(d.getHours()).padStart(2, "0");
  const minutes = String(d.getMinutes()).padStart(2, "0");
  return `${year}-${month}-${day}T${hours}:${minutes}`;
};

export default function EventForm({
  teamId,
  event,
  publicBaseUrl: initialPublicBaseUrl = "",
  rightRailAppend,
}: EventFormProps) {
  const router = useRouter();
  const { toast } = useToast();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [publicBaseUrl, setPublicBaseUrl] = useState(initialPublicBaseUrl);
  const [contactRoles, setContactRoles] = useState<Record<string, string[]>>(
    () => {
      const roles: Record<string, string[]> = {};
      event?.contacts.forEach((c) => {
        roles[c.id] = c.roles.map((r) => r.id);
      });
      return roles;
    },
  );
  const [contactLookup, setContactLookup] = useState<
    Record<string, ContactSummary>
  >(() => {
    const initial: Record<string, ContactSummary> = {};
    event?.contacts.forEach((c) => {
      initial[c.id] = {
        id: c.id,
        name: c.name,
        email: c.email ?? undefined,
        phone: c.phone ?? undefined,
      };
    });
    return initial;
  });
  const [contactSearchOpen, setContactSearchOpen] = useState(false);
  const [contactSearchTerm, setContactSearchTerm] = useState("");
  const [debouncedContactSearch, setDebouncedContactSearch] = useState("");
  const [listSearchTerm, setListSearchTerm] = useState("");

  const isEditMode = !!event;

  const { data: rolesData } = useSWR(
    `/api/event-roles?teamId=${teamId}`,
    fetcher,
  );
  const availableRoles = rolesData?.data || [];

  const { data: eventTypesData } = useSWR(
    `/api/event-types?teamId=${teamId}`,
    fetcher,
  );
  const eventTypes = eventTypesData?.data || [];

  const { data: listsData } = useSWR(
    `/api/contact-lists?teamId=${teamId}`,
    fetcher,
  );
  const lists: ContactListSummary[] = listsData?.data || [];

  type FormValues = CreateEventFormValues | UpdateEventFormValues;

  const formResolver = useMemo<Resolver<FormValues>>(
    () =>
      zodResolver(
        isEditMode ? updateEventSchema : createEventSchema,
      ) as Resolver<FormValues>,
    [isEditMode],
  );

  const form = useForm<FormValues>({
    resolver: formResolver,
    defaultValues: isEditMode
      ? ({
          id: event.id,
          teamId,
          eventTypeId: event?.eventTypeId ?? "",
          title: event?.title || "",
          slug: event?.slug || "",
          description: event?.description || "",
          location: event?.location || "",
          isOnline: event?.isOnline ?? false,
          expectedGuests: event?.expectedGuests ?? undefined,
          hasRemuneration: event?.hasRemuneration ?? false,
          address: event?.address || "",
          city: event?.city || "",
          postalCode: event?.postalCode || "",
          state: event?.state || "",
          timeZone: event?.timeZone || "",
          merchNeeded: event?.merchNeeded ?? false,
          startDate: formatDateForInput(event?.startDate) || "",
          endDate: formatDateForInput(event?.endDate) || "",
          isPublic: event?.isPublic ?? false,
          contacts:
            event?.contacts.map((c) => ({
              contactId: c.id,
              roleIds: c.roles.map((r) => r.id),
            })) || [],
          listIds: event?.lists?.map((list) => list.id) || [],
        } satisfies UpdateEventFormValues)
      : ({
          teamId,
          eventTypeId: "",
          title: "",
          slug: "",
          description: "",
          location: "",
          isOnline: false,
          expectedGuests: undefined,
          hasRemuneration: false,
          address: "",
          city: "",
          postalCode: "",
          state: "",
          timeZone: "",
          merchNeeded: false,
          startDate: "",
          endDate: "",
          isPublic: false,
          contacts: [],
          listIds: [],
        } satisfies CreateEventFormValues),
  });

  useEffect(() => {
    form.setValue("teamId", teamId);
  }, [teamId, form]);

  useEffect(() => {
    if (initialPublicBaseUrl) {
      setPublicBaseUrl(initialPublicBaseUrl);
      return;
    }

    if (typeof window !== "undefined") {
      setPublicBaseUrl(window.location.origin);
    }
  }, [initialPublicBaseUrl]);

  useEffect(() => {
    if (event?.contacts) {
      setContactLookup((prev) => {
        const next = { ...prev };
        event.contacts.forEach((c) => {
          next[c.id] = {
            id: c.id,
            name: c.name,
            email: c.email ?? undefined,
            phone: c.phone ?? undefined,
          };
        });
        return next;
      });
    }
  }, [event?.contacts]);

  useEffect(() => {
    const handler = window.setTimeout(() => {
      setDebouncedContactSearch(contactSearchTerm.trim());
    }, 300);

    return () => window.clearTimeout(handler);
  }, [contactSearchTerm]);

  useEffect(() => {
    if (!contactSearchOpen) {
      setContactSearchTerm("");
      setDebouncedContactSearch("");
    }
  }, [contactSearchOpen]);

  const shouldSearchContacts =
    contactSearchOpen && debouncedContactSearch.length >= 2;

  const { data: contactSearchData, isLoading: isContactSearchLoading } = useSWR(
    shouldSearchContacts
      ? `/api/contacts?teamId=${teamId}&query=${encodeURIComponent(debouncedContactSearch)}`
      : null,
    fetcher,
  );

  const contactSearchResults: ContactSummary[] = useMemo(
    () =>
      (contactSearchData?.data ?? []).map(
        (contact: {
          id: string;
          name: string;
          email?: string | null;
          phone?: string | null;
        }) => ({
          id: contact.id,
          name: contact.name,
          email: contact.email ?? undefined,
          phone: contact.phone ?? undefined,
        }),
      ),
    [contactSearchData],
  );

  useEffect(() => {
    if (contactSearchResults.length === 0) {
      return;
    }

    setContactLookup((prev) => {
      const next = { ...prev };
      contactSearchResults.forEach((contact) => {
        next[contact.id] = contact;
      });
      return next;
    });
  }, [contactSearchResults]);

  const { control, watch, setValue, formState } = form;
  const typedControl =
    control as unknown as import("react-hook-form").Control<FormValues>;
  const selectedContacts = watch("contacts") || [];
  const titleValue = watch("title") || "";
  const slugValue = watch("slug") || "";
  const normalizedSlug = useMemo(
    () => (slugValue ? generateSlug(slugValue) : ""),
    [slugValue],
  );
  const isPublicValue = watch("isPublic");
  const isOnlineValue = watch("isOnline");

  const slugSuggestion = useMemo(() => generateSlug(titleValue), [titleValue]);
  const slugDirty = Boolean(formState.dirtyFields.slug);
  const publicRegistrationUrl =
    publicBaseUrl && normalizedSlug
      ? `${publicBaseUrl}/public/${teamId}/events/${normalizedSlug}`
      : "";

  // Debug form errors
  useEffect(() => {
    if (Object.keys(formState.errors).length > 0) {
      console.log("Form validation errors:", formState.errors);
    }
  }, [formState.errors]);

  useEffect(() => {
    if (isEditMode) {
      return;
    }

    if (slugDirty) {
      return;
    }

    if (slugSuggestion && slugSuggestion !== slugValue) {
      form.setValue("slug", slugSuggestion, { shouldDirty: false });
    }
  }, [form, isEditMode, slugDirty, slugSuggestion, slugValue]);

  const isContactSelected = (contactId: string) => {
    return selectedContacts.some((c) => c.contactId === contactId);
  };

  const handleAddContact = (contact: ContactSummary) => {
    if (isContactSelected(contact.id)) {
      toast({
        title: "Contact already linked",
        description: `${contact.name} is already associated with this event.`,
      });
      return;
    }

    const updatedContacts = [
      ...selectedContacts,
      { contactId: contact.id, roleIds: contactRoles[contact.id] || [] },
    ];

    setContactLookup((prev) => ({
      ...prev,
      [contact.id]: contact,
    }));

    setContactRoles((prev) => ({
      ...prev,
      [contact.id]: prev[contact.id] || [],
    }));

    setValue("contacts", updatedContacts, {
      shouldDirty: true,
      shouldTouch: true,
    });
    setContactSearchTerm("");
    setDebouncedContactSearch("");
    setContactSearchOpen(false);
  };

  const handleRemoveContact = (contactId: string) => {
    const updatedContacts = (selectedContacts || []).filter(
      (c) => c.contactId !== contactId,
    );
    setValue("contacts", updatedContacts, {
      shouldDirty: true,
      shouldTouch: true,
    });

    setContactRoles((prev) => {
      const next = { ...prev };
      delete next[contactId];
      return next;
    });
  };

  const handleApplySlugSuggestion = () => {
    if (!slugSuggestion) {
      return;
    }

    form.clearErrors("slug");
    form.setValue("slug", slugSuggestion, {
      shouldDirty: true,
      shouldValidate: true,
    });
  };

  const handleCopyPublicLink = async () => {
    if (!publicRegistrationUrl) {
      return;
    }

    if (typeof navigator === "undefined" || !navigator.clipboard) {
      toast({
        title: "Clipboard unavailable",
        description:
          "Your browser does not allow copying automatically. Copy the link manually.",
        variant: "destructive",
      });
      return;
    }

    try {
      await navigator.clipboard.writeText(publicRegistrationUrl);
      toast({
        title: "Link copied",
        description: "Public registration URL copied to your clipboard.",
      });
    } catch (error) {
      console.error("Copy public link error:", error);
      toast({
        title: "Unable to copy link",
        description: "Try copying the link manually.",
        variant: "destructive",
      });
    }
  };

  const handleRoleToggle = (contactId: string, roleId: string) => {
    const currentRoles = contactRoles[contactId] || [];
    const newRoles = currentRoles.includes(roleId)
      ? currentRoles.filter((id) => id !== roleId)
      : [...currentRoles, roleId];

    setContactRoles({ ...contactRoles, [contactId]: newRoles });

    // Update the form value
    const currentContacts = selectedContacts || [];
    const newContacts = currentContacts.map((c) =>
      c.contactId === contactId ? { ...c, roleIds: newRoles } : c,
    );
    setValue("contacts", newContacts, { shouldDirty: true });
  };

  const selectedListIds = form.watch("listIds") || [];
  const filteredLists = useMemo(() => {
    const term = listSearchTerm.trim().toLowerCase();
    if (!term) {
      return lists;
    }
    return lists.filter((list) =>
      [list.name, list.description]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(term),
    );
  }, [listSearchTerm, lists]);

  const toggleListSelection = (listId: string) => {
    const next = selectedListIds.includes(listId)
      ? selectedListIds.filter((id) => id !== listId)
      : [...selectedListIds, listId];
    setValue("listIds", next, { shouldDirty: true });
  };

  const onSubmit = async (
    values: CreateEventFormValues | UpdateEventFormValues,
  ) => {
    setIsSubmitting(true);

    try {
      const url = isEditMode ? `/api/events/${event.id}` : "/api/events";
      const method = isEditMode ? "PUT" : "POST";

      const normalizedSlugValue = values.slug ? generateSlug(values.slug) : "";
      const payload = {
        ...values,
        slug: normalizedSlugValue || undefined,
      };

      console.log("Submitting event:", { url, method, payload });

      const response = await fetch(url, {
        method,
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const errorBody = await response.json().catch(() => ({}));
        console.error("Event submission error:", errorBody);
        throw new Error(
          errorBody.error ||
            `Failed to ${isEditMode ? "update" : "create"} event`,
        );
      }

      const result = await response.json();
      console.log("Event submission success:", result);

      toast({
        title: isEditMode ? "Event updated" : "Event created",
        description: `${values.title} has been ${isEditMode ? "updated" : "added"}.`,
      });

      router.push(`/teams/${teamId}/crm/events`);
      router.refresh();
    } catch (error) {
      console.error("Event submission catch:", error);
      const message =
        error instanceof Error
          ? error.message
          : "An unexpected error occurred.";

      if (
        error instanceof Error &&
        error.message.toLowerCase().includes("slug is already in use")
      ) {
        form.setError("slug", { type: "manual", message: error.message });
      }

      toast({
        title: `Unable to ${isEditMode ? "update" : "create"} event`,
        description: message,
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <>
      <div className="w-full lg:col-span-7 xl:col-span-7">
        <Card className="w-full shadow-sm">
          <CardHeader className="border-b pb-3">
            <CardTitle className="text-xl font-semibold">
              {isEditMode ? "Edit Event" : "Add Event"}
            </CardTitle>
            <CardDescription>
              {isEditMode
                ? "Update event details and linked contacts."
                : "Create a new event and link contacts."}
            </CardDescription>
          </CardHeader>

          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
              <input
                type="hidden"
                {...form.register("teamId")}
                value={teamId}
              />
              {isEditMode && (
                <input
                  type="hidden"
                  {...form.register("id")}
                  value={(event?.id as string) ?? ""}
                />
              )}

              <CardContent className="space-y-6">
                <div className="grid gap-4 sm:grid-cols-2">
                  <FormField
                    control={typedControl}
                    name="title"
                    render={({ field }) => (
                      <FormItem className="sm:col-span-2">
                        <FormLabel>Title *</FormLabel>
                        <FormControl>
                          <Input
                            placeholder="Event title"
                            {...field}
                            value={field.value}
                          />
                        </FormControl>
                        <FormDescription>
                          e.g., Annual Fundraising Gala
                        </FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={typedControl}
                    name="eventTypeId"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Event type</FormLabel>
                        <Select
                          onValueChange={(value) =>
                            field.onChange(value === "none" ? "" : value)
                          }
                          value={field.value || "none"}
                        >
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue placeholder="Select a type" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="none">No type</SelectItem>
                            {eventTypes.map(
                              (type: { id: string; name: string }) => (
                                <SelectItem key={type.id} value={type.id}>
                                  {type.name}
                                </SelectItem>
                              ),
                            )}
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={typedControl}
                    name="timeZone"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Time zone</FormLabel>
                        <FormControl>
                          <Input
                            placeholder="Time zone"
                            {...field}
                            value={field.value ?? ""}
                          />
                        </FormControl>
                        <FormDescription>e.g., Europe/Berlin</FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={typedControl}
                    name="location"
                    render={({ field }) => (
                      <FormItem className="sm:col-span-2">
                        <FormLabel>Location</FormLabel>
                        <FormControl>
                          <Input
                            placeholder="Location"
                            {...field}
                            value={field.value ?? ""}
                          />
                        </FormControl>
                        <FormDescription>
                          e.g., Convention Center, Main Hall
                        </FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={typedControl}
                    name="isOnline"
                    render={({ field }) => (
                      <FormItem className="sm:col-span-2 flex flex-row items-start space-x-3 space-y-0 rounded-md border p-4">
                        <FormControl>
                          <Checkbox
                            checked={field.value}
                            onCheckedChange={field.onChange}
                          />
                        </FormControl>
                        <div className="space-y-1 leading-none">
                          <FormLabel className="cursor-pointer">
                            Online event
                          </FormLabel>
                          <p className="text-sm text-muted-foreground">
                            Mark this event as online-only.
                          </p>
                        </div>
                      </FormItem>
                    )}
                  />

                  {!isOnlineValue && (
                    <>
                      <FormField
                        control={typedControl}
                        name="address"
                        render={({ field }) => (
                          <FormItem className="sm:col-span-2">
                            <FormLabel>Street address</FormLabel>
                            <FormControl>
                              <Input
                                placeholder="Street address"
                                {...field}
                                value={field.value ?? ""}
                              />
                            </FormControl>
                            <FormDescription>
                              e.g., Example Street 12
                            </FormDescription>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={typedControl}
                        name="postalCode"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Postal code</FormLabel>
                            <FormControl>
                              <Input
                                placeholder="Postal code"
                                {...field}
                                value={field.value ?? ""}
                              />
                            </FormControl>
                            <FormDescription>e.g., 10115</FormDescription>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={typedControl}
                        name="state"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>State</FormLabel>
                            <FormControl>
                              <Input
                                placeholder="State"
                                {...field}
                                value={field.value ?? ""}
                              />
                            </FormControl>
                            <FormDescription>
                              e.g., Baden-Württemberg
                            </FormDescription>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={typedControl}
                        name="city"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>City</FormLabel>
                            <FormControl>
                              <Input
                                placeholder="City"
                                {...field}
                                value={field.value ?? ""}
                              />
                            </FormControl>
                            <FormDescription>e.g., Berlin</FormDescription>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </>
                  )}

                  <FormField
                    control={typedControl}
                    name="startDate"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Start Date & Time *</FormLabel>
                        <FormControl>
                          <Input
                            type="datetime-local"
                            {...field}
                            value={field.value}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={typedControl}
                    name="endDate"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>End Date & Time</FormLabel>
                        <FormControl>
                          <Input
                            type="datetime-local"
                            {...field}
                            value={field.value ?? ""}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={typedControl}
                    name="expectedGuests"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Expected guests</FormLabel>
                        <FormControl>
                          <Input
                            type="number"
                            min={0}
                            placeholder="0"
                            {...field}
                            value={field.value ?? ""}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={typedControl}
                    name="hasRemuneration"
                    render={({ field }) => (
                      <FormItem className="flex flex-row items-start space-x-3 space-y-0 rounded-md border p-4">
                        <FormControl>
                          <Checkbox
                            checked={field.value}
                            onCheckedChange={field.onChange}
                          />
                        </FormControl>
                        <div className="space-y-1 leading-none">
                          <FormLabel className="cursor-pointer">
                            Remuneration offered
                          </FormLabel>
                          <p className="text-sm text-muted-foreground">
                            Track if costs or honorarium apply.
                          </p>
                        </div>
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={typedControl}
                    name="merchNeeded"
                    render={({ field }) => (
                      <FormItem className="flex flex-row items-start space-x-3 space-y-0 rounded-md border p-4">
                        <FormControl>
                          <Checkbox
                            checked={field.value}
                            onCheckedChange={field.onChange}
                          />
                        </FormControl>
                        <div className="space-y-1 leading-none">
                          <FormLabel className="cursor-pointer">
                            Merch needed
                          </FormLabel>
                          <p className="text-sm text-muted-foreground">
                            Mark if merch should be ordered or sold.
                          </p>
                        </div>
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={typedControl}
                    name="description"
                    render={({ field }) => (
                      <FormItem className="sm:col-span-2">
                        <FormLabel>Description</FormLabel>
                        <FormControl>
                          <Textarea
                            placeholder="Event details and agenda..."
                            className="min-h-24"
                            {...field}
                            value={field.value ?? ""}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={typedControl}
                    name="isPublic"
                    render={({ field }) => (
                      <FormItem className="sm:col-span-2 flex flex-row items-start space-x-3 space-y-0 rounded-md border p-4">
                        <FormControl>
                          <Checkbox
                            checked={field.value}
                            onCheckedChange={field.onChange}
                          />
                        </FormControl>
                        <div className="space-y-1 leading-none">
                          <FormLabel className="cursor-pointer">
                            Make this event public
                          </FormLabel>
                          <p className="text-sm text-muted-foreground">
                            Allow anyone with the link to view event details and
                            register
                          </p>
                        </div>
                      </FormItem>
                    )}
                  />

                  {(isPublicValue || slugValue) && (
                    <FormField
                      control={typedControl}
                      name="slug"
                      render={({ field }) => {
                        const showSuggestionButton = Boolean(
                          slugSuggestion && slugSuggestion !== normalizedSlug,
                        );

                        return (
                          <FormItem className="sm:col-span-2">
                            <FormLabel>Public Slug</FormLabel>
                            <FormDescription>
                              This text becomes part of the link you share with
                              attendees.
                            </FormDescription>
                            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-3">
                              <FormControl>
                                <Input
                                  {...field}
                                  className="w-full"
                                  value={
                                    (field.value as string | undefined) ?? ""
                                  }
                                  placeholder={
                                    slugSuggestion || "fundraising-gala"
                                  }
                                  onChange={(event) => {
                                    form.clearErrors("slug");
                                    field.onChange(event.target.value);
                                  }}
                                  onBlur={(event) => {
                                    field.onBlur();
                                    const sanitized = generateSlug(
                                      event.target.value,
                                    );
                                    if (sanitized !== field.value) {
                                      form.setValue("slug", sanitized, {
                                        shouldDirty: true,
                                        shouldValidate: true,
                                      });
                                    }
                                  }}
                                />
                              </FormControl>
                              {showSuggestionButton && (
                                <Button
                                  type="button"
                                  variant="outline"
                                  size="sm"
                                  onClick={handleApplySlugSuggestion}
                                >
                                  Use suggestion
                                </Button>
                              )}
                            </div>
                            <FormMessage />
                          </FormItem>
                        );
                      }}
                    />
                  )}

                  {isPublicValue && normalizedSlug && (
                    <div className="sm:col-span-2 rounded-md border border-green-200 bg-green-50 p-4">
                      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                        <div className="flex items-start gap-3">
                          <div className="flex-shrink-0">
                            <svg
                              className="h-5 w-5 text-green-600"
                              fill="none"
                              stroke="currentColor"
                              viewBox="0 0 24 24"
                              aria-hidden="true"
                            >
                              <title>Completed step</title>
                              <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth={2}
                                d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1"
                              />
                            </svg>
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="text-sm font-medium text-green-900">
                              Public Registration Link
                            </p>
                            <p className="mt-1 break-all text-sm text-green-700">
                              {publicRegistrationUrl ||
                                "Link will be available once the app knows your domain."}
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={handleCopyPublicLink}
                            disabled={!publicRegistrationUrl}
                            aria-label="Copy public registration link"
                          >
                            <Copy className="mr-2 h-4 w-4" />
                            Copy link
                          </Button>
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => {
                              if (publicRegistrationUrl) {
                                window.open(
                                  publicRegistrationUrl,
                                  "_blank",
                                  "noopener,noreferrer",
                                );
                              }
                            }}
                            disabled={!publicRegistrationUrl}
                            aria-label="Open public registration link"
                          >
                            <ExternalLink className="mr-2 h-4 w-4" />
                            Open link
                          </Button>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </CardContent>

              <CardFooter className="flex justify-end gap-2 border-t pt-4">
                <Button
                  type="button"
                  variant="outline"
                  disabled={isSubmitting}
                  onClick={() => router.back()}
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  disabled={isSubmitting}
                  onClick={() =>
                    console.log("Submit button clicked", {
                      isSubmitting,
                      errors: formState.errors,
                    })
                  }
                >
                  {isSubmitting ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      {isEditMode ? "Updating" : "Saving"}
                    </>
                  ) : isEditMode ? (
                    "Update event"
                  ) : (
                    "Save event"
                  )}
                </Button>
              </CardFooter>
            </form>
          </Form>
        </Card>
      </div>

      <div className="w-full space-y-6 lg:col-span-5 lg:col-start-8 xl:col-span-5 xl:col-start-8">
        <Card className="w-full shadow-sm">
          <CardHeader className="border-b pb-3">
            <CardTitle>Linked Contacts</CardTitle>
            <CardDescription>
              Search your CRM and assign event-specific roles.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4 pt-4">
            <div className="flex flex-wrap items-center gap-2">
              <Popover
                open={contactSearchOpen}
                onOpenChange={setContactSearchOpen}
              >
                <PopoverTrigger asChild>
                  <Button type="button" variant="outline" size="sm">
                    <Plus className="mr-2 h-4 w-4" />
                    Add contact
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-[320px] p-0">
                  <Command>
                    <CommandInput
                      placeholder="Search contacts by name or email..."
                      value={contactSearchTerm}
                      onValueChange={setContactSearchTerm}
                    />
                    <CommandList>
                      <CommandEmpty>
                        {debouncedContactSearch.length < 2
                          ? "Type at least two characters to search."
                          : isContactSearchLoading
                            ? "Searching..."
                            : "No contacts found."}
                      </CommandEmpty>
                      <CommandGroup heading="Contacts">
                        {contactSearchResults.map((contact) => {
                          const isSelected = isContactSelected(contact.id);
                          return (
                            <CommandItem
                              key={contact.id}
                              value={[
                                contact.name,
                                contact.email,
                                contact.phone,
                              ]
                                .filter(Boolean)
                                .join(" ")}
                              disabled={isSelected}
                              onSelect={() => handleAddContact(contact)}
                            >
                              <div className="flex flex-col">
                                <span className="font-medium">
                                  {contact.name}
                                </span>
                                {contact.email && (
                                  <span className="text-xs text-muted-foreground break-all">
                                    {contact.email}
                                  </span>
                                )}
                              </div>
                              {isSelected && (
                                <Check className="ml-auto h-4 w-4 text-green-600" />
                              )}
                            </CommandItem>
                          );
                        })}
                      </CommandGroup>
                    </CommandList>
                  </Command>
                </PopoverContent>
              </Popover>
              <p className="text-sm text-muted-foreground">
                Link contacts to assign responsibilities quickly.
              </p>
            </div>

            {availableRoles.length === 0 && (
              <div className="rounded-md border border-yellow-200 bg-yellow-50 p-3 text-sm text-yellow-800">
                No event roles configured. Visit Settings to create event roles
                like &quot;Partner&quot;, &quot;Musician&quot;, etc.
              </div>
            )}

            {selectedContacts.length === 0 ? (
              <div className="rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground">
                No contacts linked yet. Use &quot;Add contact&quot; to search by
                name or email.
              </div>
            ) : (
              <div className="space-y-3">
                {selectedContacts.map((selected) => {
                  const contact = contactLookup[selected.contactId];
                  const selectedRoleIds =
                    contactRoles[selected.contactId] || [];

                  return (
                    <div
                      key={selected.contactId}
                      className="space-y-3 rounded-md border bg-muted/30 p-4"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="space-y-1">
                          <p className="font-medium">
                            {contact?.name ?? "Unknown contact"}
                          </p>
                          <div className="text-sm text-muted-foreground space-y-0.5">
                            {contact?.email && (
                              <p className="break-all">{contact.email}</p>
                            )}
                            {contact?.phone && <p>{contact.phone}</p>}
                          </div>
                        </div>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          onClick={() =>
                            handleRemoveContact(selected.contactId)
                          }
                          aria-label="Remove contact"
                        >
                          <X className="h-4 w-4" />
                        </Button>
                      </div>
                      {availableRoles.length > 0 && (
                        <div className="space-y-2">
                          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                            Roles
                          </p>
                          <div className="flex flex-wrap gap-2">
                            {availableRoles.map(
                              (role: {
                                id: string;
                                name: string;
                                color?: string;
                              }) => {
                                const isRoleSelected = selectedRoleIds.includes(
                                  role.id,
                                );
                                return (
                                  <Badge
                                    key={role.id}
                                    variant={
                                      isRoleSelected ? "default" : "outline"
                                    }
                                    className="cursor-pointer"
                                    style={
                                      isRoleSelected && role.color
                                        ? {
                                            backgroundColor: role.color,
                                            borderColor: role.color,
                                          }
                                        : role.color
                                          ? {
                                              borderColor: role.color,
                                              color: role.color,
                                            }
                                          : {}
                                    }
                                    onClick={() =>
                                      handleRoleToggle(
                                        selected.contactId,
                                        role.id,
                                      )
                                    }
                                  >
                                    {role.name}
                                    {isRoleSelected && (
                                      <X className="ml-1 h-3 w-3" />
                                    )}
                                  </Badge>
                                );
                              },
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
        <Card className="w-full shadow-sm">
          <CardHeader className="border-b pb-3">
            <CardTitle>Linked Lists</CardTitle>
            <CardDescription>
              Attach contact lists to this event for grouped outreach.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4 pt-4">
            <Input
              value={listSearchTerm}
              onChange={(event) => setListSearchTerm(event.target.value)}
              placeholder="Search lists..."
            />
            {lists.length === 0 ? (
              <div className="rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground">
                No contact lists available yet.
              </div>
            ) : filteredLists.length === 0 ? (
              <div className="rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground">
                No lists match your search.
              </div>
            ) : (
              <div className="space-y-2">
                {filteredLists.map((list) => {
                  const isSelected = selectedListIds.includes(list.id);
                  return (
                    <div
                      key={list.id}
                      className="flex items-start gap-3 rounded-md border p-3 text-sm hover:bg-muted/30"
                    >
                      <Checkbox
                        checked={isSelected}
                        onCheckedChange={() => toggleListSelection(list.id)}
                        className="mt-1"
                      />
                      <div className="space-y-1">
                        <p className="font-medium">{list.name}</p>
                        {list.description && (
                          <p className="text-xs text-muted-foreground">
                            {list.description}
                          </p>
                        )}
                        {typeof list.contactCount === "number" && (
                          <p className="text-xs text-muted-foreground">
                            {list.contactCount} contact
                            {list.contactCount === 1 ? "" : "s"}
                          </p>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
        {rightRailAppend}
      </div>
    </>
  );
}
