"use client";

import {
  Loader2,
  Mail,
  Phone,
  Search,
  Unlink,
  UserPlus,
  Users,
} from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import useSWR from "swr";
import OrganizationForm from "@/components/forms/organization";
import { Loader } from "@/components/helper/loader";
import OrganizationDetails from "@/components/organization-details";
import OrganizationEngagements from "@/components/organization-engagements";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { toast } from "@/hooks/use-toast";

const fetcher = (url: string) => fetch(url).then((res) => res.json());

type LinkedContact = {
  id: string;
  teamId: string;
  name: string;
  email?: string | null;
  phone?: string | null;
};

function LinkedContactsOverview({
  organizationId,
  teamId,
  contacts,
  onLinkedContactsChange,
}: {
  organizationId: string;
  teamId?: string | null;
  contacts: LinkedContact[];
  onLinkedContactsChange: () => undefined | Promise<unknown>;
}) {
  const [contactSearch, setContactSearch] = useState("");
  const [actionContactId, setActionContactId] = useState<string | null>(null);
  const [newContactEmail, setNewContactEmail] = useState("");
  const [newContactPhone, setNewContactPhone] = useState("");
  const [isCreatingContact, setIsCreatingContact] = useState(false);
  const trimmedSearch = contactSearch.trim();
  const searchKey =
    teamId && trimmedSearch
      ? `/api/contacts?teamId=${teamId}&query=${encodeURIComponent(trimmedSearch)}&page=1&pageSize=10`
      : null;
  const { data: contactsData, isLoading: isSearchingContacts } = useSWR(
    searchKey,
    fetcher,
  );
  const linkedContactIds = useMemo(
    () => new Set(contacts.map((contact) => contact.id)),
    [contacts],
  );
  const searchResults: LinkedContact[] = Array.isArray(contactsData?.data)
    ? contactsData.data
    : [];
  const availableSearchResults = searchResults.filter(
    (contact) => !linkedContactIds.has(contact.id),
  );
  const normalizedSearch = trimmedSearch.toLowerCase();
  const exactContactExists = searchResults.some(
    (contact) =>
      contact.name.trim().toLowerCase() === normalizedSearch ||
      contact.email?.trim().toLowerCase() === normalizedSearch,
  );

  const linkContact = async (contactId: string) => {
    setActionContactId(contactId);

    try {
      const response = await fetch(
        `/api/organizations/${organizationId}/contacts`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ contactId }),
        },
      );

      const body = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(body.error || "Failed to link contact");
      }

      setContactSearch("");
      await onLinkedContactsChange();

      toast({
        title: "Contact linked",
        description: "The contact is now linked to this organization.",
      });
    } catch (error) {
      toast({
        title: "Unable to link contact",
        description:
          error instanceof Error
            ? error.message
            : "An unexpected error occurred.",
        variant: "destructive",
      });
    } finally {
      setActionContactId(null);
    }
  };

  const createAndLinkContact = async () => {
    if (!teamId || !trimmedSearch || !newContactEmail.trim()) {
      toast({
        title: "Name and email are required",
        description: "Add an email address before creating the contact.",
        variant: "destructive",
      });
      return;
    }

    setIsCreatingContact(true);

    try {
      const response = await fetch("/api/contacts", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          teamId,
          name: trimmedSearch,
          email: newContactEmail.trim().toLowerCase(),
          phone: newContactPhone.trim() || undefined,
          organizationIds: [organizationId],
        }),
      });

      const body = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(body.error || "Failed to create contact");
      }

      setContactSearch("");
      setNewContactEmail("");
      setNewContactPhone("");
      await onLinkedContactsChange();

      toast({
        title: "Contact created",
        description: "The new contact is linked to this organization.",
      });
    } catch (error) {
      toast({
        title: "Unable to create contact",
        description:
          error instanceof Error
            ? error.message
            : "An unexpected error occurred.",
        variant: "destructive",
      });
    } finally {
      setIsCreatingContact(false);
    }
  };

  const unlinkContact = async (contactId: string) => {
    setActionContactId(contactId);

    try {
      const response = await fetch(
        `/api/organizations/${organizationId}/contacts`,
        {
          method: "DELETE",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ contactId }),
        },
      );

      const body = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(body.error || "Failed to unlink contact");
      }

      await onLinkedContactsChange();

      toast({
        title: "Contact unlinked",
        description: "The contact is no longer linked to this organization.",
      });
    } catch (error) {
      toast({
        title: "Unable to unlink contact",
        description:
          error instanceof Error
            ? error.message
            : "An unexpected error occurred.",
        variant: "destructive",
      });
    } finally {
      setActionContactId(null);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-xl">
          Linked Contacts <Badge variant="outline">{contacts.length}</Badge>
        </CardTitle>
        <CardDescription>
          People linked to this organization from the CRM.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {teamId ? (
          <div className="space-y-2">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={contactSearch}
                onChange={(event) => setContactSearch(event.target.value)}
                placeholder="Search contacts by name, email, or phone"
                className="pl-9"
              />
            </div>
            {trimmedSearch ? (
              <div className="rounded-md border">
                {isSearchingContacts ? (
                  <div className="flex items-center gap-2 p-3 text-sm text-muted-foreground">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Searching contacts
                  </div>
                ) : availableSearchResults.length > 0 ? (
                  availableSearchResults.map((contact) => (
                    <div
                      key={contact.id}
                      className="flex min-w-0 items-center justify-between gap-3 border-b p-3 last:border-b-0"
                    >
                      <div className="min-w-0">
                        <div className="truncate text-sm font-medium">
                          {contact.name}
                        </div>
                        <div className="truncate text-xs text-muted-foreground">
                          {[contact.email, contact.phone]
                            .filter(Boolean)
                            .join(" · ") || "No email or phone"}
                        </div>
                      </div>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        disabled={actionContactId === contact.id}
                        onClick={() => linkContact(contact.id)}
                      >
                        {actionContactId === contact.id ? (
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        ) : (
                          <UserPlus className="mr-2 h-4 w-4" />
                        )}
                        Link
                      </Button>
                    </div>
                  ))
                ) : (
                  <div className="p-3 text-sm text-muted-foreground">
                    No unlinked contacts found.
                  </div>
                )}
                {!exactContactExists && (
                  <div className="border-t border-dashed p-3">
                    <div className="mb-3">
                      <p className="text-sm font-medium">
                        Create &quot;{trimmedSearch}&quot;
                      </p>
                      <p className="text-xs text-muted-foreground">
                        Add a new contact and link them to this organization.
                      </p>
                    </div>
                    <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto]">
                      <Input
                        type="email"
                        value={newContactEmail}
                        onChange={(event) =>
                          setNewContactEmail(event.target.value)
                        }
                        placeholder="contact@example.org"
                      />
                      <Input
                        value={newContactPhone}
                        onChange={(event) =>
                          setNewContactPhone(event.target.value)
                        }
                        placeholder="Phone optional"
                      />
                      <Button
                        type="button"
                        className="shrink-0"
                        disabled={isCreatingContact}
                        onClick={createAndLinkContact}
                      >
                        {isCreatingContact ? (
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        ) : (
                          <UserPlus className="mr-2 h-4 w-4" />
                        )}
                        Create
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            ) : null}
          </div>
        ) : null}

        {contacts.length === 0 ? (
          <div className="rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground">
            No contacts are linked to this organization yet.
          </div>
        ) : (
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/50">
                  <TableHead>Name</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Phone</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {contacts.map((contact) => (
                  <TableRow key={contact.id}>
                    <TableCell className="font-medium">
                      <div className="flex items-center">
                        <Users className="mr-2 h-3.5 w-3.5 text-muted-foreground" />
                        {contact.name}
                      </div>
                    </TableCell>
                    <TableCell>
                      {contact.email ? (
                        <a
                          href={`mailto:${contact.email}`}
                          className="inline-flex items-center text-foreground underline underline-offset-2 hover:text-foreground"
                        >
                          <Mail className="mr-2 h-3.5 w-3.5" />
                          {contact.email}
                        </a>
                      ) : (
                        <span className="text-muted-foreground">-</span>
                      )}
                    </TableCell>
                    <TableCell>
                      {contact.phone ? (
                        <a
                          href={`tel:${contact.phone}`}
                          className="inline-flex items-center text-foreground underline underline-offset-2 hover:text-foreground"
                        >
                          <Phone className="mr-2 h-3.5 w-3.5" />
                          {contact.phone}
                        </a>
                      ) : (
                        <span className="text-muted-foreground">-</span>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-2">
                        <Button asChild variant="ghost" size="sm">
                          <Link
                            href={`/teams/${contact.teamId}/crm/contacts/${contact.id}`}
                          >
                            View
                          </Link>
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          disabled={actionContactId === contact.id}
                          onClick={() => unlinkContact(contact.id)}
                        >
                          {actionContactId === contact.id ? (
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          ) : (
                            <Unlink className="mr-2 h-4 w-4" />
                          )}
                          Unlink
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default function OrganizationData({
  organizationId,
  isAdminOrTeam = false,
}: {
  organizationId: string;
  isAdminOrTeam?: boolean;
}) {
  const allowManagement = isAdminOrTeam;

  const {
    data: organizationData,
    isLoading: orgLoading,
    mutate,
  } = useSWR(`/api/organizations/${organizationId}`, fetcher);

  const { data: fundingRequestsData, isLoading: fundingLoading } = useSWR(
    `/api/funding-requests/?organizationId=${organizationId}`,
    fetcher,
  );

  const [isFilledByOrg, setIsFilledByOrg] = useState(false);

  useEffect(() => {
    if (organizationData?.data) {
      setIsFilledByOrg(organizationData.data.isFilledByOrg);
    }
  }, [organizationData?.data]);

  if (orgLoading || fundingLoading) {
    return (
      <div className="flex justify-center items-center h-64">
        <Loader className={""} />
      </div>
    );
  }

  const allowEditOrganization = async () => {
    const newValue = !isFilledByOrg;
    setIsFilledByOrg(newValue);

    try {
      await fetch(`/api/organizations/${organizationId}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          isFilledByOrg: newValue,
        }),
      });

      await mutate();

      toast({
        title: "Success",
        description: "Organization updated",
      });
    } catch (error) {
      console.log(error);
      setIsFilledByOrg(!newValue);

      toast({
        title: "Error",
        description: "Error updating organization",
        variant: "destructive",
      });
    }
  };

  const linkedContacts = Array.isArray(organizationData?.data?.contacts)
    ? organizationData.data.contacts
    : [];

  return (
    <div className=" px-5 py-8 mx-auto">
      <div className=" p-6">
        {allowManagement && (
          <div className="flex justify-between items-center mb-6 bg-blue-50 p-4 rounded-lg border border-blue-200">
            <div className="flex flex-col">
              <h3 className="text-base font-semibold text-gray-800">
                Organization Edit Mode
              </h3>
              <p className="text-sm text-gray-600 mt-1">
                {isFilledByOrg
                  ? "Edit mode is locked. Organization details can only be viewed by the organization."
                  : "Edit mode is active. Organization can modify organization details."}
              </p>
            </div>
            <div className="flex items-center space-x-3">
              <span className="text-sm font-medium text-gray-700">
                {isFilledByOrg ? "Unlock" : "Lock"}
              </span>
              <Switch
                checked={isFilledByOrg}
                onCheckedChange={allowEditOrganization}
                className="data-[state=checked]:bg-blue-600"
              />
            </div>
          </div>
        )}

        {isFilledByOrg && !allowManagement ? (
          <OrganizationDetails
            organization={organizationData?.data}
            fundingRequests={fundingRequestsData?.data}
          />
        ) : (
          <div className="space-y-6">
            <OrganizationForm data={organizationData?.data} />
            <LinkedContactsOverview
              organizationId={organizationId}
              teamId={organizationData?.data?.teamId}
              contacts={linkedContacts}
              onLinkedContactsChange={mutate}
            />
            {organizationData?.data?.teamId && (
              <OrganizationEngagements
                organizationId={organizationId}
                teamId={organizationData.data.teamId}
              />
            )}
          </div>
        )}
      </div>
    </div>
  );
}