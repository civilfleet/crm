"use client";

import { AlertTriangle, Loader2, Paperclip, X } from "lucide-react";
import { useId, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export type PendingEmailAttachment = {
  pendingUploadId: string;
  fileName: string;
  sizeBytes: number;
};

export type EmailAttachmentSummary = {
  id: string;
  fileName: string;
  contentType: string;
  sizeBytes: number;
  status: "AVAILABLE" | "BLOCKED" | "OMITTED";
  direction: "INBOUND" | "OUTBOUND";
  inline: boolean;
};

const formatBytes = (bytes: number) => {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.ceil(bytes / 1024)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
};

export function EmailAttachmentUploader({
  teamId,
  inboxId,
  attachments,
  onChange,
  disabled,
}: {
  teamId: string;
  inboxId: string;
  attachments: PendingEmailAttachment[];
  onChange: (attachments: PendingEmailAttachment[]) => void;
  disabled?: boolean;
}) {
  const id = useId();
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string>();

  const upload = async (files: FileList | null) => {
    if (!files?.length) return;
    if (attachments.length + files.length > 10) {
      setError("A reply can include at most 10 attachments.");
      return;
    }
    setUploading(true);
    setError(undefined);
    try {
      const uploaded = [...attachments];
      for (const file of Array.from(files)) {
        if (file.size > 10 * 1024 * 1024) {
          throw new Error(`${file.name} exceeds the 10 MB per-file limit.`);
        }
        const response = await fetch(
          `/api/teams/${teamId}/email-inboxes/${inboxId}/attachments/upload`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              fileName: file.name,
              fileType: file.type || "application/octet-stream",
              sizeBytes: file.size,
            }),
          },
        );
        const payload = await response.json();
        if (!response.ok)
          throw new Error(payload.error || "Attachment upload failed.");
        const put = await fetch(payload.putUrl, {
          method: "PUT",
          headers: { "Content-Type": file.type || "application/octet-stream" },
          body: file,
        });
        if (!put.ok) throw new Error(`${file.name} could not be uploaded.`);
        uploaded.push({
          pendingUploadId: payload.pendingUploadId,
          fileName: file.name,
          sizeBytes: file.size,
        });
      }
      onChange(uploaded);
    } catch (uploadError) {
      setError(
        uploadError instanceof Error
          ? uploadError.message
          : "Attachment upload failed.",
      );
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="space-y-2">
      <Label htmlFor={id}>Attachments</Label>
      <Input
        id={id}
        type="file"
        multiple
        disabled={disabled || uploading || attachments.length >= 10}
        onChange={(event) => {
          void upload(event.target.files);
          event.target.value = "";
        }}
      />
      {uploading ? (
        <p className="flex items-center gap-2 text-xs text-muted-foreground">
          <Loader2 className="h-3.5 w-3.5 animate-spin" /> Uploading attachment…
        </p>
      ) : null}
      {attachments.map((attachment) => (
        <div
          key={attachment.pendingUploadId}
          className="flex items-center gap-2 text-sm"
        >
          <Paperclip className="h-4 w-4" />
          <span className="min-w-0 flex-1 truncate">{attachment.fileName}</span>
          <span className="text-xs text-muted-foreground">
            {formatBytes(attachment.sizeBytes)}
          </span>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            disabled={disabled}
            aria-label={`Remove ${attachment.fileName}`}
            onClick={() =>
              onChange(
                attachments.filter(
                  (item) => item.pendingUploadId !== attachment.pendingUploadId,
                ),
              )
            }
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
      ))}
      {error ? <p className="text-xs text-destructive">{error}</p> : null}
    </div>
  );
}

export function EmailAttachmentLinks({
  teamId,
  attachments,
}: {
  teamId: string;
  attachments?: EmailAttachmentSummary[];
}) {
  if (!attachments?.length) return null;
  return (
    <div className="space-y-1 rounded-md border bg-muted/20 p-3 text-sm">
      <p className="font-medium">Attachments</p>
      {attachments.map((attachment) =>
        attachment.status === "AVAILABLE" ? (
          <a
            key={attachment.id}
            className="flex items-center gap-2 text-primary underline-offset-4 hover:underline"
            href={`/api/teams/${teamId}/email-attachments/${attachment.id}/content${attachment.direction === "INBOUND" ? "?acknowledgeRisk=true" : ""}`}
            onClick={(event) => {
              if (
                attachment.direction === "INBOUND" &&
                !window.confirm(
                  "Only open attachments you trust. Your mail server scanned this file, but the CRM does not scan it again. Download it?",
                )
              ) {
                event.preventDefault();
              }
            }}
          >
            <Paperclip className="h-4 w-4" />
            <span>{attachment.fileName}</span>
            <span className="text-xs text-muted-foreground">
              ({formatBytes(attachment.sizeBytes)})
            </span>
          </a>
        ) : (
          <p
            key={attachment.id}
            className="flex items-center gap-2 text-muted-foreground"
          >
            <AlertTriangle className="h-4 w-4 text-amber-600" />
            {attachment.fileName} was blocked by policy.
          </p>
        ),
      )}
    </div>
  );
}
