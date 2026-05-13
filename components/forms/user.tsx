"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useForm } from "react-hook-form";
import type { z } from "zod";
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
import { toast } from "@/hooks/use-toast";
import { createUserSchema } from "@/validations/organizations";

export default function UserForm({
  teamId,
  organizationId,
}: {
  teamId: string;
  organizationId: string;
}) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const router = useRouter();
  const form = useForm<z.infer<typeof createUserSchema>>({
    resolver: zodResolver(createUserSchema),
    defaultValues: {
      name: "",
      email: "",
      phone: "",
    },
  });

  const returnPath = teamId
    ? `/teams/${teamId}/users`
    : organizationId
      ? `/organizations/${organizationId}/users`
      : undefined;

  const handleCancel = () => {
    form.reset();
    if (returnPath) {
      router.push(returnPath);
    } else {
      router.back();
    }
  };

  async function onSubmit(values: z.infer<typeof createUserSchema>) {
    setIsSubmitting(true);

    try {
      const response = await fetch(`/api/users`, {
        method: "POST",
        body: JSON.stringify({ ...values, teamId, organizationId }),
        headers: {
          "Content-Type": "application/json",
        },
      });

      if (!response.ok) {
        throw new Error(response.statusText || "Failed to invite user");
      }

      await response.json();

      toast({
        title: "User invited",
        description: `${values.name} has been successfully invited to your team.`,
        variant: "default",
      });

      form.reset();

      if (teamId) {
        router.push(`/teams/${teamId}/users`);
      } else if (organizationId) {
        router.push(`/organizations/${organizationId}/users`);
      }
    } catch (error) {
      toast({
        title: "Error inviting user",
        description:
          error instanceof Error
            ? error.message
            : "An unexpected error occurred",
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <Card className="w-full shadow-xs">
      <CardHeader className="border-b pb-3">
        <CardTitle className="text-xl font-semibold">
          Invite Team Member
        </CardTitle>
        <CardDescription>
          Enter the details of the team member you want to invite to your
          organization
        </CardDescription>
      </CardHeader>

      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)}>
          <CardContent className="pt-6">
            <div className="space-y-6">
              <div>
                <h3 className="text-sm font-medium text-muted-foreground mb-3">
                  Personal Information
                </h3>
                <div className="grid gap-4 sm:grid-cols-2">
                  <FormField
                    control={form.control}
                    name="name"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Full Name</FormLabel>
                        <FormControl>
                          <Input
                            placeholder="Full name"
                            {...field}
                            value={field.value || ""}
                          />
                        </FormControl>
                        <FormDescription>e.g., John Doe</FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="email"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Email Address</FormLabel>
                        <FormControl>
                          <Input
                            placeholder="Email address"
                            type="email"
                            {...field}
                            value={field.value || ""}
                          />
                        </FormControl>
                        <FormDescription>
                          e.g., john.doe@example.com
                        </FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="phone"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Phone Number</FormLabel>
                        <FormControl>
                          <Input
                            placeholder="Phone number"
                            {...field}
                            value={field.value || ""}
                          />
                        </FormControl>
                        <FormDescription>
                          e.g., +1 (555) 123-4567
                        </FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
              </div>

              <Separator />
            </div>
          </CardContent>

          <CardFooter className="flex justify-end border-t pt-4">
            <Button
              type="button"
              variant="outline"
              className="mr-2"
              disabled={isSubmitting}
              onClick={handleCancel}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Inviting...
                </>
              ) : (
                "Invite User"
              )}
            </Button>
          </CardFooter>
        </form>
      </Form>
    </Card>
  );
}