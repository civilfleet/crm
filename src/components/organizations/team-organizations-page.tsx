import { Building2, HandHeart } from "lucide-react";
import Link from "next/link";
import { CopyRegistrationLinkButton } from "@/components/buttons/copy-registration-link-button";
import {
  RecordsHeader,
  RecordsPage,
} from "@/components/records/records-layout";
import OrganizationTable from "@/components/table/organization-table";
import { Button } from "@/components/ui/button";

type TeamOrganizationsPageProps = {
  teamId: string;
  scope: "crm" | "funding";
  showRegistrationLink?: boolean;
  initialPageSize: number;
};

export default function TeamOrganizationsPage({
  teamId,
  scope,
  showRegistrationLink = true,
  initialPageSize,
}: TeamOrganizationsPageProps) {
  const basePath = `/teams/${teamId}/${scope}/organizations`;

  return (
    <RecordsPage>
      <RecordsHeader
        icon={scope === "funding" ? HandHeart : Building2}
        title="Organizations"
        action={
          <>
            {showRegistrationLink ? (
              <CopyRegistrationLinkButton teamId={teamId} />
            ) : null}
            <Button asChild size="sm">
              <Link href={`${basePath}/create`}>New organization</Link>
            </Button>
          </>
        }
      />
      <OrganizationTable
        teamId={teamId}
        basePath={basePath}
        initialPageSize={initialPageSize}
      />
    </RecordsPage>
  );
}
