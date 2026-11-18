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
  - [Trash, restore and permanent delete](#trash-restore-and-permanent-delete)
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

### Editing a contact

`updateContact` (`src/services/contacts/index.ts`):

- changes **only the fields that were sent**; everything else stays;
- runs in **one transaction**: if any part fails (an unknown organization, a
  group of another team, a taken e-mail), nothing changes, history included;
- writes **one history entry per changed field**, with old and new value and
  who changed it. Values sent unchanged leave no entry;
- **groups** end up exactly as sent (an empty list removes all groups, which
  makes the contact visible to the whole team); only groups of the team;
- **organizations** end up exactly as sent; only organizations of the team;
  changes are recorded in the history.

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
form submissions, consents, attributes, social links, access reviews, the
organization contact-person link, and the history. Duplicates are kept once.

Removing a source contact deletes whatever still points at it, so **every
new table that references `Contact` must be handled in `mergeContacts`**.
The merge test enforces this: it reads all foreign keys to `Contact` from
the database and fails when its test data does not cover one, or when a
merge loses a row (`tests/db/contacts-merge.test.ts`).

A merge is all or nothing, and every contact in it must be visible to the
person merging.

### Which contact a website submission belongs to

Website forms and event registrations find their contact **by e-mail only**
(primary or alias address of the team). A phone number never picks a
contact: a new contact is made, and contacts with the same number are noted
as possible duplicates on it, for a person to merge or dismiss. An address
of a contact in the trash brings that contact back. Code:
`src/services/contact-intake`, `src/services/contact-duplicates`. Tests:
`tests/db/intake-matching.test.ts`.

### Proposed changes

Website forms and event registrations never overwrite a value an existing
contact already has. A different value is recorded as a proposal
(`PROPOSED` in the change history) and waits for a person:

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

Tests: `tests/public-forms.test.ts` (contract, intake),
`tests/db/form-consent.test.ts` (real intake, unticked box, a confirmed
consent holds, team scope), `tests/db/form-confirmation.test.ts`
(confirmation, removal after 7 days) and `tests/db/contacts-merge.test.ts`.

### Unconfirmed website submissions

A submission that asks for e-mail confirmation (the form requires it, or a
marketing consent was ticked) and is not confirmed within 7 days is removed
with its pending consents, its engagement and the change proposals it made.
The contact goes too, but only if that submission created it and nothing else
refers to it: no other submission, registration, engagement, consent, list,
group, event, organization, file, e-mail, attribute or change by a person
(`removeExpiredUnconfirmed`, `tests/db/form-confirmation.test.ts`).

### Trash, restore and permanent delete

- **Trash** sets `deletedAt`; the contact and everything linked to it stay.
- **Restore** clears `deletedAt`.
- **Permanent delete** removes the contact and, with it, its addresses,
  history, engagements, form submissions, consents, files and memberships. Messages and
  e-mail recipients keep their record, without the contact link.

All three act only on contacts the person can see.

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
