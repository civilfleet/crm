"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2, Pencil, Plus, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useForm } from "react-hook-form";
import useSWR from "swr";
import type { z } from "zod";
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
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { createEventRoleSchema } from "@/validations/event-roles";

type EventRole = {
  id: string;
  name: string;
  color?: string;
};

type FormValues = z.infer<typeof createEventRoleSchema>;

interface EventRolesManagerProps {
  teamId: string;
}

const fetcher = (url: string) => fetch(url).then((res) => res.json());

export default function EventRolesManager({ teamId }: EventRolesManagerProps) {
  const router = useRouter();
  const { toast } = useToast();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [editingRole, setEditingRole] = useState<EventRole | null>(null);

  const { data: rolesData, mutate } = useSWR(
    `/api/event-roles?teamId=${teamId}`,
    fetcher,
  );

  const roles: EventRole[] = rolesData?.data || [];

  const form = useForm({
    resolver: zodResolver(createEventRoleSchema),
    defaultValues: {
      teamId,
      name: "",
      color: "",
    },
  });

  const typedControl =
    form.control as unknown as import("react-hook-form").Control<FormValues>;

  const handleOpenDialog = (role?: EventRole) => {
    if (role) {
      setEditingRole(role);
      form.reset({
        teamId,
        name: role.name,
        color: role.color || "",
      });
    } else {
      setEditingRole(null);
      form.reset({
        teamId,
        name: "",
        color: "",
      });
    }
    setIsDialogOpen(true);
  };

  const handleCloseDialog = () => {
    setIsDialogOpen(false);
    setEditingRole(null);
    form.reset();
  };

  const onSubmit = async (values: FormValues) => {
    setIsSubmitting(true);

    try {
      const url = editingRole
        ? `/api/event-roles/${editingRole.id}`
        : "/api/event-roles";
      const method = editingRole ? "PUT" : "POST";

      const response = await fetch(url, {
        method,
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(values),
      });

      if (!response.ok) {
        const errorBody = await response.json().catch(() => ({}));
        throw new Error(
          errorBody.error ||
            `Failed to ${editingRole ? "update" : "create"} event role`,
        );
      }

      toast({
        title: editingRole ? "Role updated" : "Role created",
        description: `${values.name} has been ${
          editingRole ? "updated" : "added"
        }.`,
      });

      mutate();
      handleCloseDialog();
      router.refresh();
    } catch (error) {
      toast({
        title: `Unable to ${editingRole ? "update" : "create"} event role`,
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

  const handleDelete = async (roleId: string, roleName: string) => {
    if (!confirm(`Are you sure you want to delete the role "${roleName}"?`)) {
      return;
    }

    try {
      const response = await fetch("/api/event-roles", {
        method: "DELETE",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          teamId,
          ids: [roleId],
        }),
      });

      if (!response.ok) {
        const errorBody = await response.json().catch(() => ({}));
        throw new Error(errorBody.error || "Failed to delete event role");
      }

      toast({
        title: "Role deleted",
        description: `${roleName} has been removed.`,
      });

      mutate();
      router.refresh();
    } catch (error) {
      toast({
        title: "Unable to delete event role",
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
              <CardTitle>Event Roles</CardTitle>
              <CardDescription>
                Configure roles that can be assigned to contacts at events
                (e.g., Partner, Musician, Volunteer)
              </CardDescription>
            </div>
            <Button onClick={() => handleOpenDialog()}>
              <Plus className="mr-2 h-4 w-4" />
              Add Role
            </Button>
          </div>
        </CardHeader>

        <CardContent className="pt-6">
          {roles.length === 0 ? (
            <div className="rounded-md border border-dashed p-8 text-center">
              <p className="text-sm text-muted-foreground">
                No event roles configured yet. Create your first role to get
                started.
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              {roles.map((role) => (
                <div
                  key={role.id}
                  className="flex items-center justify-between rounded-md border p-3"
                >
                  <div className="flex items-center gap-3">
                    <Badge
                      variant="outline"
                      style={
                        role.color
                          ? { borderColor: role.color, color: role.color }
                          : {}
                      }
                    >
                      {role.name}
                    </Badge>
                    {role.color && (
                      <div className="flex items-center gap-2">
                        <div
                          className="h-4 w-4 rounded border"
                          style={{ backgroundColor: role.color }}
                        />
                        <span className="text-xs text-muted-foreground">
                          {role.color}
                        </span>
                      </div>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="ghost"
                      size="sm"
                      aria-label={`Edit role ${role.name}`}
                      title={`Edit role ${role.name}`}
                      onClick={() => handleOpenDialog(role)}
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      aria-label={`Delete role ${role.name}`}
                      title={`Delete role ${role.name}`}
                      onClick={() => handleDelete(role.id, role.name)}
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
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {editingRole ? "Edit Event Role" : "Create Event Role"}
            </DialogTitle>
            <DialogDescription>
              {editingRole
                ? "Update the role name and color."
                : "Add a new role that can be assigned to contacts at events."}
            </DialogDescription>
          </DialogHeader>

          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
              <FormField
                control={typedControl}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Role Name *</FormLabel>
                    <FormControl>
                      <Input
                        placeholder="e.g., Partner, Musician, Volunteer"
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
                name="color"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Color (optional)</FormLabel>
                    <FormControl>
                      <div className="flex gap-2">
                        <Input
                          type="color"
                          className="w-20 h-10"
                          {...field}
                          value={field.value ?? ""}
                        />
                        <Input
                          type="text"
                          placeholder="#000000"
                          {...field}
                          value={field.value ?? ""}
                        />
                      </div>
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <DialogFooter>
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
                      {editingRole ? "Updating" : "Creating"}
                    </>
                  ) : editingRole ? (
                    "Update Role"
                  ) : (
                    "Create Role"
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