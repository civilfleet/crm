# Data rules

How funding requests and contacts change, what keeps their data consistent,
and where each rule is enforced and tested. When you change one of these
rules, change this page, the code and its test together.

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

### Merging contacts

`mergeContacts` keeps one contact (the target) and removes the others (the
sources). Before removing them it moves **everything** that pointed at them
onto the target: e-mail addresses (as chosen), groups, organizations, list
memberships, files, engagements and tasks (with their assignee), inbox
messages, e-mail recipients, event participation and roles, registrations,
form submissions, attributes, social links, access reviews, the
organization contact-person link, and the history. Duplicates are kept once.

Removing a source contact deletes whatever still points at it, so **every
new table that references `Contact` must be handled in `mergeContacts`**.
The merge test enforces this: it reads all foreign keys to `Contact` from
the database and fails when its test data does not cover one, or when a
merge loses a row (`tests/db/contacts-merge.test.ts`).

A merge is all or nothing, and every contact in it must be visible to the
person merging.

### Trash, restore and permanent delete

- **Trash** sets `deletedAt`; the contact and everything linked to it stay.
- **Restore** clears `deletedAt`.
- **Permanent delete** removes the contact and, with it, its addresses,
  history, engagements, form submissions, files and memberships. Messages and
  e-mail recipients keep their record, without the contact link.

All three act only on contacts the person can see.

## Rules held by the database

Rules in the code can be bypassed (scripts, races, future code). These are
also enforced by Postgres:

| Rule | Database object |
|---|---|
| A primary or alias address belongs to one contact per team | partial unique index `ContactEmail_identity_email_key` |
| A contact has at most one primary address | partial unique index `ContactEmail_primary_contact_key` |
| A change proposal is resolved at most once | partial unique index `ContactChangeLog_proposal_resolution_key` |
| A signer cannot be deleted | foreign key `DonationAgreementSignature_userId_fkey` (`ON DELETE RESTRICT`) |
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
