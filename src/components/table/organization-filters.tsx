"use client";

import { DebouncedInput } from "@/components/records/list-filters";
import type { FilterDefinition } from "@/components/records/record-list-toolbar";
import type { FilterModel } from "@/components/records/use-record-list";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

/*
  Organization filters: a custom field of the team's organization types,
  compared by an operator that fits the field's type ("Founded before
  2010", "Members greater than 50"). Each chip is one condition; several
  are combined with AND by the server (services/organizations).
*/

export const ORGANIZATION_FIELD_OPERATORS = [
  "contains",
  "equals",
  "gt",
  "lt",
  "before",
  "after",
  "isTrue",
  "isFalse",
] as const;
type Operator = (typeof ORGANIZATION_FIELD_OPERATORS)[number];

export type OrganizationListFilter = {
  key: string;
  kind: "field";
  field: string;
  operator: Operator;
  value?: string;
};

export type OrganizationFieldOption = {
  key: string;
  label: string;
  type: string;
};

const OPERATOR_LABELS: Record<Operator, string> = {
  contains: "contains",
  equals: "equals",
  gt: "greater than",
  lt: "less than",
  before: "before",
  after: "after",
  isTrue: "is true",
  isFalse: "is false",
};

const OPERATORS_BY_TYPE: Record<string, Operator[]> = {
  STRING: ["contains", "equals"],
  SELECT: ["equals", "contains"],
  MULTISELECT: ["contains", "equals"],
  NUMBER: ["equals", "gt", "lt"],
  DATE: ["equals", "before", "after"],
  BOOLEAN: ["isTrue", "isFalse"],
};

const operatorsFor = (type?: string) =>
  OPERATORS_BY_TYPE[type ?? "STRING"] ?? OPERATORS_BY_TYPE.STRING;

const needsValue = (operator: Operator) =>
  operator !== "isTrue" && operator !== "isFalse";

const isOperator = (value: unknown): value is Operator =>
  typeof value === "string" &&
  (ORGANIZATION_FIELD_OPERATORS as readonly string[]).includes(value);

export const organizationFilterModel: FilterModel<OrganizationListFilter> = {
  create: (kind) => ({
    key: kind,
    kind: "field",
    field: "",
    operator: "contains",
  }),
  isActive: (filter) =>
    Boolean(filter.field) &&
    (!needsValue(filter.operator) || Boolean(filter.value?.trim())),
  read: (saved) => {
    if (!saved || typeof saved !== "object") return null;
    const item = saved as Record<string, unknown>;
    if (
      typeof item.key !== "string" ||
      typeof item.field !== "string" ||
      !item.field ||
      !isOperator(item.operator)
    ) {
      return null;
    }
    return {
      key: item.key,
      kind: "field",
      field: item.field,
      operator: item.operator,
      ...(typeof item.value === "string" ? { value: item.value } : {}),
    };
  },
  // Several conditions, on the same or different fields.
  multiple: () => true,
};

/** The conditions as the organizations API reads them (`filters=`). */
export const toOrganizationApiFilters = (filters: OrganizationListFilter[]) =>
  filters.map(({ field, operator, value }) => ({
    type: "field" as const,
    key: field,
    operator,
    ...(needsValue(operator) ? { value: value?.trim() } : {}),
  }));

export const organizationFilterDefinitions = (
  fields: OrganizationFieldOption[],
): FilterDefinition<OrganizationListFilter>[] => [
  {
    key: "field",
    label: "Field",
    disabled: fields.length === 0,
    summary: (filter) => {
      const field = fields.find((option) => option.key === filter.field);
      const label = field?.label ?? (filter.field || "Field");
      if (!needsValue(filter.operator)) {
        return `${label} ${OPERATOR_LABELS[filter.operator]}`;
      }
      return filter.value?.trim()
        ? `${label} ${OPERATOR_LABELS[filter.operator]} “${filter.value.trim()}”`
        : `${label} ${OPERATOR_LABELS[filter.operator]}…`;
    },
    editor: (filter, onChange) => {
      const field = fields.find((option) => option.key === filter.field);
      const operators = operatorsFor(field?.type);
      const inputType =
        field?.type === "NUMBER"
          ? "number"
          : field?.type === "DATE"
            ? "date"
            : "text";
      return (
        <div className="flex w-72 flex-col gap-2 p-1">
          <Select
            value={filter.field || undefined}
            onValueChange={(next) => {
              const nextField = fields.find((option) => option.key === next);
              const nextOperators = operatorsFor(nextField?.type);
              onChange({
                ...filter,
                field: next,
                operator: nextOperators.includes(filter.operator)
                  ? filter.operator
                  : nextOperators[0],
                value: "",
              });
            }}
          >
            <SelectTrigger aria-label="Field" className="h-8">
              <SelectValue placeholder="Choose a field" />
            </SelectTrigger>
            <SelectContent>
              {fields.map((option) => (
                <SelectItem key={option.key} value={option.key}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select
            value={filter.operator}
            onValueChange={(next) =>
              onChange({ ...filter, operator: next as Operator })
            }
            disabled={!filter.field}
          >
            <SelectTrigger aria-label="Condition" className="h-8">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {operators.map((operator) => (
                <SelectItem key={operator} value={operator}>
                  {OPERATOR_LABELS[operator]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {needsValue(filter.operator) ? (
            <DebouncedInput
              aria-label="Value"
              type={inputType}
              value={filter.value ?? ""}
              placeholder="Value"
              onCommit={(value) => onChange({ ...filter, value })}
              className="h-8"
              disabled={!filter.field}
            />
          ) : null}
        </div>
      );
    },
  },
];
