import TeamOrganizationCreate from "@/components/organizations/team-organization-create";

export default async function CrmOrganizationCreatePage({
  params,
}: {
  params: Promise<{ teamId: string }>;
}) {
  const { teamId } = await params;
  return <TeamOrganizationCreate teamId={teamId} />;
}
