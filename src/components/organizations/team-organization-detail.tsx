import OrganizationData from "@/components/data-components/organization";

export default function TeamOrganizationDetail({
  organizationId,
  isAdminOrTeam,
}: {
  organizationId: string;
  isAdminOrTeam?: boolean;
}) {
  return (
    <div>
      <div className="container">
        <OrganizationData
          organizationId={organizationId}
          isAdminOrTeam={isAdminOrTeam}
        />
      </div>
    </div>
  );
}
