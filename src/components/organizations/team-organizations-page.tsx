import { CopyRegistrationLinkButton } from "@/components/buttons/copy-registration-link-button";
import OrganizationTable from "@/components/table/organization-table";

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
    <OrganizationTable
      scope={scope}
      teamId={teamId}
      basePath={basePath}
      initialPageSize={initialPageSize}
      createHref={`${basePath}/create`}
      headerActions={
        showRegistrationLink ? (
          <CopyRegistrationLinkButton teamId={teamId} />
        ) : null
      }
    />
  );
}
