import {
  type DonationPayoutStatus,
  statusDescriptionMap,
} from "@/components/helper/status-badge";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { FundingStatus } from "@/types";

type Tone = "default" | "info" | "success" | "warning" | "destructive";

type StatusChipProps = {
  label: string;
  tone: Tone;
  /** Shown on hover: what the status means. */
  description?: string;
};

// Close to the colours of helper/status-badge, as quiet chips for a grid.
const TONE_CLASSES: Record<Tone, string> = {
  default: "bg-muted text-muted-foreground",
  info: "bg-sky-100 text-sky-900 dark:bg-sky-950 dark:text-sky-100",
  success:
    "bg-emerald-100 text-emerald-900 dark:bg-emerald-950 dark:text-emerald-100",
  warning: "bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-100",
  destructive: "bg-rose-100 text-rose-900 dark:bg-rose-950 dark:text-rose-100",
};

export const StatusChip = ({ label, tone, description }: StatusChipProps) => (
  <Badge
    variant="outline"
    title={description}
    className={cn("max-w-full border-transparent", TONE_CLASSES[tone])}
  >
    <span className="truncate">{label}</span>
  </Badge>
);

export const FUNDING_STATUS_LABELS: Record<FundingStatus, string> = {
  [FundingStatus.Submitted]: "Submitted",
  [FundingStatus.Accepted]: "Accepted",
  [FundingStatus.WaitingForSignature]: "Waiting for signature",
  [FundingStatus.Approved]: "Approved",
  [FundingStatus.FundsDisbursing]: "Funds disbursing",
  [FundingStatus.Completed]: "Completed",
  [FundingStatus.Rejected]: "Rejected",
};

// Warning where someone has to act next, success once it is settled.
const FUNDING_STATUS_TONES: Record<FundingStatus, Tone> = {
  [FundingStatus.Submitted]: "warning",
  [FundingStatus.Accepted]: "info",
  [FundingStatus.WaitingForSignature]: "warning",
  [FundingStatus.Approved]: "success",
  [FundingStatus.FundsDisbursing]: "info",
  [FundingStatus.Completed]: "success",
  [FundingStatus.Rejected]: "destructive",
};

/** In workflow order, for filters. */
export const FUNDING_STATUS_OPTIONS = [
  FundingStatus.Submitted,
  FundingStatus.Accepted,
  FundingStatus.WaitingForSignature,
  FundingStatus.Approved,
  FundingStatus.FundsDisbursing,
  FundingStatus.Completed,
  FundingStatus.Rejected,
].map((status) => ({ value: status, label: FUNDING_STATUS_LABELS[status] }));

export const FundingStatusChip = ({
  status,
}: {
  status?: FundingStatus | null;
}) => {
  if (!status) return null;
  return (
    <StatusChip
      label={FUNDING_STATUS_LABELS[status] ?? status}
      tone={FUNDING_STATUS_TONES[status] ?? "default"}
      description={statusDescriptionMap[status]}
    />
  );
};

const PAYOUT_CHIPS: Record<
  DonationPayoutStatus,
  { label: string; tone: Tone }
> = {
  not_disbursed: { label: "Not disbursed", tone: "default" },
  in_disbursement: { label: "In disbursement", tone: "info" },
  partially_disbursed: { label: "Partially disbursed", tone: "warning" },
  disbursed: { label: "Disbursed", tone: "success" },
};

export const PayoutStatusChip = ({
  status,
}: {
  status: DonationPayoutStatus;
}) => <StatusChip {...PAYOUT_CHIPS[status]} />;
