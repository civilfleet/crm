"use client";

import OrganizationView from "@/components/funding-request/organization-view";
import FundingRequestOverview from "@/components/funding-request/overview";
import TransactionTable from "@/components/table/transaction-table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { FundingRequest } from "../types";
import FundingRequestHeader from "./funding-request/header";
import { FileList } from "./helper/file-list";

export default function FundingRequestDetail({
  data,
  refreshData,
  isTeam = false,
}: {
  data: FundingRequest;
  refreshData: () => void;
  isTeam?: boolean;
}) {
  return (
    <div className="space-y-8 max-w-7xl mx-auto">
      {/* Status Header */}
      <FundingRequestHeader
        data={data}
        isTeam={isTeam}
        refreshData={refreshData}
      />

      {/* Tab Navigation */}
      <Tabs defaultValue="details" className="w-full">
        <TabsList className="mb-6">
          <TabsTrigger value="details">Request Details</TabsTrigger>
          <TabsTrigger value="documents">Documents</TabsTrigger>
          <TabsTrigger value="organization">Organization</TabsTrigger>
          <TabsTrigger value="transactions">Transactions</TabsTrigger>
        </TabsList>

        {/* Details Tab */}
        <TabsContent value="details" className="space-y-6">
          <FundingRequestOverview data={data} />
        </TabsContent>

        {/* Documents Tab */}
        <TabsContent value="documents">
          <FileList files={data?.files} organizationFiles={[]} />
        </TabsContent>

        {/* Organization Tab */}
        <TabsContent value="organization">
          <OrganizationView data={data} />
        </TabsContent>
        <TabsContent value="transactions">
          <TransactionTable fundingRequestId={data?.id} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
