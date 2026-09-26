"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import {
  ArrowLeft,
  CheckCircle2,
  Clock3,
  Crown,
  KeyRound,
  Loader2,
  Mail,
  Pencil,
  ShieldCheck,
  Trash2,
  UserRound,
  UsersRound,
  X,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import useSWR from "swr";
import type { z } from "zod";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
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
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import type { AppModule, Roles } from "@/types";
import { updateTeamUserSchema } from "@/validations/users";
import { Loader } from "./helper/loader";

type UserGroup = {
  id: string;
  name: string;
  description?: string | null;
  isDefaultGroup: boolean;
  canAccessAllContacts: boolean;
  modules: AppModule[];
  joinedAt?: string;
};

type TeamUserDetails = {
  id: string;
  name?: string | null;
  email: string;
  phone?: string | null;
  address?: string | null;
  postalCode?: string | null;
  city?: string | null;
  country?: string | null;
  image?: string | null;
  roles: Roles[];
  emailVerified?: string | null;
  createdAt: string;
  updatedAt: string;
  lastLoginAt?: string | null;
  accounts?: Array<{ provider: string }>;
  isOwner?: boolean;
  team?: { id: string; name: string };
  groups?: UserGroup[];
  availableGroups?: UserGroup[];
};

type UserDetailsProps = {
  userId: string;
  teamId?: string;
  organizationId?: string;
};

const moduleLabels: Record<AppModule, string> = {
  CRM: "CRM",
  FUNDING: "Funding",
  ADMIN: "Admin",
};

const fetcher = async (url: string) => {
  const response = await fetch(url);
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(body.error || "Unable to load this user");
  }
  return body;
};

const formatDate = (value?: string | null, includeTime = false) => {
  if (!value) return "Never";
  return new Intl.DateTimeFormat("en", {
    dateStyle: "medium",
    ...(includeTime ? { timeStyle: "short" as const } : {}),
  }).format(new Date(value));
};

const getInitials = (name?: string | null, email?: string) => {
  const source = name?.trim() || email || "User";
  return source
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");
};

const getLoginMethods = (accounts?: Array<{ provider: string }>) => {
  const methods = new Set<string>();
  for (const account of accounts ?? []) {
    if (account.provider === "nodemailer") methods.add("Email link");
    else if (account.provider.startsWith("oidc-")) methods.add("SSO");
    else if (account.provider) methods.add(account.provider);
  }
  return methods.size ? Array.from(methods).join(" + ") : "Not recorded";
};

function ReadOnlyDetails({ user }: { user: TeamUserDetails }) {
  const details = [
    ["Name", user.name],
    ["Email", user.email],
    ["Phone", user.phone],
    ["Address", user.address],
    ["Postal code", user.postalCode],
    ["City", user.city],
    ["Country", user.country],
  ];

  return (
    <Card>
      <CardHeader>
        <CardTitle>User Profile</CardTitle>
        <CardDescription>Contact information for this user.</CardDescription>
      </CardHeader>
      <CardContent>
        <dl className="grid gap-x-8 gap-y-5 sm:grid-cols-2">
          {details.map(([label, value]) => (
            <div key={label} className="min-w-0">
              <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                {label}
              </dt>
              <dd className="mt-1 break-words text-sm font-medium">
                {value || "Not set"}
              </dd>
            </div>
          ))}
        </dl>
      </CardContent>
    </Card>
  );
}

export default function UserDetails({
  userId,
  teamId,
  organizationId,
}: UserDetailsProps) {
  const router = useRouter();
  const { toast } = useToast();
  const [isEditing, setIsEditing] = useState(false);
  const [isRemoving, setIsRemoving] = useState(false);
  const scope = teamId
    ? `teamId=${encodeURIComponent(teamId)}`
    : `organizationId=${encodeURIComponent(organizationId ?? "")}`;
  const { data, error, isLoading, mutate } = useSWR<{ data: TeamUserDetails }>(
    `/api/users/${userId}?${scope}`,
    fetcher,
  );
  const user = data?.data;
  const form = useForm<z.infer<typeof updateTeamUserSchema>>({
    resolver: zodResolver(updateTeamUserSchema),
    defaultValues: {
      teamId: teamId ?? "",
      name: "",
      email: "",
      phone: "",
      address: "",
      postalCode: "",
      city: "",
      country: "",
      groupIds: [],
    },
  });

  useEffect(() => {
    if (!user || !teamId) return;
    form.reset({
      teamId,
      name: user.name ?? "",
      email: user.email,
      phone: user.phone ?? "",
      address: user.address ?? "",
      postalCode: user.postalCode ?? "",
      city: user.city ?? "",
      country: user.country ?? "",
      groupIds: (user.groups ?? [])
        .filter((group) => !group.isDefaultGroup)
        .map((group) => group.id),
    });
  }, [form, teamId, user]);

  const hasUnsavedChanges = isEditing && form.formState.isDirty;
  useEffect(() => {
    if (!hasUnsavedChanges) return;
    const warnBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
    };
    window.addEventListener("beforeunload", warnBeforeUnload);
    return () => window.removeEventListener("beforeunload", warnBeforeUnload);
  }, [hasUnsavedChanges]);

  const selectedGroupIds = form.watch("groupIds");
  const loginMethods = useMemo(
    () => getLoginMethods(user?.accounts),
    [user?.accounts],
  );

  const cancelEditing = () => {
    if (hasUnsavedChanges && !window.confirm("Discard your unsaved changes?")) {
      return;
    }
    if (user && teamId) {
      form.reset({
        teamId,
        name: user.name ?? "",
        email: user.email,
        phone: user.phone ?? "",
        address: user.address ?? "",
        postalCode: user.postalCode ?? "",
        city: user.city ?? "",
        country: user.country ?? "",
        groupIds: (user.groups ?? [])
          .filter((group) => !group.isDefaultGroup)
          .map((group) => group.id),
      });
    }
    setIsEditing(false);
  };

  const saveUser = async (values: z.infer<typeof updateTeamUserSchema>) => {
    const response = await fetch(`/api/users/${userId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(values),
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
      toast({
        title: "Unable to save user",
        description: body.error || "Review the details and try again.",
        variant: "destructive",
      });
      return;
    }

    await mutate();
    setIsEditing(false);
    toast({
      title: "User updated",
      description: "Profile details and group access are up to date.",
    });
  };

  const removeUser = async () => {
    if (!teamId || !user) return;
    setIsRemoving(true);
    try {
      const response = await fetch(`/api/users/${userId}`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ teamId }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(body.error || "Unable to remove this user");
      }
      toast({
        title: "User removed",
        description: `${user.name || user.email} no longer has access to this team.`,
      });
      router.push(`/teams/${teamId}/users`);
      router.refresh();
    } catch (removeError) {
      toast({
        title: "Unable to remove user",
        description:
          removeError instanceof Error
            ? removeError.message
            : "Try again in a moment.",
        variant: "destructive",
      });
      setIsRemoving(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex min-h-[24rem] items-center justify-center p-6">
        <div className="flex items-center gap-3 text-sm text-muted-foreground">
          <Loader className="size-5" /> Loading user…
        </div>
      </div>
    );
  }

  if (error || !user) {
    return (
      <div className="mx-auto flex min-h-[24rem] max-w-xl items-center p-6">
        <Card className="w-full border-destructive/30">
          <CardHeader>
            <CardTitle>Unable to Open User</CardTitle>
            <CardDescription>
              {error instanceof Error
                ? error.message
                : "This user is not available in the current scope."}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button
              type="button"
              variant="outline"
              onClick={() => router.back()}
            >
              <ArrowLeft className="mr-2 size-4" aria-hidden="true" /> Go Back
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!teamId) {
    return (
      <div className="mx-auto grid w-full max-w-4xl gap-6 p-4 md:p-6">
        <ReadOnlyDetails user={user} />
      </div>
    );
  }

  return (
    <Form {...form}>
      <form
        onSubmit={form.handleSubmit(saveUser)}
        className="mx-auto flex w-full max-w-6xl flex-col gap-6 p-4 md:p-6"
      >
        <div className="flex flex-col gap-5 border-b pb-6">
          <Link
            href={`/teams/${teamId}/users`}
            onClick={(event) => {
              if (
                hasUnsavedChanges &&
                !window.confirm("Discard your unsaved changes?")
              ) {
                event.preventDefault();
              }
            }}
            className="flex w-fit items-center gap-2 rounded-sm text-sm text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <ArrowLeft className="size-4" aria-hidden="true" /> Back to Users
          </Link>
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex min-w-0 items-center gap-4">
              <Avatar className="size-14 border">
                {user.image ? (
                  <AvatarImage src={user.image} alt="" width={56} height={56} />
                ) : null}
                <AvatarFallback className="bg-primary/10 font-semibold text-primary">
                  {getInitials(user.name, user.email)}
                </AvatarFallback>
              </Avatar>
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <h1 className="truncate text-2xl font-semibold tracking-tight text-balance">
                    {user.name || "Unnamed user"}
                  </h1>
                  {user.isOwner ? (
                    <Badge variant="secondary" className="gap-1">
                      <Crown className="size-3" aria-hidden="true" /> Owner
                    </Badge>
                  ) : null}
                </div>
                <p className="mt-1 truncate text-sm text-muted-foreground">
                  {user.email} · {user.team?.name}
                </p>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {isEditing ? (
                <>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={cancelEditing}
                    disabled={form.formState.isSubmitting}
                  >
                    <X className="mr-2 size-4" aria-hidden="true" /> Cancel
                  </Button>
                  <Button type="submit" disabled={form.formState.isSubmitting}>
                    {form.formState.isSubmitting ? (
                      <Loader2
                        className="mr-2 size-4 animate-spin"
                        aria-hidden="true"
                      />
                    ) : (
                      <CheckCircle2
                        className="mr-2 size-4"
                        aria-hidden="true"
                      />
                    )}
                    {form.formState.isSubmitting ? "Saving…" : "Save Changes"}
                  </Button>
                </>
              ) : (
                <Button type="button" onClick={() => setIsEditing(true)}>
                  <Pencil className="mr-2 size-4" aria-hidden="true" /> Edit
                  User
                </Button>
              )}
            </div>
          </div>
        </div>

        <div className="grid gap-6 lg:grid-cols-[minmax(0,1.35fr)_minmax(18rem,0.65fr)]">
          <div className="grid content-start gap-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <UserRound
                    className="size-4 text-primary"
                    aria-hidden="true"
                  />
                  Profile Details
                </CardTitle>
                <CardDescription>
                  Contact information used across the CRM.
                </CardDescription>
              </CardHeader>
              <CardContent className="grid gap-5 sm:grid-cols-2">
                <FormField
                  control={form.control}
                  name="name"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Full Name</FormLabel>
                      <FormControl>
                        <Input
                          {...field}
                          name="name"
                          autoComplete="name"
                          disabled={!isEditing}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="email"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Email Address</FormLabel>
                      <FormControl>
                        <Input
                          {...field}
                          name="email"
                          type="email"
                          autoComplete="email"
                          spellCheck={false}
                          disabled={!isEditing}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="phone"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Phone</FormLabel>
                      <FormControl>
                        <Input
                          {...field}
                          name="phone"
                          type="tel"
                          autoComplete="tel"
                          disabled={!isEditing}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="address"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Street Address</FormLabel>
                      <FormControl>
                        <Input
                          {...field}
                          name="address"
                          autoComplete="street-address"
                          disabled={!isEditing}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="postalCode"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Postal Code</FormLabel>
                      <FormControl>
                        <Input
                          {...field}
                          name="postalCode"
                          autoComplete="postal-code"
                          disabled={!isEditing}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="city"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>City</FormLabel>
                      <FormControl>
                        <Input
                          {...field}
                          name="city"
                          autoComplete="address-level2"
                          disabled={!isEditing}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="country"
                  render={({ field }) => (
                    <FormItem className="sm:col-span-2">
                      <FormLabel>Country</FormLabel>
                      <FormControl>
                        <Input
                          {...field}
                          name="country"
                          autoComplete="country-name"
                          disabled={!isEditing}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <UsersRound
                    className="size-4 text-primary"
                    aria-hidden="true"
                  />
                  Group Access
                </CardTitle>
                <CardDescription>
                  Groups determine module access and which CRM records this user
                  can see.
                </CardDescription>
              </CardHeader>
              <CardContent className="grid gap-3">
                {(user.availableGroups ?? []).map((group) => {
                  const checked = group.isDefaultGroup
                    ? (user.groups ?? []).some(
                        (current) => current.id === group.id,
                      )
                    : selectedGroupIds.includes(group.id);
                  const isOwnerAdmin = user.isOwner && group.name === "Admin";
                  const disabled =
                    !isEditing || group.isDefaultGroup || isOwnerAdmin;

                  return (
                    <label
                      key={group.id}
                      htmlFor={`group-${group.id}`}
                      className="flex cursor-pointer items-start gap-3 rounded-lg border p-4 transition-colors hover:bg-muted/40 has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring has-[:disabled]:cursor-default"
                    >
                      <Checkbox
                        id={`group-${group.id}`}
                        checked={checked}
                        disabled={disabled}
                        onCheckedChange={(nextChecked) => {
                          const current = form.getValues("groupIds");
                          form.setValue(
                            "groupIds",
                            nextChecked
                              ? Array.from(new Set([...current, group.id]))
                              : current.filter((id) => id !== group.id),
                            { shouldDirty: true },
                          );
                        }}
                        aria-label={`${checked ? "Remove from" : "Assign to"} ${group.name}`}
                      />
                      <span className="min-w-0 flex-1">
                        <span className="flex flex-wrap items-center gap-2">
                          <span className="text-sm font-medium">
                            {group.name}
                          </span>
                          {group.isDefaultGroup ? (
                            <Badge variant="secondary">Automatic</Badge>
                          ) : null}
                          {isOwnerAdmin ? (
                            <Badge variant="secondary">
                              Required for owner
                            </Badge>
                          ) : null}
                        </span>
                        <span className="mt-1 block text-sm text-muted-foreground">
                          {group.description || "No description provided."}
                        </span>
                        <span className="mt-2 flex flex-wrap gap-1.5">
                          {group.modules.map((module) => (
                            <Badge
                              key={module}
                              variant="outline"
                              className="text-xs"
                            >
                              {moduleLabels[module]}
                            </Badge>
                          ))}
                          {group.canAccessAllContacts ? (
                            <Badge variant="outline" className="text-xs">
                              All contacts
                            </Badge>
                          ) : null}
                        </span>
                      </span>
                    </label>
                  );
                })}
              </CardContent>
            </Card>
          </div>

          <div className="grid content-start gap-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <ShieldCheck
                    className="size-4 text-primary"
                    aria-hidden="true"
                  />
                  Account & Access
                </CardTitle>
              </CardHeader>
              <CardContent className="grid gap-4 text-sm">
                <div className="flex items-start gap-3">
                  <KeyRound
                    className="mt-0.5 size-4 text-muted-foreground"
                    aria-hidden="true"
                  />
                  <div>
                    <p className="font-medium">Login Method</p>
                    <p className="text-muted-foreground">{loginMethods}</p>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <Mail
                    className="mt-0.5 size-4 text-muted-foreground"
                    aria-hidden="true"
                  />
                  <div>
                    <p className="font-medium">Email Status</p>
                    <p className="text-muted-foreground">
                      {user.emailVerified
                        ? `Verified ${formatDate(user.emailVerified)}`
                        : "Not verified"}
                    </p>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <Clock3
                    className="mt-0.5 size-4 text-muted-foreground"
                    aria-hidden="true"
                  />
                  <div>
                    <p className="font-medium">Last Login</p>
                    <p className="text-muted-foreground">
                      {formatDate(user.lastLoginAt, true)}
                    </p>
                  </div>
                </div>
                <Separator />
                <dl className="grid gap-3">
                  <div className="flex items-center justify-between gap-4">
                    <dt className="text-muted-foreground">Created</dt>
                    <dd className="font-medium tabular-nums">
                      {formatDate(user.createdAt)}
                    </dd>
                  </div>
                  <div className="flex items-center justify-between gap-4">
                    <dt className="text-muted-foreground">Updated</dt>
                    <dd className="font-medium tabular-nums">
                      {formatDate(user.updatedAt)}
                    </dd>
                  </div>
                  <div className="flex items-start justify-between gap-4">
                    <dt className="text-muted-foreground">Roles</dt>
                    <dd className="flex flex-wrap justify-end gap-1">
                      {user.roles.map((role) => (
                        <Badge key={role} variant="secondary">
                          {role}
                        </Badge>
                      ))}
                    </dd>
                  </div>
                </dl>
              </CardContent>
            </Card>

            <Card className="border-destructive/30">
              <CardHeader>
                <CardTitle className="text-base">Team Membership</CardTitle>
                <CardDescription>
                  Removing a user revokes this team’s access without deleting
                  their account.
                </CardDescription>
              </CardHeader>
              <CardContent>
                {user.isOwner ? (
                  <p className="text-sm text-muted-foreground">
                    Transfer team ownership before removing this user.
                  </p>
                ) : (
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button
                        type="button"
                        variant="destructive"
                        className="w-full"
                      >
                        <Trash2 className="mr-2 size-4" aria-hidden="true" />{" "}
                        Remove from Team
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>
                          Remove This User from the Team?
                        </AlertDialogTitle>
                        <AlertDialogDescription>
                          {user.name || user.email} will lose access to{" "}
                          {user.team?.name} and all of its groups. Their account
                          and other memberships remain intact.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel disabled={isRemoving}>
                          Cancel
                        </AlertDialogCancel>
                        <AlertDialogAction
                          onClick={removeUser}
                          disabled={isRemoving}
                          className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                        >
                          {isRemoving ? "Removing…" : "Remove User"}
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      </form>
    </Form>
  );
}
