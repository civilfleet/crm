"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2, Pencil, Plus, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { type Resolver, useForm } from "react-hook-form";
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
import { useToast } from "@/hooks/use-toast";
import { createOrganizationTypeSchema } from "@/validations/organization-types";

type OrganizationType = {
  id: string;
  name: string;
  color?: string;
  schema?: unknown;
};

type FormValues = z.infer<typeof createOrganizationTypeSchema>;

interface OrganizationTypesManagerProps {
  teamId: string;
}

const fetcher = (url: string) => fetch(url).then((res) => res.json());

const FIELD_TYPE_OPTIONS = [
  { value: "STRING", label: "Text" },
  { value: "NUMBER", label: "Number" },
  { value: "DATE", label: "Date" },
  { value: "BOOLEAN", label: "Boolean" },
  { value: "SELECT", label: "Select" },
  { value: "MULTISELECT", label: "Multi-select" },
] as const;

type OrganizationTypeField = {
  key: string;
  label: string;
  type: (typeof FIELD_TYPE_OPTIONS)[number]["value"];
  required?: boolean;
  options?: Array<{ label: string; value: string }>;
};

const parseOptions = (value: string) =>
  value
    .split(",")
    .map((option) => option.trim())
    .filter(Boolean)
    .map((option) => ({ label: option, value: option }));

const formatOptions = (options?: Array<{ label: string; value: string }>) =>
  options && options.length > 0
    ? options.map((option) => option.value || option.label).join(", ")
    : "";

export default function OrganizationTypesManager({
  teamId,
}: OrganizationTypesManagerProps) {
  const router = useRouter();
  const { toast } = useToast();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [editingType, setEditingType] = useState<OrganizationType | null>(null);

  const { data: typesData, mutate } = useSWR(
    `/api/organization-types?teamId=${teamId}`,
    fetcher,
  );

  const types: OrganizationType[] = typesData?.data || [];

  const form = useForm<FormValues>({
    resolver: zodResolver(createOrganizationTypeSchema) as Resolver<FormValues>,
    defaultValues: {
      teamId,
      name: "",
      color: "",
      schema: [],
    },
  });

  const typedControl =
    form.control as unknown as import("react-hook-form").Control<FormValues>;

  const handleOpenDialog = (type?: OrganizationType) => {
    if (type) {
      const schemaValue = Array.isArray(type.schema) ? type.schema : [];
      setEditingType(type);
      form.reset({
        teamId,
        name: type.name,
        color: type.color || "",
        schema: schemaValue,
      });
    } else {
      setEditingType(null);
      form.reset({
        teamId,
        name: "",
        color: "",
        schema: [],
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
      const payload = {
        ...values,
        schema: Array.isArray(values.schema) ? values.schema : [],
      };

      const url = editingType
        ? `/api/organization-types/${editingType.id}`
        : "/api/organization-types";
      const method = editingType ? "PUT" : "POST";

      const response = await fetch(url, {
        method,
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const errorBody = await response.json().catch(() => ({}));
        throw new Error(
          errorBody.error ||
            `Failed to ${editingType ? "update" : "create"} organization type`,
        );
      }

      toast({
        title: editingType ? "Type updated" : "Type created",
        description: `${values.name} has been ${editingType ? "updated" : "added"}.`,
      });

      mutate();
      handleCloseDialog();
      router.refresh();
    } catch (error) {
      toast({
        title: `Unable to ${editingType ? "update" : "create"} organization type`,
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
      const response = await fetch("/api/organization-types", {
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
        throw new Error(
          errorBody.error || "Failed to delete organization type",
        );
      }

      toast({
        title: "Type deleted",
        description: `${typeName} has been removed.`,
      });

      mutate();
      router.refresh();
    } catch (error) {
      toast({
        title: "Unable to delete organization type",
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
              <CardTitle>Organization Types</CardTitle>
              <CardDescription>
                Categorize organizations and define custom fields.
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
                No organization types configured yet. Create your first type to
                get started.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {types.map((type) => (
                <div
                  key={type.id}
                  className="flex flex-wrap items-center justify-between gap-4 rounded-md border p-4"
                >
                  <div>
                    <p className="font-medium">{type.name}</p>
                    {type.color ? (
                      <Badge
                        variant="outline"
                        className="mt-1 text-xs"
                        style={{
                          borderColor: type.color,
                          color: type.color,
                        }}
                      >
                        <span
                          className="mr-1 inline-block h-2 w-2 rounded-full"
                          style={{ backgroundColor: type.color }}
                        />
                        {type.color}
                      </Badge>
                    ) : (
                      <p className="text-xs text-muted-foreground">
                        No color set
                      </p>
                    )}
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
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {editingType ? "Edit organization type" : "Add organization type"}
            </DialogTitle>
            <DialogDescription>
              {editingType
                ? "Update the organization type details."
                : "Create a new type to organize your organizations."}
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
                      <Input placeholder="Local group" {...field} />
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
                      <Input placeholder="#0ea5e9" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <OrganizationTypeFieldsEditor form={form} />

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

function OrganizationTypeFieldsEditor({
  form,
}: {
  form: ReturnType<typeof useForm<FormValues>>;
}) {
  const { watch, setValue } = form;
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const fields = (watch("schema") as OrganizationTypeField[] | undefined) || [];

  const updateField = (
    index: number,
    update: Partial<OrganizationTypeField>,
  ) => {
    const next = [...fields];
    next[index] = { ...next[index], ...update };
    setValue("schema", next, { shouldDirty: true });
  };

  const removeField = (index: number) => {
    const next = fields.filter((_, i) => i !== index);
    setValue("schema", next, { shouldDirty: true });
  };

  const addField = () => {
    setValue(
      "schema",
      [
        ...fields,
        {
          key: `field_${fields.length + 1}`,
          label: "New field",
          type: "STRING",
          required: false,
          options: [],
        },
      ],
      { shouldDirty: true },
    );
  };

  const handleReorder = (fromIndex: number, toIndex: number) => {
    if (fromIndex === toIndex) {
      return;
    }
    const next = [...fields];
    const [moved] = next.splice(fromIndex, 1);
    next.splice(toIndex, 0, moved);
    setValue("schema", next, { shouldDirty: true });
  };

  return (
    <div className="space-y-3 rounded-md border p-3">
      <div className="flex items-center justify-between">
        <FormLabel>Fields</FormLabel>
        <Button type="button" variant="outline" size="sm" onClick={addField}>
          <Plus className="mr-2 h-4 w-4" />
          Add field
        </Button>
      </div>
      {fields.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No fields defined yet. Add one to start.
        </p>
      ) : (
        <ul className="space-y-3">
          {fields.map((field, index) => (
            <li
              key={field.key}
              className={`rounded-md border p-3 space-y-3 ${dragIndex === index ? "bg-muted" : ""}`}
              draggable
              onDragStart={() => setDragIndex(index)}
              onDragOver={(event) => {
                event.preventDefault();
              }}
              onDrop={() => {
                if (dragIndex !== null) {
                  handleReorder(dragIndex, index);
                }
                setDragIndex(null);
              }}
              onDragEnd={() => setDragIndex(null)}
            >
              <div className="grid gap-3 md:grid-cols-2">
                <FormItem>
                  <FormLabel>Key</FormLabel>
                  <FormControl>
                    <Input
                      value={field.key}
                      onChange={(event) =>
                        updateField(index, { key: event.target.value })
                      }
                    />
                  </FormControl>
                </FormItem>
                <FormItem>
                  <FormLabel>Label</FormLabel>
                  <FormControl>
                    <Input
                      value={field.label}
                      onChange={(event) =>
                        updateField(index, { label: event.target.value })
                      }
                    />
                  </FormControl>
                </FormItem>
                <FormItem>
                  <FormLabel>Type</FormLabel>
                  <Select
                    value={field.type}
                    onValueChange={(value) =>
                      updateField(index, {
                        type: value as OrganizationTypeField["type"],
                      })
                    }
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Type" />
                    </SelectTrigger>
                    <SelectContent>
                      {FIELD_TYPE_OPTIONS.map((option) => (
                        <SelectItem key={option.value} value={option.value}>
                          {option.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </FormItem>
                <FormItem>
                  <FormLabel>Required</FormLabel>
                  <div className="flex items-center gap-2 rounded-md border p-2">
                    <Checkbox
                      checked={Boolean(field.required)}
                      onCheckedChange={(checked) =>
                        updateField(index, { required: Boolean(checked) })
                      }
                    />
                    <span className="text-sm">Mark as required</span>
                  </div>
                </FormItem>
              </div>
              {(field.type === "SELECT" || field.type === "MULTISELECT") && (
                <FormItem>
                  <FormLabel>Options</FormLabel>
                  <FormControl>
                    <Input
                      placeholder="Comma-separated options"
                      value={formatOptions(field.options)}
                      onChange={(event) =>
                        updateField(index, {
                          options: parseOptions(event.target.value),
                        })
                      }
                    />
                  </FormControl>
                </FormItem>
              )}
              <div className="flex justify-end">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="text-destructive hover:text-destructive"
                  onClick={() => removeField(index)}
                >
                  <Trash2 className="mr-2 h-4 w-4" />
                  Remove field
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
