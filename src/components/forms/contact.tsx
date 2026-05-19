"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2, PlusCircle, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useFieldArray, useForm } from "react-hook-form";
import useSWR from "swr";
import type { z } from "zod";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Combobox } from "@/components/ui/combobox";
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import type { ContactSubmodule } from "@/constants/contact-submodules";
import { useToast } from "@/hooks/use-toast";
import { EUROPEAN_COUNTRY_OPTIONS } from "@/lib/countries";
import {
  type Contact,
  ContactAttributeType,
  ContactGender,
  ContactRequestPreference,
} from "@/types";
import {
  createContactSchema,
  updateContactSchema,
} from "@/validations/contacts";

type CreateContactFormValues = z.infer<typeof createContactSchema>;
type UpdateContactFormValues = z.infer<typeof updateContactSchema>;
type ContactFormValues = CreateContactFormValues | UpdateContactFormValues;

type Group = {
  id: string;
  name: string;
};

type OrganizationOption = {
  id: string;
  name: string | null;
  email: string;
};

interface ContactFormProps {
  teamId: string;
  contact?: Contact;
}

const fetcher = (url: string) => fetch(url).then((res) => res.json());

const formatDateForInput = (value?: Date | string) => {
  if (!value) return "";
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "";
  }
  return date.toISOString().slice(0, 10);
};

const genderOptions = [
  { label: "Female", value: ContactGender.FEMALE },
  { label: "Male", value: ContactGender.MALE },
  { label: "Non-binary", value: ContactGender.NON_BINARY },
  { label: "Other", value: ContactGender.OTHER },
  { label: "Prefer not to answer", value: ContactGender.NO_ANSWER },
];

const requestPreferenceOptions = [
  { label: "Yes", value: ContactRequestPreference.YES },
  { label: "No", value: ContactRequestPreference.NO },
  { label: "No answer", value: ContactRequestPreference.NO_ANSWER },
];

const bipocOptions = [
  { label: "No answer", value: "unspecified" },
  { label: "Yes", value: "yes" },
  { label: "No", value: "no" },
];

const socialPlatformOptions = [
  { label: "Instagram", value: "instagram" },
  { label: "Facebook", value: "facebook" },
  { label: "X (Twitter)", value: "x" },
  { label: "LinkedIn", value: "linkedin" },
  { label: "TikTok", value: "tiktok" },
  { label: "YouTube", value: "youtube" },
];

const countryOptions = EUROPEAN_COUNTRY_OPTIONS;

export default function ContactForm({ teamId, contact }: ContactFormProps) {
  const router = useRouter();
  const { toast } = useToast();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const isEditMode = Boolean(contact);

  const { data: groupsData } = useSWR(`/api/groups?teamId=${teamId}`, fetcher);
  const { data: organizationsData } = useSWR(
    teamId ? `/api/organizations?teamId=${teamId}` : null,
    fetcher,
  );
  const { data: attributeKeysData, isLoading: attributeKeysLoading } = useSWR(
    teamId ? `/api/contacts/attribute-keys?teamId=${teamId}` : null,
    fetcher,
  );
  const { data: submodulesData } = useSWR(
    teamId ? `/api/contacts/submodules?teamId=${teamId}` : null,
    fetcher,
  );

  const groups: Group[] = groupsData?.data || [];
  const organizations: OrganizationOption[] = organizationsData?.data || [];
  const allowedSubmodules: ContactSubmodule[] = submodulesData?.data || [];
  const canAccessSubmodule = useCallback(
    (submodule: ContactSubmodule) => allowedSubmodules.includes(submodule),
    [allowedSubmodules],
  );
  const tabOptions = useMemo(
    () => [
      { value: "general", label: "General" },
      ...(canAccessSubmodule("SUPERVISION")
        ? [{ value: "supervision", label: "Supervision" }]
        : []),
      ...(canAccessSubmodule("EVENTS")
        ? [{ value: "events", label: "Events" }]
        : []),
      ...(canAccessSubmodule("SHOP") ? [{ value: "shop", label: "Shop" }] : []),
      { value: "attributes", label: "Attributes" },
    ],
    [canAccessSubmodule],
  );
  const [activeTab, setActiveTab] = useState("general");

  useEffect(() => {
    if (!tabOptions.some((option) => option.value === activeTab)) {
      setActiveTab(tabOptions[0]?.value ?? "general");
    }
  }, [activeTab, tabOptions]);

  const form = useForm<ContactFormValues>({
    resolver: zodResolver(
      isEditMode ? updateContactSchema : createContactSchema,
    ) as import("react-hook-form").Resolver<ContactFormValues>,
    defaultValues: isEditMode
      ? {
          teamId,
          contactId: contact?.id ?? "",
          name: contact?.name ?? "",
          pronouns: contact?.pronouns ?? "",
          gender: contact?.gender ?? null,
          genderRequestPreference: contact?.genderRequestPreference ?? null,
          isBipoc:
            contact?.isBipoc === undefined ? null : (contact?.isBipoc ?? null),
          racismRequestPreference: contact?.racismRequestPreference ?? null,
          otherMargins: contact?.otherMargins ?? "",
          onboardingDate: formatDateForInput(contact?.onboardingDate),
          breakUntil: formatDateForInput(contact?.breakUntil),
          address: contact?.address ?? "",
          postalCode: contact?.postalCode ?? "",
          state: contact?.state ?? "",
          city: contact?.city ?? "",
          country: contact?.country ?? "",
          email: contact?.email ?? "",
          phone: contact?.phone ?? "",
          signal: contact?.signal ?? "",
          website: contact?.website ?? "",
          socialLinks:
            contact?.socialLinks?.map((link) => ({
              platform: link.platform,
              handle: link.handle,
            })) ?? [],
          organizationIds:
            contact?.organizations?.map((organization) => organization.id) ??
            [],
          groupId: contact?.groupId ?? undefined,
          profileAttributes: (contact?.profileAttributes ??
            []) as CreateContactFormValues["profileAttributes"],
        }
      : {
          teamId,
          name: "",
          pronouns: "",
          gender: null,
          genderRequestPreference: null,
          isBipoc: null,
          racismRequestPreference: null,
          otherMargins: "",
          onboardingDate: "",
          breakUntil: "",
          address: "",
          postalCode: "",
          state: "",
          city: "",
          country: "",
          email: "",
          phone: "",
          signal: "",
          website: "",
          socialLinks: [],
          organizationIds: [],
          groupId: undefined,
          profileAttributes: [] as CreateContactFormValues["profileAttributes"],
        },
  });

  useEffect(() => {
    form.setValue("teamId", teamId);
  }, [teamId, form]);

  const { control, watch, setValue } = form;
  const typedControl =
    control as unknown as import("react-hook-form").Control<CreateContactFormValues>;

  const { fields, append, remove } = useFieldArray({
    control,
    name: "profileAttributes",
  });
  const {
    fields: socialFields,
    append: appendSocial,
    remove: removeSocial,
  } = useFieldArray({
    control,
    name: "socialLinks",
  });

  const attributeTypes = useMemo(
    () => [
      { label: "Text", value: ContactAttributeType.STRING },
      { label: "Date", value: ContactAttributeType.DATE },
      { label: "Number", value: ContactAttributeType.NUMBER },
      { label: "Location", value: ContactAttributeType.LOCATION },
    ],
    [],
  );

  const attributes = watch("profileAttributes");
  const attributeKeyOptions = useMemo(() => {
    const keys = new Set<string>();

    const dataKeys = attributeKeysData?.data;

    if (Array.isArray(dataKeys)) {
      const filteredKeys = dataKeys
        .map((key: unknown) => (typeof key === "string" ? key.trim() : ""))
        .filter(Boolean);
      for (const key of filteredKeys) {
        keys.add(key);
      }
    }

    (contact?.profileAttributes ?? []).forEach((attribute) => {
      const key = attribute?.key?.trim();
      if (key) {
        keys.add(key);
      }
    });

    return Array.from(keys)
      .map((key) => ({
        value: key,
        label: key,
      }))
      .sort((a, b) => a.label.localeCompare(b.label));
  }, [attributeKeysData, contact?.profileAttributes]);

  const handleTypeChange = (index: number, type: ContactAttributeType) => {
    let initialValue: CreateContactFormValues["profileAttributes"][number]["value"];

    switch (type) {
      case ContactAttributeType.LOCATION:
        initialValue = {
          label: "",
          latitude: undefined,
          longitude: undefined,
        } as CreateContactFormValues["profileAttributes"][number]["value"];
        break;
      default:
        initialValue =
          "" as CreateContactFormValues["profileAttributes"][number]["value"];
        break;
    }

    setValue(`profileAttributes.${index}.value`, initialValue, {
      shouldDirty: true,
      shouldTouch: true,
      shouldValidate: true,
    });
  };

  const addAttribute = () => {
    append({
      key: "",
      type: ContactAttributeType.STRING,
      value: "",
    } as CreateContactFormValues["profileAttributes"][number]);
  };

  const addSocialLink = () => {
    appendSocial({
      platform: "",
      handle: "",
    } as CreateContactFormValues["socialLinks"][number]);
  };

  const onSubmit = async (
    values: ContactFormValues,
    shouldExit: boolean = true,
  ) => {
    setIsSubmitting(true);

    try {
      const response = await fetch("/api/contacts", {
        method: isEditMode ? "PATCH" : "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(values),
      });

      if (!response.ok) {
        const errorBody = await response.json().catch(() => ({}));
        throw new Error(
          errorBody.error ||
            `Failed to ${isEditMode ? "update" : "create"} contact`,
        );
      }

      toast({
        title: isEditMode ? "Contact updated" : "Contact created",
        description: isEditMode
          ? `${values.name} has been successfully updated.`
          : `${values.name} has been added to your CRM contacts.`,
      });

      if (shouldExit) {
        if (isEditMode && contact?.id) {
          router.push(`/teams/${teamId}/crm/contacts/${contact.id}`);
        } else {
          router.push(`/teams/${teamId}/crm/contacts`);
        }
      }
      router.refresh();
    } catch (error) {
      toast({
        title: isEditMode
          ? "Unable to update contact"
          : "Unable to create contact",
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

  const renderValueField = (index: number, type: ContactAttributeType) => {
    switch (type) {
      case ContactAttributeType.DATE:
        return (
          <FormField
            control={typedControl}
            name={`profileAttributes.${index}.value`}
            render={({ field }) => (
              <FormItem className="sm:col-span-2">
                <FormLabel>Value</FormLabel>
                <FormControl>
                  <Input
                    type="date"
                    {...field}
                    value={
                      typeof field.value === "string" ||
                      typeof field.value === "number"
                        ? field.value
                        : ""
                    }
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        );
      case ContactAttributeType.NUMBER:
        return (
          <FormField
            control={typedControl}
            name={`profileAttributes.${index}.value`}
            render={({ field }) => (
              <FormItem className="sm:col-span-2">
                <FormLabel>Value</FormLabel>
                <FormControl>
                  <Input
                    type="number"
                    {...field}
                    value={
                      typeof field.value === "number" ||
                      typeof field.value === "string"
                        ? field.value
                        : ""
                    }
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        );
      case ContactAttributeType.LOCATION:
        return (
          <div className="grid gap-3 sm:grid-cols-3 sm:col-span-3">
            <FormField
              control={typedControl}
              name={`profileAttributes.${index}.value.label`}
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Location name</FormLabel>
                  <FormControl>
                    <Input
                      placeholder="Office"
                      {...field}
                      value={
                        typeof field.value === "string" ||
                        typeof field.value === "number"
                          ? field.value
                          : ""
                      }
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={typedControl}
              name={`profileAttributes.${index}.value.latitude`}
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Latitude</FormLabel>
                  <FormControl>
                    <Input
                      type="number"
                      step="any"
                      {...field}
                      value={
                        typeof field.value === "number" ||
                        typeof field.value === "string"
                          ? field.value
                          : ""
                      }
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={typedControl}
              name={`profileAttributes.${index}.value.longitude`}
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Longitude</FormLabel>
                  <FormControl>
                    <Input
                      type="number"
                      step="any"
                      {...field}
                      value={
                        typeof field.value === "number" ||
                        typeof field.value === "string"
                          ? field.value
                          : ""
                      }
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>
        );
      default:
        return (
          <FormField
            control={typedControl}
            name={`profileAttributes.${index}.value`}
            render={({ field }) => (
              <FormItem className="sm:col-span-2">
                <FormLabel>Value</FormLabel>
                <FormControl>
                  <Input
                    placeholder="Enter value"
                    {...field}
                    value={
                      typeof field.value === "string" ||
                      typeof field.value === "number"
                        ? field.value
                        : ""
                    }
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        );
    }
  };

  return (
    <Card className="w-full shadow-sm">
      <CardHeader className="border-b pb-3">
        <CardTitle className="text-xl font-semibold">
          {isEditMode ? "Edit Contact" : "Add Contact"}
        </CardTitle>
        <CardDescription>
          {isEditMode
            ? "Update contact information and CRM attributes."
            : "Create a contact record with flexible CRM attributes."}
        </CardDescription>
      </CardHeader>

      <Form {...form}>
        <form onSubmit={(e) => e.preventDefault()} className="space-y-6">
          <input type="hidden" {...form.register("teamId")} value={teamId} />
          {isEditMode && (
            <input
              type="hidden"
              {...form.register("contactId")}
              value={contact?.id}
            />
          )}
          <CardContent className="space-y-6 pt-6">
            <Tabs
              value={activeTab}
              onValueChange={setActiveTab}
              className="w-full"
            >
              <div className="mb-4 mt-2 sm:hidden">
                <Select value={activeTab} onValueChange={setActiveTab}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select section" />
                  </SelectTrigger>
                  <SelectContent>
                    {tabOptions.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <TabsList className="mb-6 mt-4 hidden h-9 w-full flex-wrap sm:flex">
                {tabOptions.map((option) => (
                  <TabsTrigger key={option.value} value={option.value}>
                    {option.label}
                  </TabsTrigger>
                ))}
              </TabsList>

              <TabsContent value="general" className="space-y-6">
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  <FormField
                    control={typedControl}
                    name="name"
                    render={({ field }) => (
                      <FormItem className="sm:col-span-2 lg:col-span-3">
                        <FormLabel>Full name</FormLabel>
                        <FormControl>
                          <Input
                            placeholder="Full name"
                            {...field}
                            value={field.value ?? ""}
                          />
                        </FormControl>
                        <FormDescription>e.g., Alex Johnson</FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={typedControl}
                    name="email"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Email</FormLabel>
                        <FormControl>
                          <Input
                            type="email"
                            placeholder="Email address"
                            {...field}
                            value={field.value ?? ""}
                          />
                        </FormControl>
                        <FormDescription>
                          e.g., alex@example.com
                        </FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={typedControl}
                    name="phone"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Phone</FormLabel>
                        <FormControl>
                          <Input
                            placeholder="Phone number"
                            {...field}
                            value={field.value ?? ""}
                          />
                        </FormControl>
                        <FormDescription>
                          e.g., +1 (555) 123-4567
                        </FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={typedControl}
                    name="signal"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Signal</FormLabel>
                        <FormControl>
                          <Input
                            placeholder="Signal handle or number"
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
                    name="website"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Website</FormLabel>
                        <FormControl>
                          <Input
                            type="url"
                            placeholder="Website"
                            {...field}
                            value={field.value ?? ""}
                          />
                        </FormControl>
                        <FormDescription>
                          e.g., https://example.com
                        </FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={typedControl}
                    name="pronouns"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Pronouns</FormLabel>
                        <FormControl>
                          <Input
                            placeholder="Pronouns"
                            {...field}
                            value={field.value ?? ""}
                          />
                        </FormControl>
                        <FormDescription>e.g., they/them</FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={typedControl}
                    name="address"
                    render={({ field }) => (
                      <FormItem className="sm:col-span-2 lg:col-span-3">
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
                        <FormDescription>
                          Used together with country to place the contact on the
                          map. Example: 10115
                        </FormDescription>
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
                  <FormField
                    control={typedControl}
                    name="country"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Country</FormLabel>
                        <Select
                          onValueChange={(value) =>
                            field.onChange(value === "none" ? "" : value)
                          }
                          value={field.value || "none"}
                        >
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue placeholder="Select country" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="none">Select country</SelectItem>
                            {!countryOptions.some(
                              (option) => option.value === (field.value ?? ""),
                            ) && field.value ? (
                              <SelectItem value={field.value}>
                                {field.value} (custom)
                              </SelectItem>
                            ) : null}
                            {countryOptions.map((option) => (
                              <SelectItem
                                key={option.code}
                                value={option.value}
                              >
                                {option.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <FormDescription>
                          Combine with postal code to enable map and distance
                          filters.
                        </FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={typedControl}
                    name="groupId"
                    render={({ field }) => (
                      <FormItem className="sm:col-span-2 lg:col-span-3">
                        <FormLabel>Group (optional)</FormLabel>
                        <Select
                          onValueChange={(value) =>
                            field.onChange(value === "none" ? undefined : value)
                          }
                          value={field.value || "none"}
                        >
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue placeholder="No group" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="none">No group</SelectItem>
                            {groups.map((group) => (
                              <SelectItem key={group.id} value={group.id}>
                                {group.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={typedControl}
                    name="organizationIds"
                    render={({ field }) => {
                      const selectedOrganizationIds = field.value ?? [];

                      return (
                        <FormItem className="sm:col-span-2 lg:col-span-3">
                          <FormLabel>Organizations</FormLabel>
                          <FormDescription>
                            Assign this contact to one or more organizations.
                          </FormDescription>
                          {organizations.length === 0 ? (
                            <p className="rounded-md border p-3 text-sm text-muted-foreground">
                              No organizations are available in this team.
                            </p>
                          ) : (
                            <div className="grid gap-3 md:grid-cols-2">
                              {organizations.map((organization) => (
                                <label
                                  key={organization.id}
                                  className="flex min-w-0 items-start gap-3 rounded-md border p-3"
                                >
                                  <Checkbox
                                    checked={selectedOrganizationIds.includes(
                                      organization.id,
                                    )}
                                    onCheckedChange={(checked) => {
                                      if (checked) {
                                        field.onChange(
                                          Array.from(
                                            new Set([
                                              ...selectedOrganizationIds,
                                              organization.id,
                                            ]),
                                          ),
                                        );
                                        return;
                                      }

                                      field.onChange(
                                        selectedOrganizationIds.filter(
                                          (id) => id !== organization.id,
                                        ),
                                      );
                                    }}
                                  />
                                  <span className="min-w-0">
                                    <span className="block break-words text-sm font-medium">
                                      {organization.name || organization.email}
                                    </span>
                                    <span className="block break-all text-xs text-muted-foreground">
                                      {organization.email}
                                    </span>
                                  </span>
                                </label>
                              ))}
                            </div>
                          )}
                          <FormMessage />
                        </FormItem>
                      );
                    }}
                  />
                </div>

                <div className="space-y-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <h3 className="text-base font-semibold">
                        Social profiles
                      </h3>
                      <p className="text-sm text-muted-foreground">
                        Add social media handles or profile URLs.
                      </p>
                    </div>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={addSocialLink}
                    >
                      <PlusCircle className="mr-2 h-4 w-4" /> Add profile
                    </Button>
                  </div>

                  {socialFields.length === 0 ? (
                    <div className="rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground">
                      No social profiles added yet.
                    </div>
                  ) : (
                    <div className="space-y-4">
                      {socialFields.map((field, index) => (
                        <div
                          key={field.id}
                          className="rounded-md border p-4 space-y-4"
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div className="grid flex-1 gap-3 sm:grid-cols-2">
                              <FormField
                                control={typedControl}
                                name={`socialLinks.${index}.platform`}
                                render={({ field }) => {
                                  const currentValue =
                                    typeof field.value === "string"
                                      ? field.value
                                      : "";
                                  return (
                                    <FormItem>
                                      <FormLabel>Platform</FormLabel>
                                      <FormControl>
                                        <Combobox
                                          value={currentValue}
                                          onChange={(value) => {
                                            field.onChange(value);
                                          }}
                                          onBlur={field.onBlur}
                                          placeholder="Select platform"
                                          searchPlaceholder="Search platform..."
                                          emptyStateText="No platforms found."
                                          options={socialPlatformOptions}
                                          allowCustomValue
                                        />
                                      </FormControl>
                                      <FormMessage />
                                    </FormItem>
                                  );
                                }}
                              />
                              <FormField
                                control={typedControl}
                                name={`socialLinks.${index}.handle`}
                                render={({ field }) => (
                                  <FormItem>
                                    <FormLabel>Handle or URL</FormLabel>
                                    <FormControl>
                                      <Input
                                        placeholder="@username or https://..."
                                        {...field}
                                        value={field.value ?? ""}
                                      />
                                    </FormControl>
                                    <FormMessage />
                                  </FormItem>
                                )}
                              />
                            </div>
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              onClick={() => removeSocial(index)}
                              aria-label="Remove social profile"
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </TabsContent>

              {canAccessSubmodule("SUPERVISION") && (
                <TabsContent value="supervision" className="space-y-6">
                  <div>
                    <h3 className="text-base font-semibold">Supervision</h3>
                    <p className="text-sm text-muted-foreground">
                      Sensitive supervision details only visible to authorized
                      groups.
                    </p>
                  </div>
                  <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                    <FormField
                      control={typedControl}
                      name="gender"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Gender</FormLabel>
                          <Select
                            value={field.value ?? "none"}
                            onValueChange={(value) =>
                              field.onChange(value === "none" ? null : value)
                            }
                          >
                            <FormControl>
                              <SelectTrigger>
                                <SelectValue placeholder="Select gender" />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              <SelectItem value="none">Not set</SelectItem>
                              {genderOptions.map((option) => (
                                <SelectItem
                                  key={option.value}
                                  value={option.value}
                                >
                                  {option.label}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={typedControl}
                      name="genderRequestPreference"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Request because of gender</FormLabel>
                          <Select
                            value={field.value ?? "none"}
                            onValueChange={(value) =>
                              field.onChange(
                                value === "none"
                                  ? null
                                  : (value as ContactRequestPreference),
                              )
                            }
                          >
                            <FormControl>
                              <SelectTrigger>
                                <SelectValue placeholder="Select preference" />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              <SelectItem value="none">Not set</SelectItem>
                              {requestPreferenceOptions.map((option) => (
                                <SelectItem
                                  key={option.value}
                                  value={option.value}
                                >
                                  {option.label}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={typedControl}
                      name="isBipoc"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>BIPoC</FormLabel>
                          <Select
                            value={
                              field.value === null || field.value === undefined
                                ? "unspecified"
                                : field.value
                                  ? "yes"
                                  : "no"
                            }
                            onValueChange={(value) => {
                              if (value === "yes") {
                                field.onChange(true);
                              } else if (value === "no") {
                                field.onChange(false);
                              } else {
                                field.onChange(null);
                              }
                            }}
                          >
                            <FormControl>
                              <SelectTrigger>
                                <SelectValue placeholder="Select option" />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              {bipocOptions.map((option) => (
                                <SelectItem
                                  key={option.value}
                                  value={option.value}
                                >
                                  {option.label}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={typedControl}
                      name="racismRequestPreference"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>
                            Request because of racism experience
                          </FormLabel>
                          <Select
                            value={field.value ?? "none"}
                            onValueChange={(value) =>
                              field.onChange(
                                value === "none"
                                  ? null
                                  : (value as ContactRequestPreference),
                              )
                            }
                          >
                            <FormControl>
                              <SelectTrigger>
                                <SelectValue placeholder="Select preference" />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              <SelectItem value="none">Not set</SelectItem>
                              {requestPreferenceOptions.map((option) => (
                                <SelectItem
                                  key={option.value}
                                  value={option.value}
                                >
                                  {option.label}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={typedControl}
                      name="otherMargins"
                      render={({ field }) => (
                        <FormItem className="sm:col-span-2 lg:col-span-3">
                          <FormLabel>Other margins</FormLabel>
                          <FormControl>
                            <Textarea
                              placeholder="Add other intersectional identities or notes"
                              {...field}
                              value={field.value ?? ""}
                              rows={3}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={typedControl}
                      name="onboardingDate"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Onboarding date</FormLabel>
                          <FormControl>
                            <Input
                              type="date"
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
                      name="breakUntil"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Break until</FormLabel>
                          <FormControl>
                            <Input
                              type="date"
                              {...field}
                              value={field.value ?? ""}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                </TabsContent>
              )}

              {canAccessSubmodule("EVENTS") && (
                <TabsContent value="events" className="space-y-4">
                  <div className="rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground">
                    No Events fields configured yet.
                  </div>
                </TabsContent>
              )}

              {canAccessSubmodule("SHOP") && (
                <TabsContent value="shop" className="space-y-4">
                  <div className="rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground">
                    No Shop fields configured yet.
                  </div>
                </TabsContent>
              )}

              <TabsContent value="attributes" className="space-y-4">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <h3 className="text-base font-semibold">
                      Profile attributes
                    </h3>
                    <p className="text-sm text-muted-foreground">
                      Capture structured CRM data such as roles, regions, or
                      lifecycle dates.
                    </p>
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={addAttribute}
                  >
                    <PlusCircle className="mr-2 h-4 w-4" /> Add attribute
                  </Button>
                </div>

                <div className="space-y-4">
                  {fields.length === 0 && (
                    <div className="rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground">
                      No attributes yet. Add one to capture additional context.
                    </div>
                  )}

                  {fields.map((field, index) => {
                    const currentType =
                      attributes?.[index]?.type ?? ContactAttributeType.STRING;
                    return (
                      <div
                        key={field.id}
                        className="rounded-md border p-4 space-y-4"
                      >
                        <div className="grid gap-3 sm:grid-cols-5">
                          <FormField
                            control={typedControl}
                            name={`profileAttributes.${index}.key`}
                            render={({ field }) => {
                              const currentValue =
                                typeof field.value === "string"
                                  ? field.value
                                  : "";

                              return (
                                <FormItem className="sm:col-span-2">
                                  <FormLabel>Label *</FormLabel>
                                  <FormControl>
                                    <Combobox
                                      value={currentValue}
                                      onChange={(value) => {
                                        field.onChange(value);
                                      }}
                                      onBlur={field.onBlur}
                                      placeholder="e.g. Relationship"
                                      searchPlaceholder="Search or type label..."
                                      emptyStateText="No labels found."
                                      options={attributeKeyOptions}
                                      allowCustomValue
                                      isLoading={attributeKeysLoading}
                                    />
                                  </FormControl>
                                  <FormMessage />
                                </FormItem>
                              );
                            }}
                          />

                          <FormField
                            control={typedControl}
                            name={`profileAttributes.${index}.type`}
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel>Type</FormLabel>
                                <Select
                                  value={field.value}
                                  onValueChange={(
                                    value: ContactAttributeType,
                                  ) => {
                                    field.onChange(value);
                                    handleTypeChange(index, value);
                                  }}
                                >
                                  <FormControl>
                                    <SelectTrigger>
                                      <SelectValue placeholder="Select type" />
                                    </SelectTrigger>
                                  </FormControl>
                                  <SelectContent>
                                    {attributeTypes.map((option) => (
                                      <SelectItem
                                        key={option.value}
                                        value={option.value}
                                      >
                                        {option.label}
                                      </SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                                <FormMessage />
                              </FormItem>
                            )}
                          />

                          <div className="flex justify-end sm:col-span-1">
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              className="mt-6 text-red-600 hover:text-red-700 hover:bg-red-50"
                              onClick={() => remove(index)}
                              aria-label="Remove attribute"
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </div>

                        {renderValueField(index, currentType)}
                      </div>
                    );
                  })}
                </div>
              </TabsContent>
            </Tabs>
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
            {isEditMode && (
              <Button
                type="button"
                variant="outline"
                disabled={isSubmitting}
                onClick={form.handleSubmit((values) => onSubmit(values, false))}
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Saving
                  </>
                ) : (
                  "Save"
                )}
              </Button>
            )}
            <Button
              type="button"
              disabled={isSubmitting}
              onClick={form.handleSubmit((values) => onSubmit(values, true))}
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Saving
                </>
              ) : isEditMode ? (
                "Save & Exit"
              ) : (
                "Save contact"
              )}
            </Button>
          </CardFooter>
        </form>
      </Form>
    </Card>
  );
}
