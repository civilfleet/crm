"use client";

import { format } from "date-fns";
import {
  Ban,
  Edit,
  GitPullRequestArrow,
  History,
  Plus,
  Trash,
} from "lucide-react";
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

const formatFieldName = (fieldName?: string) => {
  if (!fieldName) return "";
  // Convert camelCase to Title Case
  return fieldName
    .replace(/[_-]+/g, " ")
    .replace(/([A-Z])/g, " $1")
    .replace(/^./, (str) => str.toUpperCase())
    .trim();
};

const formatValue = (value?: string) => {
  if (!value) return "—";
  try {
    const parsed = JSON.parse(value);
    if (typeof parsed === "object") {
      return JSON.stringify(parsed, null, 2);
    }
    return String(parsed);
  } catch {
    return value;
  }
};

const formatMetadataValue = (value: unknown) => {
  if (value === null || value === undefined) {
    return "—";
  }

  if (
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  ) {
    return String(value);
  }

  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
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
  const shownLogs = logs.filter((log) => !log.metadata?.decidedWith);

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
              Track all modifications made to this contact
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
              const metadataEntries = log.metadata
                ? Object.entries(log.metadata)
                : [];
              const creationSource = log.metadata
                ? log.metadata.source
                : undefined;
              return (
                <div key={log.id}>
                  <div className="flex gap-4">
                    <div className="flex flex-col items-center">
                      <div
                        className={`rounded-full p-2 ${getActionColor(log.action)}`}
                      >
                        <ActionIcon className="h-4 w-4" />
                      </div>
                      {index < shownLogs.length - 1 && (
                        <div className="w-px h-full bg-border mt-2" />
                      )}
                    </div>

                    <div className="flex-1 pb-4">
                      <div className="flex items-start justify-between gap-4 mb-2">
                        <div className="flex items-center gap-2">
                          <Badge
                            variant="outline"
                            className={`text-xs ${getActionColor(log.action)}`}
                          >
                            {getActionLabel(log.action)}
                          </Badge>
                          {log.fieldName && (
                            <span className="text-sm font-medium">
                              {formatFieldName(log.fieldName)}
                            </span>
                          )}
                          {log.action === ChangeAction.PROPOSED && (
                            <Badge
                              variant="outline"
                              className={`text-xs ${getProposalStatus(log, logs).className}`}
                            >
                              {getProposalStatus(log, logs).label}
                            </Badge>
                          )}
                        </div>
                        <span className="text-xs text-muted-foreground whitespace-nowrap">
                          {format(new Date(log.createdAt), "PPp")}
                        </span>
                      </div>

                      {log.action === ChangeAction.CREATED && (
                        <p className="text-sm text-muted-foreground">
                          Contact record was created
                          {creationSource
                            ? ` via ${formatMetadataValue(creationSource)}`
                            : ""}
                        </p>
                      )}

                      {log.action === ChangeAction.UPDATED && log.fieldName && (
                        <div className="space-y-1 text-sm">
                          {log.oldValue && (
                            <div className="p-2 rounded bg-destructive/10 border border-destructive/25">
                              <span className="text-xs font-medium text-destructive-strong">
                                Old:
                              </span>
                              <pre className="text-xs text-destructive mt-1 whitespace-pre-wrap">
                                {formatValue(log.oldValue)}
                              </pre>
                            </div>
                          )}
                          {log.newValue && (
                            <div className="p-2 rounded bg-success/10 border border-success/25">
                              <span className="text-xs font-medium text-success-strong">
                                New:
                              </span>
                              <pre className="text-xs text-success mt-1 whitespace-pre-wrap">
                                {formatValue(log.newValue)}
                              </pre>
                            </div>
                          )}
                        </div>
                      )}

                      {log.action === ChangeAction.PROPOSED &&
                        log.fieldName && (
                          <div className="space-y-1 text-sm">
                            <p className="text-xs text-muted-foreground">
                              Submitted data differs from the contact. The
                              contact was not changed.
                            </p>
                            <div className="p-2 rounded bg-muted/40 border">
                              <span className="text-xs font-medium">
                                Current:
                              </span>
                              <pre className="text-xs mt-1 whitespace-pre-wrap">
                                {formatValue(log.oldValue)}
                              </pre>
                            </div>
                            <div className="p-2 rounded bg-warning/10 border border-warning/25">
                              <span className="text-xs font-medium text-warning-strong">
                                Proposed:
                              </span>
                              <pre className="text-xs text-warning-strong mt-1 whitespace-pre-wrap">
                                {formatValue(log.newValue)}
                              </pre>
                            </div>
                          </div>
                        )}

                      {log.proposalId && (
                        <p className="text-xs text-muted-foreground mt-2">
                          {log.action === ChangeAction.PROPOSAL_REJECTED
                            ? "Declined a proposed change."
                            : "Applied from a proposed change."}
                        </p>
                      )}

                      {log.action === ChangeAction.DELETED && (
                        <p className="text-sm text-muted-foreground">
                          {log.fieldName
                            ? `${formatFieldName(log.fieldName)} was removed`
                            : "Contact record was deleted"}
                        </p>
                      )}

                      {metadataEntries.length > 0 && (
                        <div className="mt-3 rounded-md border bg-muted/30 p-3">
                          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                            Metadata
                          </p>
                          <dl className="mt-2 space-y-1">
                            {metadataEntries.map(([key, value]) => (
                              <div
                                key={key}
                                className="flex items-start justify-between gap-3 text-xs"
                              >
                                <dt className="font-medium text-muted-foreground">
                                  {formatFieldName(key)}
                                </dt>
                                <dd className="max-w-[60%] text-right text-muted-foreground break-words">
                                  {formatMetadataValue(value)}
                                </dd>
                              </div>
                            ))}
                          </dl>
                        </div>
                      )}

                      {log.userName && (
                        <p className="text-xs text-muted-foreground mt-2">
                          By: {log.userName}
                        </p>
                      )}
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
