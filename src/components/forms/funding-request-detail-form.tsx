import { zodResolver } from "@hookform/resolvers/zod";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import FundingRequestPostData from "@/components/forms/funding-request-post-data";
import FormInputControl from "@/components/helper/form-input-control";
import { Button } from "@/components/ui/button";
import { Form } from "@/components/ui/form";
import { toast } from "@/hooks/use-toast";
import { type FileTypes, type FundingRequest, FundingStatus } from "@/types";

const amountOfferSchema = z.object({
  amountAgreed: z.coerce.number(),
});

export default function FundingRequestDetailsForm({
  fundingRequest,
  isTeam,
  refreshData,
}: {
  fundingRequest: FundingRequest;
  isTeam: boolean | undefined;
  refreshData?: () => void;
}) {
  const [data, setData] = useState<FundingRequest>(fundingRequest);

  useEffect(() => {
    setData(fundingRequest);
  }, [fundingRequest]);

  const isFundsTransferred = data.status === FundingStatus.Completed;

  const isFileMissing = (fileType: string) =>
    !isTeam &&
    isFundsTransferred &&
    data.files.filter((file) => file.type === fileType).length === 0;

  const showStatementForm = isFileMissing("STATEMENT");
  const showReportForm = isFileMissing("REPORT");
  const showReceiptForm = isFileMissing("DONATION_RECEIPT");

  const form = useForm({
    resolver: zodResolver(amountOfferSchema),
    defaultValues: {
      amountAgreed: data.amountAgreed || 0,
    },
  });

  async function onSubmit(values: z.infer<typeof amountOfferSchema>) {
    try {
      const response = await fetch(`/api/funding-requests/${data.id}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          ...values,
          status: "Accepted",
          remainingAmount: values.amountAgreed,
        }),
      });

      if (!response.ok) {
        throw new Error("Failed to update funding request");
      }

      await response.json();

      if (refreshData) {
        refreshData();
      }

      toast({
        title: "Success",
        description: "Request Submitted Successfully.",
        variant: "default",
      });
    } catch (e) {
      toast({
        title: "Error",
        description:
          e instanceof Error
            ? e.message
            : "An error occurred while updating the request",
        variant: "destructive",
      });
    }
  }
  return (
    <>
      {isTeam &&
        ![FundingStatus.Completed, FundingStatus.Rejected].includes(
          data.status,
        ) && (
          <div className="flex flex-col items-start gap-2 ">
            {/* <h3 className="text-lg font-semibold">Funding Amount</h3> */}
            <Form {...form}>
              <form
                onSubmit={form.handleSubmit(onSubmit)}
                className="space-y-8"
              >
                <div className="flex items-center  align-middle ">
                  <FormInputControl
                    name="amountAgreed"
                    placeholder="Amount to Offer"
                    type="number"
                    form={form}
                    className="bg-white"
                  />
                  <Button
                    type="submit"
                    className="btn btn-primary align-bottom ml-2"
                    disabled={form.formState.isSubmitting}
                  >
                    Accept Request
                  </Button>
                </div>
              </form>
            </Form>
          </div>

          // add button for uploading the donation agreement.
        )}
      {showReceiptForm && (
        <div className="mt-6 p-4 border rounded-lg bg-blue-50">
          <FundingRequestPostData
            title="Upload Receipt"
            description="Please upload the receipt to confirm the funds transfer. This is required within 7 days of the transfer."
            type={"DONATION_RECEIPT" as FileTypes}
            fundingRequestId={data.id}
          />
        </div>
      )}
      {showReportForm && (
        <FundingRequestPostData
          title="Upload Report"
          description="Upload the funding request report after the 8 weeks period."
          type={"REPORT" as FileTypes}
          fundingRequestId={data.id}
        />
      )}
      {showStatementForm && (
        <FundingRequestPostData
          title="Upload Budget statement"
          description="Upload the budget statement after the 8 weeks period."
          type={"STATEMENT" as FileTypes}
          fundingRequestId={data.id}
        />
      )}
    </>
  );
}