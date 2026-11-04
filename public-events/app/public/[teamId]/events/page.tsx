import { snapshot } from "../../../../snapshot";
import EventsPage from "../../../../events-page";
import { notFound } from "next/navigation";

export function generateStaticParams() {
  return snapshot().teams.map(({ id }) => ({ teamId: id }));
}
export const dynamicParams = false;
export default async function Events({
  params,
}: {
  params: Promise<{ teamId: string }>;
}) {
  const { teamId } = await params;
  const data = snapshot();
  const team = data.teams.find((item) => item.id === teamId);
  if (!team) notFound();
  return <EventsPage team={team} version={data.version} />;
}
