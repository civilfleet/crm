import assert from "node:assert/strict";
import test from "node:test";
import { resolveActivityInboxReadState } from "@/services/activity-inbox/read-state";

const cutoff = new Date("2026-07-13T12:00:00.000Z");

test("treats activity before the inbox cutoff as read", () => {
  assert.equal(
    resolveActivityInboxReadState({
      engagementCreatedAt: new Date("2026-07-13T11:59:00.000Z"),
      readThroughAt: cutoff,
      currentUserId: "user-1",
    }),
    true,
  );
});

test("treats new activity from another user as unread", () => {
  assert.equal(
    resolveActivityInboxReadState({
      engagementCreatedAt: new Date("2026-07-13T12:01:00.000Z"),
      readThroughAt: cutoff,
      engagementUserId: "user-2",
      currentUserId: "user-1",
    }),
    false,
  );
});

test("treats activity created by the current user as read", () => {
  assert.equal(
    resolveActivityInboxReadState({
      engagementCreatedAt: new Date("2026-07-13T12:01:00.000Z"),
      readThroughAt: cutoff,
      engagementUserId: "user-1",
      currentUserId: "user-1",
    }),
    true,
  );
});

test("explicit state overrides the cutoff and author defaults", () => {
  assert.equal(
    resolveActivityInboxReadState({
      explicitIsRead: false,
      engagementCreatedAt: new Date("2026-07-13T11:00:00.000Z"),
      readThroughAt: cutoff,
      engagementUserId: "user-1",
      currentUserId: "user-1",
    }),
    false,
  );
  assert.equal(
    resolveActivityInboxReadState({
      explicitIsRead: true,
      engagementCreatedAt: new Date("2026-07-13T13:00:00.000Z"),
      readThroughAt: cutoff,
      currentUserId: "user-1",
    }),
    true,
  );
});
