"use client";

import {
  Mail,
  MailCheck,
  MailWarning,
  RefreshCw,
  UserRound,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import type { EmailHistoryBatch } from "@/services/emails";

type EmailHistoryViewProps = {
  teamId: string;
  batches: EmailHistoryBatch[];
};

const statusClasses: Record<string, string> = {
  SENT: "bg-emerald-100 text-emerald-900 border-emerald-200",
  PARTIAL: "bg-amber-100 text-amber-900 border-amber-200",
  FAILED: "bg-red-100 text-red-900 border-red-200",
  SENDING: "bg-blue-100 text-blue-900 border-blue-200",
  SKIPPED: "bg-muted text-foreground border-border",
  DELIVERED: "bg-emerald-100 text-emerald-900 border-emerald-200",
  BOUNCED: "bg-red-100 text-red-900 border-red-200",
  PENDING: "bg-blue-100 text-blue-900 border-blue-200",
};

const formatDateTime = (value?: string) => {
  if (!value) {
    return "-";
  }

  try {
    return new Intl.DateTimeFormat("default", {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(new Date(value));
  } catch {
    return value;
  }
};

const getStatusClass = (status: string) =>
  statusClasses[status] ?? "bg-muted text-foreground border-border";

const isFutureDate = (value?: string) => {
  if (!value) {
    return false;
  }

  const time = new Date(value).getTime();
  return Number.isFinite(time) && time > Date.now();
};

const canRetryBatch = (batch: EmailHistoryBatch) =>
  (batch.status === "FAILED" || batch.status === "PARTIAL") &&
  batch.recipients.some((recipient) =>
    ["FAILED", "BOUNCED", "PENDING"].includes(recipient.status),
  );

const getBatchWorkerState = (batch: EmailHistoryBatch) => {
  if (batch.lockedAt) {
    return "Running";
  }

  if (batch.status === "SENDING") {
    return isFutureDate(batch.runAfter) ? "Scheduled retry" : "Queued";
  }

  if (canRetryBatch(batch)) {
    return "Retry available";
  }

  return "Idle";
};

const getPendingRetryCount = (batch: EmailHistoryBatch) =>
  batch.recipients.filter((recipient) => recipient.status === "PENDING").length;

const getFailedRetryCount = (batch: EmailHistoryBatch) =>
  batch.recipients.filter((recipient) =>
    ["FAILED", "BOUNCED"].includes(recipient.status),
  ).length;

export default function EmailHistoryView({
  teamId,
  batches,
}: EmailHistoryViewProps) {
  const router = useRouter();
  const { toast } = useToast();
  const [selectedBatchId, setSelectedBatchId] = useState<string | null>(
    batches[0]?.id ?? null,
  );
  const [isSheetOpen, setIsSheetOpen] = useState(false);
  const [retryingBatchId, setRetryingBatchId] = useState<string | null>(null);

  const selectedBatch = useMemo(
    () => batches.find((batch) => batch.id === selectedBatchId) ?? null,
    [batches, selectedBatchId],
  );

  const totals = useMemo(
    () =>
      batches.reduce(
        (acc, batch) => ({
          sent: acc.sent + batch.sentCount,
          failed: acc.failed + batch.failedCount,
          skipped: acc.skipped + batch.skippedCount,
          batches: acc.batches + 1,
        }),
        { sent: 0, failed: 0, skipped: 0, batches: 0 },
      ),
    [batches],
  );

  const openBatch = (batchId: string) => {
    setSelectedBatchId(batchId);
    setIsSheetOpen(true);
  };

  const retryBatch = async (batchId: string) => {
    setRetryingBatchId(batchId);

    try {
      const response = await fetch(
        `/api/teams/${teamId}/emails/${batchId}/retry`,
        { method: "POST" },
      );
      const payload = (await response.json().catch(() => null)) as {
        error?: string;
      } | null;

      if (!response.ok) {
        throw new Error(payload?.error ?? "Failed to retry email batch.");
      }

      toast({
        title: "Email batch queued",
        description: "Only failed recipients were queued for retry.",
      });
      router.refresh();
    } catch (error) {
      toast({
        title: "Retry failed",
        description:
          error instanceof Error
            ? error.message
            : "Failed to retry email batch.",
        variant: "destructive",
      });
    } finally {
      setRetryingBatchId(null);
    }
  };

  return (
    <div className="space-y-5">
      <div className="grid gap-3 sm:grid-cols-4">
        <Metric label="Batches" value={totals.batches} icon={Mail} />
        <Metric label="Sent" value={totals.sent} icon={MailCheck} />
        <Metric label="Failed" value={totals.failed} icon={MailWarning} />
        <Metric label="Skipped" value={totals.skipped} icon={UserRound} />
      </div>

      <div className="rounded-md border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Subject</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Recipients</TableHead>
              <TableHead>Sender</TableHead>
              <TableHead>Sent by</TableHead>
              <TableHead>Created</TableHead>
              <TableHead className="w-24" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {batches.length > 0 ? (
              batches.map((batch) => (
                <TableRow key={batch.id}>
                  <TableCell>
                    <div className="max-w-md">
                      <p className="font-medium">{batch.subject}</p>
                      <p className="text-xs text-muted-foreground">
                        {batch.provider}
                      </p>
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant="secondary"
                      className={getStatusClass(batch.status)}
                    >
                      {batch.status}
                    </Badge>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {getBatchWorkerState(batch)}
                    </p>
                  </TableCell>
                  <TableCell>
                    <div className="text-sm">
                      <span className="font-medium">{batch.sentCount}</span>
                      <span className="text-muted-foreground">
                        {" "}
                        sent of {batch.requestedCount}
                      </span>
                    </div>
                    {(batch.failedCount > 0 || batch.skippedCount > 0) && (
                      <p className="text-xs text-muted-foreground">
                        {batch.failedCount} failed, {batch.skippedCount} skipped
                      </p>
                    )}
                    {batch.status === "SENDING" &&
                    getPendingRetryCount(batch) > 0 ? (
                      <p className="text-xs text-muted-foreground">
                        {getPendingRetryCount(batch)} queued for delivery
                      </p>
                    ) : null}
                  </TableCell>
                  <TableCell>
                    <div className="text-sm">
                      <p>{batch.senderName || batch.senderEmail || "-"}</p>
                      {batch.senderName && batch.senderEmail ? (
                        <p className="text-xs text-muted-foreground">
                          {batch.senderEmail}
                        </p>
                      ) : null}
                    </div>
                  </TableCell>
                  <TableCell>{batch.userName || "-"}</TableCell>
                  <TableCell>
                    <div className="text-sm">
                      <p>{formatDateTime(batch.createdAt)}</p>
                      <p className="text-xs text-muted-foreground">
                        Attempts {batch.attempts}/{batch.maxAttempts}
                      </p>
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex justify-end gap-2">
                      {canRetryBatch(batch) ? (
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => retryBatch(batch.id)}
                          disabled={retryingBatchId === batch.id}
                        >
                          <RefreshCw className="h-4 w-4" />
                          Retry
                        </Button>
                      ) : null}
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => openBatch(batch.id)}
                      >
                        View
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell colSpan={7} className="h-28 text-center">
                  <div className="space-y-1">
                    <p className="font-medium">No CRM emails sent yet</p>
                    <p className="text-sm text-muted-foreground">
                      Sent emails will appear here after users email selected
                      contacts.
                    </p>
                  </div>
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      <Sheet open={isSheetOpen} onOpenChange={setIsSheetOpen}>
        <SheetContent
          side="right"
          className="w-full overflow-y-auto sm:max-w-3xl"
        >
          {selectedBatch ? (
            <EmailBatchDetails
              teamId={teamId}
              batch={selectedBatch}
              isRetrying={retryingBatchId === selectedBatch.id}
              onRetry={() => retryBatch(selectedBatch.id)}
            />
          ) : null}
        </SheetContent>
      </Sheet>
    </div>
  );
}

type MetricProps = {
  label: string;
  value: number;
  icon: typeof Mail;
};

const Metric = ({ label, value, icon: Icon }: MetricProps) => (
  <div className="rounded-md border bg-card p-4">
    <div className="flex items-center justify-between gap-3">
      <p className="text-sm text-muted-foreground">{label}</p>
      <Icon className="h-4 w-4 text-muted-foreground" />
    </div>
    <p className="mt-2 text-2xl font-semibold">{value}</p>
  </div>
);

const EmailBatchDetails = ({
  teamId,
  batch,
  isRetrying,
  onRetry,
}: {
  teamId: string;
  batch: EmailHistoryBatch;
  isRetrying: boolean;
  onRetry: () => void;
}) => (
  <div className="space-y-6">
    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
      <SheetHeader>
        <SheetTitle>{batch.subject}</SheetTitle>
        <SheetDescription>
          {formatDateTime(batch.createdAt)} by{" "}
          {batch.userName || "unknown user"}
        </SheetDescription>
      </SheetHeader>
      {canRetryBatch(batch) ? (
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={onRetry}
          disabled={isRetrying}
          className="sm:mt-1"
        >
          <RefreshCw className="h-4 w-4" />
          Retry failed
        </Button>
      ) : null}
    </div>

    <div className="grid gap-3 sm:grid-cols-4">
      <Metric label="Requested" value={batch.requestedCount} icon={Mail} />
      <Metric label="Sent" value={batch.sentCount} icon={MailCheck} />
      <Metric label="Failed" value={batch.failedCount} icon={MailWarning} />
      <Metric label="Skipped" value={batch.skippedCount} icon={UserRound} />
    </div>

    <div className="rounded-md border bg-muted/30 p-4">
      <div className="grid gap-4 text-sm sm:grid-cols-2">
        <DetailItem label="Worker state" value={getBatchWorkerState(batch)} />
        <DetailItem
          label="Attempts"
          value={`${batch.attempts}/${batch.maxAttempts}`}
        />
        <DetailItem label="Next run" value={formatDateTime(batch.runAfter)} />
        <DetailItem label="Started" value={formatDateTime(batch.startedAt)} />
        <DetailItem label="Locked at" value={formatDateTime(batch.lockedAt)} />
        <DetailItem label="Locked by" value={batch.lockedBy || "-"} />
        <DetailItem
          label="BCC"
          value={batch.bccEmails.length ? batch.bccEmails.join(", ") : "-"}
        />
      </div>
      {batch.lastError ? (
        <div className="mt-4 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-950">
          <p className="font-medium">Batch error</p>
          <p className="mt-1 whitespace-pre-wrap break-words">
            {batch.lastError}
          </p>
        </div>
      ) : null}
      {canRetryBatch(batch) || getPendingRetryCount(batch) > 0 ? (
        <div className="mt-4 rounded-md border bg-background p-3 text-sm">
          <p className="font-medium">Retry behavior</p>
          <p className="mt-1 text-muted-foreground">
            Already-sent recipients are not resent. Retry only queues failed,
            bounced, or still-pending recipients.
          </p>
          <p className="mt-2 text-muted-foreground">
            {getFailedRetryCount(batch)} failed or bounced,{" "}
            {getPendingRetryCount(batch)} pending.
          </p>
        </div>
      ) : null}
    </div>

    <div className="space-y-2">
      <h3 className="text-sm font-semibold">Message preview</h3>
      <iframe
        title="Email message preview"
        sandbox=""
        className="h-72 w-full rounded-md border bg-white"
        srcDoc={batch.html}
      />
    </div>

    <div className="space-y-2">
      <h3 className="text-sm font-semibold">Recipients</h3>
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Contact</TableHead>
              <TableHead>Email</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Sent</TableHead>
              <TableHead>Error</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {batch.recipients.map((recipient) => (
              <TableRow key={recipient.id}>
                <TableCell>
                  {recipient.contactId ? (
                    <Link
                      href={`/teams/${teamId}/crm/contacts/${recipient.contactId}`}
                      className="font-medium hover:underline"
                    >
                      {recipient.contactName ||
                        recipient.name ||
                        recipient.email}
                    </Link>
                  ) : (
                    <span>{recipient.name || "-"}</span>
                  )}
                </TableCell>
                <TableCell>{recipient.email}</TableCell>
                <TableCell>
                  <Badge
                    variant="secondary"
                    className={getStatusClass(recipient.status)}
                  >
                    {recipient.status}
                  </Badge>
                </TableCell>
                <TableCell>{formatDateTime(recipient.sentAt)}</TableCell>
                <TableCell className="max-w-xs">
                  <span className="line-clamp-3 text-sm text-muted-foreground">
                    {recipient.errorMessage || "-"}
                  </span>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  </div>
);

const DetailItem = ({ label, value }: { label: string; value: string }) => (
  <div>
    <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
      {label}
    </p>
    <p className="mt-1 break-words">{value}</p>
  </div>
);
