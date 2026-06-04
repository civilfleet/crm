"use client";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  DEFAULT_INTERNAL_COPY_MODE,
  type InternalCopyMode,
} from "@/constants/email";

type InternalCopyFieldsProps = {
  idPrefix: string;
  emails: string;
  mode: InternalCopyMode;
  disabled?: boolean;
  onEmailsChange: (value: string) => void;
  onModeChange: (value: InternalCopyMode) => void;
};

export const InternalCopyFields = ({
  idPrefix,
  emails,
  mode,
  disabled,
  onEmailsChange,
  onModeChange,
}: InternalCopyFieldsProps) => {
  const hasInternalCopyRecipients = emails.trim().length > 0;
  const includeRecipientList = mode === "summary_with_recipients";

  return (
    <div className="space-y-3 rounded-md border bg-muted/20 p-3">
      <div className="space-y-2">
        <Label htmlFor={`${idPrefix}-internal-copy`}>Send report to</Label>
        <Input
          id={`${idPrefix}-internal-copy`}
          value={emails}
          onChange={(event) => onEmailsChange(event.target.value)}
          disabled={disabled}
          placeholder="internal@example.org, finance@example.org"
        />
        <p className="text-xs text-muted-foreground">
          Sends one batch-level report. Separate multiple addresses with commas,
          spaces, or new lines.
        </p>
      </div>

      <div className="flex items-start gap-3 rounded-md bg-background/60 p-3">
        <Switch
          id={`${idPrefix}-include-recipient-list`}
          checked={includeRecipientList}
          onCheckedChange={(checked) =>
            onModeChange(
              checked ? "summary_with_recipients" : DEFAULT_INTERNAL_COPY_MODE,
            )
          }
          disabled={disabled || !hasInternalCopyRecipients}
          aria-describedby={`${idPrefix}-include-recipient-list-description`}
        />
        <div className="space-y-1">
          <Label htmlFor={`${idPrefix}-include-recipient-list`}>
            Include recipient list in report
          </Label>
          <p
            id={`${idPrefix}-include-recipient-list-description`}
            className="text-xs text-muted-foreground"
          >
            {includeRecipientList
              ? "The report will include all recipient names and email addresses. Only send it to people who may see that information."
              : "The report includes batch metadata and the original email template, without listing every recipient."}
          </p>
        </div>
      </div>
    </div>
  );
};
