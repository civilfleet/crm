"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { CheckCircle, CreditCard, Download, Upload } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { useForm } from "react-hook-form";
import type { z } from "zod";
import FileUpload from "@/components/file-uploader";
import {
  donationPayoutStatusLabelMap,
  getDonationPayoutStatus,
} from "@/components/helper/status-badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Form } from "@/components/ui/form";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import { type DonationAgreement, FundingStatus, Roles } from "@/types";
import { updateDonationAgreementSchema as schema } from "@/validations/donation-agreement";
import DetailItem from "../helper/detail-item";
import formatCurrency from "../helper/format-currency";

export default function SignDonationAgreement({
  data: initialData,
  teamId,
  userId,
  userRoles,
}: {
  data: DonationAgreement;
  teamId?: string;
  userId?: string | null;
  userRoles?: Roles[];
}) {
  const { toast } = useToast();
  const isAdmin = userRoles?.includes(Roles.Admin);

  const [data, setData] = useState<DonationAgreement>(initialData);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [selectedUserId, setSelectedUserId] = useState<string>("");

  const currentUserSignature = data.userSignatures.find(
    (signature) => signature.user?.id === userId,
  );
  const canCurrentUserSign = Boolean(
    currentUserSignature && !currentUserSignature.signedAt,
  );

  const isFundsCompleted =
    data.fundingRequest?.status === FundingStatus.Completed;
  const signaturesCompleted = data.userSignatures.every(
    (signature) => signature?.signedAt,
  );
  const payoutStatus = getDonationPayoutStatus({
    fundingStatus: data.fundingRequest?.status,
    amountAgreed:
      data.fundingRequest?.amountAgreed !== undefined &&
      data.fundingRequest?.amountAgreed !== null
        ? Number(data.fundingRequest.amountAgreed)
        : null,
    remainingAmount:
      data.fundingRequest?.remainingAmount !== undefined &&
      data.fundingRequest?.remainingAmount !== null
        ? Number(data.fundingRequest.remainingAmount)
        : null,
  });

  const form = useForm<z.infer<typeof schema>>({
    resolver: zodResolver(schema),
    defaultValues: {
      file: "",
    },
  });

  const refreshData = async () => {
    try {
      const response = await fetch(`/api/donation-agreements/${data.id}`);
      if (!response.ok) {
        throw new Error("Failed to fetch updated data");
      }
      const { data: updatedData } = await response.json();
      setData(updatedData);
    } catch (error) {
      console.error("Error refreshing data:", error);
    }
  };

  async function onSubmit(values: z.infer<typeof schema>) {
    if (!isAdmin && !userId) {
      toast({
        title: "Error",
        description: "You must be logged in to sign this agreement.",
        variant: "destructive",
      });
      return;
    }

    if (!isAdmin && !canCurrentUserSign) {
      toast({
        title: "Not Authorized",
        description:
          "You are not assigned to sign this agreement. Please ask a team admin to sign on behalf of an assigned user.",
        variant: "destructive",
      });
      return;
    }

    setIsSubmitting(true);
    try {
      const response = await fetch(`/api/donation-agreements/${data.id}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          ...values,
          id: data.id,
          userId: isAdmin ? selectedUserId : userId,
        }),
      });
      if (!response.ok) {
        const errorData = await response.json().catch(() => null);
        throw new Error(
          errorData?.error ||
            errorData?.message ||
            "Failed to update donation agreement",
        );
      }

      await refreshData();

      toast({
        title: "Success",
        description: "Donation Agreement information updated",
        variant: "default",
      });
    } catch (e) {
      toast({
        title: "Error",
        description: (e as Error).message,
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <Card className="w-full max-w-3xl ">
      <CardHeader>
        <CardTitle className="text-3xl">Sign Donation Agreement</CardTitle>
        <CardDescription>
          Review and sign the donation agreement
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Form {...form}>
          <form
            onSubmit={form.handleSubmit(onSubmit)}
            className="space-y-8"
            id="organization-form"
          >
            <div className="space-y-6">
              <div>
                <h2 className="text-lg font-semibold mb-2">
                  Funding Request Details
                </h2>
                <div className="grid grid-cols-2 gap-4">
                  <DetailItem
                    label="Funding Request Name"
                    value={data.fundingRequest?.name}
                  />
                  <DetailItem
                    label="Purpose"
                    value={data.fundingRequest?.purpose}
                  />
                  <DetailItem
                    label="Agreed Amount"
                    value={
                      data.fundingRequest?.amountAgreed !== undefined &&
                      data.fundingRequest?.amountAgreed !== null
                        ? formatCurrency(
                            Number(data.fundingRequest.amountAgreed),
                          )
                        : "Not set"
                    }
                  />
                  <DetailItem
                    label="Payout"
                    value={donationPayoutStatusLabelMap[payoutStatus]}
                  />
                </div>
              </div>

              <Separator />

              <div>
                <h2 className="text-lg font-semibold mb-2">
                  Agreement Details
                </h2>
                <div className="bg-muted p-4 rounded-md">
                  <p className="text-sm whitespace-pre-wrap">
                    {data.agreement}
                  </p>
                </div>
                <div className="grid grid-cols-2 gap-4 mt-4">
                  <DetailItem
                    label="Created At"
                    value={new Date(data.createdAt).toLocaleString()}
                  />
                  <DetailItem
                    label="Updated At"
                    value={new Date(data.updatedAt).toLocaleString()}
                  />
                </div>
              </div>

              <Separator />

              <div>
                <h2 className="text-lg font-semibold mb-2">Created By</h2>
                <div className="grid grid-cols-2 gap-4">
                  <DetailItem label="Name" value={data.createdBy?.name} />
                  <DetailItem
                    label="Email"
                    value={data.createdBy?.email}
                    type="email"
                  />
                </div>
              </div>

              <Separator />

              <div>
                <h2 className="text-lg font-semibold mb-2">Agreement File</h2>
                <p className="text-sm text-muted-foreground mb-2">
                  Please download the agreement, sign it, and re-upload it.
                </p>
                {data.file?.url && (
                  <Button asChild variant="outline" size="sm">
                    <Link
                      href={`${process.env.NEXT_PUBLIC_BASE_URL}/api/files/${data.file?.id}`}
                    >
                      <Download className="mr-2 h-4 w-4" />
                      Download Agreement
                    </Link>
                  </Button>
                )}
              </div>

              <Separator />

              <div>
                <h2 className="text-lg font-semibold mb-2">User Signatures</h2>
                {data.userSignatures.length > 0 ? (
                  <div className="space-y-2">
                    {data.userSignatures.map((signature, index) => (
                      // Some signature rows can arrive without a stable id in dev snapshots.
                      // Fall back to user identity + index to keep React keys unique.
                      <div
                        key={
                          signature.id ||
                          `${signature.user?.id || signature.user?.email || "signature"}-${index}`
                        }
                        className="flex items-center justify-between bg-muted p-2 rounded-md"
                      >
                        <span className="text-sm font-medium">
                          {signature.user?.email}
                        </span>
                        {signature.signedAt && (
                          <div className="flex items-center text-green-600">
                            <CheckCircle className="w-4 h-4 mr-1" />
                            <span className="text-xs">
                              {new Date(signature.signedAt).toLocaleString()}
                            </span>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">
                    No signatures yet.
                  </p>
                )}
              </div>

              <Separator />
              {!signaturesCompleted && (
                <div>
                  <h2 className="text-lg font-semibold mb-2">
                    Upload Signed Agreement
                  </h2>
                  {!isAdmin && !canCurrentUserSign && (
                    <p className="text-sm text-destructive mb-4">
                      You are not assigned as a signer for this agreement.
                    </p>
                  )}
                  {isAdmin && (
                    <div className="mb-4">
                      <label
                        className="text-sm font-medium mb-2 block"
                        htmlFor="sign-on-behalf"
                      >
                        Sign on behalf of:
                      </label>
                      <Select
                        value={selectedUserId}
                        onValueChange={setSelectedUserId}
                      >
                        <SelectTrigger id="sign-on-behalf">
                          <SelectValue placeholder="Select user to sign for" />
                        </SelectTrigger>
                        <SelectContent>
                          {data.userSignatures.map((signature, index) => (
                            <SelectItem
                              key={
                                signature.id ||
                                `${signature.user?.id || signature.user?.email || "signature"}-${index}`
                              }
                              value={signature.user?.id || ""}
                              disabled={signature.signedAt !== null}
                            >
                              {signature.user?.email}
                              {signature.signedAt && " (Already signed)"}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  )}
                  <FileUpload
                    placeholder="Drag and drop or click to upload"
                    name="file"
                    data={""}
                    onFileUpload={(url) => form.setValue("file", url)}
                  />
                </div>
              )}
            </div>
          </form>
        </Form>
      </CardContent>
      <CardFooter>
        {!signaturesCompleted && (
          <Button
            type="submit"
            form="organization-form"
            disabled={
              isSubmitting || (isAdmin ? !selectedUserId : !canCurrentUserSign)
            }
          >
            <Upload className="mr-2 h-4 w-4" />
            {isAdmin
              ? "Submit Signed Agreement on Behalf of User"
              : "Submit Signed Agreement"}
          </Button>
        )}

        {signaturesCompleted && teamId && !isFundsCompleted && (
          <Button asChild type="button" className="m-2">
            <Link
              href={`/teams/${teamId}/funding/transactions/create?fundingRequestId=${data.fundingRequestId}`}
            >
              <CreditCard className="mr-2 h-5 w-5" />
              Disburse Funds
            </Link>
          </Button>
        )}

        {signaturesCompleted && isFundsCompleted && (
          <Button type="button" className="m-2" disabled>
            <CreditCard className="mr-2 h-5 w-5" />
            Funds Disbursed
          </Button>
        )}
      </CardFooter>
    </Card>
  );
}