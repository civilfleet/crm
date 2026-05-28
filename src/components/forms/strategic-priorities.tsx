"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import FileUpload from "@/components/file-uploader";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import ButtonControl from "../helper/button-control";
import { Button } from "../ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "../ui/card";

const strategicPrioritiesSchema = z.object({
  strategicPriorities: z.string().optional(),
  registrationPageLogoKey: z.string().optional(),
});

interface StrategicPrioritiesFormProps {
  teamId: string;
}

export default function StrategicPrioritiesForm({
  teamId,
}: StrategicPrioritiesFormProps) {
  const { toast } = useToast();
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(true);

  const form = useForm<z.infer<typeof strategicPrioritiesSchema>>({
    resolver: zodResolver(strategicPrioritiesSchema),
    defaultValues: {
      strategicPriorities: "",
      registrationPageLogoKey: "",
    },
  });

  useEffect(() => {
    async function fetchTeamData() {
      try {
        const response = await fetch(`/api/teams/${teamId}`);
        if (response.ok) {
          const data = await response.json();
          form.reset({
            strategicPriorities: data.strategicPriorities || "",
            registrationPageLogoKey: data.registrationPageLogoKey || "",
          });
        }
      } catch (error) {
        console.error("Error fetching team data:", error);
      } finally {
        setIsLoading(false);
      }
    }

    fetchTeamData();
  }, [teamId, form]);

  async function onSubmit(values: z.infer<typeof strategicPrioritiesSchema>) {
    try {
      const response = await fetch(`/api/teams/${teamId}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(values),
      });

      const data = await response.json();

      if (!response.ok) {
        toast({
          title: "Error",
          description: data.error || response.statusText,
          variant: "destructive",
        });
        return;
      }

      toast({
        title: "Success",
        description: "Strategic priorities updated successfully",
        variant: "default",
      });

      router.refresh();
    } catch (e) {
      toast({
        title: "Error",
        description: (e as Error).message,
        variant: "destructive",
      });
    }
  }

  if (isLoading) {
    return (
      <Card className="w-full">
        <CardContent className="py-6">
          <div className="text-center">Loading...</div>
        </CardContent>
      </Card>
    );
  }

  const registrationPageLogoKey = form.watch("registrationPageLogoKey");

  return (
    <Card className="w-full">
      <CardHeader>
        <CardTitle>Registration Page Information</CardTitle>
        <CardDescription>
          Configure the text that appears on your public registration page to
          inform organizations about your strategic priorities and available
          grants.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
            <FormField
              control={form.control}
              name="strategicPriorities"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Strategic Priorities & Available Grants</FormLabel>
                  <FormControl>
                    <Textarea
                      placeholder="Enter information about your team's strategic priorities, available grants, and any other details organizations should know when registering..."
                      className="min-h-[150px]"
                      {...field}
                      value={field.value || ""}
                    />
                  </FormControl>
                  <FormMessage />
                  <p className="text-sm text-muted-foreground">
                    This text will be displayed prominently at the top of your
                    public registration page to help organizations understand
                    your focus areas and available funding opportunities.
                  </p>
                </FormItem>
              )}
            />

            <FormItem>
              <FormLabel>Registration Page Logo</FormLabel>
              <div className="space-y-3">
                <FileUpload
                  label="Upload organization logo"
                  onFileUpload={(fileUrl) => {
                    form.setValue("registrationPageLogoKey", fileUrl, {
                      shouldDirty: true,
                    });
                  }}
                />
                {registrationPageLogoKey ? (
                  <div className="flex items-center gap-3 rounded-md border p-3">
                    <Image
                      src={`/api/public/teams/${teamId}/logo`}
                      alt="Registration page logo preview"
                      width={56}
                      height={56}
                      className="h-14 w-14 rounded-md object-contain bg-background"
                      unoptimized
                    />
                    <div className="flex-1 text-sm text-muted-foreground break-all">
                      Current logo: {registrationPageLogoKey}
                    </div>
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() =>
                        form.setValue("registrationPageLogoKey", "", {
                          shouldDirty: true,
                        })
                      }
                    >
                      Remove
                    </Button>
                  </div>
                ) : null}
              </div>
              <p className="text-sm text-muted-foreground">
                This logo is shown at the top of your public registration page.
              </p>
            </FormItem>

            <ButtonControl
              className="w-32"
              type="submit"
              disabled={form.formState.isSubmitting}
              label="Save Changes"
            />
          </form>
        </Form>
      </CardContent>
    </Card>
  );
}
