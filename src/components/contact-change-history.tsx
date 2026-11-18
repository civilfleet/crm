"use client";

import { format, formatDistanceToNow } from "date-fns";
import {
  ArrowRight,
  Ban,
  Edit,
  GitPullRequestArrow,
  History,
  Minus,
  Plus,
  Trash,
} from "lucide-react";
import type { ReactNode } from "react";
import useSWR from "swr";
import { Loader } from "@/components/helper/loader";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import {
  creationSource,
  describeListChange,
  displayValue,
  fieldLabel,
  isListField,
  type ListChange,
  isNoOpChange,
} from "@/lib/contact-change-format";
import { ChangeAction, type ContactChangeLog } from "@/types";

const fetcher = (url: string) => fetch(url).then((res) => res.json());

interface ContactChangeHistoryProps {
  contactId: string;
}

const getActionIcon = (action: ChangeAction) => {
  switch (action) {
    case ChangeAction.CREATED:
      return Plus;
    case ChangeAction.UPDATED:
      return Edit;
    case ChangeAction.DELETED:
      return Trash;
    case ChangeAction.PROPOSED:
      return GitPullRequestArrow;
    case ChangeAction.PROPOSAL_REJECTED:
      return Ban;
    default:
      return History;
  }
};

const getActionColor = (action: ChangeAction) => {
  switch (action) {
    case ChangeAction.CREATED:
      return "bg-success/10 text-success-strong border-success/25";
    case ChangeAction.UPDATED:
      return "bg-info/10 text-info-strong border-info/25";
    case ChangeAction.DELETED:
      return "bg-destructive/10 text-destructive-strong border-destructive/25";
    case ChangeAction.PROPOSED:
      return "bg-warning/10 text-warning-strong border-warning/25";
    default:
      return "bg-muted text-foreground border-border";
  }
};

const getActionLabel = (action: ChangeAction) => {
  switch (action) {
    case ChangeAction.CREATED:
      return "Created";
    case ChangeAction.UPDATED:
      return "Updated";
    case ChangeAction.DELETED:
      return "Deleted";
    case ChangeAction.PROPOSED:
      return "Proposed";
    case ChangeAction.PROPOSAL_REJECTED:
      return "Proposal rejected";
    default:
      return action;
  }
};

/** A proposal's status is derived from the entry that resolves it, if any. */
const getProposalStatus = (
  proposal: ContactChangeLog,
  logs: ContactChangeLog[],
) => {
  const resolution = logs.find((log) => log.proposalId === proposal.id);
  if (!resolution)
    return {
      label: "Pending review",
      className: "bg-warning/10 text-warning-strong border-warning/25",
    };
  return resolution.action === ChangeAction.PROPOSAL_REJECTED
    ? {
        label: "Rejected",
        className: "bg-muted text-foreground border-border",
      }
    : {
        label: "Applied",
        className: "bg-success/10 text-success-strong border-success/25",
      };
};

const ADDED_VERB_PREFIXES = ["profileAttribute.", "socialLink.", "language."];

const Value = ({ children, old }: { children: string; old?: boolean }) => (
  <span
    className={
      old
        ? "text-muted-foreground line-through decoration-muted-foreground/60"
        : "font-medium text-foreground"
    }
  >
    {children}
  </span>
);

const ValueChange = ({ from, to }: { from: string; to: string }) => (
  <p className="mt-1 flex flex-wrap items-baseline gap-x-2 gap-y-1 text-sm whitespace-pre-wrap break-words">
    {from && <Value old>{from}</Value>}
    {from && to && (
      <ArrowRight
        className="h-3.5 w-3.5 shrink-0 self-center text-muted-foreground"
        role="img"
        aria-label="changed to"
      />
    )}
    {to && <Value>{to}</Value>}
  </p>
);

const ListChangeChips = ({ added, removed }: ListChange) => (
  <ul className="mt-1 flex flex-wrap gap-1.5" aria-label="Changes">
    {added.map((item) => (
      <li key={`added-${item}`}>
        <Badge
          variant="outline"
          className="bg-success/10 text-success-strong border-success/25 font-normal"
        >
          <Plus className="mr-1 h-3 w-3" role="img" aria-label="added" />
          {item}
        </Badge>
      </li>
    ))}
    {removed.map((item) => (
      <li key={`removed-${item}`}>
        <Badge
          variant="outline"
          className="bg-muted text-muted-foreground border-border font-normal line-through"
        >
          <Minus className="mr-1 h-3 w-3" role="img" aria-label="removed" />
          {item}
        </Badge>
      </li>
    ))}
  </ul>
);

/** The sentence and the values for one entry. */
const describeEntry = (
  log: ContactChangeLog,
): { sentence: ReactNode; detail?: ReactNode } => {
  const who = log.userName ? (
    <span className="font-medium">{log.userName}</span>
  ) : null;
  const field = log.fieldName;
  const label = <span className="font-medium">{fieldLabel(field)}</span>;
  const labels = log.valueLabels ?? {};
  const before = displayValue(field, log.oldValue, labels);
  const after = displayValue(field, log.newValue, labels);
  const subject = (text: string) =>
    who ? (
      <>
        {who} {text}
      </>
    ) : (
      text.charAt(0).toUpperCase() + text.slice(1)
    );

  switch (log.action) {
    case ChangeAction.CREATED: {
      const source = creationSource(log.metadata);
      const duplicates = log.metadata?.possibleDuplicates;
      return {
        sentence: (
          <>
            {who ? <>{who} created this contact</> : "Contact created"}
            {source ? ` from ${source}` : ""}
          </>
        ),
        detail:
          Array.isArray(duplicates) && duplicates.length > 0 ? (
            <p className="mt-1 text-xs text-muted-foreground">
              Might be a duplicate: another contact has the same phone number.
            </p>
          ) : undefined,
      };
    }
    case ChangeAction.DELETED:
      return {
        sentence: field ? (
          <>
            {subject("removed")} {label}
          </>
        ) : (
          subject("deleted this contact")
        ),
      };
    case ChangeAction.PROPOSED:
      return {
        sentence: (
          <>
            {subject("suggested a change to")} {label}
          </>
        ),
        detail: <ValueChange from={before} to={after} />,
      };
    case ChangeAction.PROPOSAL_REJECTED:
      return {
        sentence: (
          <>
            {subject("declined a suggested")} {label}
          </>
        ),
        detail: after ? <ValueChange from={after} to="" /> : undefined,
      };
  }

  if (!field) return { sentence: subject("updated this contact") };

  if (field === "merge") {
    const merged = log.metadata?.sourceContactIds;
    const count = Array.isArray(merged) ? merged.length : 0;
    return {
      sentence: subject(
        count === 1
          ? "merged another contact into this one"
          : count > 1
            ? `merged ${count} contacts into this one`
            : "merged other contacts into this one",
      ),
    };
  }
  if (field === "possibleDuplicate") {
    return { sentence: subject("marked this as not a duplicate") };
  }
  if (field === "deletedAt") {
    return {
      sentence: subject(
        after
          ? "moved this contact to the trash"
          : "restored this contact from the trash",
      ),
    };
  }
  if (isListField(field)) {
    return {
      sentence: (
        <>
          {subject("updated")} {label}
        </>
      ),
      detail: (
        <ListChangeChips
          {...describeListChange(field, log.oldValue, log.newValue, labels)}
        />
      ),
    };
  }
  if (!before) {
    const verb = ADDED_VERB_PREFIXES.some((prefix) => field.startsWith(prefix))
      ? "added"
      : "set";
    return {
      sentence: (
        <>
          {subject(verb)} {label}
        </>
      ),
      detail: <ValueChange from="" to={after} />,
    };
  }
  if (!after) {
    return {
      sentence: (
        <>
          {subject("removed")} {label}
        </>
      ),
      detail: <ValueChange from={before} to="" />,
    };
  }
  return {
    sentence: (
      <>
        {subject("changed")} {label}
      </>
    ),
    detail: <ValueChange from={before} to={after} />,
  };
};

export default function ContactChangeHistory({
  contactId,
}: ContactChangeHistoryProps) {
  const { data, error, isLoading } = useSWR(
    `/api/contact-change-logs?contactId=${contactId}`,
    fetcher,
  );

  const logs = (data?.data || []) as ContactChangeLog[];
  // A proposal decided together with an equal one keeps its own resolution
  // (so it shows as applied or rejected) but the entry itself is not listed
  // again: the one it was decided with is.
  // Updates that changed nothing visible (older saves logged every profile
  // attribute) are left out.
  const shownLogs = logs.filter(
    (log) => !log.metadata?.decidedWith && !isNoOpChange(log, log.valueLabels),
  );

  return (
    <Card className="w-full shadow-sm">
      <CardHeader className="border-b pb-3">
        <div className="flex items-center gap-2">
          <History className="h-5 w-5 text-muted-foreground" />
          <div>
            <CardTitle className="text-xl font-semibold">
              Change History
            </CardTitle>
            <CardDescription>
              Who changed what on this contact, newest first
            </CardDescription>
          </div>
        </div>
      </CardHeader>

      <CardContent className="pt-6">
        {isLoading ? (
          <div className="flex justify-center items-center h-32">
            <Loader className="h-6 w-6 text-muted-foreground" />
          </div>
        ) : error ? (
          <div className="text-center py-8 text-sm text-muted-foreground">
            Failed to load change history
          </div>
        ) : shownLogs.length === 0 ? (
          <div className="text-center py-8 rounded-md border border-dashed">
            <History className="h-12 w-12 mx-auto text-muted-foreground mb-2" />
            <p className="text-sm text-muted-foreground">
              No changes recorded yet
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {shownLogs.map((log, index) => {
              const ActionIcon = getActionIcon(log.action);
              const { sentence, detail } = describeEntry(log);
              const createdAt = new Date(log.createdAt);
              const proposalStatus =
                log.action === ChangeAction.PROPOSED
                  ? getProposalStatus(log, logs)
                  : undefined;
              return (
                <div key={log.id}>
                  <div className="flex gap-3">
                    <div className="flex flex-col items-center">
                      <div
                        className={`rounded-full p-2 ${getActionColor(log.action)}`}
                        title={getActionLabel(log.action)}
                      >
                        <ActionIcon className="h-4 w-4" aria-hidden="true" />
                      </div>
                      {index < shownLogs.length - 1 && (
                        <div className="w-px h-full bg-border mt-2" />
                      )}
                    </div>

                    <div className="min-w-0 flex-1 pb-4">
                      <p className="text-sm leading-6">{sentence}</p>
                      {detail}
                      {log.proposalId &&
                        log.action !== ChangeAction.PROPOSAL_REJECTED && (
                          <p className="mt-1 text-xs text-muted-foreground">
                            Accepted from a suggestion.
                          </p>
                        )}
                      <div className="mt-1 flex flex-wrap items-center gap-2">
                        <time
                          dateTime={createdAt.toISOString()}
                          title={format(createdAt, "PPp")}
                          className="text-xs text-muted-foreground"
                        >
                          {formatDistanceToNow(createdAt, { addSuffix: true })}
                        </time>
                        {proposalStatus && (
                          <Badge
                            variant="outline"
                            className={`text-xs ${proposalStatus.className}`}
                          >
                            {proposalStatus.label}
                          </Badge>
                        )}
                      </div>
                    </div>
                  </div>
                  {index < shownLogs.length - 1 && <Separator />}
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
