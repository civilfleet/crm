---
version: 1
slug: "public-events-app-page-tsx"
primary_target: "public-events/app/page.tsx"
related_targets: ["public-events/app/layout.tsx","public-events/events-page.tsx","public-events/app/style.css","public-events/app/public/[teamId]/events/[eventSlug]/page.tsx"]
---

# Static public events

Scope: public-events/ listing, team routes and event detail pages. Mode: Operate for discovery and registration; Read for event descriptions.
Audience/task: public visitors find an event, inspect details and understand registration status.
Constraints: preserve existing copy, search, filters, archives, URLs and registration state handling. Match the user-supplied https://sea-watch.org/ visual identity. Code-first adaptation of that established brand; no generated concept imagery or replacement identity.

## Direction contract

THESIS: Make events recognizably part of Sea-Watch using the supplied main website as visual authority.
OWN-WORLD: Navy #001f29, bright cyan, white fields, locally served Inter, official logo, square controls and clear flat sections. No cream/green gradients or rounded floating panels.
STORY: Visitors recognize Sea-Watch, search the catalogue, open an event and distinguish archived events from open registration.
FIRST VIEWPORT: Navy utility strip; white logo/navigation header; cyan title band with the existing heading and introduction; white filter area directly below. Archive controls and real event results follow without decorative imagery or new marketing claims.
FORM: Existing discovery flow and detail information hierarchy translated into the reference brand. User-pinned reference; seed: none (unavailable). Responsive navigation wraps; controls stack on narrow screens; dates and postal-radius search remain available.
FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance

Open decisions: no localization or registration enablement is requested. No production publication is part of this styling change.
