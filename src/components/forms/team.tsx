"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { useForm } from "react-hook-form";
import type { z } from "zod";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { createTeamSchema } from "@/validations/team";
import ButtonControl from "../helper/button-control";
import FormInputControl from "../helper/form-input-control";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "../ui/card";

interface TeamFormProps {
  team?: {
    id: string;
    name: string;
    email: string;
    loginDomain?: string | null;
    loginMethod?: "EMAIL_MAGIC_LINK" | "OIDC" | null;
    oidcIssuer?: string | null;
    oidcClientId?: string | null;
    hasOidcClientSecret?: boolean;
    phone: string | null;
    address: string | null;
    postalCode: string | null;
    city: string | null;
    country: string | null;
    website: string | null;
    bankDetails?: {
      bankName: string | null;
      accountHolder: string | null;
      iban: string | null;
      bic: string | null;
    } | null;
    users?: {
      name: string | null;
      email: string | null;
      phone: string | null;
      address: string | null;
    }[];
  };
}

export default function TeamForm({ team }: TeamFormProps) {
  const { toast } = useToast();
  const router = useRouter();

  const form = useForm<z.infer<typeof createTeamSchema>>({
    resolver: zodResolver(createTeamSchema),
    defaultValues: {
      name: "",
      email: "",
      loginDomain: "",
      loginMethod: "EMAIL_MAGIC_LINK",
      oidcIssuer: "",
      oidcClientId: "",
      oidcClientSecret: "",
      phone: "",
      address: "",
      city: "",
      country: "",
      postalCode: "",
      website: "",
      user: {
        name: "",
        email: "",
        phone: "",
        address: "",
      },
    },
  });

  useEffect(() => {
    if (team) {
      form.reset({
        name: team.name || "",
        email: team.email || "",
        loginDomain: team.loginDomain || "",
        loginMethod: team.loginMethod || "EMAIL_MAGIC_LINK",
        oidcIssuer: team.oidcIssuer || "",
        oidcClientId: team.oidcClientId || "",
        oidcClientSecret: "",
        phone: team.phone || "",
        address: team.address || "",
        city: team.city || "",
        country: team.country || "",
        postalCode: team.postalCode || "",
        website: team.website || "",
        user: {
          name: team.users?.[0]?.name || "",
          email: team.users?.[0]?.email || "",
          phone: team.users?.[0]?.phone || "",
          address: team.users?.[0]?.address || "",
        },
      });
    }
  }, [team, form]);

  async function onSubmit(values: z.infer<typeof createTeamSchema>) {
    try {
      const url = team ? `/api/teams/${team.id}` : "/api/teams";
      const method = team ? "PATCH" : "POST";
      const payload = {
        ...values,
        loginDomain: values.loginDomain?.trim() || undefined,
        oidcIssuer: values.oidcIssuer?.trim() || undefined,
        oidcClientId: values.oidcClientId?.trim() || undefined,
        oidcClientSecret: values.oidcClientSecret?.trim() || undefined,
      };

      const response = await fetch(url, {
        method,
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
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
        description: team
          ? "Team information updated"
          : "Team information created",
        variant: "default",
      });

      if (!team) {
        // Redirect to the newly created team
        router.push(`/teams/${data.id}`);
      } else {
        router.refresh();
      }
    } catch (e) {
      toast({
        title: "Error",
        description: (e as Error).message,
        variant: "destructive",
      });
    }
  }

  return (
    <Card className="w-full">
      <CardHeader>
        <CardTitle>{team ? "Edit Team" : "Create New Team"}</CardTitle>
        <CardDescription>
          {team
            ? "Update team information below"
            : "Please create a new team below"}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Form {...form}>
          <form
            onSubmit={form.handleSubmit(onSubmit)}
            className="space-y-8"
            id="Team-form"
          >
            <div className="grid grid-cols-2 gap-4">
              <FormInputControl
                form={form}
                name="name"
                placeholder="Team name"
              />
              <FormInputControl
                form={form}
                name="email"
                placeholder="Email address"
              />
              <FormInputControl
                form={form}
                name="loginDomain"
                placeholder="Login domain (e.g. @example.org)"
              />
              <FormField
                control={form.control}
                name="loginMethod"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Login method</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Select login method" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="EMAIL_MAGIC_LINK">
                          Email magic link
                        </SelectItem>
                        <SelectItem value="OIDC">OIDC</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormInputControl
                form={form}
                name="oidcIssuer"
                placeholder="OIDC issuer (https://idp.example.com)"
              />
              <FormInputControl
                form={form}
                name="oidcClientId"
                placeholder="OIDC client ID"
              />
              <FormInputControl
                form={form}
                name="oidcClientSecret"
                placeholder="OIDC client secret"
                type="password"
              />
              {team?.hasOidcClientSecret && (
                <p className="col-span-2 -mt-2 text-xs text-muted-foreground">
                  Leave OIDC client secret empty to keep the existing secret.
                </p>
              )}
              <FormInputControl
                form={form}
                name="phone"
                placeholder="Phone number"
              />
              <FormInputControl
                form={form}
                name="address"
                placeholder="Street address"
              />

              <FormInputControl form={form} name="city" placeholder="City" />
              <FormInputControl
                form={form}
                name="country"
                placeholder="Country"
              />
              <FormInputControl
                form={form}
                name="postalCode"
                placeholder="Postal code"
              />
              <FormInputControl
                form={form}
                name="website"
                placeholder="Website"
              />
            </div>

            <h4 className="text-lg font-semibold">
              User Person
              <hr />
            </h4>
            <div className="grid grid-cols-2 gap-4">
              <FormInputControl
                form={form}
                name="user.name"
                placeholder="User person name"
              />
              <FormInputControl
                form={form}
                name="user.email"
                placeholder="User person email"
              />
              <FormInputControl
                form={form}
                name="user.phone"
                placeholder="User person phone"
              />
              <FormInputControl
                form={form}
                name="user.address"
                placeholder="User person address"
              />
            </div>

            <ButtonControl
              className="w-24"
              type="submit"
              disabled={form.formState.isSubmitting}
            />
          </form>
        </Form>
      </CardContent>
    </Card>
  );
}