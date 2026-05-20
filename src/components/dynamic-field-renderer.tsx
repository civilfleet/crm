"use client";

import { format } from "date-fns";
import { ExternalLink, File, Mail } from "lucide-react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { FieldType, type FormField, type FormFieldOption } from "@/types";

interface DynamicFieldRendererProps {
  field: FormField;
  value: unknown;
}

const DynamicFieldRenderer = ({ field, value }: DynamicFieldRendererProps) => {
  if (value === null || value === undefined || value === "") {
    return <span className="text-muted-foreground">Not provided</span>;
  }

  const renderValue = () => {
    switch (field.type) {
      case FieldType.TEXT:
      case FieldType.TEXTAREA:
        return <span className="whitespace-pre-wrap">{String(value)}</span>;

      case FieldType.NUMBER: {
        const numValue = Number(value);
        return (
          <span className="font-medium">
            {new Intl.NumberFormat("en-US", {
              minimumFractionDigits: 0,
              maximumFractionDigits: 2,
            }).format(numValue)}
          </span>
        );
      }

      case FieldType.DATE:
        try {
          const date = new Date(String(value));
          return (
            <Badge variant="outline" className="font-normal">
              {format(date, "MMMM d, yyyy")}
            </Badge>
          );
        } catch (_error) {
          return <span>{String(value)}</span>;
        }

      case FieldType.EMAIL:
        return (
          <Link
            href={`mailto:${value}`}
            className="flex items-center gap-1 text-foreground underline underline-offset-2 hover:text-foreground"
          >
            <Mail className="h-3 w-3" />
            {String(value)}
          </Link>
        );

      case FieldType.URL:
        return (
          <Link
            href={String(value)}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1 text-foreground underline underline-offset-2 hover:text-foreground"
          >
            <ExternalLink className="h-3 w-3" />
            {String(value)}
          </Link>
        );

      case FieldType.SELECT:
      case FieldType.RADIO: {
        const selectedOption = field.options?.find(
          (option: FormFieldOption) => option.value === value,
        );
        return (
          <Badge variant="secondary">
            {selectedOption?.label || String(value)}
          </Badge>
        );
      }

      case FieldType.MULTISELECT:
        if (Array.isArray(value)) {
          return (
            <div className="flex flex-wrap gap-1">
              {value.map((val) => {
                const option = field.options?.find(
                  (opt: FormFieldOption) => opt.value === val,
                );
                return (
                  <Badge
                    key={`${field.id}-${String(val)}`}
                    variant="secondary"
                    className="text-xs"
                  >
                    {option?.label || String(val)}
                  </Badge>
                );
              })}
            </div>
          );
        }
        return <span>{String(value)}</span>;

      case FieldType.CHECKBOX:
        return (
          <Badge variant={value ? "default" : "outline"}>
            {value ? "Yes" : "No"}
          </Badge>
        );

      case FieldType.FILE:
        if (typeof value === "string") {
          return (
            <Link
              href={value}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1 text-foreground underline underline-offset-2 hover:text-foreground"
            >
              <File className="h-3 w-3" />
              View File
            </Link>
          );
        }
        return <span>{String(value)}</span>;

      default:
        return <span>{String(value)}</span>;
    }
  };

  return (
    <div className="space-y-1">
      <div className="text-sm font-medium text-muted-foreground">
        {field.label}
        {field.isRequired && <span className="text-destructive ml-1">*</span>}
      </div>
      {field.description && (
        <div className="text-xs text-muted-foreground/75 mb-2">
          {field.description}
        </div>
      )}
      <div className="text-base">{renderValue()}</div>
    </div>
  );
};

export default DynamicFieldRenderer;