import path from "node:path";

export const MAX_EMAIL_ATTACHMENT_COUNT = 10;
export const MAX_EMAIL_ATTACHMENT_BYTES = 10 * 1024 * 1024;
export const MAX_SMTP_MESSAGE_BYTES = 25 * 1024 * 1024;
export const MAX_SCALEWAY_MESSAGE_BYTES = 2 * 1024 * 1024;
export const DEFAULT_MAX_INBOUND_MESSAGE_BYTES = 100 * 1024 * 1024;

const DEFAULT_BLOCKED_EXTENSIONS = new Set([
  ".app",
  ".bat",
  ".cmd",
  ".com",
  ".cpl",
  ".exe",
  ".hta",
  ".jar",
  ".js",
  ".jse",
  ".lnk",
  ".msi",
  ".msp",
  ".ps1",
  ".reg",
  ".scr",
  ".sh",
  ".vbe",
  ".vbs",
  ".wsf",
]);

const DEFAULT_BLOCKED_MIME_TYPES = new Set([
  "application/java-archive",
  "application/vnd.microsoft.portable-executable",
  "application/x-dosexec",
  "application/x-msdownload",
  "application/x-msdos-program",
  "application/x-sh",
  "text/javascript",
]);

export const SCALEWAY_ATTACHMENT_MIME_TYPES = new Set([
  "application/msword",
  "application/pdf",
  "application/vnd.ms-excel",
  "application/vnd.ms-powerpoint",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "image/gif",
  "image/jpeg",
  "image/png",
  "image/webp",
  "text/csv",
  "text/plain",
]);

export const SAFE_INLINE_IMAGE_MIME_TYPES = new Set([
  "image/gif",
  "image/jpeg",
  "image/png",
  "image/webp",
]);

const configuredSet = (value: string | undefined, defaults: Set<string>) => {
  if (value === undefined) return defaults;
  return new Set(
    value
      .split(",")
      .map((item) => item.trim().toLowerCase())
      .filter(Boolean),
  );
};

export const isEmailAttachmentBlocked = (
  fileName: string,
  contentType: string,
) => {
  const extensions = configuredSet(
    process.env.EMAIL_ATTACHMENT_BLOCKED_EXTENSIONS,
    DEFAULT_BLOCKED_EXTENSIONS,
  );
  const mimeTypes = configuredSet(
    process.env.EMAIL_ATTACHMENT_BLOCKED_MIME_TYPES,
    DEFAULT_BLOCKED_MIME_TYPES,
  );
  return (
    extensions.has(path.extname(fileName).toLowerCase()) ||
    mimeTypes.has(contentType.toLowerCase())
  );
};

export const getInboundMessageByteLimit = () => {
  const configured = Number(process.env.EMAIL_INBOUND_MAX_MESSAGE_BYTES);
  return Number.isSafeInteger(configured) && configured > 0
    ? configured
    : DEFAULT_MAX_INBOUND_MESSAGE_BYTES;
};

export const sanitizeAttachmentFileName = (value?: string | null) => {
  const base = path.basename(value?.trim() || "attachment");
  return base.replace(/[\r\n\0]/g, "").slice(0, 255) || "attachment";
};

export const encodedBase64Bytes = (sizeBytes: number) =>
  Math.ceil(sizeBytes / 3) * 4;
