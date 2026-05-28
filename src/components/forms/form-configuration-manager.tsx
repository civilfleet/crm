"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Eye, GripVertical, Plus, Save, Settings, Trash2 } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { useFieldArray, useForm } from "react-hook-form";
import { z } from "zod";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
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
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { FieldType } from "@/types";

const fieldOptionSchema = z.object({
  label: z.string().min(1, "Label is required"),
  value: z.string().min(1, "Value is required"),
});

// Reserved field keys that cannot be used (static fields)
const RESERVED_FIELD_KEYS = [
  "name",
  "description",
  "purpose",
  "amountRequested",
  "refinancingConcept",
  "sustainability",
  "expectedCompletionDate",
  "organizationId",
  "submittedBy",
  "files",
  "status",
  "id",
  "createdAt",
  "updatedAt",
];

const formFieldSchema = z.object({
  id: z.string().optional(),
  key: z
    .string()
    .min(1, "Key is required")
    .regex(/^[a-zA-Z_][a-zA-Z0-9_]*$/, "Key must be a valid identifier")
    .refine(
      (key) => !RESERVED_FIELD_KEYS.includes(key),
      "This field key is reserved and cannot be used. Please choose a different key.",
    ),
  label: z.string().min(1, "Label is required"),
  description: z.string().nullish(),
  type: z.enum(FieldType),
  placeholder: z.string().nullish(),
  defaultValue: z.string().nullish(),
  isRequired: z.boolean().default(false),
  order: z.number().default(1),
  minLength: z.number().min(0).nullish(),
  maxLength: z.number().min(1).nullish(),
  minValue: z.number().nullish(),
  maxValue: z.number().nullish(),
  pattern: z.string().nullish(),
  options: z.array(fieldOptionSchema).optional(),
});

const formSectionSchema = z.object({
  id: z.string().optional(),
  name: z.string().min(1, "Section name is required"),
  description: z.string().nullish(),
  order: z.number().default(1),
  fields: z.array(formFieldSchema).default([]),
});

const formConfigSchema = z.object({
  sections: z.array(formSectionSchema).default([]),
});

const createId = (prefix: string) =>
  `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

type ConfigSection = FormConfigValues["sections"][number];
type ConfigField = ConfigSection["fields"][number];

const ensureFieldIds = (fields: ConfigField[]): ConfigField[] =>
  fields.map((field) => ({
    ...field,
    id: field.id ?? createId("field"),
  }));

const ensureSectionIds = (sections: ConfigSection[]): ConfigSection[] =>
  sections.map((section) => ({
    ...section,
    id: section.id ?? createId("section"),
    fields: ensureFieldIds(section.fields ?? []),
  }));

type FormConfigValues = z.infer<typeof formConfigSchema>;

interface FormConfigurationManagerProps {
  teamId: string;
}

export default function FormConfigurationManager({
  teamId,
}: FormConfigurationManagerProps) {
  const { toast } = useToast();
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [openSections, setOpenSections] = useState<Record<string, boolean>>({});

  const form = useForm({
    resolver: zodResolver(formConfigSchema),
    defaultValues: {
      sections: [] as FormConfigValues["sections"],
    },
  });

  const {
    fields: sections,
    append: appendSection,
    remove: removeSection,
  } = useFieldArray({
    control: form.control,
    name: "sections",
  });

  const loadFormConfiguration = useCallback(async () => {
    setIsLoading(true);
    try {
      const response = await fetch(`/api/teams/${teamId}/form-config`);
      if (response.ok) {
        const data = await response.json();
        if (data.sections && data.sections.length > 0) {
          const sectionsWithIds = ensureSectionIds(data.sections);
          form.reset({ sections: sectionsWithIds });
          // Open all sections by default
          const openState: Record<string, boolean> = {};
          sectionsWithIds.forEach((_, index) => {
            openState[`section-${index}`] = true;
          });
          setOpenSections(openState);
        } else {
          // No configuration exists - show empty state
          form.reset({ sections: [] });
          setOpenSections({});
        }
      } else {
        // API error - show empty state
        form.reset({ sections: [] });
        setOpenSections({});
      }
    } catch (error) {
      console.error("Failed to load form configuration:", error);
      // Error loading - show empty state
      form.reset({ sections: [] });
      setOpenSections({});
    } finally {
      setIsLoading(false);
    }
  }, [form, teamId]);

  useEffect(() => {
    void loadFormConfiguration();
  }, [loadFormConfiguration]);

  const loadDefaultConfiguration = () => {
    // Load the new default configuration that only contains example additional fields
    // Static fields (name, description, purpose, etc.) are no longer configurable
    const defaultSections = ensureSectionIds([
      {
        name: "Additional Project Information",
        description:
          "Configure additional fields for your funding requests (examples shown)",
        order: 1,
        fields: [
          {
            key: "targetAudience",
            label: "Target Audience",
            description: "Who will benefit from this project?",
            type: FieldType.TEXTAREA,
            placeholder: "Describe your target audience",
            isRequired: false,
            order: 1,
          },
          {
            key: "projectCategory",
            label: "Project Category",
            description: "Select the category that best describes your project",
            type: FieldType.SELECT,
            isRequired: false,
            order: 2,
            options: [
              { label: "Education", value: "education" },
              { label: "Healthcare", value: "healthcare" },
              { label: "Environment", value: "environment" },
              { label: "Community Development", value: "community" },
              { label: "Arts & Culture", value: "arts" },
              { label: "Other", value: "other" },
            ],
          },
          {
            key: "teamSize",
            label: "Team Size",
            description: "Number of people working on this project",
            type: FieldType.NUMBER,
            placeholder: "5",
            isRequired: false,
            order: 3,
            minValue: 1,
            maxValue: 1000,
          },
        ],
      },
    ]);

    form.reset({ sections: defaultSections });
    const openState: Record<string, boolean> = {};
    defaultSections.forEach((_, index) => {
      openState[`section-${index}`] = true;
    });
    setOpenSections(openState);
  };

  const addSection = () => {
    appendSection({
      id: createId("section"),
      name: "New Section",
      description: "",
      order: sections.length + 1,
      fields: [],
    });
  };

  const addField = (sectionIndex: number) => {
    const currentFields = ensureFieldIds(
      (form.getValues(`sections.${sectionIndex}.fields`) as
        | ConfigField[]
        | undefined) ?? [],
    );
    const newField: ConfigField = {
      id: createId("field"),
      key: `field_${currentFields.length + 1}`,
      label: "New Field",
      type: FieldType.TEXT,
      isRequired: false,
      order: currentFields.length + 1,
    };

    form.setValue(`sections.${sectionIndex}.fields`, [
      ...currentFields,
      newField,
    ]);
  };

  const removeField = (sectionIndex: number, fieldIndex: number) => {
    const currentFields = ensureFieldIds(
      (form.getValues(`sections.${sectionIndex}.fields`) as
        | ConfigField[]
        | undefined) ?? [],
    );
    const updatedFields = currentFields.filter(
      (_, index) => index !== fieldIndex,
    );
    form.setValue(`sections.${sectionIndex}.fields`, updatedFields);
  };

  const toggleSection = (sectionKey: string) => {
    setOpenSections((prev) => ({
      ...prev,
      [sectionKey]: !prev[sectionKey],
    }));
  };

  const onSubmit = async (values: FormConfigValues) => {
    setIsSaving(true);
    try {
      const response = await fetch(`/api/teams/${teamId}/form-config`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(values),
      });

      if (!response.ok) {
        throw new Error("Failed to save form configuration");
      }

      toast({
        title: "Configuration Saved",
        description: "Form configuration has been successfully updated.",
      });
    } catch (_error) {
      toast({
        title: "Save Failed",
        description: "Failed to save form configuration. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoading) {
    return (
      <Card>
        <CardContent className="py-8">
          <div className="text-center">Loading form configuration...</div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Settings className="h-5 w-5" />
          Funding Request Form Configuration
        </CardTitle>
        <p className="text-sm text-muted-foreground">
          Customize the fields and sections that appear in your funding request
          forms
        </p>
      </CardHeader>
      <CardContent>
        {/* Static Fields Information */}
        <Alert className="mb-6">
          <AlertDescription>
            <div className="space-y-2">
              <h4 className="font-medium">Always Present Fields</h4>
              <p className="text-sm text-muted-foreground">
                The following fields are always included in funding request
                forms and cannot be modified:
              </p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2 mt-3">
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 bg-primary rounded-full"></div>
                  <span className="text-sm">Project Name</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 bg-primary rounded-full"></div>
                  <span className="text-sm">Amount Requested</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 bg-primary rounded-full"></div>
                  <span className="text-sm">Expected Completion Date</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 bg-primary rounded-full"></div>
                  <span className="text-sm">Project Description</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 bg-primary rounded-full"></div>
                  <span className="text-sm">Project Purpose</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 bg-primary rounded-full"></div>
                  <span className="text-sm">Refinancing Concept</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 bg-primary rounded-full"></div>
                  <span className="text-sm">Sustainability Plan</span>
                </div>
              </div>
              <p className="text-sm text-muted-foreground mt-3">
                Configure additional fields below to collect extra information
                specific to your team&apos;s requirements.
              </p>
            </div>
          </AlertDescription>
        </Alert>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
            <div className="space-y-4">
              {sections.length === 0 ? (
                // Empty State
                <Card className="border-dashed border-2">
                  <CardContent className="flex flex-col items-center justify-center py-12">
                    <div className="text-center space-y-4">
                      <div className="w-16 h-16 bg-muted rounded-full flex items-center justify-center mx-auto">
                        <Settings className="h-8 w-8 text-muted-foreground" />
                      </div>
                      <div className="space-y-2">
                        <h3 className="text-lg font-medium">
                          No Additional Fields Configured
                        </h3>
                        <p className="text-sm text-muted-foreground max-w-md">
                          You haven&apos;t configured any additional fields yet.
                          The static fields shown above will always be present
                          in funding requests.
                        </p>
                      </div>
                      <div className="flex flex-col gap-3">
                        <div className="flex gap-2">
                          <Button
                            type="button"
                            onClick={addSection}
                            className="mt-4"
                          >
                            <Plus className="h-4 w-4 mr-2" />
                            Add First Section
                          </Button>
                          <Button
                            type="button"
                            variant="outline"
                            onClick={loadDefaultConfiguration}
                            className="mt-4"
                          >
                            <Eye className="h-4 w-4 mr-2" />
                            Load Example Fields
                          </Button>
                        </div>
                        <div className="flex justify-center">
                          <Button
                            type="submit"
                            variant="secondary"
                            disabled={isSaving}
                            className="mt-2"
                          >
                            {isSaving ? (
                              <>
                                <Save className="h-4 w-4 mr-2 animate-spin" />
                                Saving...
                              </>
                            ) : (
                              <>
                                <Save className="h-4 w-4 mr-2" />
                                Save Empty Configuration
                              </>
                            )}
                          </Button>
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ) : (
                sections.map((section, sectionIndex) => {
                  const sectionKey = `section-${sectionIndex}`;
                  const isOpen = openSections[sectionKey];

                  return (
                    <Card
                      key={section.id || sectionIndex}
                      className="border-dashed"
                    >
                      <Collapsible
                        open={isOpen}
                        onOpenChange={() => toggleSection(sectionKey)}
                      >
                        <CollapsibleTrigger asChild>
                          <CardHeader className="cursor-pointer hover:bg-muted/50 transition-colors">
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-2">
                                <GripVertical className="h-4 w-4 text-muted-foreground" />
                                <div>
                                  <h3 className="font-medium">
                                    {form.watch(
                                      `sections.${sectionIndex}.name`,
                                    ) || "Unnamed Section"}
                                  </h3>
                                  <p className="text-sm text-muted-foreground">
                                    {form.watch(
                                      `sections.${sectionIndex}.fields`,
                                    )?.length || 0}{" "}
                                    fields
                                  </p>
                                </div>
                              </div>
                              <div className="flex items-center gap-2">
                                <Badge variant="outline">
                                  Section {sectionIndex + 1}
                                </Badge>
                                <Button
                                  type="button"
                                  variant="destructive"
                                  size="sm"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    removeSection(sectionIndex);
                                  }}
                                >
                                  <Trash2 className="h-4 w-4" />
                                </Button>
                              </div>
                            </div>
                          </CardHeader>
                        </CollapsibleTrigger>

                        <CollapsibleContent>
                          <CardContent className="pt-0 space-y-4">
                            <div className="grid gap-4 md:grid-cols-2">
                              <FormField
                                control={form.control}
                                name={`sections.${sectionIndex}.name`}
                                render={({ field }) => (
                                  <FormItem>
                                    <FormLabel>Section Name</FormLabel>
                                    <FormControl>
                                      <Input
                                        placeholder="e.g., Basic Information"
                                        {...field}
                                        value={field.value ?? ""}
                                      />
                                    </FormControl>
                                    <FormMessage />
                                  </FormItem>
                                )}
                              />

                              <FormField
                                control={form.control}
                                name={`sections.${sectionIndex}.order`}
                                render={({ field }) => (
                                  <FormItem>
                                    <FormLabel>Order</FormLabel>
                                    <FormControl>
                                      <Input
                                        type="number"
                                        {...field}
                                        value={field.value ?? ""}
                                        onChange={(e) =>
                                          field.onChange(Number(e.target.value))
                                        }
                                      />
                                    </FormControl>
                                    <FormMessage />
                                  </FormItem>
                                )}
                              />
                            </div>

                            <FormField
                              control={form.control}
                              name={`sections.${sectionIndex}.description`}
                              render={({ field }) => (
                                <FormItem>
                                  <FormLabel>Description (Optional)</FormLabel>
                                  <FormControl>
                                    <Textarea
                                      placeholder="Brief description of this section"
                                      className="resize-none"
                                      {...field}
                                      value={field.value ?? ""}
                                    />
                                  </FormControl>
                                  <FormMessage />
                                </FormItem>
                              )}
                            />

                            <Separator />

                            <div className="space-y-4">
                              <div className="flex items-center justify-between">
                                <h4 className="font-medium">Fields</h4>
                                <Button
                                  type="button"
                                  variant="outline"
                                  size="sm"
                                  onClick={() => addField(sectionIndex)}
                                >
                                  <Plus className="h-4 w-4 mr-2" />
                                  Add Field
                                </Button>
                              </div>

                              {form
                                .watch(`sections.${sectionIndex}.fields`)
                                ?.map((fieldData, fieldIndex) => (
                                  <Card
                                    key={(fieldData as { id: string }).id}
                                    className="border border-border"
                                  >
                                    <CardContent className="pt-4 space-y-4">
                                      <div className="flex items-center justify-between">
                                        <Badge variant="secondary">
                                          Field {fieldIndex + 1}
                                        </Badge>
                                        <Button
                                          type="button"
                                          variant="destructive"
                                          size="sm"
                                          onClick={() =>
                                            removeField(
                                              sectionIndex,
                                              fieldIndex,
                                            )
                                          }
                                        >
                                          <Trash2 className="h-4 w-4" />
                                        </Button>
                                      </div>

                                      <div className="grid gap-4 md:grid-cols-2">
                                        <FormField
                                          control={form.control}
                                          name={`sections.${sectionIndex}.fields.${fieldIndex}.key`}
                                          render={({ field }) => (
                                            <FormItem>
                                              <FormLabel>Field Key</FormLabel>
                                              <FormControl>
                                                <Input
                                                  placeholder="field_name"
                                                  {...field}
                                                  value={field.value ?? ""}
                                                />
                                              </FormControl>
                                              <FormDescription>
                                                Unique identifier (no spaces,
                                                underscore allowed)
                                              </FormDescription>
                                              <FormMessage />
                                            </FormItem>
                                          )}
                                        />

                                        <FormField
                                          control={form.control}
                                          name={`sections.${sectionIndex}.fields.${fieldIndex}.label`}
                                          render={({ field }) => (
                                            <FormItem>
                                              <FormLabel>Label</FormLabel>
                                              <FormControl>
                                                <Input
                                                  placeholder="Field Label"
                                                  {...field}
                                                  value={field.value ?? ""}
                                                />
                                              </FormControl>
                                              <FormMessage />
                                            </FormItem>
                                          )}
                                        />

                                        <FormField
                                          control={form.control}
                                          name={`sections.${sectionIndex}.fields.${fieldIndex}.type`}
                                          render={({ field }) => (
                                            <FormItem>
                                              <FormLabel>Field Type</FormLabel>
                                              <Select
                                                onValueChange={field.onChange}
                                                value={field.value}
                                              >
                                                <FormControl>
                                                  <SelectTrigger>
                                                    <SelectValue placeholder="Select field type" />
                                                  </SelectTrigger>
                                                </FormControl>
                                                <SelectContent>
                                                  {Object.values(FieldType).map(
                                                    (type) => (
                                                      <SelectItem
                                                        key={type}
                                                        value={type}
                                                      >
                                                        {type.replace("_", " ")}
                                                      </SelectItem>
                                                    ),
                                                  )}
                                                </SelectContent>
                                              </Select>
                                              <FormMessage />
                                            </FormItem>
                                          )}
                                        />

                                        <FormField
                                          control={form.control}
                                          name={`sections.${sectionIndex}.fields.${fieldIndex}.isRequired`}
                                          render={({ field }) => (
                                            <FormItem className="flex flex-row items-center justify-between rounded-lg border p-3 shadow-sm">
                                              <div className="space-y-0.5">
                                                <FormLabel>
                                                  Required Field
                                                </FormLabel>
                                                <FormDescription>
                                                  Must be filled by users
                                                </FormDescription>
                                              </div>
                                              <FormControl>
                                                <Switch
                                                  checked={field.value}
                                                  onCheckedChange={
                                                    field.onChange
                                                  }
                                                />
                                              </FormControl>
                                            </FormItem>
                                          )}
                                        />
                                      </div>

                                      <FormField
                                        control={form.control}
                                        name={`sections.${sectionIndex}.fields.${fieldIndex}.description`}
                                        render={({ field }) => (
                                          <FormItem>
                                            <FormLabel>
                                              Description (Optional)
                                            </FormLabel>
                                            <FormControl>
                                              <Textarea
                                                placeholder="Help text for this field"
                                                className="resize-none"
                                                {...field}
                                                value={field.value ?? ""}
                                              />
                                            </FormControl>
                                            <FormMessage />
                                          </FormItem>
                                        )}
                                      />

                                      <FormField
                                        control={form.control}
                                        name={`sections.${sectionIndex}.fields.${fieldIndex}.placeholder`}
                                        render={({ field }) => (
                                          <FormItem>
                                            <FormLabel>
                                              Placeholder (Optional)
                                            </FormLabel>
                                            <FormControl>
                                              <Input
                                                placeholder="Enter placeholder text"
                                                {...field}
                                                value={field.value ?? ""}
                                              />
                                            </FormControl>
                                            <FormMessage />
                                          </FormItem>
                                        )}
                                      />

                                      {/* Field-specific configuration options */}
                                      {(() => {
                                        const fieldType = form.watch(
                                          `sections.${sectionIndex}.fields.${fieldIndex}.type`,
                                        );

                                        return (
                                          <div className="space-y-4">
                                            {/* Text validation options */}
                                            {(fieldType === FieldType.TEXT ||
                                              fieldType ===
                                                FieldType.TEXTAREA ||
                                              fieldType === FieldType.EMAIL ||
                                              fieldType === FieldType.URL) && (
                                              <div className="space-y-4">
                                                <h5 className="font-medium text-sm">
                                                  Text Validation
                                                </h5>
                                                <div className="grid gap-4 md:grid-cols-2">
                                                  <FormField
                                                    control={form.control}
                                                    name={`sections.${sectionIndex}.fields.${fieldIndex}.minLength`}
                                                    render={({ field }) => (
                                                      <FormItem>
                                                        <FormLabel>
                                                          Minimum Length
                                                        </FormLabel>
                                                        <FormControl>
                                                          <Input
                                                            type="number"
                                                            placeholder="0"
                                                            {...field}
                                                            onChange={(e) =>
                                                              field.onChange(
                                                                e.target.value
                                                                  ? Number(
                                                                      e.target
                                                                        .value,
                                                                    )
                                                                  : undefined,
                                                              )
                                                            }
                                                            value={
                                                              field.value ?? ""
                                                            }
                                                          />
                                                        </FormControl>
                                                        <FormMessage />
                                                      </FormItem>
                                                    )}
                                                  />

                                                  <FormField
                                                    control={form.control}
                                                    name={`sections.${sectionIndex}.fields.${fieldIndex}.maxLength`}
                                                    render={({ field }) => (
                                                      <FormItem>
                                                        <FormLabel>
                                                          Maximum Length
                                                        </FormLabel>
                                                        <FormControl>
                                                          <Input
                                                            type="number"
                                                            placeholder="255"
                                                            {...field}
                                                            onChange={(e) =>
                                                              field.onChange(
                                                                e.target.value
                                                                  ? Number(
                                                                      e.target
                                                                        .value,
                                                                    )
                                                                  : undefined,
                                                              )
                                                            }
                                                            value={
                                                              field.value ?? ""
                                                            }
                                                          />
                                                        </FormControl>
                                                        <FormMessage />
                                                      </FormItem>
                                                    )}
                                                  />
                                                </div>

                                                <FormField
                                                  control={form.control}
                                                  name={`sections.${sectionIndex}.fields.${fieldIndex}.pattern`}
                                                  render={({ field }) => (
                                                    <FormItem>
                                                      <FormLabel>
                                                        Validation Pattern
                                                        (Regex)
                                                      </FormLabel>
                                                      <FormControl>
                                                        <Input
                                                          placeholder="^[A-Za-z0-9]+$"
                                                          {...field}
                                                          value={
                                                            field.value ?? ""
                                                          }
                                                        />
                                                      </FormControl>
                                                      <FormDescription>
                                                        Optional regular
                                                        expression for
                                                        validation
                                                      </FormDescription>
                                                      <FormMessage />
                                                    </FormItem>
                                                  )}
                                                />
                                              </div>
                                            )}

                                            {/* Number validation options */}
                                            {fieldType === FieldType.NUMBER && (
                                              <div className="space-y-4">
                                                <h5 className="font-medium text-sm">
                                                  Number Validation
                                                </h5>
                                                <div className="grid gap-4 md:grid-cols-2">
                                                  <FormField
                                                    control={form.control}
                                                    name={`sections.${sectionIndex}.fields.${fieldIndex}.minValue`}
                                                    render={({ field }) => (
                                                      <FormItem>
                                                        <FormLabel>
                                                          Minimum Value
                                                        </FormLabel>
                                                        <FormControl>
                                                          <Input
                                                            type="number"
                                                            placeholder="0"
                                                            {...field}
                                                            onChange={(e) =>
                                                              field.onChange(
                                                                e.target.value
                                                                  ? Number(
                                                                      e.target
                                                                        .value,
                                                                    )
                                                                  : undefined,
                                                              )
                                                            }
                                                            value={
                                                              field.value ?? ""
                                                            }
                                                          />
                                                        </FormControl>
                                                        <FormMessage />
                                                      </FormItem>
                                                    )}
                                                  />

                                                  <FormField
                                                    control={form.control}
                                                    name={`sections.${sectionIndex}.fields.${fieldIndex}.maxValue`}
                                                    render={({ field }) => (
                                                      <FormItem>
                                                        <FormLabel>
                                                          Maximum Value
                                                        </FormLabel>
                                                        <FormControl>
                                                          <Input
                                                            type="number"
                                                            placeholder="999999"
                                                            {...field}
                                                            onChange={(e) =>
                                                              field.onChange(
                                                                e.target.value
                                                                  ? Number(
                                                                      e.target
                                                                        .value,
                                                                    )
                                                                  : undefined,
                                                              )
                                                            }
                                                            value={
                                                              field.value ?? ""
                                                            }
                                                          />
                                                        </FormControl>
                                                        <FormMessage />
                                                      </FormItem>
                                                    )}
                                                  />
                                                </div>
                                              </div>
                                            )}

                                            {/* Options for SELECT and RADIO fields */}
                                            {(fieldType === FieldType.SELECT ||
                                              fieldType ===
                                                FieldType.RADIO) && (
                                              <div className="space-y-4">
                                                <div className="flex items-center justify-between">
                                                  <h5 className="font-medium text-sm">
                                                    Field Options
                                                  </h5>
                                                  <Button
                                                    type="button"
                                                    variant="outline"
                                                    size="sm"
                                                    onClick={() => {
                                                      const currentOptions =
                                                        form.getValues(
                                                          `sections.${sectionIndex}.fields.${fieldIndex}.options`,
                                                        ) || [];
                                                      form.setValue(
                                                        `sections.${sectionIndex}.fields.${fieldIndex}.options`,
                                                        [
                                                          ...currentOptions,
                                                          {
                                                            label: "New Option",
                                                            value: `option_${currentOptions.length + 1}`,
                                                          },
                                                        ],
                                                      );
                                                    }}
                                                  >
                                                    <Plus className="h-4 w-4 mr-2" />
                                                    Add Option
                                                  </Button>
                                                </div>

                                                {form
                                                  .watch(
                                                    `sections.${sectionIndex}.fields.${fieldIndex}.options`,
                                                  )
                                                  ?.map(
                                                    (_option, optionIndex) => (
                                                      <Card
                                                        key={
                                                          _option?.value ??
                                                          `option-${optionIndex}`
                                                        }
                                                        className="border border-muted"
                                                      >
                                                        <CardContent className="pt-4 space-y-4">
                                                          <div className="flex items-center justify-between">
                                                            <Badge variant="outline">
                                                              Option{" "}
                                                              {optionIndex + 1}
                                                            </Badge>
                                                            <Button
                                                              type="button"
                                                              variant="destructive"
                                                              size="sm"
                                                              onClick={() => {
                                                                const currentOptions =
                                                                  form.getValues(
                                                                    `sections.${sectionIndex}.fields.${fieldIndex}.options`,
                                                                  ) || [];
                                                                const updatedOptions =
                                                                  currentOptions.filter(
                                                                    (_, idx) =>
                                                                      idx !==
                                                                      optionIndex,
                                                                  );
                                                                form.setValue(
                                                                  `sections.${sectionIndex}.fields.${fieldIndex}.options`,
                                                                  updatedOptions,
                                                                );
                                                              }}
                                                            >
                                                              <Trash2 className="h-4 w-4" />
                                                            </Button>
                                                          </div>

                                                          <div className="grid gap-4 md:grid-cols-2">
                                                            <FormField
                                                              control={
                                                                form.control
                                                              }
                                                              name={`sections.${sectionIndex}.fields.${fieldIndex}.options.${optionIndex}.label`}
                                                              render={({
                                                                field,
                                                              }) => (
                                                                <FormItem>
                                                                  <FormLabel>
                                                                    Display
                                                                    Label
                                                                  </FormLabel>
                                                                  <FormControl>
                                                                    <Input
                                                                      placeholder="Option label"
                                                                      {...field}
                                                                      value={
                                                                        field.value ??
                                                                        ""
                                                                      }
                                                                    />
                                                                  </FormControl>
                                                                  <FormMessage />
                                                                </FormItem>
                                                              )}
                                                            />

                                                            <FormField
                                                              control={
                                                                form.control
                                                              }
                                                              name={`sections.${sectionIndex}.fields.${fieldIndex}.options.${optionIndex}.value`}
                                                              render={({
                                                                field,
                                                              }) => (
                                                                <FormItem>
                                                                  <FormLabel>
                                                                    Value
                                                                  </FormLabel>
                                                                  <FormControl>
                                                                    <Input
                                                                      placeholder="option_value"
                                                                      {...field}
                                                                      value={
                                                                        field.value ??
                                                                        ""
                                                                      }
                                                                    />
                                                                  </FormControl>
                                                                  <FormDescription>
                                                                    Internal
                                                                    value (no
                                                                    spaces)
                                                                  </FormDescription>
                                                                  <FormMessage />
                                                                </FormItem>
                                                              )}
                                                            />
                                                          </div>
                                                        </CardContent>
                                                      </Card>
                                                    ),
                                                  )}

                                                {(!form.watch(
                                                  `sections.${sectionIndex}.fields.${fieldIndex}.options`,
                                                ) ||
                                                  form.watch(
                                                    `sections.${sectionIndex}.fields.${fieldIndex}.options`,
                                                  )?.length === 0) && (
                                                  <div className="text-center py-4 text-muted-foreground">
                                                    No options added yet. Click
                                                    &quot;Add Option&quot; to
                                                    create choices for this
                                                    field.
                                                  </div>
                                                )}
                                              </div>
                                            )}

                                            {/* Default value field */}
                                            <FormField
                                              control={form.control}
                                              name={`sections.${sectionIndex}.fields.${fieldIndex}.defaultValue`}
                                              render={({ field }) => (
                                                <FormItem>
                                                  <FormLabel>
                                                    Default Value (Optional)
                                                  </FormLabel>
                                                  <FormControl>
                                                    <Input
                                                      placeholder="Default value for this field"
                                                      {...field}
                                                      value={field.value ?? ""}
                                                    />
                                                  </FormControl>
                                                  <FormDescription>
                                                    Pre-filled value when the
                                                    form loads
                                                  </FormDescription>
                                                  <FormMessage />
                                                </FormItem>
                                              )}
                                            />
                                          </div>
                                        );
                                      })()}
                                    </CardContent>
                                  </Card>
                                ))}
                            </div>
                          </CardContent>
                        </CollapsibleContent>
                      </Collapsible>
                    </Card>
                  );
                })
              )}
            </div>

            {sections.length > 0 && (
              <div className="flex justify-between">
                <Button type="button" variant="outline" onClick={addSection}>
                  <Plus className="h-4 w-4 mr-2" />
                  Add Section
                </Button>

                <div className="flex gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={loadDefaultConfiguration}
                  >
                    <Eye className="h-4 w-4 mr-2" />
                    Load Example Fields
                  </Button>
                  <Button type="submit" disabled={isSaving}>
                    {isSaving ? (
                      <>
                        <Save className="h-4 w-4 mr-2 animate-spin" />
                        Saving...
                      </>
                    ) : (
                      <>
                        <Save className="h-4 w-4 mr-2" />
                        Save Configuration
                      </>
                    )}
                  </Button>
                </div>
              </div>
            )}
          </form>
        </Form>
      </CardContent>
    </Card>
  );
}
