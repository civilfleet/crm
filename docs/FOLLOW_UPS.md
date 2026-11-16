# Follow-ups

Known open points, written down so they are not lost. Each says what it is,
why it matters, how we would do it, and roughly how big it is. When one is
done, remove it here and update `docs/DATA_RULES.md` if a rule changed.

- [1. Protect `Contact.primaryEmail`](#1-protect-contactprimaryemail)
- [2. CRM files of contacts hidden by groups](#2-crm-files-of-contacts-hidden-by-groups)
- [3. Status dropdown in the funding request form](#3-status-dropdown-in-the-funding-request-form)
- [4. Which groups an editor may assign](#4-which-groups-an-editor-may-assign)
- [5. One visibility check for opening a contact](#5-one-visibility-check-for-opening-a-contact)
- [6. Format `services/contacts/index.ts`](#6-format-servicescontactsindexts)
- [7. Data checks for imports and website intake](#7-data-checks-for-imports-and-website-intake)
- [8. Test the distance filter](#8-test-the-distance-filter)
- [9. Production checks](#9-production-checks)
- [10. Send marketing consent to Klaviyo](#10-send-marketing-consent-to-klaviyo)
- [11. Check submissions against the published form](#11-check-submissions-against-the-published-form)
- [12. Unconfirmed submissions still fill existing contacts](#12-unconfirmed-submissions-still-fill-existing-contacts)

## 1. Protect `Contact.primaryEmail`

**What.** Contacts sort by e-mail through a copy of the primary address on
the contact, `Contact.primaryEmail`. An AFTER trigger on `ContactEmail`
(`contact_primary_email_sync`, migration
`20261116120000_contact_primary_email_sort`) keeps it in step with every
address change. Nothing stops code from writing the column directly, though;
a wrong value would stay until that contact's addresses change again.

**Why it matters.**

- A direct write (a future `contact.update`, a script, a manual SQL fix)
  makes the e-mail sort wrong for that contact, silently.
- Prisma does not know about triggers. `yarn db:check` compares columns and
  indexes, not triggers, so a missing trigger would go unnoticed.
- `npx prisma db push` (in `CLAUDE.md` for local setup) builds tables from
  the schema without running migrations: such a database has the column but
  no trigger and no backfill, and the e-mail sort puts every contact under
  "no e-mail". Production uses migrations, so this mainly bites dev and
  staging databases.

**How.**

1. A new migration adds a BEFORE INSERT OR UPDATE trigger on `Contact` that
   always sets `NEW."primaryEmail"` to the contact's primary address, so any
   value written to the column is replaced in the same statement. The
   `ContactEmail` trigger then only needs to touch the contact
   (`UPDATE "Contact" SET "primaryEmail" = NULL WHERE "id" = …`) and the
   BEFORE trigger works the value out.
2. A database test that fails when either trigger is missing, and one that
   writes a wrong value through Prisma and through raw SQL and checks the
   real address is kept (`tests/db/sorting.test.ts`).
3. In `CLAUDE.md`, replace `npx prisma db push` with
   `npx prisma migrate deploy` for local setup, with a line on why.

**Trade-offs we accept with this approach.**

- The logic lives in the database, outside `schema.prisma` and the app code;
  the schema comment and `docs/DATA_RULES.md` are the only pointers.
- Every address change also rewrites the contact row, and every contact
  write runs one small indexed lookup. Negligible for edits; an import of
  thousands of contacts does thousands of extra small updates.
- Address writes now also lock the contact row. Two transactions updating a
  contact and its addresses in opposite order at once could deadlock (one is
  aborted). Today's code does both in one transaction in one order.

**Considered and rejected.**

- *Sort with a join, no copy.* Prisma cannot order contacts by a joined
  address, so the contacts list query (filters, distance, attributes, group
  visibility) would have to be rewritten as hand-written SQL, or all matching
  ids fetched and sorted separately on every page. More code, slower for big
  teams, and a visibility mistake would leak contacts.
- *Copy kept by app code.* Every place that writes addresses (forms, imports,
  merge, form and event intake) would have to remember it; one forgotten
  path silently breaks the sort.

**Size.** Small: one migration, two tests, one line in `CLAUDE.md`.

## 2. CRM files of contacts hidden by groups

**What.** The CRM files list includes files of every contact of the team,
also contacts a person cannot see because of their groups. It already did
before the records table; the joshi branch hides those files.

**How.** Decide first. If they should be hidden, add the contact visibility
(`getContactVisibility`, `src/services/contacts/access.ts`) to the contact
part of the file scope in `getFileScopeWhere` (`src/services/file/index.ts`),
and to the file detail page and download routes, with database tests.

**Size.** Small to medium.

## 3. Status dropdown in the funding request form

**What.** The funding request edit form offers Submitted, Accepted, Approved
and Rejected whatever the current status, but the funding rules
(`src/lib/funding-status.ts`) refuse most changes, so people get a 409.

**How.** Offer only the statuses `assertManualStatusChange` allows from the
current one (export the allowed list from `src/lib/funding-status.ts`), and
show the server's reason when a change is refused.

**Size.** Small.

## 4. Which groups an editor may assign

**What.** Editing a contact replaces its groups with any groups of the team,
including groups that then hide the contact from the editor, or that take it
away from people who need it.

**How.** Decide the policy first (for example: only groups you are in, unless
you are an administrator or in an "all contacts" group). Enforce it in
`updateContact` / `syncContactGroups` (`src/services/contacts/index.ts`),
with database tests.

**Size.** Small once decided.

## 5. One visibility check for opening a contact

**What.** `getContactById` (`src/services/contacts/index.ts`) has its own
copy of the group visibility rules; lists, edits, merges and the trash use
`getContactVisibility`. Two copies can drift apart.

**How.** Make `getContactById` use `getContactVisibility`, with a database
test that opening and listing agree.

**Size.** Small.

## 6. Format `services/contacts/index.ts`

**What.** The file does not match Biome's formatting (it didn't on main
either), so running the formatter touches far more than a change.

**How.** One formatting-only commit (`npx biome check --write` on that file),
nothing else in it.

**Size.** Tiny.

## 7. Data checks for imports and website intake

**What.** Bulk and outside input is the next most likely source of bad data:
CSV and vCard import, and website form and event intake (deduplication,
merging into existing contacts, change proposals).

**How.** Database tests in the style of `tests/db/contacts-edit.test.ts`:
duplicates by e-mail, existing contacts only filled where empty, proposals
resolved once, nothing half-written when an import fails.

**Size.** Medium.

## 8. Test the distance filter

**What.** The contacts "within distance of postal code" filter uses PostGIS,
which the test database (`postgres:16-alpine`) does not have, so no test
covers it.

**How.** Use a PostGIS image for the test database (`postgis/postgis:16-*`,
as Kubernetes runs) in CI and the local instructions, then add a database
test with a few postal code centroids.

**Size.** Small.

## 9. Production checks

**What.** Read-only checks in `docs/DATA_RULES.md` ("Production checks") that
have not been run against production yet.

- Restricted contact fields cleared by the old edit bug, then decide what to
  restore from the history.
- The e-mail uniqueness rule is in place.
- Funding amounts and payouts agree.
- No agreement is stuck waiting with nobody left to sign.

**Size.** Run the queries; follow-up work depends on what they find.

## 10. Send marketing consent to Klaviyo

**What.** Consents are recorded in the CRM (`ContactConsent`,
`docs/DATA_RULES.md` "Consent"), but newsletters go out through Klaviyo, which
does not see them yet. Unsubscribes in Klaviyo do not reach the CRM either.

**How.**
- An outbox: each `marketing` consent row gets a sync state; a job subscribes
  `GRANTED` (that is, e-mail confirmed) contacts to the Klaviyo list (with the consent time and wording)
  and unsubscribes `WITHDRAWN` ones, retrying on failure.
- A Klaviyo webhook or a periodic pull writes `WITHDRAWN` rows (source
  `EXTERNAL`) for unsubscribes, so the CRM stays the record.
- Decide which team's consents go to which Klaviyo list.

**Size.** Medium; needs a Klaviyo API key in the CRM's secrets.

## 11. Check submissions against the published form

**What.** The CRM reads each form's published file
(`/forms/<formId>/<locale>.json`) for the confirmation text, but does not yet
compare the submission with it. A forged submission can claim a marketing
consent the form never had; it still needs the address confirmed, but the
recorded wording is whatever was sent.

**How.** Before recording consents, read the file (cached) and keep a
purpose only when the form has a consent question with that id and purpose;
take the wording from the file when the revisions match. Check option
answers against `options`, and allow missing `conditional` questions. The
bridge could reject unknown forms the same way, before queueing.

**Size.** Small to medium.

## 12. Unconfirmed submissions still fill existing contacts

**What.** A submission matched to an existing contact fills its empty fields
straight away (changes to filled ones are only proposed), even when it asks
for confirmation and is never confirmed. Someone could add a phone number or
city to a real person's record by typing their e-mail address.

**How.** For submissions that ask for confirmation, record the fills as
proposals too, or apply them only on confirmation.

**Size.** Small.
