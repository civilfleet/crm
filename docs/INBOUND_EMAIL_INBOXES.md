# Inbound Email Inboxes

## Goal

Support syncing incoming email from configured inboxes into the CRM contact
history. Inboxes should be configured per group, not only per team, so incoming
messages inherit the right contact visibility and ownership boundaries.

## Recommended Model

Add a first-class inbox configuration table instead of overloading the existing
outbound email integration.

```prisma
model EmailInbox {
  id           String   @id @default(uuid())
  teamId       String
  groupId      String
  group        Group    @relation(fields: [groupId], references: [id], onDelete: Cascade)

  name         String   @db.VarChar(255)
  host         String   @db.VarChar(255)
  port         Int
  secure       Boolean  @default(true)
  username     String   @db.VarChar(255)
  password     String   @db.Text // encrypted at rest
  mailbox      String   @default("INBOX") @db.VarChar(255)
  autoApproveExistingVisible Boolean @default(true)
  requireReviewForHiddenMatches Boolean @default(true)
  allowCreateContacts Boolean @default(false)
  allowedDomains String[] @default([])

  isEnabled    Boolean  @default(true)
  lastSyncedAt DateTime?
  uidValidity  BigInt?
  lastUid      BigInt?

  createdAt    DateTime @default(now())
  updatedAt    DateTime @updatedAt

  @@index([teamId])
  @@index([groupId])
}
```

Also add an imported-message table for durable dedupe and traceability.

```prisma
model InboundEmailMessage {
  id            String   @id @default(uuid())
  teamId        String
  groupId       String
  emailInboxId  String

  mailbox       String   @db.VarChar(255)
  uidValidity   BigInt?
  uid           BigInt
  messageId     String?  @db.VarChar(500)

  fromEmail     String   @db.VarChar(255)
  fromName      String?  @db.VarChar(255)
  subject       String?  @db.VarChar(500)
  body          String   @db.Text
  receivedAt    DateTime @db.Timestamptz(6)

  contactId     String?
  engagementId  String?
  accessReviews ContactAccessReview[]
  rawHeaders    Json?
  createdAt     DateTime @default(now()) @db.Timestamptz(6)

  @@unique([emailInboxId, mailbox, uidValidity, uid])
  @@index([teamId, fromEmail])
  @@index([groupId])
  @@index([messageId])
}
```

Access-review state lives on a separate group-visibility workflow record, not
on the imported message itself.

```prisma
model ContactAccessReview {
  id            String   @id @default(uuid())
  teamId        String
  groupId       String
  contactId     String
  source        String
  inboundEmailMessageId String?
  status        ContactAccessReviewStatus @default(PENDING)
  reviewedAt    DateTime?
  reviewedByUserId String?
  reviewedByUserName String?
  revokedAt     DateTime?
  revokedByUserId String?
  revokedByUserName String?
  reviewNote    String?
  createdAt     DateTime @default(now()) @db.Timestamptz(6)
  updatedAt     DateTime @updatedAt
}
```

IMAP UID plus UIDVALIDITY should be the primary dedupe key. `Message-ID` is
useful as supporting metadata, but should not be the only dedupe mechanism.

## Sync Behavior

The existing background worker owns inbox sync. API routes do not hold
long-lived IMAP connections open.

Recommended first version:

1. Load enabled `EmailInbox` records.
2. For each inbox, connect to IMAP and open the configured mailbox.
3. Fetch messages newer than the stored UID checkpoint.
4. Parse each message.
5. Upsert an `InboundEmailMessage` by inbox, mailbox, UIDVALIDITY, and UID.
6. Match sender email to an existing contact in the same team.
7. Create a `ContactEngagement` for matched contacts:
   - `direction: INBOUND`
   - `source: EMAIL`
   - `subject`: parsed email subject
   - `message`: sanitized HTML or text body
   - `externalSource`: `IMAP`
   - `externalId`: stable inbox/message key
   - `engagedAt`: message received date
8. Advance the inbox UID checkpoint only after messages are stored.

IMAP `IDLE` can be added later as an optimization. The first version uses
polling plus UID checkpoints because it is simpler and more reliable in
deployment. The default worker interval is 60 seconds and can be tuned with
`INBOUND_EMAIL_SYNC_INTERVAL_MS`.

## Implemented Runtime

The implementation lives in `src/services/inbound-email/index.ts` and is wired
into `src/services/background-worker.ts`.

Admin API routes:

- `GET /api/teams/:teamId/email-inboxes`
- `POST /api/teams/:teamId/email-inboxes`
- `PATCH /api/teams/:teamId/email-inboxes/:inboxId`
- `DELETE /api/teams/:teamId/email-inboxes/:inboxId`
- `POST /api/teams/:teamId/email-inboxes/:inboxId/test`
- `POST /api/teams/:teamId/email-inboxes/:inboxId/sync`

Incoming messages create `ContactEngagement` timeline entries with
`direction: INBOUND`, `source: EMAIL`, and `externalSource: IMAP` only when the
matched or created contact is visible to the inbox group, or after an admin
approves access for a hidden match.

## Group Visibility

Each inbox belongs to one group. Incoming messages from that inbox are treated as
belonging to that group's CRM scope.

When an inbound message matches an existing contact:

- If the contact has no groups, leave it globally visible unless product policy
  says otherwise.
- If the contact already belongs to the inbox group, create the engagement when
  `autoApproveExistingVisible` is enabled; otherwise create a review record so
  an admin confirms importing the message into contact history.
- If the contact belongs to other groups but not this group, do not add a
  `ContactGroup` row automatically when `requireReviewForHiddenMatches` is
  enabled. Store the inbound message and create a pending
  `ContactAccessReview` so an admin can approve or reject adding the inbox
  group to the contact. If review is disabled for that inbox, the system grants
  the group and logs the automatic access change.

When an inbound message does not match a contact, make this behavior
configurable per inbox:

- `allowCreateContacts: false`: store unmatched messages only.
- `allowCreateContacts: true`: create a contact in the inbox group.

The default is to store unmatched senders only until the team explicitly opts
into automatic contact creation. `allowedDomains` can further limit which sender
domains are allowed to create contact history or access reviews; when set,
out-of-policy messages are stored for dedupe/audit but do not create contacts,
engagements, or access reviews.

## Permission Behavior

Inbound email sync runs as a background system process, not as the viewing user.
That means the worker can match an email address to an existing team contact
even when a particular user would not currently be able to see that contact.

The implemented rule is group ownership with admin-reviewed permission
expansion:

- If the matched contact is already visible to the inbox group and
  `autoApproveExistingVisible` is enabled, only the inbound engagement is
  created.
- If the matched contact is already visible but auto-approval is disabled, the
  message is stored and a pending `ContactAccessReview` confirms whether the
  email should be added to the timeline.
- If the matched contact exists but is not visible to the inbox group, the sync
  stores an `InboundEmailMessage`, links it to the contact, stores the sanitized
  body for later approval, creates a pending `ContactAccessReview`, and
  does not create a `ContactEngagement`, unless
  `requireReviewForHiddenMatches` is disabled.
- If hidden-match review is disabled, the sync treats the inbox as trusted,
  adds the inbox group to the contact, creates the inbound engagement, and logs
  the automatic access grant.
- If an admin approves the review, the sync adds the inbox group to the contact,
  creates or links the inbound engagement, marks the review `APPROVED`, and
  writes a contact change log for the access grant.
- If an admin rejects the review, the contact remains hidden from the inbox
  group and the review is marked `REJECTED`.
- If an admin revokes an approved review, the review is marked `REVOKED`, the
  access change is logged, and the inbox group is removed from the contact when
  no other approved review still justifies that same group/contact access. The
  imported email history is retained as audit/history.
- If no contact matches and `allowCreateContacts` is disabled, only the
  `InboundEmailMessage` dedupe/audit record is stored; no contact timeline entry
  is visible yet.
- If no contact matches and `allowCreateContacts` is enabled, the sync
  creates a contact assigned to the inbox group, then creates the inbound
  engagement.

This avoids silent permission expansion while still giving admins a direct path
to grant normal contact access when an inbox should own that relationship.

## Admin UI

Expose inbox configuration from group administration or CRM settings:

- Group
- Inbox name
- IMAP host
- IMAP port
- TLS/secure toggle
- Username
- Password or app password
- Mailbox folder, default `INBOX`
- Auto-import visible matches toggle
- Review hidden matches toggle
- Create unknown contacts toggle
- Allowed sender domains
- Enabled toggle
- Test connection action
- Sync now action
- Pending access review queue with approve/reject actions
- Approved access grants with revoke action

Credentials are encrypted at rest with AES-256-GCM. Set a stable
`INBOUND_EMAIL_ENCRYPTION_KEY`; if unset, the app falls back to `AUTH_SECRET`.
Changing that value after inboxes are configured makes existing stored IMAP
passwords unreadable.

## Implementation Notes

- Use a mature IMAP library such as `imapflow`.
- Use `mailparser` to parse MIME messages.
- Sanitize inbound HTML before rendering it in the CRM.
- Keep raw email bodies out of `ContactEngagement` if storage size becomes a
  concern; store normalized display content there and keep full source in a
  dedicated message table or object storage.
- Add per-inbox locking before running multiple worker instances. Without it,
  two workers could sync the same inbox concurrently.
- Handle UIDVALIDITY changes by resetting the UID checkpoint for that mailbox
  and leaning on stored message metadata to reduce duplicate imports.
- Treat deleted or moved mailbox messages as historical CRM records. Once an
  email has been imported into contact history, do not delete it just because it
  disappeared from IMAP.
