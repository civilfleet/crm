import assert from "node:assert/strict";
import test from "node:test";
import {
  escapeEmailHtml,
  getStoredReferences,
  normalizeReplySubject,
} from "./reply-helpers";

test("normalizeReplySubject adds exactly one reply prefix", () => {
  assert.equal(normalizeReplySubject("Question"), "Re: Question");
  assert.equal(normalizeReplySubject("RE: Question"), "RE: Question");
  assert.equal(normalizeReplySubject(""), "Re: Email reply");
});

test("getStoredReferences preserves the thread and removes duplicates", () => {
  assert.deepEqual(
    getStoredReferences(
      { references: JSON.stringify(["<first@example.org>"]) },
      "<second@example.org>",
    ),
    ["<first@example.org>", "<second@example.org>"],
  );
  assert.deepEqual(
    getStoredReferences(
      { references: "<same@example.org>" },
      "<same@example.org>",
    ),
    ["<same@example.org>"],
  );
});

test("escapeEmailHtml escapes markup and preserves line breaks", () => {
  assert.equal(
    escapeEmailHtml('<script>alert("x")</script>\nNext'),
    "&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt;<br>Next",
  );
});
