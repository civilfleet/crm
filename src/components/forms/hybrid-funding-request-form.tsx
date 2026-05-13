"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2, Upload } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { DataSelectBox } from "@/components/helper/data-select-box";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
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
// Dynamic field rendering components
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
import { useToast } from "@/hooks/use-toast";
import {
  FieldType,
  type FormField as FormFieldType,
  type FormSection,
  FundingStatus,
} from "@/types";
import { staticFundingRequestSchema } from "@/validations/funding-request";
import FileUpload from "../file-uploader";
import StaticFundingRequestForm from "./static-funding-request-form";

type UploadedFile = { id: string; name: string; url: string };

const createUploadedFile = (fileUrl: string): UploadedFile => ({
  id: `uploaded-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
  name: fileUrl.split("/").pop() || "Uploaded File",
  url: fileUrl,
});

interface HybridFundingRequestFormProps {
  organizationId?: string;
  teamId?: string;
  userEmail?: string | null;
  returnToTeamView?: boolean;
}

export default function HybridFundingRequestForm({
  organizationId,
  teamId,
  userEmail,
  returnToTeamView = false,
}: HybridFundingRequestFormProps) {
  const router = useRouter();
  const { toast } = useToast();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [formConfiguration, setFormConfiguration] = useState<FormSection[]>([]);
  const [files, setFiles] = useState<UploadedFile[]>([]);

  // Dynamic schema generation for additional fields
  const generateDynamicSchema = (sections: FormSection[]) => {
    const dynamicFields: Record<string, z.ZodTypeAny> = {};

    sections.forEach((section) => {
      section.fields.forEach((field) => {
        let fieldSchema: z.ZodTypeAny;

        switch (field.type) {
          case FieldType.TEXT:
          case FieldType.TEXTAREA:
          case FieldType.EMAIL:
          case FieldType.URL: {
            let stringSchema = z.string();
            if (field.minLength !== null && field.minLength !== undefined) {
              stringSchema = stringSchema.min(
                field.minLength,
                `Minimum ${field.minLength} characters required.`,
              );
            }
            if (field.maxLength !== null && field.maxLength !== undefined) {
              stringSchema = stringSchema.max(
                field.maxLength,
                `Maximum ${field.maxLength} characters allowed.`,
              );
            }
            if (field.pattern) {
              stringSchema = stringSchema.regex(
                new RegExp(field.pattern),
                "Invalid format.",
              );
            }
            fieldSchema = stringSchema;
            break;
          }

          case FieldType.NUMBER: {
            let numberSchema = z.coerce.number();
            if (field.minValue !== null && field.minValue !== undefined) {
              numberSchema = numberSchema.min(
                field.minValue,
                `Minimum value is ${field.minValue}.`,
              );
            }
            if (field.maxValue !== null && field.maxValue !== undefined) {
              numberSchema = numberSchema.max(
                field.maxValue,
                `Maximum value is ${field.maxValue}.`,
              );
            }
            fieldSchema = numberSchema;
            break;
          }

          case FieldType.DATE:
            fieldSchema = z
              .string()
              .refine((date) => !Number.isNaN(Date.parse(date)), {
                message: "Invalid date format.",
              });
            break;

          case FieldType.SELECT:
          case FieldType.RADIO:
            if (field.options && field.options.length > 0) {
              const values = field.options.map((opt) => opt.value) as [
                string,
                ...string[],
              ];
              fieldSchema = z.enum(values);
            } else {
              fieldSchema = z.string();
            }
            break;

          case FieldType.MULTISELECT:
            fieldSchema = z.array(z.string());
            break;

          case FieldType.CHECKBOX:
            fieldSchema = z.boolean();
            break;

          case FieldType.FILE:
            fieldSchema = z.string().url();
            break;

          default:
            fieldSchema = z.string();
        }

        if (!field.isRequired) {
          fieldSchema = fieldSchema.optional();
        }

        dynamicFields[field.key] = fieldSchema;
      });
    });

    return z.object(dynamicFields);
  };

  // Combined schema: static fields + dynamic fields + system fields
  const dynamicSchema = generateDynamicSchema(formConfiguration);
  const combinedSchema = staticFundingRequestSchema
    .merge(
      z.object({
        organizationId: z.uuid(),
        submittedBy: z.string().email().optional().or(z.literal("")),
        files: z
          .array(
            z.object({
              name: z.string(),
              url: z.string(),
            }),
          )
          .optional()
          .default([]),
      }),
    )
    .merge(dynamicSchema);

  const form = useForm<z.infer<typeof combinedSchema>>({
    resolver: zodResolver(combinedSchema),
    defaultValues: {
      organizationId: organizationId || "",
      submittedBy: userEmail || "",
      files: [],
    },
  });

  // Fetch form configuration
  useEffect(() => {
    const fetchFormConfiguration = async () => {
      try {
        setIsLoading(true);
        if (teamId) {
          const response = await fetch(`/api/teams/${teamId}/form-config`);
          if (response.ok) {
            const config = await response.json();
            console.log("Form configuration loaded:", config);
            setFormConfiguration(config.sections || []);
          } else {
            console.log("No form configuration found for team:", teamId);
            setFormConfiguration([]);
          }
        } else {
          // No teamId provided - use empty array (no additional fields)
          setFormConfiguration([]);
        }
      } catch (error) {
        console.error("Failed to fetch form configuration:", error);
        setError("Failed to load form configuration");
      } finally {
        setIsLoading(false);
      }
    };

    fetchFormConfiguration();
  }, [teamId]);

  // Debug: Log form configuration changes
  useEffect(() => {
    console.log("Form configuration updated:", {
      teamId,
      formConfigurationLength: formConfiguration.length,
      formConfiguration: formConfiguration,
    });
  }, [formConfiguration, teamId]);

  // File upload handler
  const handleFileUpload = (fileUrl: string) => {
    const newFile = createUploadedFile(fileUrl);
    const updatedFiles = [...files, newFile];
    setFiles(updatedFiles);
    form.setValue(
      "files",
      updatedFiles.map(({ name, url }) => ({ name, url })),
    );
  };

  // Dynamic field renderer
  const renderDynamicField = (field: FormFieldType) => {
    const fieldName = field.key;

    return (
      <FormField
        key={field.id}
        control={form.control}
        name={fieldName}
        render={({ field: formField }) => (
          <FormItem>
            <FormLabel className="text-base font-medium">
              {field.label}
              {field.isRequired && (
                <span className="text-destructive ml-1">*</span>
              )}
            </FormLabel>
            {field.description && (
              <FormDescription>{field.description}</FormDescription>
            )}
            <FormControl>
              {(() => {
                switch (field.type) {
                  case FieldType.TEXT:
                    return (
                      <Input
                        placeholder={field.placeholder}
                        {...formField}
                        value={(formField.value as string) || ""}
                      />
                    );

                  case FieldType.TEXTAREA:
                    return (
                      <Textarea
                        placeholder={field.placeholder}
                        rows={3}
                        {...formField}
                        value={(formField.value as string) || ""}
                      />
                    );

                  case FieldType.NUMBER:
                    return (
                      <Input
                        type="number"
                        placeholder={field.placeholder}
                        {...formField}
                        value={(formField.value as string) || ""}
                        onChange={(e) =>
                          formField.onChange(
                            e.target.value ? parseFloat(e.target.value) : "",
                          )
                        }
                      />
                    );

                  case FieldType.DATE:
                    return (
                      <Input
                        type="date"
                        {...formField}
                        value={(formField.value as string) || ""}
                      />
                    );

                  case FieldType.EMAIL:
                    return (
                      <Input
                        type="email"
                        placeholder={field.placeholder}
                        {...formField}
                        value={(formField.value as string) || ""}
                      />
                    );

                  case FieldType.URL:
                    return (
                      <Input
                        type="url"
                        placeholder={field.placeholder}
                        {...formField}
                        value={(formField.value as string) || ""}
                      />
                    );

                  case FieldType.SELECT:
                    return (
                      <Select
                        onValueChange={formField.onChange}
                        value={(formField.value as string) || ""}
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
                          checked={(formField.value as boolean) || false}
                          onCheckedChange={formField.onChange}
                        />
                        <span className="text-sm">
                          {field.placeholder || "Check if applicable"}
                        </span>
                      </div>
                    );

                  default:
                    return (
                      <Input
                        placeholder={field.placeholder}
                        {...formField}
                        value={(formField.value as string) || ""}
                      />
                    );
                }
              })()}
            </FormControl>
            <FormMessage />
          </FormItem>
        )}
      />
    );
  };

  // Form submission
  const onSubmit = async (values: z.infer<typeof combinedSchema>) => {
    try {
      setIsSubmitting(true);
      setError(null);

      // Separate static fields from dynamic fields
      const staticFields = {
        name: values.name,
        description: values.description,
        purpose: values.purpose,
        amountRequested: values.amountRequested,
        refinancingConcept: values.refinancingConcept,
        sustainability: values.sustainability,
        expectedCompletionDate: values.expectedCompletionDate,
      };

      // Get dynamic fields by excluding static and system fields
      const excludedKeys = new Set([
        ...Object.keys(staticFields),
        "organizationId",
        "submittedBy",
        "files",
      ]);

      const customFields: Record<string, unknown> = {};
      Object.entries(values).forEach(([key, value]) => {
        if (!excludedKeys.has(key) && value !== undefined && value !== "") {
          customFields[key] = value;
        }
      });

      const payload = {
        ...staticFields,
        organizationId: values.organizationId,
        submittedBy: values.submittedBy,
        files: values.files || [],
        customFields:
          Object.keys(customFields).length > 0 ? customFields : undefined,
        status: FundingStatus.Submitted,
      };

      const response = await fetch("/api/funding-requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Failed to submit funding request");
      }

      const data = await response.json();

      toast({
        title: "Success",
        description: "Your funding request has been submitted successfully.",
      });

      // Redirect to the funding request detail page
      router.push(
        returnToTeamView && teamId
          ? `/teams/${teamId}/funding/funding-requests/${data.data.id}`
          : `/organizations/${values.organizationId}/funding-requests/${data.data.id}`,
      );
    } catch (error) {
      console.error("Submission error:", error);
      setError(
        error instanceof Error ? error.message : "An unexpected error occurred",
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex justify-center items-center h-64">
        <Loader2 className="h-8 w-8 animate-spin" />
        <span className="ml-2">Loading form configuration...</span>
      </div>
    );
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-8">
        {error && (
          <Alert variant="destructive">
            <AlertTitle>Error</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {!organizationId && teamId && (
          <Card>
            <CardHeader>
              <CardTitle>Target Organization</CardTitle>
              <CardDescription>
                Select the organization this funding request belongs to.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <FormField
                control={form.control}
                name="organizationId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Organization</FormLabel>
                    <FormControl>
                      <DataSelectBox
                        targetKey="id"
                        url={`/api/organizations?teamId=${teamId}`}
                        attribute="name"
                        label="Select Organization"
                        value={
                          typeof field.value === "string" ? field.value : null
                        }
                        onChange={field.onChange}
                        disabled={isSubmitting}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </CardContent>
          </Card>
        )}

        {/* Static Fields Section */}
        <StaticFundingRequestForm form={form} />

        {/* Dynamic Fields Section */}
        {formConfiguration.length > 0 && (
          <div className="space-y-6">
            {formConfiguration.map((section) => (
              <Card key={section.id}>
                <CardHeader>
                  <CardTitle>{section.name}</CardTitle>
                  {section.description && (
                    <CardDescription>{section.description}</CardDescription>
                  )}
                </CardHeader>
                <CardContent className="space-y-6">
                  {section.fields.map((field, index) => (
                    <div key={field.id}>
                      {renderDynamicField(field)}
                      {index < section.fields.length - 1 && (
                        <Separator className="my-6" />
                      )}
                    </div>
                  ))}
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        {/* Debug: Show when no dynamic fields */}
        {!isLoading && formConfiguration.length === 0 && (
          <div className="text-center py-4 text-muted-foreground text-sm">
            No additional fields configured for this team. Only static fields
            will be shown.
          </div>
        )}

        {/* File Upload Section */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Upload className="h-5 w-5" />
              Supporting Documents
            </CardTitle>
            <CardDescription>
              Upload any supporting documents for your funding request
              (optional)
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <FileUpload onFileUpload={handleFileUpload} />

            {files.length > 0 && (
              <div className="space-y-2">
                <h4 className="text-sm font-medium">Uploaded Files:</h4>
                {files.map((file) => (
                  <div
                    key={file.id}
                    className="flex items-center justify-between p-2 bg-muted rounded"
                  >
                    <span className="text-sm">{file.name}</span>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        const updatedFiles = files.filter(
                          (item) => item.id !== file.id,
                        );
                        setFiles(updatedFiles);
                        form.setValue(
                          "files",
                          updatedFiles.map(({ name, url }) => ({ name, url })),
                        );
                      }}
                    >
                      Remove
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Submit Button */}
        <Card>
          <CardFooter className="mt-2 flex flex-col-reverse gap-3 pt-6 sm:flex-row sm:justify-end sm:gap-4">
            <Button
              type="button"
              variant="outline"
              onClick={() => router.back()}
              disabled={isSubmitting}
              className="w-full sm:w-auto"
            >
              Cancel
            </Button>
            <Button
              className="w-full sm:w-auto"
              type="submit"
              disabled={
                isSubmitting ||
                (!organizationId && !form.watch("organizationId"))
              }
            >
              {isSubmitting && (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              )}
              Submit Funding Request
            </Button>
          </CardFooter>
        </Card>
      </form>
    </Form>
  );
}