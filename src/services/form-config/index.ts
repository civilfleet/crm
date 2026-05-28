import prisma from "@/lib/prisma";
import { FieldType, type FormSection } from "@/types";

export async function getFormConfiguration(
  teamId: string,
): Promise<FormSection[]> {
  const formSections = await prisma.formSection.findMany({
    where: { teamId },
    include: {
      fields: {
        orderBy: { order: "asc" },
      },
    },
    orderBy: { order: "asc" },
  });

  // Convert options from JSON to proper format
  return formSections.map((section) => ({
    ...section,
    fields: section.fields.map((field) => ({
      ...field,
      options: field.options ? JSON.parse(field.options as string) : undefined,
      minValue: field.minValue ? Number(field.minValue) : undefined,
      maxValue: field.maxValue ? Number(field.maxValue) : undefined,
    })),
  })) as FormSection[];
}

export async function getStaticFieldsConfiguration(): Promise<FormSection[]> {
  // Return the static fields configuration for display purposes only
  // These fields are always present and cannot be modified
  return [
    {
      id: "static-1",
      name: "Basic Information",
      description: "Essential project details (always present)",
      order: 1,
      teamId: undefined,
      fields: [
        {
          id: "static-field-1",
          key: "name",
          label: "Project Name",
          description: "Provide a clear, concise name for your funding request",
          type: FieldType.TEXT,
          placeholder: "Enter the name of your project",
          isRequired: true,
          order: 1,
          minLength: 3,
          sectionId: "static-1",
          createdAt: new Date(),
          updatedAt: new Date(),
        },
        {
          id: "static-field-2",
          key: "amountRequested",
          label: "Amount Requested",
          type: FieldType.NUMBER,
          placeholder: "0.00",
          isRequired: true,
          order: 2,
          minValue: 0,
          sectionId: "static-1",
          createdAt: new Date(),
          updatedAt: new Date(),
        },
        {
          id: "static-field-3",
          key: "expectedCompletionDate",
          label: "Expected Completion Date",
          type: FieldType.DATE,
          isRequired: true,
          order: 3,
          sectionId: "static-1",
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ],
      createdAt: new Date(),
      updatedAt: new Date(),
    },
    {
      id: "static-2",
      name: "Project Details",
      description: "Detailed information about your project (always present)",
      order: 2,
      teamId: undefined,
      fields: [
        {
          id: "static-field-4",
          key: "description",
          label: "Project Description",
          description: "Explain what your project is about and why it matters",
          type: FieldType.TEXTAREA,
          placeholder: "Provide a detailed description of your project",
          isRequired: true,
          order: 1,
          minLength: 10,
          sectionId: "static-2",
          createdAt: new Date(),
          updatedAt: new Date(),
        },
        {
          id: "static-field-5",
          key: "purpose",
          label: "Project Purpose",
          description: "Clearly state the objectives and intended outcomes",
          type: FieldType.TEXTAREA,
          placeholder: "Describe the purpose and goals of your project",
          isRequired: true,
          order: 2,
          minLength: 10,
          sectionId: "static-2",
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ],
      createdAt: new Date(),
      updatedAt: new Date(),
    },
    {
      id: "static-3",
      name: "Financial Planning",
      description:
        "Financial sustainability and planning details (always present)",
      order: 3,
      teamId: undefined,
      fields: [
        {
          id: "static-field-6",
          key: "refinancingConcept",
          label: "Refinancing Concept",
          description:
            "Detail how the project will be financially sustainable after initial funding",
          type: FieldType.TEXTAREA,
          placeholder: "Explain your refinancing strategy",
          isRequired: true,
          order: 1,
          minLength: 10,
          sectionId: "static-3",
          createdAt: new Date(),
          updatedAt: new Date(),
        },
        {
          id: "static-field-7",
          key: "sustainability",
          label: "Sustainability Plan",
          description:
            "Outline the long-term viability and impact of your project",
          type: FieldType.TEXTAREA,
          placeholder:
            "Describe how your project will be sustainable in the long term",
          isRequired: true,
          order: 2,
          minLength: 10,
          sectionId: "static-3",
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ],
      createdAt: new Date(),
      updatedAt: new Date(),
    },
  ];
}

export async function getDefaultFormConfiguration(): Promise<FormSection[]> {
  // Return example additional fields configuration
  // Teams can use this as a starting point for their custom fields
  return [
    {
      id: "example-1",
      name: "Additional Project Information",
      description:
        "Custom fields for additional project details (example section)",
      order: 1,
      teamId: undefined,
      fields: [
        {
          id: "example-field-1",
          key: "targetAudience",
          label: "Target Audience",
          description: "Who will benefit from this project?",
          type: FieldType.TEXTAREA,
          placeholder: "Describe your target audience",
          isRequired: false,
          order: 1,
          sectionId: "example-1",
          createdAt: new Date(),
          updatedAt: new Date(),
        },
        {
          id: "example-field-2",
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
          sectionId: "example-1",
          createdAt: new Date(),
          updatedAt: new Date(),
        },
        {
          id: "example-field-3",
          key: "teamSize",
          label: "Team Size",
          description: "Number of people working on this project",
          type: FieldType.NUMBER,
          placeholder: "5",
          isRequired: false,
          order: 3,
          minValue: 1,
          maxValue: 1000,
          sectionId: "example-1",
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ],
      createdAt: new Date(),
      updatedAt: new Date(),
    },
  ];
}

export async function createDefaultFormConfiguration(
  teamId: string,
): Promise<void> {
  const defaultConfig = await getDefaultFormConfiguration();

  await prisma.$transaction(async (tx) => {
    for (const sectionData of defaultConfig) {
      const section = await tx.formSection.create({
        data: {
          name: sectionData.name,
          description: sectionData.description,
          order: sectionData.order,
          teamId,
        },
      });

      for (const fieldData of sectionData.fields) {
        await tx.formField.create({
          data: {
            key: fieldData.key,
            label: fieldData.label,
            description: fieldData.description,
            type: fieldData.type,
            placeholder: fieldData.placeholder,
            defaultValue: fieldData.defaultValue,
            isRequired: fieldData.isRequired,
            order: fieldData.order,
            minLength: fieldData.minLength,
            maxLength: fieldData.maxLength,
            minValue: fieldData.minValue,
            maxValue: fieldData.maxValue,
            pattern: fieldData.pattern,
            options: fieldData.options
              ? JSON.stringify(fieldData.options)
              : undefined,
            sectionId: section.id,
          },
        });
      }
    }
  });
}
