export const INTERNAL_COPY_MODES = [
  "summary",
  "summary_with_recipients",
] as const;

export type InternalCopyMode = (typeof INTERNAL_COPY_MODES)[number];

export const DEFAULT_INTERNAL_COPY_MODE: InternalCopyMode = "summary";

export const INTERNAL_COPY_MODE_LABELS: Record<InternalCopyMode, string> = {
  summary: "Summary only",
  summary_with_recipients: "Summary with recipient list",
};
