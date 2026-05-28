"use client";

import { format } from "date-fns";
import { AlertTriangle, CheckCircle2, Clock, FileText } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import FundingRequestDetailsForm from "@/components/forms/funding-request-detail-form";
import formatCurrency from "@/components/helper/format-currency";
import { StatusBadge } from "@/components/helper/status-badge";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { type FundingRequest, FundingStatus } from "@/types";

interface FundingRequestHeaderProps {
  data: FundingRequest;
  teamId?: string;
  organizationId?: string;
  isTeam?: boolean;
  refreshData: () => void;
}

export default function FundingRequestHeader({
  data,
  isTeam,
  refreshData,
}: FundingRequestHeaderProps) {
  const router = useRouter();
  const { toast } = useToast();
  const [isRejecting, setIsRejecting] = useState(false);
  const [isTransferring, setIsTransferring] = useState(false);
  const [currentStatus, setCurrentStatus] = useState<FundingStatus>(
    data?.status,
  );

  const teamId = data?.organization?.teamId;
  const organizationId = data?.organization?.id;
  const showRejectButton =
    isTeam &&
    ![
      FundingStatus.Completed,
      FundingStatus.Rejected,
      FundingStatus.Approved,
    ].includes(currentStatus);

  const statusColors = {
    Submitted: "bg-amber-50 border-amber-200",
    Accepted: "bg-blue-50 border-blue-200",
    WaitingForSignature: "bg-indigo-50 border-indigo-200",
    Approved: "bg-emerald-50 border-emerald-200",
    FundsDisbursing: "bg-violet-50 border-violet-200",
    Completed: "bg-green-50 border-green-200",
    Rejected: "bg-rose-50 border-rose-200",
    default: "bg-gray-50 border-gray-200",
  };

  const getStatusColor = () =>
    statusColors[currentStatus] || statusColors.default;

  async function updateStatus(newStatus: FundingStatus) {
    const isRejecting = newStatus === FundingStatus.Rejected;
    const isTransferring = newStatus === FundingStatus.FundsDisbursing;

    if (isRejecting) setIsRejecting(true);
    if (isTransferring) setIsTransferring(true);

    try {
      const response = await fetch(`/api/funding-requests/${data.id}/status`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          status: newStatus,
          teamId,
        }),
      });

      if (!response.ok)
        throw new Error(`Failed to update status to ${newStatus}`);

      const { data: updatedData } = await response.json();
      setCurrentStatus(updatedData.status);
      refreshData();

      toast({
        title: "Status Updated",
        description: `The funding request status has been updated to ${newStatus}.`,
        variant: "default",
      });
    } catch (e) {
      toast({
        title: "Error",
        description:
          e instanceof Error
            ? e.message
            : "An error occurred while updating the status",
        variant: "destructive",
      });
    } finally {
      if (isRejecting) setIsRejecting(false);
      if (isTransferring) setIsTransferring(false);
    }
  }

  return (
    <div
      className={`shadow-lg ${getStatusColor()} rounded-xl p-8 mb-8 dark:bg-gray-900`}
    >
      <div className="space-y-8">
        <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-6">
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <h1 className="text-3xl font-bold tracking-tight">
                Funding Request
              </h1>
              <StatusBadge status={currentStatus} />
            </div>
            <p className="text-muted-foreground flex items-center gap-2">
              <Clock className="h-4 w-4" />
              Submitted on {format(new Date(data.createdAt), "MMMM d, yyyy")}
            </p>
          </div>

          {currentStatus !== "Submitted" && currentStatus !== "Rejected" && (
            <div className="w-full lg:w-auto p-4 bg-muted/10 rounded-lg border border-muted/20">
              <p className="text-sm font-medium text-muted-foreground">
                Agreed Amount
              </p>
              <p className="text-2xl font-bold text-primary mt-1">
                {data.amountAgreed
                  ? formatCurrency(data.amountAgreed)
                  : "Not Set"}
              </p>
            </div>
          )}
        </div>

        <div className="flex flex-col lg:flex-row gap-4 justify-between items-stretch lg:items-center">
          {currentStatus === "Submitted" && (
            <div className="w-full lg:w-1/2">
              <FundingRequestDetailsForm
                fundingRequest={data}
                isTeam={isTeam}
                refreshData={refreshData}
              />
            </div>
          )}

          <div className="flex flex-wrap gap-3 justify-end">
            {showRejectButton && (
              <Button
                variant="destructive"
                onClick={() => updateStatus(FundingStatus.Rejected)}
                disabled={isRejecting}
                className="w-full sm:w-auto"
              >
                {isRejecting ? (
                  <>
                    <span className="mr-2">Rejecting</span>
                    <Clock className="h-4 w-4 animate-spin" />
                  </>
                ) : (
                  <>
                    <AlertTriangle className="h-4 w-4 mr-2" />
                    Reject Request
                  </>
                )}
              </Button>
            )}

            {currentStatus === FundingStatus.Approved && (
              <Button
                variant="default"
                className="w-full sm:w-auto"
                onClick={() => updateStatus(FundingStatus.FundsDisbursing)}
                disabled={isTransferring}
              >
                {isTransferring ? (
                  <>
                    <span className="mr-2">Updating</span>
                    <Clock className="h-4 w-4 animate-spin" />
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="h-4 w-4 mr-2" />
                    Transfer Funds
                  </>
                )}
              </Button>
            )}

            {currentStatus === FundingStatus.Accepted &&
              !data?.donationAgreement?.[0]?.id &&
              isTeam && (
                <Button
                  variant="outline"
                  onClick={() =>
                    router.push(
                      `/teams/${teamId}/funding/donation-agreements/create?fundingRequestId=${data.id}`,
                    )
                  }
                  className="w-full sm:w-auto"
                >
                  <FileText className="h-4 w-4 mr-2" />
                  Create Donation Agreement
                </Button>
              )}

            {data?.donationAgreement?.[0]?.id && (
              <Button
                variant="default"
                className="w-full sm:w-auto"
                onClick={() => {
                  const isOrgPath =
                    window.location.pathname.includes("/organizations/");
                  if (isOrgPath) {
                    router.push(
                      `/organizations/${organizationId}/donation-agreements/${data?.donationAgreement?.[0]?.id}`,
                    );
                  } else {
                    router.push(
                      `/teams/${teamId}/funding/donation-agreements/${data?.donationAgreement?.[0]?.id}`,
                    );
                  }
                }}
              >
                <CheckCircle2 className="h-4 w-4 mr-2" />
                View Donation Agreement
              </Button>
            )}
            {currentStatus === FundingStatus.FundsDisbursing && isTeam && (
              <Button
                variant="outline"
                className="w-full sm:w-auto"
                onClick={() =>
                  router.push(
                    `/teams/${teamId}/funding/transactions/create?fundingRequestId=${data.id}`,
                  )
                }
              >
                Create Transaction
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
