# Requirements Gap Analysis

This document maps requested requirements to what is currently implemented in the codebase, what is partially supported, and what is missing.

## Contacts

### Implemented
- Contact fields include pronouns, address, city, postal code, website, Signal, phone, and social links.
  - `components/forms/contact.tsx`, `validations/contacts.ts`
- Contact cards and detail views show phone, Signal, address, and other core fields.
  - `components/table/contact-columns.tsx`, `app/teams/[teamId]/contacts/[id]/page.tsx`
- Profile attributes (custom key/value) on contacts (can represent "newbie/experienced" or other labels).
  - `validations/contacts.ts`, `components/forms/contact.tsx`
- Attribute key suggestions via dropdown/autofill (prevents some misspellings).
  - `components/forms/contact.tsx` (Combobox with `attributeKeyOptions`)
- Filter by state/address/postal code/city/country, distance from postal code, group membership, event roles, and profile attributes.
  - `components/forms/contact-list-filters-builder.tsx`, `types/index.ts` (`ContactFilter`)
- Distance filter (postal code + radius).
  - `components/forms/contact-list-filters-builder.tsx`, `validations/contacts.ts`
- Restricted internal notes per contact (visibility by submodule), useful for "events team only" notes.
  - `components/forms/contact-engagement.tsx`, `components/contact-engagement-history.tsx`
  - `constants/contact-submodules.ts`, `prisma/schema.prisma` (`ContactEngagement.restrictedToSubmodule`)
- Public event registrations create or match contacts by email/phone and link the registration to the resolved contact.
  - `app/api/public/events/registrations/route.ts`, `services/events/index.ts` (`createEventRegistration`)
- Zammad ticket/article sync logs matched email activity into contact engagements.
  - `services/integrations/zammad.ts` (`upsertArticleEngagement`)
- Zammad ticket creation/replies from CRM are logged into contact engagements.
  - `services/integrations/zammad.ts` (`createZammadTicket`, `replyToZammadTicket`)
- CRM mass email sends to selected contacts are queued as email batches, tracked per recipient, and successful sends are logged into contact engagements.
  - `components/table/contact-table.tsx`, `app/api/teams/[teamId]/integrations/scaleway-email/send/route.ts`
  - `services/integrations/scaleway-email.ts`, `prisma/schema.prisma` (`EmailBatch`, `EmailRecipient`)

### Partially
- Attribute label dropdown exists, but custom values are allowed, so duplicates can still occur.
  - `components/forms/contact.tsx` (`allowCustomValue`)
- "Assign attribute/sub-role to activists such as newbie/experienced" is achievable via profile attributes, but there is no dedicated role field or UX.
  - `components/forms/contact.tsx`
- "Comments" on contact cards are not a dedicated contact field. Engagement NOTE entries or a custom profile attribute can be used, but they are not shown on cards.
  - `components/table/contact-columns.tsx`, `components/forms/contact-engagement.tsx`
- Filter by languages, Crewmember, Department, first activist action is not native fields, but can be supported if stored as profile attributes and filtered via attribute filters.
- Sorting while filtering: contact table supports column sorting, but there is no dedicated "sort within filters" control on filter UI.
  - `components/table/contact-columns.tsx`, `components/data-table.tsx`
- Preset attributes (fixed set of approximately 40) are not enforced; possible to pre-populate via attribute keys but not locked.

### Missing
- BCC email sending option in CRM.
- Assign an internal "contact owner" (team member responsible for a contact).
  - `prisma/schema.prisma` (`Contact`) has no owner field/relation yet.
- Reduce roles/attributes to a single label system across contacts/lists/events (current model has both attributes and event roles).

## Lists

### Implemented
- Sorting lists (by updated/name/count).
  - `components/forms/contact-lists-manager.tsx`
- Export/download emails for a list (CSV).
  - `components/forms/contact-lists-manager.tsx`, `components/forms/contact-list-detail.tsx`
- Edit a contact from list view.
  - `components/forms/contact-list-detail.tsx`
- Smart lists auto-include contacts based on filters (including attributes).
  - `components/forms/contact-list-detail.tsx`, `services/contacts/index.ts`

### Missing
- Export lists with selectable columns (e.g. name, email, and chosen attributes). Current export is emails-only.
- "Use selected contacts further" is partially covered by mass email from the contacts table, but there is no list-detail "email this list" flow yet.

## Events

### Implemented
- Event types (categorization) and manager.
  - `components/forms/event-types-manager.tsx`, `validations/event-types.ts`
- Event filters by state, date range, type.
  - `components/table/event-table.tsx`
- Event fields: online/offline, expected guests, remuneration, address/city/postal code/state/time, merch-needed, associated contacts.
  - `validations/events.ts`, `components/forms/event.tsx`
- Link existing contacts to events and assign roles.
  - `components/forms/event.tsx`, `components/forms/event-roles-manager.tsx`
- Public event listing/search/filter with pagination.
  - `app/public/[teamId]/events/page.tsx`, `components/public/public-events-explorer.tsx`, `app/api/public/events/[teamId]/route.ts`
- Add lists to events (attach contact lists for grouped outreach).
  - `components/forms/event.tsx`, `services/events/index.ts`, `prisma/schema.prisma`
- Public event registrations create or match CRM contacts and store registration records linked to contacts.
  - `app/api/public/events/registrations/route.ts`, `services/events/index.ts`

### Partially
- Reporting use-cases (e.g. "x events in Baden-Wuerttemberg in Jan 2024", "contact x participated in 8 events in 2025"). Data model supports event contacts and roles, but there is no reporting UI yet.
  - `app/teams/[teamId]/reports/page.tsx`

### Missing
- Filter by attributes when adding contacts to an event. The contacts API supports filters, but the event form only exposes a text search when adding contacts.
  - `components/forms/event.tsx`
- "Add a local group as activist" (non-contact entity) to events.
  - Events currently link contacts only.

## Communication

### Implemented
- Direct email send flow from CRM to selected contacts.
  - `components/table/contact-table.tsx`, `app/api/teams/[teamId]/integrations/scaleway-email/send/route.ts`
- Queued email delivery through the worker with per-recipient status.
  - `services/integrations/scaleway-email.ts`, `services/background-worker.ts`, `prisma/schema.prisma` (`EmailBatch`, `EmailRecipient`)
- Successful CRM email sends are logged to contact engagement history.
  - `services/integrations/scaleway-email.ts`
- Zammad sync, webhook-triggered ticket sync, ticket creation, and replies create/update contact engagement records.
  - `services/integrations/zammad.ts`, `services/integrations/zammad-queue.ts`

### Missing
- BCC emailing option.

### Partially
- Zammad email auto-matching exists and can auto-create contacts where the sync path enables it, but this should be verified against the desired Zammad group settings and production workflow.
  - `services/integrations/zammad.ts`
- Emailing contacts directly exists from selected contacts, but there is no dedicated list-level email action yet.
  - `components/table/contact-table.tsx`, `components/forms/contact-list-detail.tsx`

## Organizations

### Implemented
- Organizations as first-class CRM entities (not just funding).
  - `app/teams/[teamId]/organizations/*`, `services/organizations/index.ts`
- Link contact as contact person.
  - `prisma/schema.prisma` (`Organization.contactPersonId`), `components/forms/organization.tsx`
- Organization types with custom fields (vary by type) via `profileData`.
  - `components/forms/organization-types-manager.tsx`, `components/forms/organization.tsx`
  - `validations/organization-types.ts`, `validations/organizations.tsx`
- Organization engagement/cooperation history.
  - `components/organization-engagements.tsx`, `services/organization-engagements/index.ts`

## Smart Lists / Filtering Behavior

### Missing
- "Smart selection" is rule-based, not trainable/ML. There is no training or feedback loop.

## Users / Permissions

### Partially
- Groups and contact-field access exist, but no obvious fine-grained permissions for user management (e.g. restrict delete users).
  - `components/forms/groups-manager.tsx`, `services/contacts/index.ts`

### Needs Investigation
- "Can't edit supervision group" and display size issues need reproduction to confirm if it is permissions or a UI bug.

## Data Security

### Missing
- Attach NDA/CoC PDFs to contacts. There is no file relation on Contact.
  - `prisma/schema.prisma` (`File` links to organizations, funding requests, donation agreements, and transactions; `Contact` has no file relation)

## Templates and Automation

### Partially
- Email templates exist in Team Settings (funding-related), but no separate ownership per sub-team/module.
  - `app/teams/[teamId]/settings/*`, `services/email-templates`

## Other

### Missing
- "Projects" entity with links to contacts/organizations.
- Attach documents to contacts.
  - Contacts have no file relation in `prisma/schema.prisma`

### Implemented (Org Files)
- Attach documents to organizations (tax certificate, articles of association, logo).
  - `components/forms/organization.tsx`, `types/index.ts` (`Organization.Files`)
