"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { AlertTriangle, Download, Loader2, Save, X } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import type { FieldErrors } from "react-hook-form";
import { useForm } from "react-hook-form";
import useSWR from "swr";
import type { z } from "zod";
import { ContactListExportDialog } from "@/components/forms/contact-list-export-dialog";
import { ContactListFiltersBuilder } from "@/components/forms/contact-list-filters-builder";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
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
import { useDebounce } from "@/hooks/use-debounce";
import { useToast } from "@/hooks/use-toast";
import { type ContactFilter, ContactListType } from "@/types";
import { createContactListSchema } from "@/validations/contact-lists";

type Contact = {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
};

type ContactList = {
  id: string;
  name: string;
  description?: string | null;
  type: ContactListType;
  filters?: ContactFilter[];
  contacts: Contact[];
  teamId: string;
  createdAt: string | Date;
  updatedAt: string | Date;
};

type FormValues = z.input<typeof createContactListSchema>;
const buildFormValues = (
  teamId: string,
  source?: ContactList | null,
): FormValues => ({
  teamId,
  name: source?.name ?? "",
  description: source?.description ?? "",
  type: source?.type ?? ContactListType.MANUAL,
  filters: (source?.filters ?? []) as FormValues["filters"],
  contactIds:
    source && source.type === ContactListType.MANUAL
      ? source.contacts.map((contact) => contact.id)
      : [],
});

const fetcher = (url: string) => fetch(url).then((res) => res.json());

const getFirstErrorMessage = (
  errors: FieldErrors<FormValues>,
): string | null => {
  const queue: unknown[] = [errors];

  while (queue.length > 0) {
    const current = queue.shift();
    if (!current || typeof current !== "object") {
      continue;
    }

    if (
      "message" in current &&
      typeof (current as { message?: unknown }).message === "string"
    ) {
      return (current as { message: string }).message;
    }

    for (const value of Object.values(current)) {
      if (value && typeof value === "object") {
        queue.push(value);
      }
    }
  }

  return null;
};

interface ContactListDetailProps {
  teamId: string;
  listId: string;
}

export function ContactListDetail({ teamId, listId }: ContactListDetailProps) {
  const router = useRouter();
  const { toast } = useToast();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isExportDialogOpen, setIsExportDialogOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const debouncedQuery = useDebounce(searchQuery, 300);
  const lastSyncedKeyRef = useRef<string | null>(null);

  const isNewList = listId === "new";
  const listKey = isNewList
    ? null
    : `/api/contact-lists/${listId}?teamId=${teamId}`;

  const {
    data: listData,
    mutate: mutateList,
    isLoading: isLoadingList,
  } = useSWR(listKey, fetcher, {
    revalidateOnFocus: false,
  });

  const list: ContactList | undefined = listData?.data;

  const newListDefaults = useMemo<FormValues>(
    () => buildFormValues(teamId),
    [teamId],
  );

  const fallbackValues = useMemo<FormValues>(
    () =>
      isNewList || !list ? newListDefaults : buildFormValues(teamId, list),
    [isNewList, list, newListDefaults, teamId],
  );

  const form = useForm<FormValues>({
    resolver: zodResolver(createContactListSchema),
    mode: "onSubmit",
    defaultValues: newListDefaults,
  });

  const typedControl =
    form.control as unknown as import("react-hook-form").Control<FormValues>;

  const listSyncKey = useMemo(() => {
    if (isNewList) {
      return `new-${teamId}`;
    }

    if (!list) {
      return null;
    }

    const updatedAtValue = Number(new Date(list.updatedAt));
    const suffix = Number.isNaN(updatedAtValue) ? "unknown" : updatedAtValue;

    return `${list.id}-${suffix}`;
  }, [isNewList, list, teamId]);

  useEffect(() => {
    if (!listSyncKey) {
      return;
    }

    if (lastSyncedKeyRef.current === listSyncKey) {
      return;
    }

    if (isNewList || !list) {
      form.reset(newListDefaults);
    } else {
      form.reset(buildFormValues(teamId, list));
    }

    lastSyncedKeyRef.current = listSyncKey;
  }, [form, isNewList, list, listSyncKey, newListDefaults, teamId]);

  const isFormSynced = Boolean(
    listSyncKey && lastSyncedKeyRef.current === listSyncKey,
  );

  const watchedListType = form.watch("type");
  const fallbackListType = fallbackValues.type ?? ContactListType.MANUAL;
  const effectiveListType = isFormSynced
    ? (watchedListType ?? fallbackListType)
    : fallbackListType;

  const watchedFilters = form.watch("filters");
  const watchedContactIds = form.watch("contactIds");
  const filtersValue: ContactFilter[] = (
    isFormSynced ? (watchedFilters ?? []) : (fallbackValues.filters ?? [])
  ) as ContactFilter[];
  const contactIdsValue = isFormSynced
    ? (watchedContactIds ?? [])
    : (fallbackValues.contactIds ?? []);
  const isSmartList = effectiveListType === ContactListType.SMART;

  const contactQueryParam = debouncedQuery.trim()
    ? `&query=${encodeURIComponent(debouncedQuery.trim())}`
    : "";
  const filtersQueryParam = isSmartList
    ? `&filters=${encodeURIComponent(JSON.stringify(filtersValue))}`
    : "";
  const contactsKey = `/api/contacts?teamId=${teamId}${contactQueryParam}${filtersQueryParam}`;

  const { data: contactsData, isValidating: isLoadingContacts } = useSWR(
    contactsKey,
    fetcher,
    {
      keepPreviousData: true,
    },
  );

  const contacts: Contact[] = useMemo(
    () => (contactsData?.data as Contact[] | undefined) ?? [],
    [contactsData],
  );

  const existingContactIds = useMemo(() => {
    if (!list || list.type !== ContactListType.MANUAL) {
      return new Set<string>();
    }

    return new Set(list.contacts.map((contact) => contact.id));
  }, [list]);

  const selectedCount = isSmartList ? 0 : contactIdsValue.length;
  const previewCount = contacts.length;
  const formErrorMessage = getFirstErrorMessage(form.formState.errors);

  const handleRemoveContact = async (contactId: string) => {
    if (!list || list.type !== ContactListType.MANUAL) {
      return;
    }

    try {
      setIsSubmitting(true);

      const response = await fetch(`/api/contact-lists/${list.id}/contacts`, {
        method: "DELETE",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          teamId,
          contactIds: [contactId],
        }),
      });

      if (!response.ok) {
        const errorBody = await response.json().catch(() => ({}));
        throw new Error(errorBody.error || "Failed to remove contact");
      }

      await mutateList();
      form.setValue(
        "contactIds",
        contactIdsValue.filter((id) => id !== contactId),
      );
      toast({
        title: "Contact removed",
        description: "The contact was removed from the list.",
      });
    } catch (error) {
      toast({
        title: "Failed to remove contact",
        description:
          error instanceof Error ? error.message : "Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const onSubmit = async (values: FormValues) => {
    setIsSubmitting(true);

    try {
      if (isNewList) {
        const payload: Record<string, unknown> = {
          ...values,
          contactIds:
            values.type === ContactListType.MANUAL ? values.contactIds : [],
          ...(values.type === ContactListType.SMART
            ? { filters: values.filters ?? [] }
            : {}),
        };

        const createResponse = await fetch("/api/contact-lists", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(payload),
        });

        if (!createResponse.ok) {
          const errorBody = await createResponse.json().catch(() => ({}));
          throw new Error(errorBody.error || "Failed to create list");
        }

        const { data } = await createResponse.json();
        toast({
          title: "List created",
          description: `${values.name} has been created.`,
        });
        router.push(`/teams/${teamId}/crm/lists/${data.id}`);
        router.refresh();
        return;
      }

      if (!list) {
        throw new Error("List not found");
      }

      const shouldSendFilters =
        values.type === ContactListType.SMART ||
        list.type === ContactListType.SMART;

      const updatePayload: Record<string, unknown> = {
        teamId: values.teamId,
        name: values.name,
        description: values.description,
        type: values.type,
        ...(shouldSendFilters ? { filters: values.filters ?? [] } : {}),
      };

      const updateResponse = await fetch(`/api/contact-lists/${list.id}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(updatePayload),
      });

      if (!updateResponse.ok) {
        const errorBody = await updateResponse.json().catch(() => ({}));
        throw new Error(errorBody.error || "Failed to update list");
      }

      if (values.type === ContactListType.MANUAL) {
        const newContactIds = values.contactIds || [];

        const contactsToAdd = newContactIds.filter(
          (id) => !existingContactIds.has(id),
        );

        const contactsToRemove = [...existingContactIds].filter(
          (id) => !newContactIds.includes(id),
        );

        if (contactsToAdd.length > 0) {
          const addResponse = await fetch(
            `/api/contact-lists/${list.id}/contacts`,
            {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
              },
              body: JSON.stringify({
                teamId: values.teamId,
                contactIds: contactsToAdd,
              }),
            },
          );

          if (!addResponse.ok) {
            const errorBody = await addResponse.json().catch(() => ({}));
            throw new Error(errorBody.error || "Failed to add contacts");
          }
        }

        if (contactsToRemove.length > 0) {
          const removeResponse = await fetch(
            `/api/contact-lists/${list.id}/contacts`,
            {
              method: "DELETE",
              headers: {
                "Content-Type": "application/json",
              },
              body: JSON.stringify({
                teamId: values.teamId,
                contactIds: contactsToRemove,
              }),
            },
          );

          if (!removeResponse.ok) {
            const errorBody = await removeResponse.json().catch(() => ({}));
            throw new Error(errorBody.error || "Failed to remove contacts");
          }
        }
      }

      await mutateList();
      toast({
        title: "List updated",
        description: "Changes have been saved.",
      });
    } catch (error) {
      toast({
        title: isNewList ? "Failed to create list" : "Failed to update list",
        description:
          error instanceof Error ? error.message : "Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isNewList && isLoadingList) {
    return (
      <div className="flex justify-center py-16">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!isNewList && !list) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>List not found</CardTitle>
          <CardDescription>
            The requested list could not be located. It may have been deleted or
            you may not have access.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button asChild>
            <Link href={`/teams/${teamId}/crm/lists`}>Back to Lists</Link>
          </Button>
        </CardContent>
      </Card>
    );
  }

  const headerTitle = isNewList ? "Create contact list" : (list?.name ?? "");
  const headerDescription = isNewList
    ? "Set up the name, description, and list behaviour."
    : (list?.description ?? "");

  const currentListType = effectiveListType;
  const currentContactsCount = list?.contacts.length ?? 0;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h1 className="break-words text-3xl font-semibold">{headerTitle}</h1>
          {headerDescription && (
            <p className="mt-1 break-words text-muted-foreground">
              {headerDescription}
            </p>
          )}
        </div>
        <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto sm:justify-end">
          {!isNewList && list && (
            <>
              <Badge variant="secondary">
                {currentContactsCount} contact
                {currentContactsCount === 1 ? "" : "s"}
              </Badge>
              <Badge variant="outline">
                {currentListType === ContactListType.SMART
                  ? "Smart list"
                  : "Manual list"}
              </Badge>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setIsExportDialogOpen(true)}
              >
                <Download className="mr-2 h-4 w-4" />
                Export
              </Button>
              <ContactListExportDialog
                open={isExportDialogOpen}
                onOpenChange={setIsExportDialogOpen}
                list={{ id: list.id, name: list.name }}
                teamId={teamId}
              />
            </>
          )}
          <Button asChild variant="outline">
            <Link href={`/teams/${teamId}/crm/lists`}>Back to Lists</Link>
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>
            {isNewList ? "List details" : "Edit list details"}
          </CardTitle>
          <CardDescription>
            {isNewList
              ? "Give your list a name, optional description, and choose how contacts should be managed."
              : "Update the list name, description, type, and membership in a single place."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
              {formErrorMessage ? (
                <Alert variant="destructive">
                  <AlertTriangle className="h-4 w-4" />
                  <AlertTitle>Form validation failed</AlertTitle>
                  <AlertDescription>{formErrorMessage}</AlertDescription>
                </Alert>
              ) : null}

              <FormField
                control={typedControl}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>List Name *</FormLabel>
                    <FormControl>
                      <Input
                        placeholder="e.g., Quarterly Newsletter"
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={typedControl}
                name="description"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Description (optional)</FormLabel>
                    <FormControl>
                      <Textarea
                        placeholder="Describe the purpose of this contact list"
                        {...field}
                        value={field.value || ""}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={typedControl}
                name="type"
                render={({ field }) => {
                  const selectValue = isFormSynced
                    ? (field.value ?? fallbackListType)
                    : fallbackListType;

                  return (
                    <FormItem>
                      <FormLabel>List type</FormLabel>
                      <FormDescription>
                        Manual lists include only the contacts you select. Smart
                        lists stay in sync automatically based on filters.
                      </FormDescription>
                      <Select
                        key={list?.id || "new"}
                        value={selectValue}
                        onValueChange={(value) =>
                          field.onChange(value as ContactListType)
                        }
                      >
                        <FormControl>
                          <SelectTrigger className="w-full sm:w-[320px]">
                            <SelectValue placeholder="Select list type" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value={ContactListType.MANUAL}>
                            Manual (select contacts)
                          </SelectItem>
                          <SelectItem value={ContactListType.SMART}>
                            Smart (auto-updating)
                          </SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  );
                }}
              />

              {isSmartList ? (
                <FormField
                  control={typedControl}
                  name="filters"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Filters</FormLabel>
                      <FormDescription>
                        Contacts matching these filters are included
                        automatically.
                      </FormDescription>
                      <FormControl>
                        <ContactListFiltersBuilder
                          teamId={teamId}
                          value={(field.value ?? []) as ContactFilter[]}
                          onChange={(next) => field.onChange(next)}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              ) : (
                <FormField
                  control={typedControl}
                  name="contactIds"
                  render={() => (
                    <FormItem>
                      <FormLabel>Contacts</FormLabel>
                      <FormDescription>
                        Search and select contacts to include in this list.
                      </FormDescription>
                      <Input
                        className="mt-2"
                        value={searchQuery}
                        onChange={(event) => setSearchQuery(event.target.value)}
                        placeholder="Search contacts by name, email, or phone"
                      />
                      <div className="mt-2 max-h-60 space-y-2 overflow-y-auto rounded-md border p-3">
                        {isLoadingContacts && contacts.length === 0 ? (
                          <div className="flex items-center text-sm text-muted-foreground">
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                            Loading contacts...
                          </div>
                        ) : contacts.length === 0 ? (
                          <p className="text-sm text-muted-foreground">
                            {debouncedQuery.trim()
                              ? "No contacts match your search"
                              : "No contacts available"}
                          </p>
                        ) : (
                          contacts.map((contact) => (
                            <FormField
                              key={contact.id}
                              control={typedControl}
                              name="contactIds"
                              render={({ field }) => (
                                <FormItem className="flex min-w-0 flex-row items-start space-x-3 space-y-0">
                                  <FormControl>
                                    <Checkbox
                                      checked={field.value?.includes(
                                        contact.id,
                                      )}
                                      onCheckedChange={(checked) => {
                                        if (checked) {
                                          field.onChange([
                                            ...(field.value || []),
                                            contact.id,
                                          ]);
                                          return;
                                        }

                                        field.onChange(
                                          (field.value || []).filter(
                                            (value) => value !== contact.id,
                                          ),
                                        );
                                      }}
                                    />
                                  </FormControl>
                                  <FormLabel className="flex min-w-0 flex-col gap-0.5 font-normal">
                                    <span className="break-words">
                                      {contact.name}
                                    </span>
                                    <span className="break-all text-xs text-muted-foreground">
                                      {[contact.email, contact.phone]
                                        .filter(Boolean)
                                        .join(" • ")}
                                    </span>
                                  </FormLabel>
                                </FormItem>
                              )}
                            />
                          ))
                        )}
                      </div>
                      <FormDescription className="text-xs text-muted-foreground">
                        {selectedCount} contact
                        {selectedCount === 1 ? "" : "s"} selected.
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              )}

              {isSmartList && (
                <div className="space-y-2">
                  <FormLabel>Matching contacts preview</FormLabel>
                  <FormDescription>
                    Search within the current filter results to confirm the list
                    looks right.
                  </FormDescription>
                  <Input
                    className="mt-2"
                    value={searchQuery}
                    onChange={(event) => setSearchQuery(event.target.value)}
                    placeholder="Search contacts by name, email, or phone"
                  />
                  <div className="mt-2 max-h-60 space-y-2 overflow-y-auto rounded-md border p-3">
                    {isLoadingContacts && contacts.length === 0 ? (
                      <div className="flex items-center text-sm text-muted-foreground">
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Loading contacts...
                      </div>
                    ) : contacts.length === 0 ? (
                      <p className="text-sm text-muted-foreground">
                        {filtersValue.length
                          ? "No contacts currently match these filters."
                          : "No contacts found. Adjust your filters or search term."}
                      </p>
                    ) : (
                      contacts.map((contact) => (
                        <div
                          key={contact.id}
                          className="rounded-md border p-3 text-sm"
                        >
                          <p className="font-medium">{contact.name}</p>
                          <p className="text-muted-foreground">
                            {[contact.email, contact.phone]
                              .filter(Boolean)
                              .join(" • ")}
                          </p>
                        </div>
                      ))
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Showing {previewCount} contact
                    {previewCount === 1 ? "" : "s"} that match the current
                    filters.
                  </p>
                </div>
              )}

              <div className="flex flex-wrap justify-end gap-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    if (isNewList) {
                      form.reset(newListDefaults);
                      lastSyncedKeyRef.current = `new-${teamId}`;
                      return;
                    }

                    if (list) {
                      form.reset(buildFormValues(teamId, list));
                      if (listSyncKey) {
                        lastSyncedKeyRef.current = listSyncKey;
                      }
                    }
                  }}
                  disabled={isSubmitting}
                >
                  <X className="mr-2 h-4 w-4" />
                  Reset
                </Button>
                <Button type="submit" disabled={isSubmitting}>
                  {isSubmitting ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      {isNewList ? "Creating..." : "Saving..."}
                    </>
                  ) : (
                    <>
                      <Save className="mr-2 h-4 w-4" />
                      {isNewList ? "Create List" : "Save Changes"}
                    </>
                  )}
                </Button>
              </div>
            </form>
          </Form>
        </CardContent>
      </Card>

      {!isNewList && (
        <Card>
          <CardHeader>
            <CardTitle>
              {list?.type === ContactListType.SMART
                ? "Matching contacts"
                : "Current contacts"}
            </CardTitle>
            <CardDescription>
              {list?.type === ContactListType.SMART
                ? "These contacts currently match the filters. The list will update automatically as contacts change."
                : "These contacts are currently part of the list."}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {list?.contacts.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                {list?.type === ContactListType.SMART
                  ? "No contacts currently match the configured filters."
                  : "No contacts are assigned to this list yet."}
              </p>
            ) : (
              <div className="space-y-3">
                {list?.contacts.map((contact) => (
                  <div
                    key={contact.id}
                    className="flex flex-col gap-3 rounded-md border p-3 sm:flex-row sm:items-center sm:justify-between"
                  >
                    <div className="min-w-0">
                      <Link
                        href={`/teams/${teamId}/crm/contacts/${contact.id}`}
                        className="block truncate font-medium hover:underline"
                      >
                        {contact.name}
                      </Link>
                      <p className="truncate text-sm text-muted-foreground">
                        {[contact.email, contact.phone]
                          .filter(Boolean)
                          .join(" • ")}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-2 self-start sm:self-auto">
                      <Button asChild variant="outline" size="sm">
                        <Link
                          href={`/teams/${teamId}/crm/contacts/${contact.id}/edit`}
                        >
                          Edit
                        </Link>
                      </Button>
                      {list?.type === ContactListType.MANUAL && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleRemoveContact(contact.id)}
                          disabled={isSubmitting}
                        >
                          <X className="h-4 w-4" />
                          <span className="sr-only">Remove contact</span>
                        </Button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
