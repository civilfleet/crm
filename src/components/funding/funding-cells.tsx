import { formatEuro } from "@/components/funding/funding-format";
import { RecordNameCell, TextCell } from "@/components/records/record-cells";

/** Money lines up on the right, digit under digit. */
export const AmountCell = ({ value }: { value: unknown }) => (
  <TextCell value={formatEuro(value)} className="text-right tabular-nums" />
);

export const OrganizationCell = ({
  organization,
  href,
}: {
  organization?: { id: string; name?: string | null } | null;
  href?: string;
}) => {
  const name = organization?.name?.trim();
  if (!name) return null;
  return <RecordNameCell kind="organization" name={name} href={href} />;
};
