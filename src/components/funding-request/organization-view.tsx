import DetailItem from "@/components/helper/detail-item";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import type { FundingRequest } from "@/types";

const OrganizationView = ({ data }: { data: FundingRequest }) => {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Organization Details</CardTitle>
        <CardDescription>
          Complete information about {data.organization.name}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="space-y-4">
            <h3 className="text-lg font-semibold">Basic Information</h3>
            <DetailItem
              label="Organization Name"
              value={data.organization.name}
            />
            <DetailItem label="Tax ID" value={data.organization.taxID} />
            <DetailItem
              label="Registration Number"
              value={data.organization.taxID || "N/A"}
            />
            <DetailItem
              label="Website"
              value={data.organization.website || "N/A"}
            />
          </div>

          <div className="space-y-4">
            <h3 className="text-lg font-semibold">Address</h3>
            <DetailItem label="Street" value={data.organization.address} />
            <DetailItem label="City" value={data.organization.city} />
            <DetailItem
              label="Postal Code"
              value={data.organization.postalCode}
            />
            <DetailItem label="Country" value={data.organization.country} />
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

export default OrganizationView;