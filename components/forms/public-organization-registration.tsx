"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import type { z } from "zod";
import FileUpload from "@/components/file-uploader";
import ButtonControl from "@/components/helper/button-control";
import FormInputControl from "@/components/helper/form-input-control";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Form } from "@/components/ui/form";
import { useToast } from "@/hooks/use-toast";
import { createOrganizationSchema } from "@/validations/organizations";

type PublicOrganizationRegistrationProps = {
  teamId: string;
};

export default function PublicOrganizationRegistration({
  teamId,
}: PublicOrganizationRegistrationProps) {
  const router = useRouter();
  const { toast } = useToast();
  const [teamName, setTeamName] = useState<string>("");
  const [strategicPriorities, setStrategicPriorities] = useState<string>("");
  const [registrationPageLogoKey, setRegistrationPageLogoKey] = useState("");
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    async function fetchTeamData() {
      try {
        const response = await fetch(`/api/public/teams/${teamId}`);
        if (!response.ok) {
          router.replace("/");
          throw new Error("Team not found");
        }
        const data = await response.json();
        setTeamName(data.name);
        setStrategicPriorities(data.strategicPriorities || "");
        setRegistrationPageLogoKey(data.registrationPageLogoKey || "");
      } catch (_error) {
        toast({
          title: "Error",
          description: "Team not found",
          variant: "destructive",
        });
      } finally {
        setIsLoading(false);
      }
    }

    fetchTeamData();
  }, [teamId, toast, router]);

  const form = useForm<z.infer<typeof createOrganizationSchema>>({
    resolver: zodResolver(createOrganizationSchema),
    defaultValues: {
      email: "",
      name: "",
      phone: "",
      address: "",
      city: "",
      country: "",
      postalCode: "",
      website: "",
      taxExemptionCertificate: "",
      articlesOfAssociation: "",
      taxID: "",
      logo: "",
      bankDetails: {
        bankName: "",
        accountHolder: "",
        iban: "",
        bic: "",
      },
      user: {
        name: "",
        email: "",
        phone: "",
      },
    },
  });

  async function onSubmit(values: z.infer<typeof createOrganizationSchema>) {
    try {
      const response = await fetch("/api/organizations", {
        method: "POST",
        body: JSON.stringify({
          ...values,
          isFilledByOrg: true,
          teamId,
        }),
      });

      if (!response.ok) {
        toast({
          title: "Error",
          description: response?.statusText,
          variant: "destructive",
        });
        return;
      }

      await response.json();
      toast({
        title: "Success",
        description:
          "Your organization registration request has been submitted. We will review it and get back to you soon.",
        variant: "default",
      });

      // Reset form
      form.reset();
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
      <div className="container mx-auto py-10">
        <Card className="max-w-4xl mx-auto">
          <CardContent className="py-10">
            <div className="text-center">Loading...</div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="container mx-auto py-10">
      <Card className="max-w-4xl mx-auto">
        <CardHeader>
          {registrationPageLogoKey ? (
            <div className="mb-2">
              <Image
                src={`/api/public/teams/${teamId}/logo`}
                alt={`${teamName} logo`}
                width={160}
                height={160}
                className="h-16 w-auto max-w-40 object-contain"
                unoptimized
              />
            </div>
          ) : null}
          <CardTitle>Register Your Organization with {teamName}</CardTitle>
          <CardDescription>
            Please fill out the form below to request an organization account
            with {teamName}. We will review your application and get back to you
            soon.
          </CardDescription>
          {strategicPriorities && (
            <div className="mt-4 p-4 bg-muted/50 rounded-lg border">
              <h3 className="font-semibold text-sm text-muted-foreground mb-2">
                About {teamName}
              </h3>
              <div className="text-sm whitespace-pre-wrap text-foreground">
                {strategicPriorities}
              </div>
            </div>
          )}
        </CardHeader>
        <CardContent>
          <fieldset disabled={form.formState.isSubmitting}>
            <Form {...form}>
              <form
                onSubmit={form.handleSubmit(onSubmit)}
                className="space-y-8"
                id="organization-registration-form"
              >
                <div className="grid grid-cols-2 gap-4">
                  <FormInputControl
                    form={form}
                    name="name"
                    placeholder="Organization name"
                  />
                  <FormInputControl
                    form={form}
                    name="email"
                    placeholder="Email address *"
                  />
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
                  <FormInputControl
                    form={form}
                    name="city"
                    placeholder="City"
                  />
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
                  <FormInputControl
                    form={form}
                    name="taxID"
                    placeholder="Tax ID"
                  />
                  <FormInputControl
                    form={form}
                    name="taxExemptionCertificate"
                    placeholder="Tax exemption certificate"
                  />
                  <FormInputControl
                    form={form}
                    name="articlesOfAssociation"
                    placeholder="Articles of association"
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <FormInputControl
                    form={form}
                    name="bankDetails.bankName"
                    placeholder="Bank name"
                  />
                  <FormInputControl
                    form={form}
                    name="bankDetails.accountHolder"
                    placeholder="Account holder"
                  />
                  <FormInputControl
                    form={form}
                    name="bankDetails.iban"
                    placeholder="IBAN"
                  />
                  <FormInputControl
                    form={form}
                    name="bankDetails.bic"
                    placeholder="BIC"
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <FormInputControl
                    form={form}
                    name="user.name"
                    placeholder="Contact name"
                  />
                  <FormInputControl
                    form={form}
                    name="user.email"
                    placeholder="Contact email"
                  />
                  <FormInputControl
                    form={form}
                    name="user.phone"
                    placeholder="Contact phone"
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-4">
                    <FileUpload
                      label="Organization logo"
                      onFileUpload={(fileUrl) => form.setValue("logo", fileUrl)}
                    />
                    <FileUpload
                      label="Tax exemption certificate"
                      onFileUpload={(fileUrl) =>
                        form.setValue("taxExemptionCertificate", fileUrl)
                      }
                    />
                    <FileUpload
                      label="Articles of association"
                      onFileUpload={(fileUrl) =>
                        form.setValue("articlesOfAssociation", fileUrl)
                      }
                    />
                  </div>
                </div>

                <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                  <ButtonControl
                    loading={form.formState.isSubmitting}
                    label="Submit registration request"
                    type="submit"
                    className="w-full sm:w-auto"
                  />
                  <Link href="/" className="text-sm text-muted-foreground">
                    Back to home
                  </Link>
                </div>
              </form>
            </Form>
          </fieldset>
        </CardContent>
      </Card>
    </div>
  );
}