"use client";

import { useEffect, useState } from "react";
import useSWR from "swr";
import OrganizationForm from "@/components/forms/organization";
import { Loader } from "@/components/helper/loader";
import OrganizationDetails from "@/components/organization-details";
import OrganizationEngagements from "@/components/organization-engagements";
import { Switch } from "@/components/ui/switch";
import { toast } from "@/hooks/use-toast";

const fetcher = (url: string) => fetch(url).then((res) => res.json());

export default function OrganizationData({
  organizationId,
  isAdminOrTeam = false,
}: {
  organizationId: string;
  isAdminOrTeam?: boolean;
}) {
  const allowManagement = isAdminOrTeam;

  const {
    data: organizationData,
    isLoading: orgLoading,
    mutate,
  } = useSWR(`/api/organizations/${organizationId}`, fetcher);

  const { data: fundingRequestsData, isLoading: fundingLoading } = useSWR(
    `/api/funding-requests/?organizationId=${organizationId}`,
    fetcher,
  );

  const [isFilledByOrg, setIsFilledByOrg] = useState(false);

  useEffect(() => {
    if (organizationData?.data) {
      setIsFilledByOrg(organizationData.data.isFilledByOrg);
    }
  }, [organizationData?.data]);

  if (orgLoading || fundingLoading) {
    return (
      <div className="flex justify-center items-center h-64">
        <Loader className={""} />
      </div>
    );
  }

  const allowEditOrganization = async () => {
    const newValue = !isFilledByOrg;
    setIsFilledByOrg(newValue);

    try {
      await fetch(`/api/organizations/${organizationId}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          isFilledByOrg: newValue,
        }),
      });

      await mutate();

      toast({
        title: "Success",
        description: "Organization updated",
      });
    } catch (error) {
      console.log(error);
      setIsFilledByOrg(!newValue);

      toast({
        title: "Error",
        description: "Error updating organization",
        variant: "destructive",
      });
    }
  };

  return (
    <div className=" px-5 py-8 mx-auto">
      <div className=" p-6">
        {allowManagement && (
          <div className="flex justify-between items-center mb-6 bg-blue-50 p-4 rounded-lg border border-blue-200">
            <div className="flex flex-col">
              <h3 className="text-base font-semibold text-gray-800">
                Organization Edit Mode
              </h3>
              <p className="text-sm text-gray-600 mt-1">
                {isFilledByOrg
                  ? "Edit mode is locked. Organization details can only be viewed by the organization."
                  : "Edit mode is active. Organization can modify organization details."}
              </p>
            </div>
            <div className="flex items-center space-x-3">
              <span className="text-sm font-medium text-gray-700">
                {isFilledByOrg ? "Unlock" : "Lock"}
              </span>
              <Switch
                checked={isFilledByOrg}
                onCheckedChange={allowEditOrganization}
                className="data-[state=checked]:bg-blue-600"
              />
            </div>
          </div>
        )}

        {isFilledByOrg && !allowManagement ? (
          <OrganizationDetails
            organization={organizationData?.data}
            fundingRequests={fundingRequestsData?.data}
          />
        ) : (
          <div className="space-y-6">
            <OrganizationForm data={organizationData?.data} />
            {organizationData?.data?.teamId && (
              <OrganizationEngagements
                organizationId={organizationId}
                teamId={organizationData.data.teamId}
              />
            )}
          </div>
        )}
      </div>
    </div>
  );
}