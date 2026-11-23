# Data rules

How funding requests and contacts change, what keeps their data consistent,
and where each rule is enforced and tested. When you change one of these
rules, change this page, the code and its test together.
Known open points are in [FOLLOW_UPS.md](FOLLOW_UPS.md).

- [Funding requests](#funding-requests)
  - [The status path](#the-status-path)
  - [Payouts and amounts](#payouts-and-amounts)
  - [Donation agreements and signatures](#donation-agreements-and-signatures)
- [Contacts](#contacts)
  - [Who sees a contact](#who-sees-a-contact)
  - [Restricted fields](#restricted-fields)
  - [Editing a contact](#editing-a-contact)
  - [E-mail addresses](#e-mail-addresses)
  - [Merging contacts](#merging-contacts)
  - [Languages](#languages)
  - [Klaviyo](#klaviyo)
  - [Trash, restore and permanent delete](#trash-restore-and-permanent-delete)
  - [Organizations in the trash](#organizations-in-the-trash)
- [Lists and saved views](#lists-and-saved-views)
- [Rules held by the database](#rules-held-by-the-database)
- [Tests and CI](#tests-and-ci)
- [Production checks](#production-checks)

## Funding requests

### The status path

```
Submitted → Accepted → WaitingForSignature → FundsDisbursing → Completed
                                  Approved → FundsDisbursing   (older path)

Rejected: from any stage before the first payout.
Completed is final; a global administrator may reopen Rejected to Submitted.
```

Some steps are made by people, others only by the system:

| From | A team member may move it to | The system moves it to |
|---|---|---|
| Submitted | Accepted, Rejected | |
| Accepted | Submitted (undo), Rejected | WaitingForSignature, when the donation agreement is created |
| WaitingForSignature | Rejected | FundsDisbursing, with the last signature |
| Approved (older path) | FundsDisbursing, Rejected | |
| FundsDisbursing | Rejected, only while no payout exists | Completed, with the payout that leaves nothing remaining |
| Completed | nothing: final | |
| Rejected | nothing; a global administrator may reopen it to Submitted | |

The same rules apply to both ways a status can be changed: the status
buttons (`PUT /api/funding-requests/:id/status`) and the edit form
(`PUT /api/funding-requests/:id`). A refused change answers `409` with the
reason. Organization members cannot change the status at all; the edit route
drops it.

- Rules: `src/lib/funding-status.ts` (`assertManualStatusChange`)
- Applied in: `updateFundingRequestStatus`, `updateFundingRequest`
  (`src/services/funding-request/index.ts`)
- Tests: `tests/funding-status.test.ts` (every pair of statuses),
  `tests/db/funding-request-rules.test.ts`

### Payouts and amounts

- A payout (`Transaction`) is made only while the request is
  **FundsDisbursing**, so only after every signature.
- A payout is greater than zero and never more than what remains. Payouts are
  written in a serializable transaction, so payouts at the same time can never
  pay out more than the agreed amount together.
- The **remaining amount** is always the agreed amount minus all payouts. It
  is written by the system and cannot be typed in.
- The **agreed amount** can be changed, but never below what was already paid
  out; the remaining amount follows it.
- The payout that brings the remaining amount to zero completes the request.

Code: `createTransaction` (`src/services/transactions/index.ts`),
`calculateTransactionBalance` (`balance.ts`), `updateFundingRequest`.
Tests: `tests/db/transactions.test.ts`, `tests/db/funding-request-rules.test.ts`.

### Donation agreements and signatures

- An agreement is created only for an **Accepted** request. Creating it
  stores the file, the agreement and one signature row per signer, and moves
  the request to WaitingForSignature, all in one transaction.
- **Every signer e-mail must belong to a user** (case does not matter), and
  there must be at least one signer. An agreement with a missing signer could
  never be completed.
- Only a listed signer can sign, each exactly once, and only while the request
  is WaitingForSignature. The last signature moves it to FundsDisbursing.
- A status change that names an agreement (`donationId`) waits until that
  agreement is fully signed and must name an agreement of the same request.
- **A user who signed cannot be deleted**: the signature is the record of who
  signed. (The app removes people from teams and organizations; it never
  deletes users.)

Code: `src/services/donation-agreement/index.ts`.
Tests: `tests/db/donation-agreements.test.ts`.

## Contacts

### Who sees a contact

A contact is visible to a team member when one of these is true:

- the contact is in **no group**: the whole team sees it;
- the person is in one of the contact's groups;
- the person is in a group that **can access all contacts**;
- the person is a **global administrator**.

Listing, opening, editing, merging, trashing, restoring and permanently
deleting all apply this rule (`getContactVisibility` in
`src/services/contacts/access.ts`; opening a contact, `getContactById`, has its
own copy of the same check). A contact the person cannot see behaves as if it
did not exist.

### Restricted fields

Some fields are sensitive: gender, gender request preference, BIPOC, racism
request preference, other margins, onboarding date and break-until date. A
team can restrict each of them to groups (`ContactFieldAccess`). Someone
outside those groups neither sees nor changes the field: reads remove it, and
an edit ignores it. Ignoring means "leave as it is", never "clear it".

Code: `applyContactFieldAccess`, `filterContactByAccess`
(`src/services/contacts/index.ts`).

### Where a contact came from

Every way of creating a contact writes one **Created** history entry
(`logContactCreation`, `src/services/contact-change-logs`) with
`metadata.source`: `manual` (contact form, with the user), `website-form`,
`event-registration`, `inbound-email`, `zammad` or `klaviyo`. There is no
column for it: the entry is the record. The contact page shows it under
*Created At* ("by Ana", "from the website form “Firma”"), worded by
`describeCreation` (`src/lib/contact-change-format.ts`), the same helper the
history uses. Only a signed-in user is named as "who"; automatic paths name
themselves through the source. Contacts created before sources were saved
show no source.

Tests: `tests/contact-change-format.test.ts`,
`tests/db/intake-matching.test.ts`.

### Editing a contact

`updateContact` (`src/services/contacts/index.ts`):

- changes **only the fields that were sent**; everything else stays;
- runs in **one transaction**: if any part fails (an unknown organization, a
  group of another team, a taken e-mail), nothing changes, history included;
- writes **one history entry per changed field**, with old and new value and
  who changed it. Values sent unchanged leave no entry, profile attributes
  included (their old and new values are stored in the same shape);
- **groups** end up exactly as sent (an empty list removes all groups, which
  makes the contact visible to the whole team); only groups of the team;
- **organizations** end up exactly as sent; only organizations of the team;
  changes are recorded in the history.

The contact page shows the history as sentences in plain words
(`src/lib/contact-change-format.ts`, tests in
`tests/contact-change-format.test.ts`). Group and organization ids are shown
by name (`getContactChangeLogs` adds `valueLabels`), and entries whose old and
new values read the same (older saves logged unchanged profile attributes)
are left out.

Tests: `tests/db/contacts-edit.test.ts`.

### E-mail addresses

- Each contact has exactly one **primary** address, and may have **aliases**
  and **shared** addresses.
- A primary or alias address identifies one contact: no two contacts of a team
  share it. Shared addresses (a family or an office) may repeat.
- Addresses are stored lowercase.
- A contact in the trash keeps its addresses, so it can always be restored.
  Using one of them elsewhere is refused with "belongs to a contact in the
  trash"; restore or permanently delete that contact first.

The code checks this before saving, and the database enforces it as well, so
two saves at the same moment cannot both win (see below).

Each contact also keeps a copy of its primary address in `Contact.primaryEmail`,
only so the list can sort by e-mail (a database cannot order contacts by a row
in another table). A database trigger (`contact_primary_email_sync`, migration
`20261116120000_contact_primary_email_sort`) updates it on every change to
`ContactEmail`, whichever code makes it. Never write `primaryEmail` yourself.

### Merging contacts

`mergeContacts` keeps one contact (the target) and removes the others (the
sources). Before removing them it moves **everything** that pointed at them
onto the target: e-mail addresses (as chosen), groups, organizations, list
memberships, files, engagements and tasks (with their assignee), inbox
messages, e-mail recipients, event participation and roles, registrations,
form submissions, consents, attributes, social links, languages, access
reviews, the organization contact-person link, and the history. Duplicates
are kept once; a language several of them speak keeps the higher level.

Removing a source contact deletes whatever still points at it, so **every
new table that references `Contact` must be handled in `mergeContacts`**.
The merge test enforces this: it reads all foreign keys to `Contact` from
the database and fails when its test data does not cover one, or when a
merge loses a row (`tests/db/contacts-merge.test.ts`).

A merge is all or nothing, and every contact in it must be visible to the
person merging.

### Languages

A contact has a list of languages it speaks, each with an optional level
(Basic, Conversational, Fluent, Native); an organization has a list of the
languages it works in, without levels. Both are stored as ISO 639-1 codes
(`src/lib/languages.ts`) and shown by their English names; unknown codes are
dropped, and a language is listed once (with the higher level).

- An edit replaces a contact's languages with the list sent; leaving them
  out keeps them. Each language added, removed or given another level is
  one history entry (`language.<code>`, the level or "Spoken").
- The "Speaks" filter (contacts and smart lists) takes a language and an
  optional minimum level; "Uses language" filters organizations. Several
  language filters must all hold.
- Languages are not a restricted field: whoever sees the contact sees them.

(`tests/db/languages.test.ts`)

### Which contact a website submission belongs to

Website forms and event registrations find their contact **by e-mail only**
(primary or alias address of the team). A phone number never picks a
contact: a new contact is made, and contacts with the same number are noted
as possible duplicates on it, for a person to merge or dismiss. An address
of a contact in the trash brings that contact back. Code:
`src/services/contact-intake`, `src/services/contact-duplicates`. Tests:
`tests/db/intake-matching.test.ts`.

### Proposed changes

Website forms, event registrations and Klaviyo never overwrite a value an
existing contact already has. A different value is recorded as a proposal
(`PROPOSED` in the change history) and waits for a person. Klaviyo can also
propose withdrawing marketing consent (field `marketingConsent`, see
"Klaviyo"); applying it records the withdrawal, it changes no contact field:

- **Where:** on the contact ("Pending changes", above its consents) and for
  the whole team under CRM → Pending changes, oldest first.
- **Apply** sets the field and writes an `UPDATED` entry pointing at the
  proposal, with the value it replaced and who decided. Postal code and
  country update the coordinates as an edit does. For an e-mail address:
  **Make primary address** (the old primary stays as an alias) or **Add as
  additional address**. An address of another contact is refused, as in an
  edit.
- **Decline** writes a `PROPOSAL_REJECTED` entry; nothing else changes.
- **One row per value:** every submission records its own proposals, and
  the same value from several submissions (compared loosely) is one row,
  "proposed by N submissions". Deciding it decides all of them, including
  ones whose submission is still unconfirmed; those resolutions are marked
  `decidedWith` and not listed again in the history.
- **Once:** a proposal is decided at most once; the database allows one
  resolution per proposal, so two people deciding at the same moment cannot
  both win.
- **Who:** anyone with the CRM who can see the contact; others neither see
  nor decide its proposals.
- **Not before confirmation:** a proposal from a submission still waiting for
  its e-mail confirmation is not listed (anyone can type someone's address);
  it appears once the address is confirmed, and is removed with the
  submission otherwise.

Code: `src/services/contact-proposals`. Tests:
`tests/db/contact-proposals.test.ts`.

### Website forms

The Forms page lists a form's submissions only for contacts the user may
see; its counts follow the same rule. The public counter is the one
exception: it counts every person who sent the form, because it publishes a
number and no one's data (`src/services/forms`, `tests/db/forms.test.ts`).

### Consent

What a person agreed to beyond a single form, for example to receive updates
(purpose `marketing`), is kept in `ContactConsent`:

- **Append-only.** Every grant or withdrawal is a new row with the purpose,
  the words the person saw, the locale, the source (website form, by hand or
  another system), the form and submission, and when. The latest row per
  purpose is what holds now (`src/services/contact-consents`).
- **From website forms, only after the e-mail is confirmed.** A ticked
  consent question with a purpose becomes a `PENDING` row in the same
  transaction as the submission (`src/services/form-submissions`) and makes
  the CRM send a confirmation e-mail. When the link is used, a `GRANTED` row
  follows with the confirmation time (`src/services/form-confirmations`).
  Never confirmed within 7 days, the pending row is removed with its
  submission. A consent question without a purpose, such as agreeing to the
  processing of a petition signature, stays an answer of that submission only.
- **What holds now** is the latest `GRANTED` or `WITHDRAWN` row; a `PENDING`
  row only while there is none, so signing again never hides a confirmed
  consent.
- **An unticked box never withdraws.** Signing again without the tick leaves
  an earlier consent as it is; only an explicit unsubscribe or a change by
  hand writes `WITHDRAWN`.
- **Only consents the published form asks for.** A purpose holds only when
  the form the website published has a consent question with that id and
  purpose, and the recorded wording is the published one
  (`src/lib/public-forms/verify.ts`); a forged purpose records nothing.
- **The purposes are a fixed list**, `CONSENT_PURPOSES` in
  `src/lib/public-forms/submission.ts`, mirrored in the website's shared forms
  contract.
- Merging contacts moves their consents, history included; deleting a contact
  permanently deletes them.
- **Filters and smart lists** (`src/services/contacts`, `getTeamContacts`):
  "Gave consent" counts a contact whose consent for the purpose holds now
  (the latest grant or withdrawal is a grant; a pending tick alone does not
  count). "Sent a form" counts confirmed submissions of that form by default,
  or every submission on request, and can add "wants updates" or "doesn't":
  marketing consent as it holds now, wherever it was given (another form, by
  hand), since that is what decides who may be e-mailed. Both stay within the
  team and the usual contact visibility.

Tests: `tests/public-forms.test.ts` (contract, intake),
`tests/db/form-consent.test.ts` (real intake, unticked box, a confirmed
consent holds, team scope), `tests/db/form-confirmation.test.ts`
(confirmation, removal after 7 days), `tests/db/contact-form-filters.test.ts`
(the form and consent filters) and `tests/db/contacts-merge.test.ts`.

### Klaviyo

A team can connect a Klaviyo account (Settings → Integrations; team admins
only). The background worker syncs every 15 minutes
(`KLAVIYO_SYNC_INTERVAL_MS`), and "Sync now" queues one; the sync never runs
in a web request. One sync per team is queued or running at a time; the
database refuses a second (`KlaviyoSyncJob_active_team_key`). A sync that
fails on Klaviyo's side (unreachable, rate limit beyond five waits, a
refused key) is retried with growing pauses, five times. Code:
`src/services/integrations/klaviyo.ts`, `klaviyo-queue.ts`,
`src/lib/klaviyo.ts` (API) and `src/lib/klaviyo-mapping.ts` (translation).

**Profiles → contacts.** The first sync reads every profile, later ones the
profiles changed since the last sync (ten minutes of overlap). A profile is
matched by e-mail address, like a website form, through the same
`resolveIntakeContact`:

- an existing contact **only gets empty fields filled** (name, phone, city);
  a different value becomes a proposal by "Klaviyo" (see "Proposed changes").
  A value Klaviyo already proposed for the contact, decided or not, is not
  proposed again;
- a profile without a name leaves the contact's name as it is; a new contact
  without one is named after its address;
- a new contact is recorded as created from `klaviyo`;
- an address of a contact **in the trash** is skipped (a sync does not
  restore it, unlike a website form, which someone sent on purpose), and so
  is an address of a **permanently deleted** contact (see "Trash, restore
  and permanent delete").

A profile or event the database refuses for its data (a value too long, an
address taken or a contact deleted meanwhile) is skipped, counted and shown
under the settings ("records could not be saved") without stopping the sync.
Any other error (the database unreachable, a timeout) fails the sync, which
is retried, so no record is skipped for a passing problem.

**E-mail events → activity.** Only Klaviyo's built-in e-mail metrics are
read (received, opened, clicked, bounced, marked as spam, unsubscribed), from
the last sync on, or the last 90 days the first time
(`KLAVIYO_INITIAL_EVENT_DAYS`). They attach only to existing contacts; an
event never creates one. Each becomes a short entry with the subject, not the
newsletter's text (one copy per recipient would fill the database), and an
"Open in Klaviyo" link to the person's Klaviyo profile, which lists the
e-mails sent to them. Opens
and clicks of one e-mail by one person are one entry each, the first.

**Marketing consent → Klaviyo** (an outbox, `KlaviyoConsentSync`). Every
`marketing` grant or withdrawal is sent once:

- only the row that **holds now** for the contact is sent; earlier ones are
  marked skipped;
- a **grant** subscribes the contact's primary address to the team's list
  ("List for marketing consents") with the time of the consent, as a
  historical import: the CRM already confirmed the address, so Klaviyo sends
  no second opt-in mail (and no "added to list" flow starts). Without a list,
  grants wait; for a contact in the trash, until it is restored;
- a **withdrawal** unsubscribes the address from all e-mail marketing in
  Klaviyo, list or not;
- an address Klaviyo refuses is marked failed and retried on the next syncs,
  five times in all; the others still go;
- disconnecting Klaviyo forgets what was sent, so a new connection sends
  every consent again. Imported contacts, activity and consents stay.

**Unsubscribes in Klaviyo → the CRM.** A profile that is unsubscribed or
suppressed for unsubscribing or a spam complaint, and an "unsubscribed" or
"marked as spam" event, record a `WITHDRAWN` consent (source `EXTERNAL`, by
"Klaviyo", at Klaviyo's time), unless the CRM already holds a withdrawal or a
later grant (the person consented again since). These rows are not sent back.
Bounces are not a withdrawal.

**Leaving only the team's list** (Klaviyo's list-specific unsubscribe, on the
list set for marketing consents) is not applied by itself: it becomes a
proposed change "Marketing consent: Wants updates → Withdrawn" by "Klaviyo",
under Pending changes. Proposed only while the CRM holds a grant older than
Klaviyo's time, and once per time Klaviyo reports it (declined, it is not
proposed again until the person leaves the list again). Applying it records
the withdrawal as Klaviyo's (`EXTERNAL`, by "Klaviyo", at Klaviyo's time), so
it is not sent back as an unsubscribe from all marketing; who applied it is
in the change history. Leaving other lists is ignored.

**Contacts deleted for good → Klaviyo.** Each sync first handles the
addresses queued by permanent delete: a profile Klaviyo has for the address
gets the property `crm_deleted_at` (the time of the delete) and is
unsubscribed from e-mail marketing. Nothing is deleted in Klaviyo; the team
does that, for example from a segment on `crm_deleted_at`. An address Klaviyo
does not know is left alone, since an unsubscribe would create a profile for
it. The queue keeps the address only until then: it is removed once handled,
after five refused attempts (reported under the settings), or when Klaviyo is
disconnected. Nothing is queued while Klaviyo is switched off, and addresses
queued before switching it off wait until it is on again.

**Sign-ups in Klaviyo** are not recorded as consents: the CRM's consents are
confirmed by e-mail and keep the wording the person agreed to, which a
Klaviyo sign-up does not give.

Tests: `tests/klaviyo.test.ts` (translation, API calls),
`tests/db/klaviyo-sync.test.ts` (matching, trash, events, consents, list
leaves, queue).

### Unconfirmed website submissions

A submission that asks for e-mail confirmation (the form requires it, or a
marketing consent was ticked) and is not confirmed within 7 days is removed
with its pending consents, its engagement and the change proposals it made.
The contact goes too, but only if that submission created it and nothing else
refers to it: no other submission, registration, engagement, consent, list,
group, event, organization, file, e-mail, attribute or change by a person
(`removeExpiredUnconfirmed`, `tests/db/form-confirmation.test.ts`).

### Deleting website submissions

Team admins can delete submissions on a form's page, mostly to clear out
tests. Deleting is for good, and works like the 7-day removal, with one
difference: consents the submission gave go too, confirmed ones included.
Proposals already decided stay in the contact's history. A contact goes
under the same rule as above; the newest submissions are deleted first, so a
contact that only test submissions made goes once they all are. The team's
system log records who deleted how many, without the answers
(`deleteFormSubmissions`, `DELETE /api/forms/[formId]/submissions`,
`tests/db/form-confirmation.test.ts`).

### Trash, restore and permanent delete

- **Trash** sets `deletedAt`; the contact and everything linked to it stay.
- **Restore** clears `deletedAt`.
- **Permanent delete** removes the contact and, with it, its addresses,
  history, engagements, form submissions, consents, files and memberships. Messages and
  e-mail recipients keep their record, without the contact link.

All three act only on contacts the person can see.

Permanent delete also keeps a SHA-256 hash of the contact's primary and alias
addresses (`ContactImportBlock`, never the address itself), so imports from
other systems (Klaviyo) do not create the person again. A contact added by
hand or a website form later is not affected
(`src/services/contact-import-blocks.ts`, `tests/db/klaviyo-sync.test.ts`).

With Klaviyo switched on, permanent delete also queues the addresses
(`KlaviyoProfileDeletion`) for the next sync, which sets the profile property
`crm_deleted_at` and unsubscribes the person from e-mail marketing there, so
the team can find and delete them in Klaviyo (see "Klaviyo"). The delete
dialog says so.

### Organizations in the trash

Deleting an organization moves it to the trash (`deletedAt`); nothing of it
is deleted. While it is there:

- it leaves the organization lists, tags, activity feeds and the links on
  contact pages, and so do its funding requests, donation agreements and
  payments; agreement reminders skip it;
- its pages and API answer "not found" to everyone, so its users lose access
  (`verifyOrganizationAccess`);
- its e-mail address stays taken: a new organization with that address is
  refused until it is restored or deleted for good.

Restoring brings it back as it was. Deleting for good works only from the
trash and takes its funding requests (with what cascades from them),
donation agreements and files with it, in one transaction. All three are for
team admins, and each asks for confirmation in the list
(`src/services/organizations`, `src/app/api/organizations/[id]/trash`,
`tests/db/organization-trash.test.ts`).

## Lists and saved views

Every records list (contacts, organizations, users, files, events, contact
lists, an event's registrations, transactions, funding requests, donation
agreements and the admin teams list) is searched, filtered, sorted and paged
**on the server**, with one table and toolbar (`src/components/records/`):

- A list request sends `page`, `pageSize` (at most 100) and `sort`, read by
  `readListRequest` / `readList` (`src/lib/list-request.ts`). `sort` holds up
  to three orders, most important first (`sort=city:asc,name:desc`; older
  links with `sort=name&dir=desc` still work). Only the fields a route allows
  can order a list; anything broken falls back to the default instead of
  failing. The orders are chained (`chainOrderBy`) and end with the row id,
  so pages never overlap or skip rows.
- In a list, clicking a column header sorts by that column alone; Shift-click
  adds it as the next order (or turns, then removes, one already there).
  Headers number the orders when there are several (`nextSorts`).
- A caller that asks for no page (a picker, a form) still gets every row, as
  before (`paging: "optional"`).
- Every page goes through the same access checks and team or organization
  scope as the full list did. An event's registrations come from
  `GET /api/events/:id/registrations`, scoped to the event's team.
- A column sorts when it holds one value per row (a field, or one linked
  record such as a team or an owner). Columns that combine several values
  (groups, tags, attributes, people, roles, signatures) or are worked out
  from other records (sign-in method, last download, payout) do not sort.
  `tests/db/sorting.test.ts` runs every allowed sort of every list.
- "Download all" on Files zips every file the filtered list shows (search and
  type filter), not only the page on screen.
- Contact lists are counted, sorted and paged after their filters run (a smart
  list's size is only known then); a team has tens of lists.
- Contact and organization filters are sent as the `filters` JSON the APIs
  already validated; each filter chip holds one filter in exactly that shape
  (`src/components/table/contact-filters.tsx`, `organization-filters.tsx`),
  so a saved view is checked by the same schema the server uses.

**Saved views** (`UserViewPreference`) keep how each person left each list:
visible columns, sort, filters and view. They are saved automatically, follow
the person to any browser, and are deleted with the person.

- The key names the list and its scope: `<list>:team:<teamId>`,
  `<list>:org:<organizationId>` or `<list>:admin`
  (`src/validations/view-preferences.ts`). A person only reads and writes their
  own views, and only for a team, organization or admin list they can open
  (`src/app/api/view-preferences/route.ts`).
- Saved filters can hold what someone typed (a name, a postcode); views are
  private to their owner.
- A saved view never breaks a list: columns, sort fields and filters a list no
  longer has are ignored when it opens.

Tests: `tests/db/lists.test.ts`, `tests/db/view-preferences.test.ts`,
`src/lib/list-request.test.ts`, `src/validations/view-preferences.test.ts`.

## Rules held by the database

Rules in the code can be bypassed (scripts, races, future code). These are
also enforced by Postgres:

| Rule | Database object |
|---|---|
| A primary or alias address belongs to one contact per team | partial unique index `ContactEmail_identity_email_key` |
| A contact has at most one primary address | partial unique index `ContactEmail_primary_contact_key` |
| A change proposal is resolved at most once | partial unique index `ContactChangeLog_proposal_resolution_key` |
| A signer cannot be deleted | foreign key `DonationAgreementSignature_userId_fkey` (`ON DELETE RESTRICT`) |
| A contact's `primaryEmail` copy matches its primary address | trigger `contact_primary_email_sync` on `ContactEmail` |
| One signature per signer and agreement | primary key of `DonationAgreementSignature` |
| One queued or running Klaviyo sync per team | partial unique index `KlaviyoSyncJob_active_team_key` |

All of them are declared in `prisma/schema.prisma` (the partial indexes need
the `partialIndexes` preview feature, with the predicate exactly as Postgres
stores it).

## Tests and CI

| Command | What it checks |
|---|---|
| `yarn test` | Unit tests (`tests/*.test.ts`, `src/**/*.test.ts`), no database |
| `yarn db:check` | Builds a database from the migrations alone and fails if it differs from `schema.prisma` in any way, indexes included |
| `yarn test:db` | Runs the real services against that database (`tests/db/`) |
| `yarn ci:verify` | Lint, unit tests and typecheck |
| `yarn ci:db` | `db:check`, then `test:db` |

CI (`.gitea/workflows/docker-image.yml`) runs `ci:verify` and `ci:db` on
every push to `main` and every pull request. To make a failing check block a
merge, protect `main` in the repository settings and require it.

Database tests only use `TEST_DATABASE_URL`, never `DATABASE_URL`, and refuse
a database whose name lacks `test`, because they empty all tables:

```bash
docker run -d --rm --name crm-test-db -p 55432:5432 \
  -e POSTGRES_PASSWORD=pg -e POSTGRES_DB=crm_test postgres:16-alpine
TEST_DATABASE_URL=postgresql://postgres:pg@localhost:55432/crm_test yarn ci:db
```

A schema change always comes with a migration: `db:check` fails otherwise.

## Production checks

Read-only queries to run against production (they change nothing). Each
should return no rows unless noted.

**1. The database rules are in place.** Expect three rows. If one is missing,
check query 2 before adding it.

```sql
SELECT indexname FROM pg_indexes
WHERE indexname IN (
  'ContactEmail_identity_email_key',
  'ContactEmail_primary_contact_key',
  'ContactChangeLog_proposal_resolution_key'
)
ORDER BY indexname;
```

**2. No address belongs to two contacts.**

```sql
SELECT "teamId", email, count(DISTINCT "contactId") AS contacts
FROM "ContactEmail"
WHERE kind IN ('PRIMARY', 'ALIAS')
GROUP BY "teamId", email
HAVING count(DISTINCT "contactId") > 1;
```

**3. Restricted fields cleared by someone without access** (the bug fixed on
2026-11-14: saving a contact cleared the restricted fields the editor could
not see). `valueBefore` is the lost value as stored in the history (JSON);
compare it with `valueNow` before restoring anything, as someone may have
filled the field in again since. It uses today's field access and group
memberships, which may differ from when the value was cleared.

```sql
SELECT l."contactId", c.name AS contact, l."fieldName" AS field,
  l."oldValue" AS "valueBefore",
  CASE l."fieldName"
    WHEN 'gender' THEN c.gender::text
    WHEN 'genderRequestPreference' THEN c."genderRequestPreference"::text
    WHEN 'isBipoc' THEN c."isBipoc"::text
    WHEN 'racismRequestPreference' THEN c."racismRequestPreference"::text
    WHEN 'otherMargins' THEN c."otherMargins"
    WHEN 'onboardingDate' THEN c."onboardingDate"::text
    WHEN 'breakUntil' THEN c."breakUntil"::text
  END AS "valueNow",
  l."userName" AS "clearedBy", l."createdAt" AS "clearedAt"
FROM "ContactChangeLog" l
JOIN "Contact" c ON c.id = l."contactId"
WHERE l.action = 'UPDATED'
  AND l."fieldName" IN ('gender', 'genderRequestPreference', 'isBipoc',
    'racismRequestPreference', 'otherMargins', 'onboardingDate', 'breakUntil')
  AND l."oldValue" IS NOT NULL AND l."newValue" IS NULL
  AND EXISTS (
    SELECT 1 FROM "ContactFieldAccess" fa
    WHERE fa."teamId" = c."teamId" AND fa."fieldKey" = l."fieldName")
  AND NOT EXISTS (
    SELECT 1 FROM "ContactFieldAccess" fa
    JOIN "UserGroup" ug ON ug."groupId" = fa."groupId"
    WHERE fa."teamId" = c."teamId" AND fa."fieldKey" = l."fieldName"
      AND ug."userId" = l."userId")
ORDER BY l."createdAt";
```

**4. Funding amounts and payouts agree.** Lists requests that paid out more
than agreed, whose remaining amount is not "agreed minus paid out", that have
payouts in a status before disbursement, or that are Completed with money
remaining.

```sql
SELECT fr.id, fr.name, fr.status, fr."amountAgreed", fr."remainingAmount",
  coalesce(sum(t.amount), 0) AS "paidOut"
FROM "FundingRequest" fr
LEFT JOIN "Transaction" t ON t."fundingRequestId" = fr.id
GROUP BY fr.id
HAVING coalesce(sum(t.amount), 0) > coalesce(fr."amountAgreed", 0)
  OR (fr."amountAgreed" IS NOT NULL
      AND fr."remainingAmount" IS DISTINCT FROM
          fr."amountAgreed" - coalesce(sum(t.amount), 0))
  OR (count(t.id) > 0 AND fr.status NOT IN ('FundsDisbursing', 'Completed'))
  OR (fr.status = 'Completed' AND fr."remainingAmount" IS DISTINCT FROM 0);
```

**5. No agreement is stuck waiting with nobody left to sign** (left by the
old behaviour that dropped unknown signers).

```sql
SELECT da.id AS agreement, fr.id AS request, fr.name
FROM "DonationAgreement" da
JOIN "FundingRequest" fr ON fr.id = da."fundingRequestId"
WHERE fr.status = 'WaitingForSignature'
  AND NOT EXISTS (
    SELECT 1 FROM "DonationAgreementSignature" s
    WHERE s."donationAgreementId" = da.id AND s."signedAt" IS NULL);
```
