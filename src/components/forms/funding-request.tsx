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
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useFieldArray, useForm } from "react-hook-form";
import type { z } from "zod";
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
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { FundingStatus } from "@/types";
import { legacyCreateFundingRequestSchema } from "@/validations/funding-request";
import FileUpload from "../file-uploader";

export default function FundingRequest({
  organizationId,
  userEmail,
}: {
  organizationId: string;
  userEmail?: string | null;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const form = useForm({
    resolver: zodResolver(legacyCreateFundingRequestSchema),
    defaultValues: {
      name: "",
      description: "",
      purpose: "",
      amountRequested: 0,
      refinancingConcept: "",
      sustainability: "",
      expectedCompletionDate: "",
      status: FundingStatus.Submitted,
      files: [
        {
          name: "",
          url: "",
        },
      ],
    },
  });

  const {
    fields: files,
    append,
    remove,
  } = useFieldArray({
    control: form.control,
    name: "files",
  });

  async function onSubmit(
    values: z.infer<typeof legacyCreateFundingRequestSchema>,
  ) {
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

            <div className="space-y-4">
              <h3 className="text-sm font-medium text-muted-foreground">
                Basic Information
              </h3>

              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Project Name</FormLabel>
                    <FormControl>
                      <Input
                        placeholder="Enter the name of your project"
                        {...field}
                        value={field.value || ""}
                      />
                    </FormControl>
                    <FormDescription>
                      Provide a clear, concise name for your funding request
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <div className="grid gap-4 md:grid-cols-2">
                <FormField
                  control={form.control}
                  name="amountRequested"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Amount Requested</FormLabel>
                      <FormControl>
                        <div className="relative">
                          <Euro className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                          <Input
                            type="number"
                            placeholder="0.00"
                            className="pl-8"
                            {...field}
                            value={field.value as number}
                            onChange={(e) =>
                              field.onChange(Number(e.target.value))
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
                  name="expectedCompletionDate"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Expected Completion Date</FormLabel>
                      <FormControl>
                        <div className="relative">
                          <Calendar className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                          <Input
                            type="datetime-local"
                            className="pl-8"
                            {...field}
                            value={field.value || ""}
                          />
                        </div>
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
            </div>

            <Separator />

            <div className="space-y-4">
              <h3 className="text-sm font-medium text-muted-foreground">
                Project Details
              </h3>

              <FormField
                control={form.control}
                name="description"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Project Description</FormLabel>
                    <FormControl>
                      <Textarea
                        placeholder="Provide a detailed description of your project"
                        className="min-h-[100px] resize-y"
                        {...field}
                      />
                    </FormControl>
                    <FormDescription>
                      Explain what your project is about and why it matters
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="purpose"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Project Purpose</FormLabel>
                    <FormControl>
                      <Textarea
                        placeholder="Describe the purpose and goals of your project"
                        className="min-h-[100px] resize-y"
                        {...field}
                      />
                    </FormControl>
                    <FormDescription>
                      Clearly state the objectives and intended outcomes
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <Separator />

            <div className="space-y-4">
              <h3 className="text-sm font-medium text-muted-foreground">
                Financial Planning
              </h3>

              <FormField
                control={form.control}
                name="refinancingConcept"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Refinancing Concept</FormLabel>
                    <FormControl>
                      <Textarea
                        placeholder="Explain your refinancing strategy"
                        className="min-h-[100px] resize-y"
                        {...field}
                      />
                    </FormControl>
                    <FormDescription>
                      Detail how the project will be financially sustainable
                      after initial funding
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="sustainability"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Sustainability Plan</FormLabel>
                    <FormControl>
                      <Textarea
                        placeholder="Describe how your project will be sustainable in the long term"
                        className="min-h-[100px] resize-y"
                        {...field}
                      />
                    </FormControl>
                    <FormDescription>
                      Outline the long-term viability and impact of your project
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <Separator />

            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-medium text-muted-foreground">
                  Supporting Documents
                </h3>
                <Badge variant="outline" className="text-xs">
                  {files.length} {files.length === 1 ? "file" : "files"}
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
                                value={field.value || ""}
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
                      onClick={() => remove(index)}
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
                  onClick={() => append({ name: "", url: "" })}
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
