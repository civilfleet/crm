"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { z } from "zod";
import { DataSelectBox } from "@/components/helper/data-select-box";
import formatCurrency from "@/components/helper/format-currency";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { type FundingRequest, FundingStatus } from "@/types";

interface CreateTransactionFormProps {
  fundingRequest?: FundingRequest;
  fundingRequestId?: string;
  teamId?: string;
  refreshData?: () => void;
  defaultOpen?: boolean;
  inline?: boolean;
  cancelHref?: string;
}

const schema = z.object({
  fundingRequestId: z.string().min(1, "Funding request is required"),
  amount: z
    .number()
    .min(0.01, "Amount must be greater than zero")
    .refine((val) => val !== 0, "Amount cannot be zero"),
});

export default function CreateTransaction({
  fundingRequest,
  fundingRequestId,
  teamId,
  refreshData,
  defaultOpen = false,
  inline = false,
  cancelHref,
}: CreateTransactionFormProps) {
  const { toast } = useToast();
  const [isOpen, setIsOpen] = useState(defaultOpen);
  const [isLoading, setIsLoading] = useState(false);
  const [selectedRequestData, setSelectedRequestData] =
    useState<FundingRequest | null>(fundingRequest || null);
  const [remainingAmount, setRemainingAmount] = useState<number>(
    fundingRequest?.remainingAmount || 0,
  );

  const form = useForm<z.infer<typeof schema>>({
    resolver: zodResolver(schema),
    defaultValues: {
      fundingRequestId: fundingRequest?.id || fundingRequestId || "",
      amount: 0,
    },
  });

  // Fetch funding request details
  const fetchFundingRequestDetails = useCallback(
    async (requestId: string) => {
      setIsLoading(true);
      try {
        const response = await fetch(`/api/funding-requests/${requestId}`);
        if (!response.ok) {
          throw new Error(
            `Failed to fetch funding request: ${response.statusText}`,
          );
        }
        const { data } = await response.json();
        console.log("data", data);
        setSelectedRequestData(data);
        setRemainingAmount(data.remainingAmount || 0);
      } catch (error) {
        console.error("Error fetching funding request detail:", error);
        toast({
          title: "Error",
          description: "Failed to fetch funding request details",
          variant: "destructive",
        });
        setSelectedRequestData(null);
      } finally {
        setIsLoading(false);
      }
    },
    [toast],
  );

  // Initialize component with fundingRequest prop data
  useEffect(() => {
    if (fundingRequest?.id) {
      fetchFundingRequestDetails(fundingRequest.id);
      form.setValue("fundingRequestId", fundingRequest.id);
      return;
    }
    if (fundingRequestId) {
      fetchFundingRequestDetails(fundingRequestId);
      form.setValue("fundingRequestId", fundingRequestId);
    }
  }, [fundingRequest, fundingRequestId, form, fetchFundingRequestDetails]);

  // Update remaining amount when amount changes
  const updateRemainingAmount = (amount: number) => {
    if (selectedRequestData) {
      const baseRemaining = (selectedRequestData.remainingAmount || 0) - amount;
      setRemainingAmount(baseRemaining);
    }
  };

  const onSubmit = async (data: z.infer<typeof schema>) => {
    try {
      setIsLoading(true);
      console.log("data", data);
      // Validate funding request exists
      if (!selectedRequestData) {
        toast({
          title: "Error",
          description: "No funding request selected",
          variant: "destructive",
        });
        return;
      }

      // Validate amount doesn't exceed available funds
      const availableAmount = selectedRequestData.amountAgreed || 0;
      if (data.amount > availableAmount) {
        toast({
          title: "Error",
          description: `Amount exceeds available funds (${formatCurrency(availableAmount)})`,
          variant: "destructive",
        });
        return;
      }

      const response = await fetch("/api/transactions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          fundingRequestId: data.fundingRequestId,
          amount: data.amount,
          organizationId: selectedRequestData.organization?.id,
          teamId: selectedRequestData.organization?.teamId,
          totalAmount: selectedRequestData.amountAgreed,
          remainingAmount: remainingAmount,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => null);
        throw new Error(errorData?.message || "Failed to create transaction");
      }

      toast({
        title: "Success",
        description: "Transaction created successfully",
      });

      // Reset and close
      form.reset({ fundingRequestId: fundingRequest?.id || "", amount: 0 });
      setIsOpen(false);

      // Call callback if provided
      if (refreshData) {
        refreshData();
      }
    } catch (error) {
      toast({
        title: "Error",
        description:
          error instanceof Error
            ? error.message
            : "Failed to create transaction",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  return inline ? (
    <Card className="max-w-2xl">
      <CardContent className="pt-6">
        <div className="mb-4">
          <h2 className="text-xl font-semibold">Create Transaction</h2>
          <p className="text-sm text-muted-foreground">
            Allocate funds to a funding request
          </p>
        </div>

        {selectedRequestData && (
          <Card className="mb-4">
            <CardContent className="pt-4">
              <div className="grid grid-cols-2 gap-2 text-sm">
                <span className="font-medium">Request:</span>
                <span>{selectedRequestData.name}</span>
                <span className="font-medium">Requested Amount:</span>
                <span>
                  {formatCurrency(selectedRequestData.amountRequested || 0)}
                </span>
                <span className="font-medium">Approved Amount:</span>
                <span>
                  {formatCurrency(selectedRequestData.amountAgreed || 0)}
                </span>
                <span className="font-medium">Available Balance:</span>
                <span
                  className={
                    remainingAmount < 0
                      ? "text-destructive font-bold"
                      : "text-green-600 font-bold"
                  }
                >
                  {formatCurrency(remainingAmount)}
                </span>
                <span className="font-medium">Status:</span>
                <span>
                  <span className="inline-flex items-center rounded-full bg-blue-100 px-2 py-1 text-xs font-medium text-blue-800">
                    {selectedRequestData.status}
                  </span>
                </span>
              </div>
            </CardContent>
          </Card>
        )}

        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
          {!fundingRequest && !fundingRequestId && (
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="fundingRequestId" className="text-right">
                Request
              </Label>
              <div className="col-span-3">
                <Controller
                  control={form.control}
                  name="fundingRequestId"
                  render={({ field, fieldState }) => (
                    <div className="space-y-2">
                      <DataSelectBox
                        targetKey="id"
                        url={`/api/funding-requests/?teamId=${teamId}&status=${FundingStatus.FundsDisbursing}`}
                        attribute="name"
                        label="Select Funding Request"
                        value={field.value}
                        onChange={async (value) => {
                          field.onChange(value);
                          form.setValue("amount", 0);
                          await fetchFundingRequestDetails(value);
                        }}
                        disabled={isLoading}
                      />
                      {fieldState.error && (
                        <p className="text-sm text-destructive">
                          {fieldState.error.message}
                        </p>
                      )}
                    </div>
                  )}
                />
              </div>
            </div>
          )}

          <div className="grid grid-cols-4 items-center gap-4">
            <Label htmlFor="amount" className="text-right">
              Amount
            </Label>
            <div className="col-span-3">
              <Controller
                control={form.control}
                name="amount"
                render={({ field, fieldState }) => (
                  <div className="space-y-2">
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2">
                        €
                      </span>
                      <Input
                        id="amount"
                        type="number"
                        step="0.01"
                        className="pl-6"
                        value={field.value}
                        onChange={(e) => {
                          const value = parseFloat(e.target.value) || 0;
                          field.onChange(value);
                          updateRemainingAmount(value);
                        }}
                        disabled={isLoading || !selectedRequestData}
                      />
                    </div>
                    {fieldState.error && (
                      <p className="text-sm text-destructive">
                        {fieldState.error.message}
                      </p>
                    )}
                    {remainingAmount < 0 && (
                      <p className="text-sm text-destructive">
                        Amount exceeds available funds
                      </p>
                    )}
                  </div>
                )}
              />
            </div>
          </div>

          <div className="mt-6 flex justify-end gap-2">
            {cancelHref ? (
              <Button asChild type="button" variant="outline">
                <Link href={cancelHref}>Cancel</Link>
              </Button>
            ) : null}
            <Button
              type="submit"
              disabled={
                isLoading || remainingAmount < 0 || !form.formState.isValid
              }
            >
              {isLoading ? "Creating..." : "Create Transaction"}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  ) : (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        <Button variant="outline">Create Transaction</Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle className="text-xl">Create Transaction</DialogTitle>
          <DialogDescription>
            Allocate funds to a funding request
          </DialogDescription>
        </DialogHeader>

        {selectedRequestData && (
          <Card className="mb-4">
            <CardContent className="pt-4">
              <div className="grid grid-cols-2 gap-2 text-sm">
                <span className="font-medium">Request:</span>
                <span>{selectedRequestData.name}</span>
                <span className="font-medium">Requested Amount:</span>
                <span>
                  {formatCurrency(selectedRequestData.amountRequested || 0)}
                </span>
                <span className="font-medium">Approved Amount:</span>
                <span>
                  {formatCurrency(selectedRequestData.amountAgreed || 0)}
                </span>
                <span className="font-medium">Available Balance:</span>
                <span
                  className={
                    remainingAmount < 0
                      ? "text-destructive font-bold"
                      : "text-green-600 font-bold"
                  }
                >
                  {formatCurrency(remainingAmount)}
                </span>
                <span className="font-medium">Status:</span>
                <span>
                  <span className="inline-flex items-center rounded-full bg-blue-100 px-2 py-1 text-xs font-medium text-blue-800">
                    {selectedRequestData.status}
                  </span>
                </span>
              </div>
            </CardContent>
          </Card>
        )}

        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
          {!fundingRequest && !fundingRequestId && (
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="fundingRequestId" className="text-right">
                Request
              </Label>
              <div className="col-span-3">
                <Controller
                  control={form.control}
                  name="fundingRequestId"
                  render={({ field, fieldState }) => (
                    <div className="space-y-2">
                      <DataSelectBox
                        targetKey="id"
                        url={`/api/funding-requests/?teamId=${teamId}&status=${FundingStatus.FundsDisbursing}`}
                        attribute="name"
                        label="Select Funding Request"
                        value={field.value}
                        onChange={async (value) => {
                          field.onChange(value);
                          form.setValue("amount", 0);
                          await fetchFundingRequestDetails(value);
                        }}
                        disabled={isLoading}
                      />
                      {fieldState.error && (
                        <p className="text-sm text-destructive">
                          {fieldState.error.message}
                        </p>
                      )}
                    </div>
                  )}
                />
              </div>
            </div>
          )}

          <div className="grid grid-cols-4 items-center gap-4">
            <Label htmlFor="amount" className="text-right">
              Amount
            </Label>
            <div className="col-span-3">
              <Controller
                control={form.control}
                name="amount"
                render={({ field, fieldState }) => (
                  <div className="space-y-2">
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2">
                        €
                      </span>
                      <Input
                        id="amount"
                        type="number"
                        step="0.01"
                        className="pl-6"
                        value={field.value}
                        onChange={(e) => {
                          const value = parseFloat(e.target.value) || 0;
                          field.onChange(value);
                          updateRemainingAmount(value);
                        }}
                        disabled={isLoading || !selectedRequestData}
                      />
                    </div>
                    {fieldState.error && (
                      <p className="text-sm text-destructive">
                        {fieldState.error.message}
                      </p>
                    )}
                    {remainingAmount < 0 && (
                      <p className="text-sm text-destructive">
                        Amount exceeds available funds
                      </p>
                    )}
                  </div>
                )}
              />
            </div>
          </div>

          <DialogFooter className="mt-6">
            <Button
              type="button"
              variant="outline"
              onClick={() => setIsOpen(false)}
              disabled={isLoading}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={
                isLoading || remainingAmount < 0 || !form.formState.isValid
              }
            >
              {isLoading ? "Creating..." : "Create Transaction"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}