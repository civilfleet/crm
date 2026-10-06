import assert from "node:assert/strict";
import test from "node:test";
import {
  encodedBase64Bytes,
  getInboundMessageByteLimit,
  isEmailAttachmentBlocked,
  sanitizeAttachmentFileName,
} from "./attachments";

test("email attachment policy blocks executable defaults", () => {
  assert.equal(
    isEmailAttachmentBlocked("invoice.exe", "application/octet-stream"),
    true,
  );
  assert.equal(isEmailAttachmentBlocked("script.txt", "text/javascript"), true);
  assert.equal(
    isEmailAttachmentBlocked("invoice.pdf", "application/pdf"),
    false,
  );
});

test("email attachment policy supports explicit global replacements", () => {
  const previousExtensions = process.env.EMAIL_ATTACHMENT_BLOCKED_EXTENSIONS;
  const previousTypes = process.env.EMAIL_ATTACHMENT_BLOCKED_MIME_TYPES;
  process.env.EMAIL_ATTACHMENT_BLOCKED_EXTENSIONS = ".zip";
  process.env.EMAIL_ATTACHMENT_BLOCKED_MIME_TYPES = "application/x-custom";
  try {
    assert.equal(
      isEmailAttachmentBlocked("archive.zip", "application/zip"),
      true,
    );
    assert.equal(
      isEmailAttachmentBlocked("program.exe", "application/octet-stream"),
      false,
    );
  } finally {
    if (previousExtensions === undefined)
      delete process.env.EMAIL_ATTACHMENT_BLOCKED_EXTENSIONS;
    else process.env.EMAIL_ATTACHMENT_BLOCKED_EXTENSIONS = previousExtensions;
    if (previousTypes === undefined)
      delete process.env.EMAIL_ATTACHMENT_BLOCKED_MIME_TYPES;
    else process.env.EMAIL_ATTACHMENT_BLOCKED_MIME_TYPES = previousTypes;
  }
});

test("attachment helpers enforce safe names and stable size calculations", () => {
  assert.equal(sanitizeAttachmentFileName("../invoice\r\n.pdf"), "invoice.pdf");
  assert.equal(encodedBase64Bytes(4), 8);
  assert.equal(getInboundMessageByteLimit(), 100 * 1024 * 1024);
});
