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
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { createEventTypeSchema } from "@/validations/event-types";

type EventType = {
  id: string;
  name: string;
  color?: string;
};

type FormValues = z.infer<typeof createEventTypeSchema>;

interface EventTypesManagerProps {
  teamId: string;
}

const fetcher = (url: string) => fetch(url).then((res) => res.json());

export default function EventTypesManager({ teamId }: EventTypesManagerProps) {
  const router = useRouter();
  const { toast } = useToast();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [editingType, setEditingType] = useState<EventType | null>(null);

  const { data: typesData, mutate } = useSWR(
    `/api/event-types?teamId=${teamId}`,
    fetcher,
  );

  const types: EventType[] = typesData?.data || [];

  const form = useForm({
    resolver: zodResolver(createEventTypeSchema),
    defaultValues: {
      teamId,
      name: "",
      color: "",
    },
  });

  const typedControl =
    form.control as unknown as import("react-hook-form").Control<FormValues>;

  const handleOpenDialog = (type?: EventType) => {
    if (type) {
      setEditingType(type);
      form.reset({
        teamId,
        name: type.name,
        color: type.color || "",
      });
    } else {
      setEditingType(null);
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
    setEditingType(null);
    form.reset();
  };

  const onSubmit = async (values: FormValues) => {
    setIsSubmitting(true);

    try {
      const url = editingType
        ? `/api/event-types/${editingType.id}`
        : "/api/event-types";
      const method = editingType ? "PUT" : "POST";

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
            `Failed to ${editingType ? "update" : "create"} event type`,
        );
      }

      toast({
        title: editingType ? "Type updated" : "Type created",
        description: `${values.name} has been ${
          editingType ? "updated" : "added"
        }.`,
      });

      mutate();
      handleCloseDialog();
      router.refresh();
    } catch (error) {
      toast({
        title: `Unable to ${editingType ? "update" : "create"} event type`,
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

  const handleDelete = async (typeId: string, typeName: string) => {
    if (!confirm(`Are you sure you want to delete the type "${typeName}"?`)) {
      return;
    }

    try {
      const response = await fetch("/api/event-types", {
        method: "DELETE",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          teamId,
          ids: [typeId],
        }),
      });

      if (!response.ok) {
        const errorBody = await response.json().catch(() => ({}));
        throw new Error(errorBody.error || "Failed to delete event type");
      }

      toast({
        title: "Type deleted",
        description: `${typeName} has been removed.`,
      });

      mutate();
      router.refresh();
    } catch (error) {
      toast({
        title: "Unable to delete event type",
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
              <CardTitle>Event Types</CardTitle>
              <CardDescription>
                Configure the categories used for events (e.g., Workshop, Talk,
                Protest).
              </CardDescription>
            </div>
            <Button onClick={() => handleOpenDialog()}>
              <Plus className="mr-2 h-4 w-4" />
              Add Type
            </Button>
          </div>
        </CardHeader>

        <CardContent className="pt-6">
          {types.length === 0 ? (
            <div className="rounded-md border border-dashed p-8 text-center">
              <p className="text-sm text-muted-foreground">
                No event types configured yet. Create your first type to get
                started.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {types.map((type) => (
                <div
                  key={type.id}
                  className="flex flex-wrap items-center justify-between gap-4 rounded-md border p-4"
                >
                  <div className="flex items-center gap-3">
                    <div>
                      <p className="font-medium">{type.name}</p>
                      {type.color ? (
                        <Badge
                          variant="secondary"
                          className="mt-1"
                          style={{ backgroundColor: type.color }}
                        >
                          {type.color}
                        </Badge>
                      ) : (
                        <p className="text-xs text-muted-foreground">
                          No color set
                        </p>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleOpenDialog(type)}
                    >
                      <Pencil className="mr-2 h-4 w-4" />
                      Edit
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-destructive hover:text-destructive"
                      onClick={() => handleDelete(type.id, type.name)}
                    >
                      <Trash2 className="mr-2 h-4 w-4" />
                      Delete
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="sm:max-w-md sm:h-auto sm:max-h-[calc(100vh-2rem)] sm:grid-rows-[auto,auto] p-0 gap-0 overflow-hidden">
          <DialogHeader className="border-b px-6 py-4">
            <DialogTitle>
              {editingType ? "Edit event type" : "Add event type"}
            </DialogTitle>
            <DialogDescription>
              {editingType
                ? "Update the event type details."
                : "Create a new type to categorize events."}
            </DialogDescription>
          </DialogHeader>

          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
              <FormField
                control={typedControl}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Type name</FormLabel>
                    <FormControl>
                      <Input placeholder="Type name" {...field} />
                    </FormControl>
                    <FormDescription>e.g., Workshop</FormDescription>
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
                      <Input placeholder="Hex color" {...field} />
                    </FormControl>
                    <FormDescription>e.g., #22c55e</FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <DialogFooter>
                <Button
                  type="button"
                  variant="outline"
                  onClick={handleCloseDialog}
                >
                  Cancel
                </Button>
                <Button type="submit" disabled={isSubmitting}>
                  {isSubmitting ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Saving...
                    </>
                  ) : (
                    "Save"
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