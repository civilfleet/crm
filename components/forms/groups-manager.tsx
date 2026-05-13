"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import {
  AlertCircle,
  Loader2,
  Pencil,
  Plus,
  Trash2,
  Users,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import useSWR from "swr";
import type { z } from "zod";
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
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
import {
  CONTACT_SUBMODULE_FIELDS,
  CONTACT_SUBMODULE_LABELS,
  CONTACT_SUBMODULES,
  type ContactSubmodule,
} from "@/constants/contact-submodules";
import { useToast } from "@/hooks/use-toast";
import { APP_MODULES, type AppModule, DEFAULT_TEAM_MODULES } from "@/types";
import { createGroupSchema } from "@/validations/groups";

type Group = {
  id: string;
  name: string;
  description?: string;
  canAccessAllContacts: boolean;
  modules: AppModule[];
  contactSubmodules?: ContactSubmodule[];
  isDefaultGroup: boolean;
  users?: Array<{
    userId: string;
    user: {
      id: string;
      name: string | null;
      email: string;
    };
  }>;
};

type User = {
  id: string;
  name: string | null;
  email: string;
};

type FormValues = z.infer<typeof createGroupSchema>;

interface GroupsManagerProps {
  teamId: string;
  teamModules?: AppModule[];
}

const fetcher = (url: string) => fetch(url).then((res) => res.json());

const MODULE_LABELS: Record<AppModule, string> = {
  CRM: "CRM",
  FUNDING: "Funding",
  ADMIN: "Admin",
};

const MODULE_DESCRIPTIONS: Record<AppModule, string> = {
  CRM: "Access contacts, events, and other CRM tools.",
  FUNDING: "Access funding requests, agreements, and financial workflows.",
  ADMIN: "Manage settings, users, groups, and integrations.",
};

export default function GroupsManager({
  teamId,
  teamModules,
}: GroupsManagerProps) {
  const router = useRouter();
  const { toast } = useToast();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [editingGroup, setEditingGroup] = useState<Group | null>(null);
  const [memberSearch, setMemberSearch] = useState("");

  const resolvedTeamModules = useMemo(
    () =>
      teamModules && teamModules.length > 0
        ? teamModules
        : [...DEFAULT_TEAM_MODULES],
    [teamModules],
  );

  const availableModules = useMemo(
    () =>
      APP_MODULES.filter(
        (module) => module === "ADMIN" || resolvedTeamModules.includes(module),
      ),
    [resolvedTeamModules],
  );

  const { data: groupsData, mutate } = useSWR(
    `/api/groups?teamId=${teamId}`,
    fetcher,
  );

  const { data: usersData } = useSWR(`/api/teams/${teamId}/users`, fetcher);

  const groups: Group[] = useMemo(() => {
    const rawGroups: Group[] = (groupsData?.data || []).map((group: Group) => ({
      ...group,
      modules:
        group.modules?.length && group.modules.length > 0
          ? group.modules.filter((module) => availableModules.includes(module))
          : [...resolvedTeamModules],
    }));

    return rawGroups.sort((a, b) => {
      if (a.isDefaultGroup === b.isDefaultGroup) {
        return 0;
      }
      return a.isDefaultGroup ? -1 : 1;
    });
  }, [groupsData, availableModules, resolvedTeamModules]);
  const users: User[] = usersData?.data || [];
  const filteredUsers = useMemo(() => {
    const query = memberSearch.trim().toLowerCase();
    if (!query) {
      return users;
    }

    return users.filter((user) =>
      `${user.name || ""} ${user.email}`.toLowerCase().includes(query),
    );
  }, [memberSearch, users]);

  const form = useForm({
    resolver: zodResolver(createGroupSchema),
    defaultValues: {
      teamId,
      name: "",
      description: "",
      canAccessAllContacts: false,
      userIds: [] as string[],
      modules: [...resolvedTeamModules],
      contactSubmodules: [] as ContactSubmodule[],
    },
  });

  const typedControl =
    form.control as unknown as import("react-hook-form").Control<FormValues>;
  const isEditingDefaultGroup = editingGroup?.isDefaultGroup ?? false;

  const handleOpenDialog = (group?: Group) => {
    setMemberSearch("");
    if (group) {
      setEditingGroup(group);
      form.reset({
        teamId,
        name: group.name,
        description: group.description || "",
        canAccessAllContacts: group.canAccessAllContacts,
        userIds: group.users?.map((u) => u.userId) || [],
        modules:
          group.modules && group.modules.length > 0
            ? group.modules.filter((module) =>
                availableModules.includes(module),
              )
            : [...resolvedTeamModules],
        contactSubmodules: group.contactSubmodules ?? [],
      });
    } else {
      setEditingGroup(null);
      form.reset({
        teamId,
        name: "",
        description: "",
        canAccessAllContacts: false,
        userIds: [],
        modules: [...resolvedTeamModules],
        contactSubmodules: [],
      });
    }
    setIsDialogOpen(true);
  };

  const handleCloseDialog = () => {
    setIsDialogOpen(false);
    setMemberSearch("");
    setEditingGroup(null);
    form.reset();
  };

  const onSubmit = async (values: FormValues) => {
    setIsSubmitting(true);

    try {
      if (editingGroup) {
        // Update group basic info
        const updateResponse = await fetch(`/api/groups/${editingGroup.id}`, {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            teamId: values.teamId,
            name: values.name,
            description: values.description,
            canAccessAllContacts: values.canAccessAllContacts,
            modules: values.modules,
            contactSubmodules: values.contactSubmodules,
          }),
        });

        if (!updateResponse.ok) {
          const errorBody = await updateResponse.json().catch(() => ({}));
          throw new Error(errorBody.error || "Failed to update group");
        }

        // Update group users
        const existingUserIds = editingGroup.users?.map((u) => u.userId) || [];
        const newUserIds = values.userIds || [];

        const usersToAdd = newUserIds.filter(
          (id) => !existingUserIds.includes(id),
        );
        const usersToRemove = existingUserIds.filter(
          (id) => !newUserIds.includes(id),
        );

        // Add new users
        if (usersToAdd.length > 0) {
          const addResponse = await fetch(
            `/api/groups/${editingGroup.id}/users`,
            {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
              },
              body: JSON.stringify({
                teamId: values.teamId,
                userIds: usersToAdd,
              }),
            },
          );

          if (!addResponse.ok) {
            const errorBody = await addResponse.json().catch(() => ({}));
            throw new Error(errorBody.error || "Failed to add users to group");
          }
        }

        // Remove users
        if (usersToRemove.length > 0) {
          const removeResponse = await fetch(
            `/api/groups/${editingGroup.id}/users`,
            {
              method: "DELETE",
              headers: {
                "Content-Type": "application/json",
              },
              body: JSON.stringify({
                teamId: values.teamId,
                userIds: usersToRemove,
              }),
            },
          );

          if (!removeResponse.ok) {
            const errorBody = await removeResponse.json().catch(() => ({}));
            throw new Error(
              errorBody.error || "Failed to remove users from group",
            );
          }
        }
      } else {
        // Create new group
        const response = await fetch("/api/groups", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(values),
        });

        if (!response.ok) {
          const errorBody = await response.json().catch(() => ({}));
          throw new Error(errorBody.error || "Failed to create group");
        }
      }

      toast({
        title: editingGroup ? "Group updated" : "Group created",
        description: `${values.name} has been ${
          editingGroup ? "updated" : "created"
        }.`,
      });

      mutate();
      handleCloseDialog();
      router.refresh();
    } catch (error) {
      toast({
        title: `Unable to ${editingGroup ? "update" : "create"} group`,
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

  const handleDelete = async (groupId: string, groupName: string) => {
    if (!confirm(`Are you sure you want to delete the group "${groupName}"?`)) {
      return;
    }

    try {
      const response = await fetch("/api/groups", {
        method: "DELETE",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          teamId,
          ids: [groupId],
        }),
      });

      if (!response.ok) {
        const errorBody = await response.json().catch(() => ({}));
        throw new Error(errorBody.error || "Failed to delete group");
      }

      toast({
        title: "Group deleted",
        description: `${groupName} has been removed.`,
      });

      mutate();
      router.refresh();
    } catch (error) {
      toast({
        title: "Unable to delete group",
        description:
          error instanceof Error
            ? error.message
            : "An unexpected error occurred.",
        variant: "destructive",
      });
    }
  };

  return (
    <>
      <Card>
        <CardHeader className="border-b">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Groups</CardTitle>
              <CardDescription>
                Manage groups to control which users can access specific
                contacts
              </CardDescription>
            </div>
            <Button onClick={() => handleOpenDialog()}>
              <Plus className="mr-2 h-4 w-4" />
              Add Group
            </Button>
          </div>
        </CardHeader>

        <CardContent className="pt-6">
          {groups.length === 0 ? (
            <div className="rounded-md border border-dashed p-8 text-center">
              <p className="text-sm text-muted-foreground">
                No groups configured yet. Create your first group to get
                started.
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              {groups.map((group) => (
                <div
                  key={group.id}
                  className="flex items-center justify-between rounded-md border p-3"
                >
                  <div className="flex-1">
                    <div className="flex items-center gap-3">
                      <h3 className="font-medium">{group.name}</h3>
                      {group.users && group.users.length > 0 && (
                        <Badge
                          variant="secondary"
                          className="flex items-center gap-1"
                        >
                          <Users className="h-3 w-3" />
                          {group.users.length}{" "}
                          {group.users.length === 1 ? "user" : "users"}
                        </Badge>
                      )}
                    </div>
                    {group.description && (
                      <p className="text-sm text-muted-foreground mt-1">
                        {group.description}
                      </p>
                    )}
                    <div className="mt-2 flex flex-wrap gap-2">
                      {group.modules.map((module) => (
                        <Badge key={module} variant="outline">
                          {MODULE_LABELS[module] ?? module}
                        </Badge>
                      ))}
                      {(group.contactSubmodules ?? []).map((submodule) => (
                        <Badge key={submodule} variant="secondary">
                          {CONTACT_SUBMODULE_LABELS[submodule] ?? submodule}
                        </Badge>
                      ))}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="ghost"
                      size="sm"
                      aria-label={`Edit group ${group.name}`}
                      title={`Edit group ${group.name}`}
                      onClick={() => handleOpenDialog(group)}
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      aria-label={`Delete group ${group.name}`}
                      title={`Delete group ${group.name}`}
                      disabled={group.isDefaultGroup}
                      onClick={() => handleDelete(group.id, group.name)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="max-w-2xl flex flex-col overflow-hidden">
          <DialogHeader>
            <DialogTitle>
              {editingGroup ? "Edit Group" : "Create Group"}
            </DialogTitle>
            <DialogDescription>
              {editingGroup
                ? "Update the group name, description, and members."
                : "Create a new group and assign users to it. New groups start with the same module permissions as Default Access (CRM + Funding)."}
            </DialogDescription>
          </DialogHeader>

          <Form {...form}>
            <form
              onSubmit={form.handleSubmit(onSubmit)}
              className="flex h-full min-h-0 flex-col gap-4"
            >
              <div className="flex-1 space-y-4 overflow-y-auto pr-1">
                <FormField
                  control={typedControl}
                  name="name"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Group Name *</FormLabel>
                      <FormControl>
                        <Input
                          placeholder="e.g., Finance Team, West Region"
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
                  name="description"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Description (optional)</FormLabel>
                      <FormControl>
                        <Textarea
                          placeholder="Describe the purpose of this group"
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
                  name="modules"
                  render={({ field }) => {
                    const value = field.value ?? [];

                    const toggleModule = (
                      module: AppModule,
                      checked: boolean,
                    ) => {
                      if (checked) {
                        const next = Array.from(new Set([...value, module]));
                        field.onChange(next);
                        form.clearErrors("modules");
                      } else {
                        const next = value.filter(
                          (current) => current !== module,
                        );
                        if (next.length === 0) {
                          form.setError("modules", {
                            type: "manual",
                            message: "Select at least one module",
                          });
                          return;
                        }
                        field.onChange(next);
                      }
                    };

                    return (
                      <FormItem>
                        <FormLabel>Enabled Modules</FormLabel>
                        <FormDescription>
                          Choose which application modules members of this group
                          can access.
                        </FormDescription>
                        <div className="grid gap-3 sm:grid-cols-2">
                          {availableModules.map((module) => (
                            <div
                              key={module}
                              className="flex items-start space-x-3 rounded-md border p-3"
                            >
                              <FormControl>
                                <Checkbox
                                  checked={value.includes(module)}
                                  onCheckedChange={(checked) =>
                                    toggleModule(module, checked === true)
                                  }
                                />
                              </FormControl>
                              <div className="space-y-1 leading-none">
                                <FormLabel className="text-sm font-medium">
                                  {MODULE_LABELS[module]}
                                </FormLabel>
                                <p className="text-xs text-muted-foreground">
                                  {MODULE_DESCRIPTIONS[module]}
                                </p>
                              </div>
                            </div>
                          ))}
                        </div>
                        <FormMessage />
                      </FormItem>
                    );
                  }}
                />

                <FormField
                  control={typedControl}
                  name="contactSubmodules"
                  render={({ field }) => {
                    const value = field.value ?? [];

                    const toggleSubmodule = (
                      submodule: ContactSubmodule,
                      checked: boolean,
                    ) => {
                      if (checked) {
                        field.onChange(
                          Array.from(new Set([...value, submodule])),
                        );
                      } else {
                        field.onChange(
                          value.filter((current) => current !== submodule),
                        );
                      }
                    };

                    return (
                      <FormItem>
                        <FormLabel>CRM Submodules</FormLabel>
                        <FormDescription>
                          Assign which CRM submodules this group can access.
                          Supervision fields are only visible to assigned
                          groups.
                        </FormDescription>
                        <div className="grid gap-3 sm:grid-cols-2">
                          {CONTACT_SUBMODULES.map((submodule) => {
                            const isAvailable =
                              CONTACT_SUBMODULE_FIELDS[submodule].length > 0;
                            return (
                              <div
                                key={submodule}
                                className="flex items-start space-x-3 rounded-md border p-3"
                              >
                                <FormControl>
                                  <Checkbox
                                    checked={value.includes(submodule)}
                                    onCheckedChange={(checked) =>
                                      toggleSubmodule(
                                        submodule,
                                        checked === true,
                                      )
                                    }
                                    disabled={!isAvailable}
                                  />
                                </FormControl>
                                <div className="space-y-1 leading-none">
                                  <FormLabel className="text-sm font-medium">
                                    {CONTACT_SUBMODULE_LABELS[submodule]}
                                  </FormLabel>
                                  <p className="text-xs text-muted-foreground">
                                    {isAvailable
                                      ? "Configure field visibility for this submodule."
                                      : "No fields configured yet."}
                                  </p>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                        <FormMessage />
                      </FormItem>
                    );
                  }}
                />

                <FormField
                  control={typedControl}
                  name="canAccessAllContacts"
                  render={({ field }) => (
                    <FormItem className="flex flex-row items-start space-x-3 space-y-0 rounded-md border p-4">
                      <FormControl>
                        <Checkbox
                          checked={field.value}
                          onCheckedChange={field.onChange}
                        />
                      </FormControl>
                      <div className="space-y-1 leading-none">
                        <FormLabel>Can access all contacts</FormLabel>
                        <FormDescription>
                          Users in this group will be able to see all contacts,
                          regardless of their group assignment
                        </FormDescription>
                      </div>
                    </FormItem>
                  )}
                />

                <FormField
                  control={typedControl}
                  name="userIds"
                  render={() => {
                    if (isEditingDefaultGroup) {
                      return (
                        <FormItem>
                          <FormLabel>Group Members</FormLabel>
                          <FormDescription>
                            Membership in the default group is managed
                            automatically. Users without another group
                            assignment belong here by default.
                          </FormDescription>
                          <p className="text-sm text-muted-foreground">
                            Add someone to another group to remove them from the
                            default group.
                          </p>
                        </FormItem>
                      );
                    }

                    const selectedUserIds = form.watch("userIds") || [];
                    const allVisibleSelected =
                      filteredUsers.length > 0 &&
                      filteredUsers.every((user) =>
                        selectedUserIds.includes(user.id),
                      );

                    return (
                      <FormItem>
                        <FormLabel>Group Members</FormLabel>
                        <FormDescription>
                          Select users who should be part of this group
                        </FormDescription>
                        {!editingGroup && (
                          <Alert className="mt-2">
                            <AlertCircle className="h-4 w-4" />
                            <AlertTitle>
                              Users will lose default access
                            </AlertTitle>
                            <AlertDescription>
                              When you add users to this group, they will be
                              removed from the Default Access group. Make sure
                              this group has all necessary module permissions.
                            </AlertDescription>
                          </Alert>
                        )}
                        <div className="border rounded-md">
                          <div className="px-3 py-2 border-b">
                            <Input
                              value={memberSearch}
                              onChange={(event) =>
                                setMemberSearch(event.target.value)
                              }
                              placeholder="Search users by name or email"
                              aria-label="Search group members"
                            />
                          </div>
                          <div className="flex items-center gap-3 px-3 py-2 border-b">
                            <Checkbox
                              checked={allVisibleSelected}
                              onCheckedChange={(checked) => {
                                if (checked) {
                                  const mergedUserIds = Array.from(
                                    new Set([
                                      ...selectedUserIds,
                                      ...filteredUsers.map((u) => u.id),
                                    ]),
                                  );
                                  form.setValue("userIds", mergedUserIds);
                                } else {
                                  form.setValue(
                                    "userIds",
                                    selectedUserIds.filter(
                                      (id) =>
                                        !filteredUsers.some((u) => u.id === id),
                                    ),
                                  );
                                }
                              }}
                            />
                            <FormLabel className="text-sm font-medium">
                              Select all visible users
                            </FormLabel>
                            {memberSearch.trim() ? (
                              <span className="text-muted-foreground text-sm ml-2">
                                {filteredUsers.length} match
                                {filteredUsers.length === 1 ? "" : "es"}
                              </span>
                            ) : null}
                          </div>
                          <div className="divide-y max-h-64 overflow-y-auto">
                            {filteredUsers.length === 0 ? (
                              <p className="text-sm text-muted-foreground px-3 py-2">
                                {users.length === 0
                                  ? "No users available"
                                  : "No users match your search"}
                              </p>
                            ) : (
                              filteredUsers.map((user) => (
                                <FormField
                                  key={user.id}
                                  control={typedControl}
                                  name="userIds"
                                  render={({ field }) => (
                                    <FormItem
                                      key={user.id}
                                      className="flex flex-row items-start space-x-3 space-y-0 px-3 py-2"
                                    >
                                      <FormControl>
                                        <Checkbox
                                          checked={field.value?.includes(
                                            user.id,
                                          )}
                                          onCheckedChange={(checked) => {
                                            if (checked) {
                                              field.onChange([
                                                ...(field.value || []),
                                                user.id,
                                              ]);
                                              return;
                                            }

                                            field.onChange(
                                              (field.value || []).filter(
                                                (value) => value !== user.id,
                                              ),
                                            );
                                          }}
                                        />
                                      </FormControl>
                                      <FormLabel className="font-normal">
                                        {user.name || user.email}
                                        {user.name && (
                                          <span className="text-muted-foreground text-sm ml-2">
                                            ({user.email})
                                          </span>
                                        )}
                                      </FormLabel>
                                    </FormItem>
                                  )}
                                />
                              ))
                            )}
                          </div>
                        </div>
                        <FormMessage />
                      </FormItem>
                    );
                  }}
                />
              </div>

              <DialogFooter className="sticky bottom-0 border-t border-border bg-background pt-4">
                <Button
                  type="button"
                  variant="outline"
                  onClick={handleCloseDialog}
                  disabled={isSubmitting}
                >
                  Cancel
                </Button>
                <Button type="submit" disabled={isSubmitting}>
                  {isSubmitting ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      {editingGroup ? "Updating" : "Creating"}
                    </>
                  ) : editingGroup ? (
                    "Update Group"
                  ) : (
                    "Create Group"
                  )}
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>
    </>
  );
}