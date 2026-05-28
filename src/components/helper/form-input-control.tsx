import { CheckCircle2 } from "lucide-react";
import React from "react";
import type { FieldValues, Path, UseFormReturn } from "react-hook-form";
import { FloatingLabelInput } from "@/components/ui/floating-label-input";
import {
  FormControl,
  FormField,
  FormItem,
  FormMessage,
} from "@/components/ui/form";
import { cn } from "@/lib/utils";

export default function FormInputControl<TFieldValues extends FieldValues>({
  form,
  name,
  label,
  placeholder,
  disabled = false,
  type,
  isFilled = false,
  className,
}: {
  form: UseFormReturn<TFieldValues>;
  name: Path<TFieldValues>;
  label?: string;
  placeholder: string;
  disabled?: boolean;
  type?: React.HTMLInputTypeAttribute | undefined;
  isFilled?: boolean;
  className?: string;
}) {
  const fieldId = `${name}-${React.useId()}`;
  const actualLabel = label || placeholder;

  return (
    <FormField
      control={form.control}
      name={name}
      render={({ field }) => (
        <FormItem>
          <FormControl>
            <div className="relative">
              <FloatingLabelInput
                id={fieldId}
                label={actualLabel}
                type={type}
                disabled={disabled}
                className={cn(
                  isFilled && "border-green-500 !bg-green-50",
                  className,
                )}
                {...field}
              />
              {isFilled && !form.formState.errors[name as string] && (
                <CheckCircle2 className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-green-500" />
              )}
            </div>
          </FormControl>
          <FormMessage className="mt-1" />
        </FormItem>
      )}
    />
  );
}
