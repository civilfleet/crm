"use client";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DEFAULT_INTERNAL_COPY_MODE,
  INTERNAL_COPY_MODE_LABELS,
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

  return (
    <div className="space-y-3 rounded-md border bg-muted/20 p-3">
      <div className="space-y-2">
        <Label htmlFor={`${idPrefix}-internal-copy`}>
          Internal copy recipients
        </Label>
        <Input
          id={`${idPrefix}-internal-copy`}
          value={emails}
          onChange={(event) => onEmailsChange(event.target.value)}
          disabled={disabled}
          placeholder="internal@example.org, finance@example.org"
        />
        <p className="text-xs text-muted-foreground">
          Receives one batch-level copy. Separate multiple addresses with
          commas, spaces, or new lines.
        </p>
      </div>

      <div className="space-y-2">
        <Label htmlFor={`${idPrefix}-internal-copy-mode`}>Copy content</Label>
        <Select
          value={mode}
          onValueChange={(value) => onModeChange(value as InternalCopyMode)}
          disabled={disabled || !hasInternalCopyRecipients}
        >
          <SelectTrigger id={`${idPrefix}-internal-copy-mode`}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={DEFAULT_INTERNAL_COPY_MODE}>
              {INTERNAL_COPY_MODE_LABELS.summary}
            </SelectItem>
            <SelectItem value="summary_with_recipients">
              {INTERNAL_COPY_MODE_LABELS.summary_with_recipients}
            </SelectItem>
          </SelectContent>
        </Select>
        <p className="text-xs text-muted-foreground">
          {mode === "summary_with_recipients"
            ? "This internal copy will include the full recipient list for this batch, including names and email addresses. Only use this for recipients who may see that information."
            : "The internal copy includes batch metadata and the original email template, without listing every recipient."}
        </p>
      </div>
    </div>
  );
};
