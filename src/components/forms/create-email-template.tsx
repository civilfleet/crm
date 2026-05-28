"use client";
import { zodResolver } from "@hookform/resolvers/zod";
import { FileText } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useForm } from "react-hook-form";
import type * as z from "zod";
import { Button } from "@/components/ui/button";
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
import { EMAIL_TEMPLATES_TYPES } from "@/constants";
import { useToast } from "@/hooks/use-toast";
import type { EmailTemplate } from "@/types";
import { createEmailTemplateSchema } from "@/validations/email-templates";
import { EmailEditor } from "../email-editor";

const CreateEmailTemplate = ({
  teamId,
  templates,
}: {
  teamId: string;
  templates: EmailTemplate[];
}) => {
  const { toast } = useToast();
  const [isLoading, setIsLoading] = useState(false);
  const [template, setTemplate] = useState<EmailTemplate | null>(null);
  const editorRef = useRef<HTMLDivElement>(null);
  const form = useForm<z.infer<typeof createEmailTemplateSchema>>({
    resolver: zodResolver(createEmailTemplateSchema),
    defaultValues: {
      name: "",
      type: EMAIL_TEMPLATES_TYPES.FUNDING_REQUEST_ACCEPTED,
      subject: "",
      content: "",
    },
  });
  const [tooltipVisible, setTooltipVisible] = useState(false);
  const [tooltipPosition, setTooltipPosition] = useState({ top: 0, left: 0 });

  const variables = [
    { name: "organizationName", description: "Name of the organization" },
    { name: "requestName", description: "Name of the request" },
    {
      name: "submittedDate",
      description: "Date when the request was submitted",
    },
    { name: "status", description: "Current status of the request" },
    { name: "requestLink", description: "Link to the request details" },
    { name: "supportEmail", description: "Support email address" },
  ];

  const templateType = form.watch("type");

  const showTooltip = (e: React.MouseEvent<HTMLButtonElement>) => {
    setTooltipPosition({
      top: e.currentTarget.offsetTop + e.currentTarget.offsetHeight + 5,
      left: e.currentTarget.offsetLeft,
    });
    setTooltipVisible(true);
  };

  const insertVariable = (variableName: string) => {
    const currentContent = form.getValues("content");
    const variableText = `{{ ${variableName} }}`;
    form.setValue("content", currentContent + variableText);
    setTooltipVisible(false);
  };

  useEffect(() => {
    const template = templates.find(
      (template) => template.type === templateType,
    );
    setTemplate(template || null);

    form.setValue("name", template?.name || "");
    form.setValue("subject", template?.subject || "");
    form.setValue("content", template?.content || "");
  }, [templateType, templates, form]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        tooltipVisible &&
        editorRef.current &&
        !editorRef.current.contains(event.target as Node)
      ) {
        setTooltipVisible(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [tooltipVisible]);

  const onSubmit = async (
    values: z.infer<typeof createEmailTemplateSchema>,
  ) => {
    setIsLoading(true);
    console.log({ ...values, id: template?.id });
    const response = await fetch(`/api/teams/${teamId}/email-templates`, {
      method: template?.id ? "PUT" : "POST",
      body: JSON.stringify({ ...values, id: template?.id }),
    });
    if (response.ok) {
      toast({
        title: "Email template created successfully",
      });
    }
    setIsLoading(false);
  };

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="mx-auto max-w-4xl">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900">
            Create Email Templates
          </h1>
          <p className="mt-1 text-gray-500">
            Design your new email template with full HTML support
          </p>
        </div>

        <div className="rounded-lg border bg-white p-6 shadow-xs">
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
              <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
                <FormField
                  control={form.control}
                  name="name"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Template name</FormLabel>
                      <FormControl>
                        <Input
                          placeholder="Enter template name"
                          {...field}
                          value={field.value || ""}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="type"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Template Type</FormLabel>
                      <Select
                        onValueChange={field.onChange}
                        defaultValue={field.value}
                      >
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Select template type" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {Object.values(EMAIL_TEMPLATES_TYPES).map((type) => (
                            <SelectItem key={type} value={type}>
                              {type.replaceAll("_", " ")}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <FormField
                control={form.control}
                name="subject"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Email Subject</FormLabel>
                    <FormControl>
                      <Input
                        placeholder="Enter email subject"
                        {...field}
                        value={field.value || ""}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="content"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Email Content</FormLabel>
                    <FormControl>
                      <div className="flex flex-col gap-2" ref={editorRef}>
                        <div className="flex items-center">
                          <p className="text-sm text-gray-500">
                            Please use{" "}
                            <code className="font-bold bg-gray-100 px-1 py-0.5 rounded">{`{{ variableName }}`}</code>{" "}
                            to insert variables
                          </p>
                          <button
                            type="button"
                            className="ml-2 px-2 py-1 bg-blue-100 text-blue-600 rounded-md text-sm flex items-center"
                            onClick={showTooltip}
                          >
                            <span>Show Variables</span>
                          </button>
                        </div>

                        {tooltipVisible && (
                          <div
                            className="absolute bg-white border border-gray-200 rounded-md shadow-lg p-3 z-10"
                            style={{
                              top: `${tooltipPosition.top}px`,
                              left: `${tooltipPosition.left}px`,
                            }}
                          >
                            <h3 className="font-medium text-sm border-b pb-1 mb-2">
                              Available Variables
                            </h3>
                            <ul className="space-y-1">
                              {variables.map((variable) => (
                                <li
                                  key={variable.name}
                                  className="flex flex-col"
                                >
                                  <button
                                    type="button"
                                    className="text-left hover:bg-gray-100 px-2 py-1 rounded-md text-sm flex items-center"
                                    onClick={() =>
                                      insertVariable(variable.name)
                                    }
                                  >
                                    <code className="font-bold">{`{{ ${variable.name} }}`}</code>
                                    <span className="ml-2 text-xs text-gray-500">
                                      {variable.description}
                                    </span>
                                  </button>
                                </li>
                              ))}
                            </ul>
                            <div className="pt-2 border-t mt-2 flex justify-end">
                              <button
                                type="button"
                                className="text-xs text-gray-500 hover:text-gray-700"
                                onClick={() => setTooltipVisible(false)}
                              >
                                Close
                              </button>
                            </div>
                          </div>
                        )}
                        <EmailEditor
                          value={field.value}
                          onChange={field.onChange}
                        />
                      </div>
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <div className="flex justify-end gap-4">
                <Button
                  variant="outline"
                  type="button"
                  onClick={() => form.reset()}
                >
                  Reset
                </Button>
                <Button type="submit" disabled={isLoading}>
                  <FileText className="mr-2 h-4 w-4" />
                  Save Template
                </Button>
              </div>
            </form>
          </Form>
        </div>
      </div>
    </div>
  );
};

export default CreateEmailTemplate;