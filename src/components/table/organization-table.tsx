"use client";
import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2, Plus, Trash2 } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { useForm } from "react-hook-form";
import useSWR from "swr";
import { z } from "zod";
import { DataTable } from "@/components/data-table";
import TableLoadingState from "@/components/loading/table-loading-state";
import {
  columns,
  type OrganizationColumns,
} from "@/components/table/organization-columns";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Form } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import ButtonControl from "../helper/button-control";
import FormInputControl from "../helper/form-input-control";

const querySchema = z.object({
  query: z.string(),
});
const fetcher = (url: string) => fetch(url).then((res) => res.json());

interface IOrganizationProps {
  teamId?: string;
  basePath?: string;
}

type FieldFilter = {
  key: string;
  operator:
    | "contains"
    | "equals"
    | "gt"
    | "lt"
    | "before"
    | "after"
    | "isTrue"
    | "isFalse";
  value?: string;
};

export default function OrganizationTable({
  teamId,
  basePath,
}: IOrganizationProps) {
  const { toast } = useToast();
  const pathname = usePathname();
  const isAdmin = pathname.startsWith("/admin");
  const [fieldFilters, setFieldFilters] = useState<FieldFilter[]>([]);
  const [isDeleting, setIsDeleting] = useState(false);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const resolvedBasePath = (basePath ?? pathname).replace(/\/$/, "");

  const form = useForm<z.infer<typeof querySchema>>({
    resolver: zodResolver(querySchema),
    defaultValues: { query: "" },
  });

  const query = form.watch("query"); // Get current query value

  const { data: orgTypesData } = useSWR(
    teamId ? `/api/organization-types?teamId=${teamId}` : null,
    fetcher,
  );
  const orgTypes = orgTypesData?.data || [];

  const fieldOptions = useMemo(() => {
    const map = new Map<string, { key: string; label: string; type: string }>();
    orgTypes.forEach(
      (type: {
        schema?: Array<{ key: string; label: string; type: string }>;
      }) => {
        (type.schema || []).forEach((field) => {
          if (!map.has(field.key)) {
            map.set(field.key, field);
          }
        });
      },
    );
    return Array.from(map.values());
  }, [orgTypes]);

  const operatorOptions = useMemo(() => {
    return {
      STRING: [
        { value: "contains", label: "contains" },
        { value: "equals", label: "equals" },
      ],
      SELECT: [
        { value: "equals", label: "equals" },
        { value: "contains", label: "contains" },
      ],
      MULTISELECT: [
        { value: "contains", label: "contains" },
        { value: "equals", label: "equals" },
      ],
      NUMBER: [
        { value: "equals", label: "equals" },
        { value: "gt", label: "greater than" },
        { value: "lt", label: "less than" },
      ],
      DATE: [
        { value: "equals", label: "equals" },
        { value: "before", label: "before" },
        { value: "after", label: "after" },
      ],
      BOOLEAN: [
        { value: "isTrue", label: "is true" },
        { value: "isFalse", label: "is false" },
      ],
    } as Record<
      string,
      Array<{ value: FieldFilter["operator"]; label: string }>
    >;
  }, []);

  const filtersQuery = useMemo(() => {
    if (!fieldFilters.length) {
      return "";
    }
    return `&filters=${encodeURIComponent(JSON.stringify(fieldFilters.map((filter) => ({ type: "field", ...filter }))))}`;
  }, [fieldFilters]);
  const previousQueryStateRef = useRef({ query, filtersQuery });

  useEffect(() => {
    if (
      previousQueryStateRef.current.query === query &&
      previousQueryStateRef.current.filtersQuery === filtersQuery
    ) {
      return;
    }
    previousQueryStateRef.current = { query, filtersQuery };
    setPage(1);
  });

  const { data, error, isLoading, isValidating, mutate } = useSWR(
    `/api/organizations?${isAdmin ? "" : `teamId=${teamId}&`}query=${query}${filtersQuery}&page=${page}&pageSize=${pageSize}`,
    fetcher,
  );
  const loading = isLoading || !data;
  const totalOrganizations = Number(data?.total ?? data?.data?.length ?? 0);

  if (error) {
    toast({
      title: "Error",
      description: "Error fetching organizations",
      variant: "destructive",
    });
  }

  async function onSubmit(values: z.infer<typeof querySchema>) {
    form.setValue("query", values.query); // Triggers SWR to re-fetch
    setPage(1);
  }

  const handleAddFilter = () => {
    setFieldFilters((prev) => [
      ...prev,
      {
        key: fieldOptions[0].key,
        operator: "contains",
        value: "",
      },
    ]);
    setPage(1);
  };

  const handleDeleteSelected = async (
    selectedRows: OrganizationColumns[],
    clearSelection: () => void,
  ) => {
    if (!selectedRows.length) {
      return;
    }

    setIsDeleting(true);
    try {
      const results = await Promise.allSettled(
        selectedRows.map((organization) =>
          fetch(`/api/organizations/${organization.id}`, {
            method: "DELETE",
          }),
        ),
      );

      const failed = results.filter((result) => {
        if (result.status !== "fulfilled") {
          return true;
        }
        return !result.value.ok;
      }).length;

      await mutate();
      clearSelection();

      if (failed > 0) {
        toast({
          title: "Organizations partially deleted",
          description: `${selectedRows.length - failed} deleted, ${failed} failed.`,
          variant: "destructive",
        });
        return;
      }

      toast({
        title: "Organizations deleted",
        description: `${selectedRows.length} organization${selectedRows.length === 1 ? "" : "s"} deleted.`,
      });
    } catch (_deleteError) {
      toast({
        title: "Unable to delete organizations",
        description:
          "An unexpected error occurred while deleting organizations.",
        variant: "destructive",
      });
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <div className="my-2 flex flex-col gap-4">
      <Form {...form}>
        <form
          onSubmit={form.handleSubmit(onSubmit)}
          className="flex w-full max-w-xl flex-col gap-2 sm:flex-row sm:items-center"
        >
          <div className="flex-1">
            <FormInputControl
              form={form}
              name="query"
              placeholder="Search..."
            />
          </div>

          <ButtonControl
            type="submit"
            label="Submit"
            className="w-full sm:mx-2 sm:w-auto"
          />
        </form>
      </Form>

      {fieldOptions.length > 0 && (
        <div className="rounded-md border p-3 space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium">Field filters</p>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleAddFilter}
            >
              <Plus className="mr-2 h-4 w-4" />
              Add filter
            </Button>
          </div>
          {fieldFilters.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No field filters applied.
            </p>
          ) : (
            <div className="space-y-2">
              {fieldFilters.map((filter, index) => {
                const selectedField = fieldOptions.find(
                  (option) => option.key === filter.key,
                );
                const fieldType = selectedField?.type || "STRING";
                const operatorsForField =
                  operatorOptions[fieldType] || operatorOptions.STRING;
                const operatorValues = operatorsForField.map((op) => op.value);
                if (!operatorValues.includes(filter.operator)) {
                  setFieldFilters((prev) =>
                    prev.map((item, i) =>
                      i === index
                        ? { ...item, operator: operatorsForField[0].value }
                        : item,
                    ),
                  );
                }
                return (
                  <div
                    key={`${filter.key}-${filter.operator}-${filter.value}`}
                    className="flex flex-wrap items-center gap-2"
                  >
                    <Select
                      onValueChange={(value) =>
                        setFieldFilters((prev) =>
                          prev.map((item, i) =>
                            i === index ? { ...item, key: value } : item,
                          ),
                        )
                      }
                      value={filter.key}
                    >
                      <SelectTrigger className="min-w-[200px]">
                        <SelectValue placeholder="Field" />
                      </SelectTrigger>
                      <SelectContent>
                        {fieldOptions.map((option) => (
                          <SelectItem key={option.key} value={option.key}>
                            {option.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Select
                      onValueChange={(value) =>
                        setFieldFilters((prev) =>
                          prev.map((item, i) =>
                            i === index
                              ? {
                                  ...item,
                                  operator: value as FieldFilter["operator"],
                                }
                              : item,
                          ),
                        )
                      }
                      value={filter.operator}
                    >
                      <SelectTrigger className="min-w-[160px]">
                        <SelectValue placeholder="Operator" />
                      </SelectTrigger>
                      <SelectContent>
                        {operatorsForField.map((op) => (
                          <SelectItem key={op.value} value={op.value}>
                            {op.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {filter.operator !== "isTrue" &&
                      filter.operator !== "isFalse" && (
                        <Input
                          className="min-w-[200px]"
                          placeholder="Value"
                          type={
                            fieldType === "NUMBER"
                              ? "number"
                              : fieldType === "DATE"
                                ? "date"
                                : "text"
                          }
                          value={filter.value ?? ""}
                          onChange={(event) =>
                            setFieldFilters((prev) =>
                              prev.map((item, i) =>
                                i === index
                                  ? { ...item, value: event.target.value }
                                  : item,
                              ),
                            )
                          }
                        />
                      )}
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      onClick={() =>
                        setFieldFilters((prev) =>
                          prev.filter((_, i) => i !== index),
                        )
                      }
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                    {selectedField?.type && (
                      <span className="text-xs text-muted-foreground">
                        {selectedField.type}
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      <div className="relative my-2 flex h-full grow items-center justify-center rounded-md border p-2 sm:p-4">
        {isValidating && !loading ? (
          <p className="absolute right-4 top-4 text-xs text-muted-foreground">
            Refreshing...
          </p>
        ) : null}
        {loading ? (
          <TableLoadingState />
        ) : (
          <div className="w-full overflow-x-auto">
            <DataTable
              columns={columns(mutate, resolvedBasePath)}
              data={data?.data}
              initialView="table"
              serverPagination={{
                page,
                pageSize,
                total: totalOrganizations,
                onPageChange: setPage,
                onPageSizeChange: (nextPageSize) => {
                  setPageSize(nextPageSize);
                  setPage(1);
                },
              }}
              selectable
              renderBatchActions={({ selectedRows, clearSelection }) => (
                <div className="flex flex-wrap items-center gap-3">
                  <span className="text-sm text-muted-foreground">
                    {selectedRows.length} selected
                  </span>
                  <div className="flex items-center gap-2">
                    <Button
                      type="button"
                      variant="destructive"
                      size="sm"
                      disabled={isDeleting}
                      onClick={() =>
                        handleDeleteSelected(
                          selectedRows as OrganizationColumns[],
                          clearSelection,
                        )
                      }
                    >
                      {isDeleting ? (
                        <>
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          Deleting...
                        </>
                      ) : (
                        "Delete selected"
                      )}
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      disabled={isDeleting || selectedRows.length === 0}
                      onClick={clearSelection}
                    >
                      Clear
                    </Button>
                  </div>
                </div>
              )}
              renderCard={(org: OrganizationColumns) => (
                <Card className="h-full">
                  <CardHeader>
                    <div className="flex items-start justify-between gap-3">
                      <CardTitle className="text-base leading-tight">
                        {org.name || "Untitled Organization"}
                      </CardTitle>
                      <Badge
                        variant={org.isFilledByOrg ? "default" : "secondary"}
                      >
                        {org.isFilledByOrg
                          ? "Self-Registered"
                          : "Admin-Registered"}
                      </Badge>
                    </div>
                  </CardHeader>
                  <CardContent className="grid grid-cols-1 gap-2 text-sm">
                    <div>
                      <div className="text-xs text-muted-foreground">Email</div>
                      <div className="break-all font-medium">
                        {org.email || "N/A"}
                      </div>
                    </div>
                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                      <div>
                        <div className="text-xs text-muted-foreground">
                          Team
                        </div>
                        <div className="font-medium">
                          {org.team?.name || "N/A"}
                        </div>
                      </div>
                      <div>
                        <div className="text-xs text-muted-foreground">
                          Country
                        </div>
                        <div className="font-medium">
                          {org.country || "N/A"}
                        </div>
                      </div>
                    </div>
                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                      <div>
                        <div className="text-xs text-muted-foreground">
                          Phone
                        </div>
                        <div className="font-medium">{org.phone || "N/A"}</div>
                      </div>
                      <div>
                        <div className="text-xs text-muted-foreground">
                          Website
                        </div>
                        <div className="font-medium">
                          {org.website ? (
                            <Link
                              href={
                                org.website.startsWith("http")
                                  ? org.website
                                  : `https://${org.website}`
                              }
                              target="_blank"
                              className="text-blue-600 hover:underline"
                            >
                              {org.website}
                            </Link>
                          ) : (
                            "N/A"
                          )}
                        </div>
                      </div>
                    </div>
                  </CardContent>
                  <CardFooter className="justify-end gap-2">
                    <Link href={`${resolvedBasePath}/${org.id}`}>
                      <Button size="sm" variant="outline">
                        View
                      </Button>
                    </Link>
                  </CardFooter>
                </Card>
              )}
            />
          </div>
        )}
      </div>
    </div>
  );
}
