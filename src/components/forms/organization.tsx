"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import useSWR from "swr";
import type { z } from "zod";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { useToast } from "@/hooks/use-toast";
import type { AppModule } from "@/types";
import {
  createOrganizationSchema,
  updateOrganizationSchema,
} from "@/validations/organizations";
import FileUpload from "../file-uploader";
import Alert from "../helper/alert";
import ButtonControl from "../helper/button-control";
import FormInputControl from "../helper/form-input-control";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "../ui/card";
import { Checkbox } from "../ui/checkbox";
import { Input } from "../ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../ui/select";

type OrganizationType = {
  id: string;
  name: string;
  color?: string;
  schema?: Array<{
    key: string;
    label: string;
    type: "STRING" | "NUMBER" | "DATE" | "BOOLEAN" | "SELECT" | "MULTISELECT";
    required?: boolean;
    options?: Array<{ label: string; value: string }>;
  }>;
};

type ContactOption = {
  id: string;
  name?: string | null;
  email?: string | null;
};

type Organization = {
  id: string;
  name?: string;
  email: string;
  address?: string;
  city?: string;
  country?: string;
  phone?: string;
  website?: string;
  postalCode?: string;
  taxExemptionCertificate?: string;
  articlesOfAssociation?: string;
  taxID?: string;
  isFilledByOrg: boolean;
  portalAccessEnabled?: boolean;
  orgTypeId?: string;
  profileData?: Record<string, unknown>;
  contactPersonId?: string;
  contactPerson?: { id: string; name?: string; email?: string };
  logo?: string;
  Files?: {
    type: string;
    url: string;
    id: string;
  }[];
  bankDetails?: {
    accountHolder?: string;
    iban?: string;
    bic?: string;
    bankName?: string;
  };
  user?: {
    name?: string;
    email: string;
    phone?: string;
    address?: string;
    postalCode?: string;
    city?: string;
    country?: string;
  };
  teamId?: string;
};

export default function OrganizationForm({ data }: { data: Organization }) {
  const pathname = usePathname();
  const router = useRouter();
  const { toast } = useToast();
  const [isUpdate] = useState(!!data?.email);
  const schema = isUpdate ? updateOrganizationSchema : createOrganizationSchema;
  const teamId = data?.teamId;
  const isFundingRoute = pathname.includes("/funding/organizations");

  const fetcher = (url: string) => fetch(url).then((res) => res.json());
  const { data: orgTypesData } = useSWR(
    teamId ? `/api/organization-types?teamId=${teamId}` : null,
    fetcher,
  );
  const { data: contactsData } = useSWR(
    teamId ? `/api/contacts?teamId=${teamId}&query=` : null,
    fetcher,
  );
  const { data: modulesData } = useSWR(
    teamId ? `/api/teams/${teamId}/modules` : null,
    fetcher,
  );

  const orgTypes: OrganizationType[] = orgTypesData?.data || [];
  const contacts: ContactOption[] = contactsData?.data || [];
  const teamModules: AppModule[] = modulesData?.data || [];
  const hasFundingModule = teamId ? teamModules.includes("FUNDING") : true;

  const orgTypeMap = useMemo(() => {
    return new Map(orgTypes.map((type) => [type.id, type]));
  }, [orgTypes]);

  // Helper function to check if a field is filled
  const isFieldFilled = (value: string | undefined): boolean => {
    return Boolean(value?.trim());
  };

  const form = useForm<z.infer<typeof schema>>({
    resolver: zodResolver(schema),
    defaultValues: {
      email: data?.email || "",
      name: data?.name || "",
      phone: data?.phone || "",
      address: data?.address || "",
      city: data?.city || "",
      country: data?.country || "",
      postalCode: data?.postalCode || "",
      website: data?.website || "",
      orgTypeId: data?.orgTypeId || "",
      profileData: (data?.profileData as Record<string, unknown>) || {},
      contactPersonId: data?.contactPersonId || "",
      taxExemptionCertificate:
        data?.Files?.find((file) => file.type === "TAX_EXEMPTION_CERTIFICATE")
          ?.url || "",
      articlesOfAssociation:
        data?.Files?.find((file) => file.type === "ARTICLES_OF_ASSOCIATION")
          ?.url || "",
      taxID: data?.taxID || "",
      portalAccessEnabled: data?.portalAccessEnabled ?? isFundingRoute,
      logo: data?.Files?.find((file) => file.type === "LOGO")?.url || "",
      bankDetails: {
        bankName: data?.bankDetails?.bankName || "",
        accountHolder: data?.bankDetails?.accountHolder || "",
        iban: data?.bankDetails?.iban || "",
        bic: data?.bankDetails?.bic || "",
      },
      user: {
        name: data?.user?.name || "",
        email: data?.user?.email || "",
        phone: data?.user?.phone || "",
      },
    },
  });

  const selectedOrgTypeId = form.watch("orgTypeId");
  const selectedType = useMemo(() => {
    if (!selectedOrgTypeId) {
      return null;
    }
    return orgTypeMap.get(selectedOrgTypeId as string) || null;
  }, [orgTypeMap, selectedOrgTypeId]);

  useEffect(() => {
    const schema = selectedType?.schema || [];
    if (!schema.length) {
      return;
    }

    const current = form.getValues("profileData") || {};
    const next = { ...current };
    let changed = false;
    schema.forEach((field) => {
      if (!(field.key in next)) {
        next[field.key] = field.type === "MULTISELECT" ? [] : "";
        changed = true;
      }
    });
    if (changed) {
      form.setValue("profileData", next, { shouldDirty: true });
    }
  }, [form, selectedType]);

  async function onSubmit(values: z.infer<typeof schema>) {
    try {
      const requestInit: RequestInit = !data?.email
        ? {
            method: "POST",
            body: JSON.stringify({
              ...values,
              teamId: data?.teamId,
              isFilledByOrg: false,
            }),
          }
        : {
            method: "PUT",
            body: JSON.stringify({ ...values, isFilledByOrg: true }),
          };
      const response = await fetch("/api/organizations", requestInit);
      // check for error
      if (!response.ok) {
        const errorData = await response.json();
        toast({
          title: "Error",
          description: errorData.error || response.statusText,
          variant: "destructive",
        });
        return;
      }
      const responseData = await response.json();
      toast({
        title: "Success",
        description: isUpdate
          ? "Organization information updated"
          : "Organization information created",
        variant: "default",
      });
      const organizationId = responseData?.data?.id;
      if (!isUpdate && organizationId) {
        router.push(
          `${pathname.replace(/\/create\/?$/, "")}/${organizationId}`,
        );
      }
    } catch (e) {
      toast({
        title: "Error",
        description: (e as Error).message,
        variant: "destructive",
      });
    }
  }

  return (
    <Card className="w-full">
      <CardHeader>
        <CardTitle>Update Organization Information</CardTitle>
        <CardDescription>
          Please update your organization information below
        </CardDescription>
      </CardHeader>
      <CardContent>
        <fieldset disabled={form.formState.isSubmitting}>
          <Form {...form}>
            <form
              onSubmit={form.handleSubmit(onSubmit)}
              className="space-y-8"
              id="organization-form"
            >
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <FormInputControl
                  form={form}
                  name="name"
                  placeholder="Organization name"
                  isFilled={isFieldFilled(data?.name)}
                />
                <FormField
                  control={form.control}
                  name="orgTypeId"
                  render={({ field }) => (
                    <FormItem>
                      <Select
                        onValueChange={(value) =>
                          field.onChange(value === "none" ? "" : value)
                        }
                        value={field.value || "none"}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Organization type" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">No type</SelectItem>
                          {orgTypes.map((type) => (
                            <SelectItem key={type.id} value={type.id}>
                              {type.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormInputControl
                  form={form}
                  disabled={!!data?.email}
                  name="email"
                  placeholder="Email address"
                  isFilled={isFieldFilled(data?.email)}
                />
                <FormField
                  control={form.control}
                  name="contactPersonId"
                  render={({ field }) => (
                    <FormItem>
                      <Select
                        onValueChange={(value) =>
                          field.onChange(value === "none" ? "" : value)
                        }
                        value={field.value || "none"}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Contact person" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">
                            No contact person
                          </SelectItem>
                          {contacts.map((contact) => (
                            <SelectItem key={contact.id} value={contact.id}>
                              {contact.name || contact.email || "Unnamed"}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormInputControl
                  form={form}
                  name="phone"
                  placeholder="Phone number"
                  isFilled={isFieldFilled(data?.phone)}
                />
                <FormInputControl
                  form={form}
                  name="address"
                  placeholder="Street address"
                  isFilled={isFieldFilled(data?.address)}
                />

                <FormInputControl
                  form={form}
                  name="city"
                  placeholder="City"
                  isFilled={isFieldFilled(data?.city)}
                />
                <FormInputControl
                  form={form}
                  name="country"
                  placeholder="Country"
                  isFilled={isFieldFilled(data?.country)}
                />
                <FormInputControl
                  form={form}
                  name="postalCode"
                  placeholder="Postal code"
                  isFilled={isFieldFilled(data?.postalCode)}
                />
                <FormInputControl
                  form={form}
                  name="website"
                  placeholder="Website"
                  isFilled={isFieldFilled(data?.website)}
                />
              </div>
              {selectedType?.schema && selectedType.schema.length > 0 && (
                <div className="space-y-4">
                  <h4 className="text-lg font-semibold">
                    Organization Details
                  </h4>
                  <CardDescription>
                    Custom fields for this organization type.
                  </CardDescription>
                  <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                    {selectedType.schema.map((field) => (
                      <FormField
                        key={field.key}
                        control={form.control}
                        name={`profileData.${field.key}` as const}
                        rules={
                          field.required
                            ? { required: `${field.label} is required` }
                            : undefined
                        }
                        render={({ field: formField }) => {
                          if (field.type === "BOOLEAN") {
                            return (
                              <div className="flex items-start gap-3 rounded-md border p-4">
                                <Checkbox
                                  checked={Boolean(formField.value)}
                                  onCheckedChange={(checked) =>
                                    formField.onChange(Boolean(checked))
                                  }
                                />
                                <div className="space-y-1">
                                  <div className="text-sm font-medium">
                                    {field.label}
                                    {field.required && (
                                      <span className="ml-1 text-destructive">
                                        *
                                      </span>
                                    )}
                                  </div>
                                </div>
                              </div>
                            );
                          }

                          if (field.type === "SELECT") {
                            return (
                              <div className="space-y-2">
                                <div className="text-sm font-medium">
                                  {field.label}
                                  {field.required && (
                                    <span className="ml-1 text-destructive">
                                      *
                                    </span>
                                  )}
                                </div>
                                <Select
                                  onValueChange={formField.onChange}
                                  value={(formField.value as string) || ""}
                                >
                                  <SelectTrigger>
                                    <SelectValue placeholder="Select" />
                                  </SelectTrigger>
                                  <SelectContent>
                                    {(field.options || []).map((option) => (
                                      <SelectItem
                                        key={option.value}
                                        value={option.value}
                                      >
                                        {option.label}
                                      </SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                              </div>
                            );
                          }

                          if (field.type === "MULTISELECT") {
                            return (
                              <div className="space-y-2">
                                <div className="text-sm font-medium">
                                  {field.label}
                                  {field.required && (
                                    <span className="ml-1 text-destructive">
                                      *
                                    </span>
                                  )}
                                </div>
                                <Input
                                  placeholder="Comma-separated values"
                                  value={
                                    Array.isArray(formField.value)
                                      ? formField.value.join(", ")
                                      : (formField.value as string) || ""
                                  }
                                  onChange={(event) =>
                                    formField.onChange(
                                      event.target.value
                                        .split(",")
                                        .map((value) => value.trim())
                                        .filter(Boolean),
                                    )
                                  }
                                />
                              </div>
                            );
                          }

                          return (
                            <FormItem>
                              <FormLabel>
                                {field.label}
                                {field.required && (
                                  <span className="ml-1 text-destructive">
                                    *
                                  </span>
                                )}
                              </FormLabel>
                              <FormControl>
                                <Input
                                  type={
                                    field.type === "NUMBER"
                                      ? "number"
                                      : field.type === "DATE"
                                        ? "date"
                                        : "text"
                                  }
                                  placeholder={field.label}
                                  {...formField}
                                  value={
                                    typeof formField.value === "string" ||
                                    typeof formField.value === "number"
                                      ? formField.value
                                      : ""
                                  }
                                />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          );
                        }}
                      />
                    ))}
                  </div>
                </div>
              )}
              {hasFundingModule ? (
                <>
                  <div>
                    <h4 className="text-lg font-semibold">Tax Details</h4>
                    <CardDescription>
                      Please attached your tax exemption certificate
                    </CardDescription>
                    <hr />
                  </div>

                  <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                    <FormInputControl
                      form={form}
                      name="taxID"
                      placeholder="Tax ID"
                      isFilled={isFieldFilled(data?.taxID)}
                    />

                    <FileUpload
                      placeholder="Tax exemption certificate"
                      name="taxExemptionCertificate"
                      data={
                        data?.Files?.find(
                          (file) => file.type === "TAX_EXEMPTION_CERTIFICATE",
                        )?.id as string
                      }
                      onFileUpload={(url) =>
                        form.setValue("taxExemptionCertificate", url)
                      }
                      error={
                        form?.formState?.errors?.taxExemptionCertificate
                          ? (form.formState.errors?.taxExemptionCertificate
                              ?.message as string)
                          : ""
                      }
                    />
                  </div>

                  <div>
                    <h4 className="text-lg font-semibold">Bank Details</h4>
                    <hr />
                  </div>

                  <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                    <FormInputControl
                      form={form}
                      name="bankDetails.bankName"
                      placeholder="Bank name"
                      isFilled={isFieldFilled(data?.bankDetails?.bankName)}
                    />
                    <FormInputControl
                      form={form}
                      name="bankDetails.accountHolder"
                      placeholder="Account holder"
                      isFilled={isFieldFilled(data?.bankDetails?.accountHolder)}
                    />
                    <FormInputControl
                      form={form}
                      name="bankDetails.iban"
                      placeholder="IBAN"
                      isFilled={isFieldFilled(data?.bankDetails?.iban)}
                    />
                    <FormInputControl
                      form={form}
                      name="bankDetails.bic"
                      placeholder="SWIFT"
                      isFilled={isFieldFilled(data?.bankDetails?.bic)}
                    />
                  </div>
                  <div>
                    <h4 className="text-lg font-semibold">
                      Organization portal
                    </h4>
                    <CardDescription>
                      Controls whether this organization appears as a selectable
                      organization portal context.
                    </CardDescription>
                    <hr />
                  </div>
                  <FormField
                    control={form.control}
                    name="portalAccessEnabled"
                    render={({ field }) => (
                      <FormItem className="flex items-start gap-3 rounded-md border p-4">
                        <FormControl>
                          <Checkbox
                            checked={Boolean(field.value)}
                            onCheckedChange={(checked) =>
                              field.onChange(Boolean(checked))
                            }
                          />
                        </FormControl>
                        <div className="space-y-1">
                          <FormLabel>
                            Enable organization portal access
                          </FormLabel>
                          <CardDescription>
                            Show this organization in the team selector even if
                            no login user is assigned yet.
                          </CardDescription>
                          <FormMessage />
                        </div>
                      </FormItem>
                    )}
                  />
                  <div>
                    <h4 className="text-lg font-semibold">Portal login user</h4>
                    <CardDescription>
                      Optional. Use this when someone from the organization
                      should be able to sign in.
                    </CardDescription>
                    <hr />
                  </div>
                  <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                    <FormInputControl
                      form={form}
                      name="user.name"
                      placeholder="Login user name"
                      isFilled={isFieldFilled(data?.user?.name)}
                    />
                    <FormInputControl
                      form={form}
                      disabled={!!data?.email}
                      name="user.email"
                      placeholder="Login user email"
                      isFilled={isFieldFilled(data?.user?.email)}
                    />
                    <FormInputControl
                      form={form}
                      name="user.phone"
                      placeholder="Login user phone"
                      isFilled={isFieldFilled(data?.user?.phone)}
                    />
                  </div>

                  <div>
                    <h4 className="text-lg font-semibold">
                      Article of Association & Logo
                    </h4>
                    <CardDescription>
                      Please attached articles of association and logo
                    </CardDescription>
                    <hr />
                  </div>

                  <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                    <div>
                      <FileUpload
                        placeholder="Article of Association"
                        name="articlesOfAssociation"
                        data={
                          data?.Files?.find(
                            (file) => file.type === "ARTICLES_OF_ASSOCIATION",
                          )?.id
                        }
                        error={
                          form?.formState?.errors?.articlesOfAssociation
                            ? (form.formState.errors?.articlesOfAssociation
                                ?.message as string)
                            : ""
                        }
                        onFileUpload={(url) =>
                          form.setValue("articlesOfAssociation", url)
                        }
                      />
                    </div>
                    <div>
                      <FileUpload
                        placeholder="Logo of your Organization"
                        name="logo"
                        data={
                          data?.Files?.find((file) => file.type === "LOGO")?.id
                        }
                        error={
                          form?.formState?.errors?.logo
                            ? (form.formState.errors?.logo?.message as string)
                            : ""
                        }
                        onFileUpload={(url) => form.setValue("logo", url)}
                      />
                    </div>
                  </div>
                </>
              ) : null}

              {isUpdate ? (
                <Alert
                  title={"Are you absolutely sure?"}
                  description={
                    "You are about to update your organization information, you would not be able to update it again."
                  }
                  form={form}
                  formId="organization-form"
                />
              ) : (
                <ButtonControl
                  className="w-full sm:w-24"
                  type="submit"
                  disabled={form.formState.isSubmitting}
                />
              )}
            </form>
          </Form>
        </fieldset>
      </CardContent>
    </Card>
  );
}