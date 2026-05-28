"use client";

import {
  Calendar,
  Euro,
  FileText,
  Recycle,
  Target,
  TrendingUp,
} from "lucide-react";
import type { UseFormReturn } from "react-hook-form";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
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

interface StaticFundingRequestFormProps {
  // Accept any form that includes at least these static fields
  // biome-ignore lint/suspicious/noExplicitAny: Component needs to work with dynamic form schemas
  form: UseFormReturn<any>;
}

export default function StaticFundingRequestForm({
  form,
}: StaticFundingRequestFormProps) {
  return (
    <div className="space-y-6">
      {/* Basic Information Section */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5 text-primary" />
            Basic Information
          </CardTitle>
          <CardDescription>
            Essential project details required for all funding requests
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Project Name */}
          <FormField
            control={form.control}
            name="name"
            render={({ field }) => (
              <FormItem>
                <FormLabel className="text-base font-medium">
                  Project Name <span className="text-destructive">*</span>
                </FormLabel>
                <FormDescription>
                  Provide a clear, concise name for your funding request
                </FormDescription>
                <FormControl>
                  <Input
                    placeholder="Enter the name of your project"
                    {...field}
                    value={String(field.value || "")}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <Separator />

          {/* Amount Requested */}
          <FormField
            control={form.control}
            name="amountRequested"
            render={({ field }) => (
              <FormItem>
                <FormLabel className="flex items-center gap-2 text-base font-medium">
                  <Euro className="h-4 w-4" />
                  Amount Requested <span className="text-destructive">*</span>
                </FormLabel>
                <FormDescription>
                  Enter the total funding amount you are requesting
                </FormDescription>
                <FormControl>
                  <Input
                    type="number"
                    placeholder="0.00"
                    step="0.01"
                    min="0"
                    {...field}
                    value={String(field.value || "")}
                    onChange={(e) =>
                      field.onChange(
                        e.target.value ? parseFloat(e.target.value) : "",
                      )
                    }
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <Separator />

          {/* Expected Completion Date */}
          <FormField
            control={form.control}
            name="expectedCompletionDate"
            render={({ field }) => (
              <FormItem>
                <FormLabel className="flex items-center gap-2 text-base font-medium">
                  <Calendar className="h-4 w-4" />
                  Expected Completion Date{" "}
                  <span className="text-destructive">*</span>
                </FormLabel>
                <FormDescription>
                  When do you expect to complete this project?
                </FormDescription>
                <FormControl>
                  <Input
                    type="date"
                    {...field}
                    value={String(field.value || "")}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </CardContent>
      </Card>

      {/* Project Details Section */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Target className="h-5 w-5 text-primary" />
            Project Details
          </CardTitle>
          <CardDescription>
            Detailed information about your project objectives and
            implementation
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Project Description */}
          <FormField
            control={form.control}
            name="description"
            render={({ field }) => (
              <FormItem>
                <FormLabel className="text-base font-medium">
                  Project Description{" "}
                  <span className="text-destructive">*</span>
                </FormLabel>
                <FormDescription>
                  Explain what your project is about and why it matters
                </FormDescription>
                <FormControl>
                  <Textarea
                    placeholder="Provide a detailed description of your project"
                    rows={4}
                    {...field}
                    value={String(field.value || "")}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <Separator />

          {/* Project Purpose */}
          <FormField
            control={form.control}
            name="purpose"
            render={({ field }) => (
              <FormItem>
                <FormLabel className="text-base font-medium">
                  Project Purpose <span className="text-destructive">*</span>
                </FormLabel>
                <FormDescription>
                  Clearly state the objectives and intended outcomes
                </FormDescription>
                <FormControl>
                  <Textarea
                    placeholder="Describe the purpose and goals of your project"
                    rows={4}
                    {...field}
                    value={String(field.value || "")}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </CardContent>
      </Card>

      {/* Financial Planning Section */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <TrendingUp className="h-5 w-5 text-primary" />
            Financial Planning
          </CardTitle>
          <CardDescription>
            Financial sustainability and long-term planning details
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Refinancing Concept */}
          <FormField
            control={form.control}
            name="refinancingConcept"
            render={({ field }) => (
              <FormItem>
                <FormLabel className="text-base font-medium">
                  Refinancing Concept{" "}
                  <span className="text-destructive">*</span>
                </FormLabel>
                <FormDescription>
                  Detail how the project will be financially sustainable after
                  initial funding
                </FormDescription>
                <FormControl>
                  <Textarea
                    placeholder="Explain your refinancing strategy"
                    rows={4}
                    {...field}
                    value={String(field.value || "")}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <Separator />

          {/* Sustainability Plan */}
          <FormField
            control={form.control}
            name="sustainability"
            render={({ field }) => (
              <FormItem>
                <FormLabel className="flex items-center gap-2 text-base font-medium">
                  <Recycle className="h-4 w-4" />
                  Sustainability Plan{" "}
                  <span className="text-destructive">*</span>
                </FormLabel>
                <FormDescription>
                  Outline the long-term viability and impact of your project
                </FormDescription>
                <FormControl>
                  <Textarea
                    placeholder="Describe how your project will be sustainable in the long term"
                    rows={4}
                    {...field}
                    value={String(field.value || "")}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </CardContent>
      </Card>
    </div>
  );
}
