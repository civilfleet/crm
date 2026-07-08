"use client";

import {
  Loader2,
  ShieldAlert,
  ShieldCheck,
  Undo2,
  UserPlus,
  XCircle,
} from "lucide-react";
import { useMemo, useState } from "react";
import useSWR from "swr";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";

type ContactAccessReview = {
  id: string;
  teamId: string;
  groupId: string;
  groupName: string;
  inboundEmailMessageId: string;
  emailInboxId: string;
  emailInboxName: string;
  contactId?: string;
  contactName?: string;
  contactEmail?: string;
  contactGroups: { id: string; name: string }[];
  contactLastEngagedAt?: string;
  contactLastEngagementSubject?: string;
  fromEmail: string;
  fromName?: string;
  subject?: string;
  messagePreview: string;
  matchReason: string;
  receivedAt: string;
  createdAt: string;
  reviewedAt?: string;
  reviewedByUserName?: string;
  revokedAt?: string;
  revokedByUserName?: string;
  status: string;
};

type ContactAccessReviewsProps = {
  teamId: string;
};

const fetchJson = async <T,>(url: string): Promise<T> => {
  const response = await fetch(url);
  const json = await response.json();
  if (!response.ok) {
    throw new Error(json?.error || response.statusText);
  }
  return json.data as T;
};

const formatDate = (value?: string) => {
  if (!value) return "Never";
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
};

export default function ContactAccessReviews({
  teamId,
}: ContactAccessReviewsProps) {
  const { toast } = useToast();
  const [busyReviewId, setBusyReviewId] = useState<string | null>(null);

  const {
    data: accessReviews = [],
    error,
    isLoading,
    mutate,
  } = useSWR(
    `/api/teams/${teamId}/admin/contact-access-reviews`,
    (url: string) => fetchJson<ContactAccessReview[]>(url),
  );

  const pendingReviews = useMemo(
    () => accessReviews.filter((review) => review.status === "PENDING"),
    [accessReviews],
  );
  const approvedReviews = useMemo(
    () => accessReviews.filter((review) => review.status === "APPROVED"),
    [accessReviews],
  );

  const runAccessReviewAction = async (
    review: ContactAccessReview,
    action: "approve" | "reject" | "revoke",
  ) => {
    setBusyReviewId(`${action}:${review.id}`);
    try {
      const response = await fetch(
        `/api/teams/${teamId}/admin/contact-access-reviews/${review.id}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action }),
        },
      );

      const json = await response.json();
      if (!response.ok) {
        throw new Error(json?.error || response.statusText);
      }

      await mutate();
      toast({
        title:
          action === "approve"
            ? "Access granted"
            : action === "revoke"
              ? "Access revoked"
              : "Access request rejected",
        description:
          action === "approve"
            ? `${review.groupName} can now access this contact.`
            : action === "revoke"
              ? `${review.groupName} no longer has access from this review.`
              : "The contact remains hidden from the requesting group.",
      });
    } catch (error) {
      toast({
        title:
          action === "approve"
            ? "Failed to grant access"
            : action === "revoke"
              ? "Failed to revoke access"
              : "Failed to reject access",
        description: (error as Error).message,
        variant: "destructive",
      });
    } finally {
      setBusyReviewId(null);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Contact Access Reviews</h1>
        <p className="text-muted-foreground">
          Review group access requests created by trusted sync and import flows.
        </p>
      </div>

      {error ? (
        <Alert variant="destructive">
          <ShieldAlert className="h-4 w-4" />
          <AlertTitle>Unable to load contact access reviews</AlertTitle>
          <AlertDescription>{(error as Error).message}</AlertDescription>
        </Alert>
      ) : null}

      <Card>
        <CardHeader>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <CardTitle>Pending reviews</CardTitle>
              <CardDescription>
                Hidden contact matches waiting for an admin decision.
              </CardDescription>
            </div>
            <Badge variant="secondary">{pendingReviews.length} pending</Badge>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex items-center gap-2 rounded-md border bg-muted/30 p-4 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading reviews
            </div>
          ) : pendingReviews.length === 0 ? (
            <div className="rounded-md border border-dashed p-6 text-sm text-muted-foreground">
              No pending contact access reviews.
            </div>
          ) : (
            <div className="space-y-3">
              {pendingReviews.map((review) => (
                <div
                  key={review.id}
                  className="rounded-md border border-amber-200 bg-amber-50/50 p-4"
                >
                  <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                    <ReviewSummary review={review} />
                    <div className="flex flex-wrap gap-2">
                      <Button
                        size="sm"
                        onClick={() =>
                          runAccessReviewAction(review, "approve")
                        }
                        disabled={busyReviewId !== null}
                      >
                        {busyReviewId === `approve:${review.id}` ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <UserPlus className="h-4 w-4" />
                        )}
                        Grant access
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => runAccessReviewAction(review, "reject")}
                        disabled={busyReviewId !== null}
                      >
                        {busyReviewId === `reject:${review.id}` ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <XCircle className="h-4 w-4" />
                        )}
                        Reject
                      </Button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <CardTitle>Approved access grants</CardTitle>
              <CardDescription>
                Recent grants that can be revoked if access was approved by
                mistake.
              </CardDescription>
            </div>
            <Badge variant="secondary">{approvedReviews.length} approved</Badge>
          </div>
        </CardHeader>
        <CardContent>
          {approvedReviews.length === 0 ? (
            <div className="rounded-md border border-dashed p-6 text-sm text-muted-foreground">
              No approved access grants.
            </div>
          ) : (
            <div className="space-y-3">
              {approvedReviews.map((review) => (
                <div
                  key={review.id}
                  className="rounded-md border border-emerald-200 bg-emerald-50/50 p-4"
                >
                  <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                    <ReviewSummary review={review} approved />
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => runAccessReviewAction(review, "revoke")}
                      disabled={busyReviewId !== null}
                    >
                      {busyReviewId === `revoke:${review.id}` ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Undo2 className="h-4 w-4" />
                      )}
                      Revoke
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function ReviewSummary({
  review,
  approved = false,
}: {
  review: ContactAccessReview;
  approved?: boolean;
}) {
  return (
    <div className="min-w-0 space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        {approved ? (
          <ShieldCheck className="h-4 w-4 text-emerald-700" />
        ) : (
          <ShieldAlert className="h-4 w-4 text-amber-700" />
        )}
        <p className="font-medium">
          {approved
            ? review.contactName || review.contactEmail || "Approved contact"
            : review.subject || "(No subject)"}
        </p>
        <Badge variant="outline">{review.groupName}</Badge>
        <Badge variant="outline">{review.emailInboxName}</Badge>
      </div>

      <p className="break-words text-sm text-muted-foreground">
        From {review.fromName ? `${review.fromName} ` : ""}
        &lt;{review.fromEmail}&gt; matched{" "}
        {review.contactName || review.contactEmail || "a contact"}.
      </p>
      <p className="text-sm text-muted-foreground">{review.matchReason}</p>

      {review.messagePreview ? (
        <p className="line-clamp-3 rounded-md bg-background/70 p-2 text-sm text-muted-foreground">
          {review.messagePreview}
        </p>
      ) : null}

      <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
        <span>
          Current groups:{" "}
          {review.contactGroups.length > 0
            ? review.contactGroups.map((group) => group.name).join(", ")
            : "none"}
        </span>
        <span>Last activity: {formatDate(review.contactLastEngagedAt)}</span>
        <span>Received: {formatDate(review.receivedAt)}</span>
        {approved ? (
          <span>
            Approved: {formatDate(review.reviewedAt)} by{" "}
            {review.reviewedByUserName || "an admin"}
          </span>
        ) : null}
      </div>
    </div>
  );
}
