"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import {
  AlertCircle,
  Calendar,
  Euro,
  FileText,
  Loader2,
  Plus,
  Trash2,
} from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";

// import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";

import { useRouter } from "next/navigation";
import { useToast } from "@/hooks/use-toast";
import { getDefaultFormConfiguration } from "@/services/form-config";
import {
  FieldType,
  type FormField as FormFieldType,
  type FormSection,
  FundingStatus,
} from "@/types";
import FileUpload from "../file-uploader";

type FundingFile = { id: string; name: string; url: string };

const createEmptyFundingFile = (): FundingFile => ({
  id: `file-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
  name: "",
  url: "",
});

const withFileIds = (files: Array<Partial<FundingFile>>): FundingFile[] =>
  files.map((file) => ({
    id:
      file.id ?? `file-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    name: file.name ?? "",
    url: file.url ?? "",
  }));

interface DynamicFundingRequestProps {
  organizationId: string;
  teamId?: string;
  userEmail?: string | null;
}

export default function DynamicFundingRequest({
  organizationId,
  teamId,
  userEmail,
}: DynamicFundingRequestProps) {
  const router = useRouter();
  const { toast } = useToast();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [formConfiguration, setFormConfiguration] = useState<FormSection[]>([]);

  // Dynamic schema generation based on configuration
  const generateSchema = (sections: FormSection[]) => {
    const schemaFields: Record<string, z.ZodTypeAny> = {};

    sections.forEach((section) => {
      section.fields.forEach((field) => {
        let fieldSchema: z.ZodTypeAny;

        switch (field.type) {
          case FieldType.TEXT:
          case FieldType.TEXTAREA:
          case FieldType.EMAIL:
          case FieldType.URL: {
            let stringSchema = z.string();
            if (field.isRequired) {
              stringSchema = stringSchema.min(1, `${field.label} is required`);
            }
            if (field.minLength) {
              stringSchema = stringSchema.min(
                field.minLength,
                `${field.label} must be at least ${field.minLength} characters`,
              );
            }
            if (field.maxLength) {
              stringSchema = stringSchema.max(
                field.maxLength,
                `${field.label} must be at most ${field.maxLength} characters`,
              );
            }
            if (field.type === FieldType.EMAIL) {
              stringSchema = stringSchema.email("Invalid email format");
            }
            if (field.type === FieldType.URL) {
              stringSchema = stringSchema.url("Invalid URL format");
            }
            fieldSchema = stringSchema;
            break;
          }

          case FieldType.NUMBER: {
            let numberSchema = z.coerce.number();
            if (field.isRequired) {
              numberSchema = numberSchema.min(0, `${field.label} is required`);
            }
            if (field.minValue !== null && field.minValue !== undefined) {
              numberSchema = numberSchema.min(
                field.minValue,
                `${field.label} must be at least ${field.minValue}`,
              );
            }
            if (field.maxValue !== null && field.maxValue !== undefined) {
              numberSchema = numberSchema.max(
                field.maxValue,
                `${field.label} must be at most ${field.maxValue}`,
              );
            }
            fieldSchema = numberSchema;
            break;
          }

          case FieldType.DATE: {
            let dateSchema = z.string();
            if (field.isRequired) {
              dateSchema = dateSchema.min(1, `${field.label} is required`);
            }
            fieldSchema = dateSchema.refine(
              (date) => !Number.isNaN(Date.parse(date)),
              {
                message: "Invalid date format",
              },
            );
            break;
          }

          case FieldType.SELECT:
          case FieldType.RADIO:
            if (field.options && field.options.length > 0) {
              const values = field.options.map((opt) => opt.value);
              const enumSchema = z.enum(values as [string, ...string[]]);
              if (field.isRequired) {
                fieldSchema = enumSchema.refine(
                  (val) => val.length > 0,
                  `${field.label} is required`,
                );
              } else {
                fieldSchema = enumSchema;
              }
            } else {
              let selectSchema = z.string();
              if (field.isRequired) {
                selectSchema = selectSchema.min(
                  1,
                  `${field.label} is required`,
                );
              }
              fieldSchema = selectSchema;
            }
            break;

          case FieldType.MULTISELECT: {
            let arraySchema = z.array(z.string());
            if (field.isRequired) {
              arraySchema = arraySchema.min(
                1,
                `${field.label} must have at least one selection`,
              );
            }
            fieldSchema = arraySchema;
            break;
          }

          case FieldType.CHECKBOX: {
            const boolSchema = z.boolean();
            if (field.isRequired) {
              fieldSchema = boolSchema.refine((val) => val === true, {
                message: `${field.label} must be checked`,
              });
            } else {
              fieldSchema = boolSchema;
            }
            break;
          }

          default: {
            let defaultSchema = z.string();
            if (field.isRequired) {
              defaultSchema = defaultSchema.min(
                1,
                `${field.label} is required`,
              );
            }
            fieldSchema = defaultSchema;
          }
        }

        if (!field.isRequired && field.type !== FieldType.CHECKBOX) {
          schemaFields[field.key] = fieldSchema.optional();
        } else {
          schemaFields[field.key] = fieldSchema;
        }
      });
    });

    // Always include status and files
    schemaFields.status = z.enum([
      FundingStatus.Submitted,
      FundingStatus.Accepted,
      FundingStatus.Approved,
      FundingStatus.Rejected,
    ]);
    schemaFields.files = z.array(
      z.object({
        id: z.string(),
        name: z.string(),
        url: z.string(),
      }),
    );

    return z.object(schemaFields);
  };

  const form = useForm<Record<string, unknown>>({
    resolver:
      formConfiguration.length > 0
        ? zodResolver(generateSchema(formConfiguration))
        : undefined,
    defaultValues: {},
  });

  const files = withFileIds(
    (form.watch("files") as Array<Partial<FundingFile>> | undefined) ?? [],
  );

  useEffect(() => {
    const currentFiles =
      (form.getValues("files") as Array<Partial<FundingFile>> | undefined) ??
      [];
    if (currentFiles.some((file) => !(file && "id" in file))) {
      form.setValue(
        "files" as keyof Record<string, unknown>,
        withFileIds(currentFiles),
      );
    }
  }, [form]);

  const loadFormConfiguration = useCallback(async () => {
    setIsLoading(true);
    try {
      let config: FormSection[];

      if (teamId) {
        const response = await fetch(`/api/teams/${teamId}/form-config`);
        if (response.ok) {
          const data = await response.json();
          config = data.sections;
        } else {
          config = await getDefaultFormConfiguration();
        }
      } else {
        config = await getDefaultFormConfiguration();
      }

      setFormConfiguration(config);

      // Set default values
      const defaultValues: Record<string, unknown> = {
        status: FundingStatus.Submitted,
        files: [createEmptyFundingFile()],
      };

      config.forEach((section) => {
        section.fields.forEach((field) => {
          if (field.defaultValue) {
            defaultValues[field.key] = field.defaultValue;
          } else {
            switch (field.type) {
              case FieldType.NUMBER:
                defaultValues[field.key] = 0;
                break;
              case FieldType.CHECKBOX:
                defaultValues[field.key] = false;
                break;
              case FieldType.MULTISELECT:
                defaultValues[field.key] = [];
                break;
              default:
                defaultValues[field.key] = "";
            }
          }
        });
      });

      form.reset(defaultValues);
    } catch (error) {
      console.error("Failed to load form configuration:", error);
      toast({
        title: "Configuration Error",
        description: "Failed to load form configuration. Using default fields.",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  }, [form, teamId, toast]);

  useEffect(() => {
    void loadFormConfiguration();
  }, [loadFormConfiguration]);

  const renderField = (field: FormFieldType, _sectionIndex: number) => {
    const fieldName = field.key;

    return (
      <FormField
        key={field.id}
        control={form.control}
        name={fieldName}
        render={({ field: formField }) => (
          <FormItem>
            <FormLabel>
              {field.label}
              {field.isRequired && <span className="text-red-500 ml-1">*</span>}
            </FormLabel>
            <FormControl>
              {(() => {
                switch (field.type) {
                  case FieldType.TEXT:
                  case FieldType.EMAIL:
                  case FieldType.URL:
                    return (
                      <Input
                        placeholder={field.placeholder}
                        type={
                          field.type === FieldType.EMAIL
                            ? "email"
                            : field.type === FieldType.URL
                              ? "url"
                              : "text"
                        }
                        {...formField}
                        value={
                          typeof formField.value === "string"
                            ? formField.value
                            : ""
                        }
                      />
                    );

                  case FieldType.TEXTAREA:
                    return (
                      <Textarea
                        placeholder={field.placeholder}
                        className="min-h-[100px] resize-y"
                        {...formField}
                        value={
                          typeof formField.value === "string"
                            ? formField.value
                            : ""
                        }
                      />
                    );

                  case FieldType.NUMBER:
                    return (
                      <div className="relative">
                        {field.key === "amountRequested" && (
                          <Euro className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                        )}
                        <Input
                          type="number"
                          placeholder={field.placeholder}
                          className={
                            field.key === "amountRequested" ? "pl-8" : ""
                          }
                          {...formField}
                          value={
                            typeof formField.value === "number"
                              ? String(formField.value)
                              : typeof formField.value === "string"
                                ? formField.value
                                : ""
                          }
                          onChange={(e) =>
                            formField.onChange(Number(e.target.value))
                          }
                        />
                      </div>
                    );

                  case FieldType.DATE:
                    return (
                      <div className="relative">
                        <Calendar className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                        <Input
                          type="datetime-local"
                          className="pl-8"
                          {...formField}
                          value={
                            typeof formField.value === "string"
                              ? formField.value
                              : ""
                          }
                        />
                      </div>
                    );

                  case FieldType.SELECT:
                    return (
                      <Select
                        onValueChange={formField.onChange}
                        value={
                          typeof formField.value === "string"
                            ? formField.value
                            : ""
                        }
                      >
                        <SelectTrigger>
                          <SelectValue
                            placeholder={
                              field.placeholder || "Select an option"
                            }
                          />
                        </SelectTrigger>
                        <SelectContent>
                          {field.options?.map((option) => (
                            <SelectItem key={option.value} value={option.value}>
                              {option.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    );

                  case FieldType.RADIO:
                    return (
                      <Select
                        onValueChange={formField.onChange}
                        value={
                          typeof formField.value === "string"
                            ? formField.value
                            : ""
                        }
                      >
                        <SelectTrigger>
                          <SelectValue
                            placeholder={
                              field.placeholder || "Select an option"
                            }
                          />
                        </SelectTrigger>
                        <SelectContent>
                          {field.options?.map((option) => (
                            <SelectItem key={option.value} value={option.value}>
                              {option.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    );

                  case FieldType.CHECKBOX:
                    return (
                      <div className="flex items-center space-x-2">
                        <Checkbox
                          checked={!!formField.value}
                          onCheckedChange={formField.onChange}
                          id={fieldName}
                        />
                        <label htmlFor={fieldName} className="text-sm">
                          {field.placeholder || field.label}
                        </label>
                      </div>
                    );

                  default:
                    return (
                      <Input
                        placeholder={field.placeholder}
                        {...formField}
                        value={
                          typeof formField.value === "string"
                            ? formField.value
                            : ""
                        }
                      />
                    );
                }
              })()}
            </FormControl>
            {field.description && (
              <FormDescription>{field.description}</FormDescription>
            )}
            <FormMessage />
          </FormItem>
        )}
      />
    );
  };

  async function onSubmit(values: Record<string, unknown>) {
    if (!userEmail) {
      toast({
        title: "Authentication Error",
        description: "You must be logged in to submit a funding request",
        variant: "destructive",
      });
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      const response = await fetch("/api/funding-requests", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          ...values,
          organizationId,
          submittedBy: userEmail,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => null);
        throw new Error(
          errorData?.message ||
            `Error: ${response.status} ${response.statusText}`,
        );
      }

      const { data } = await response.json();

      toast({
        title: "Request Submitted",
        description:
          "Your funding request has been successfully submitted for review.",
        variant: "default",
      });
      router.push(
        `/organizations/${organizationId}/funding-requests/${data?.id}`,
      );

      form.reset();
    } catch (error) {
      setError(
        error instanceof Error ? error.message : "An unexpected error occurred",
      );
      toast({
        title: "Submission Failed",
        description:
          error instanceof Error
            ? error.message
            : "Failed to submit funding request",
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  }

  if (isLoading) {
    return (
      <Card className="w-full shadow-xs">
        <CardContent className="py-8">
          <div className="text-center">
            <Loader2 className="h-6 w-6 animate-spin mx-auto mb-2" />
            Loading form...
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="w-full shadow-xs">
      <CardHeader className="border-b pb-4">
        <CardTitle className="text-2xl font-semibold">
          Funding Request
        </CardTitle>
        <CardDescription>
          Complete the form below to submit a new funding request for your
          organization
        </CardDescription>
      </CardHeader>

      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)}>
          <CardContent className="space-y-6 pt-6">
            {error && (
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertTitle>Error</AlertTitle>
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}

            {formConfiguration.map((section, sectionIndex) => (
              <div key={section.id} className="space-y-4">
                <div>
                  <h3 className="text-sm font-medium text-muted-foreground">
                    {section.name}
                  </h3>
                  {section.description && (
                    <p className="text-xs text-muted-foreground mt-1">
                      {section.description}
                    </p>
                  )}
                </div>

                <div className="grid gap-4 md:grid-cols-2">
                  {section.fields
                    .sort((a, b) => a.order - b.order)
                    .map((field) => renderField(field, sectionIndex))}
                </div>

                {sectionIndex < formConfiguration.length - 1 && <Separator />}
              </div>
            ))}

            <Separator />

            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-medium text-muted-foreground">
                  Supporting Documents
                </h3>
                <Badge variant="outline" className="text-xs">
                  {files.length} files
                </Badge>
              </div>

              <div className="space-y-4">
                {files.map((file, index) => (
                  <div
                    key={file.id}
                    className="flex flex-col space-y-2 sm:space-y-0 sm:flex-row sm:items-end sm:space-x-2"
                  >
                    <FormField
                      control={form.control}
                      name={`files.${index}.name`}
                      render={({ field }) => (
                        <FormItem className="flex-1">
                          <FormLabel
                            className={index !== 0 ? "sr-only" : undefined}
                          >
                            File Name
                          </FormLabel>
                          <FormControl>
                            <div className="relative">
                              <FileText className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                              <Input
                                placeholder="Document name"
                                className="pl-8"
                                {...field}
                                value={
                                  typeof field.value === "string"
                                    ? field.value
                                    : ""
                                }
                              />
                            </div>
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name={`files.${index}.url`}
                      render={({ field }) => (
                        <FormItem className="flex-1">
                          <FormLabel
                            className={index !== 0 ? "sr-only" : undefined}
                          >
                            File Upload
                          </FormLabel>
                          <FormControl>
                            <FileUpload
                              placeholder="Upload document"
                              name={`file-${file.id}`}
                              data={
                                typeof field.value === "string"
                                  ? field.value
                                  : ""
                              }
                              onFileUpload={(url) => field.onChange(url)}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <Button
                      type="button"
                      variant="destructive"
                      size="icon"
                      onClick={() => {
                        const currentFiles = withFileIds(
                          (form.getValues("files") as
                            | Array<Partial<FundingFile>>
                            | undefined) ?? [],
                        );
                        const updatedFiles = currentFiles.filter(
                          (existing) => existing.id !== file.id,
                        );
                        form.setValue(
                          "files" as keyof Record<string, unknown>,
                          updatedFiles,
                        );
                      }}
                      className="mt-2 sm:mt-0"
                      disabled={files.length <= 1}
                    >
                      <Trash2 className="h-4 w-4" />
                      <span className="sr-only">Remove file</span>
                    </Button>
                  </div>
                ))}

                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    const currentFiles = withFileIds(
                      (form.getValues("files") as
                        | Array<Partial<FundingFile>>
                        | undefined) ?? [],
                    );
                    form.setValue("files" as keyof Record<string, unknown>, [
                      ...currentFiles,
                      createEmptyFundingFile(),
                    ]);
                  }}
                  className="mt-2"
                >
                  <Plus className="mr-2 h-4 w-4" />
                  Add Document
                </Button>
              </div>
            </div>
          </CardContent>

          <CardFooter className="flex justify-end gap-2 border-t pt-4">
            <Button
              type="button"
              variant="outline"
              onClick={() => form.reset()}
              disabled={isSubmitting}
            >
              Cancel
            </Button>

            <Button
              type="submit"
              disabled={isSubmitting}
              className="min-w-[120px]"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Submitting...
                </>
              ) : (
                "Submit Request"
              )}
            </Button>
          </CardFooter>
        </form>
      </Form>
    </Card>
  );
}