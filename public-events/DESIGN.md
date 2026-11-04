---
name: Sea-Watch Public Events
description: Static event discovery and registration pages adapted from the supplied Sea-Watch identity.
colors:
  ink: "#001f29"
  paper: "#fff"
  blue: "#17affa"
  muted: "#455f68"
  line: "#c4d1d6"
  subtle: "#f0f6f8"
  focus: "#006b9e"
  ink-hover: "#073e50"
  field-border: "#8299a2"
typography:
  display:
    fontFamily: "Inter, sans-serif"
    fontSize: "64px"
    fontWeight: 700
    lineHeight: 1.08
    letterSpacing: "-0.035em"
  detail-headline:
    fontFamily: "Inter, sans-serif"
    fontSize: "48px"
    fontWeight: 700
    lineHeight: 1.12
    letterSpacing: "-0.035em"
  title:
    fontFamily: "Inter, sans-serif"
    fontSize: "24px"
    fontWeight: 700
    lineHeight: 1.25
  body:
    fontFamily: "Inter, sans-serif"
    fontSize: "16px"
    fontWeight: 400
    lineHeight: 1.5
  introduction:
    fontFamily: "Inter, sans-serif"
    fontSize: "18px"
    fontWeight: 400
    lineHeight: 1.6
  description:
    fontFamily: "Inter, sans-serif"
    fontSize: "18px"
    fontWeight: 400
    lineHeight: 1.7
  label:
    fontFamily: "Inter, sans-serif"
    fontSize: "14px"
    fontWeight: 400
    lineHeight: 1.5
  action:
    fontFamily: "Inter, sans-serif"
    fontSize: "14px"
    fontWeight: 700
    lineHeight: 1.5
  badge:
    fontFamily: "Inter, sans-serif"
    fontSize: "12px"
    fontWeight: 700
    lineHeight: 1.5
rounded:
  square: "0px"
spacing:
  micro: "4px"
  tight: "8px"
  control-y: "10px"
  compact: "12px"
  regular: "16px"
  medium: "20px"
  section-gap: "24px"
  card-inset: "28px"
  panel-inset: "32px"
  section-inset: "36px"
  wide: "40px"
  mobile-end: "48px"
  page-end: "72px"
components:
  button-outline:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.ink}"
    typography: "{typography.action}"
    rounded: "{rounded.square}"
    padding: "10px 18px"
  button-outline-hover:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.paper}"
  button-primary:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.paper}"
    typography: "{typography.action}"
    rounded: "{rounded.square}"
    padding: "10px 18px"
  button-primary-hover:
    backgroundColor: "{colors.ink-hover}"
  button-ghost:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.ink}"
    typography: "{typography.action}"
    rounded: "{rounded.square}"
    padding: "10px 18px"
  button-disabled:
    backgroundColor: "{colors.subtle}"
    textColor: "{colors.muted}"
  input:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.ink}"
    typography: "{typography.body}"
    rounded: "{rounded.square}"
    padding: "10px 12px"
  event-badge:
    backgroundColor: "{colors.subtle}"
    textColor: "{colors.ink}"
    typography: "{typography.badge}"
    padding: "4px 8px"
  event-card:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.ink}"
    padding: "28px"
  registration-panel:
    backgroundColor: "{colors.subtle}"
    textColor: "{colors.ink}"
    padding: "32px"
---

# Design System: Sea-Watch Public Events

## Overview

**Creative North Star: "Sea-Watch public events"**

This system records the static public events application only. Its visual authority is the user-supplied Sea-Watch website (https://sea-watch.org/): the official locally served mark, navy and cyan fields, white content surfaces, and locally served Inter. It does not establish a visual system for the private CRM.

The implementation is flat and direct. Bold headings establish hierarchy; labelled filters, bordered event cards and restrained metadata support catalogue browsing. Detail pages retain the same header, footer, typography and controls. These are implemented source rules, not evidence of production deployment.

**Key Characteristics:**
- Official Sea-Watch mark and existing identity.
- Navy framing, cyan title field and white working surfaces.
- Locally served Inter in regular and bold weights.
- Square controls, fine borders and flat panels.
- Responsive grids and visible keyboard focus.

## Colors

The palette follows the supplied Sea-Watch identity; frontmatter records the actual CSS values.

### Primary

- **Deep Navy (ink):** main text, utility strip, footer, selected browse control and primary actions.
- **Bright Cyan (blue):** listing title field, current-navigation underline and interactive accents on dark backgrounds.
- **Deep Navy Hover (ink-hover):** donation and registration action hover state.

### Neutral

- **White (paper):** page, header, fields and cards.
- **Muted Blue Gray (muted):** supporting text, placeholders, dates and disabled labels.
- **Pale Divider (line):** card edges, section separators and disabled borders.
- **Cool Surface (subtle):** badges, registration panels, empty states and quiet hover surfaces.
- **Field Stroke (field-border):** stronger outlines for editable controls.
- **Focus Blue (focus):** keyboard outline on light surfaces. Dark header/footer surfaces use bright cyan for focus instead.

**The Public Events Scope Rule.** Apply this record within the static public events application; the private CRM has separate visual authority.

## Typography

**Display Font:** Inter, with sans-serif fallback.
**Body Font:** Inter, with sans-serif fallback.

Regular and bold Latin WOFF2 files are served locally through the application font loader with swap behavior. Headings balance their text and allow long words to wrap; card headings use pretty wrapping. Dates and result counts use tabular numerals.

### Hierarchy

- **Display:** listing heading uses the display token; steps down to 56px at 1100px, 44px at 767px and 36px at 479px.
- **Detail headline:** uses its own headline token; becomes 36px at 767px.
- **Title:** card and section headings use the title token. Registration headings are 28px on desktop and 24px at 767px.
- **Body:** uses the body token. Introduction uses the introduction token with a 700px maximum width; becomes 16px at 767px.
- **Description:** event prose uses the description token, limited to 72ch; becomes 16px at 767px.
- **Label and action:** supporting labels and metadata are regular; navigation, buttons and card actions are bold. Desktop navigation is 16px, then 14px at 767px and 12px at 479px.
- **Badge:** bold compact classification; utility text and card tags use regular text at the same size.

**The Two Weight Rule.** Use the locally served regular and bold Inter files for body text and emphasis.

## Layout

The shared container is `min(100% - 80px, 1280px)`, centered. At 767px and below it becomes `calc(100% - 40px)`. The header uses a flexible horizontal arrangement with a 112px minimum height, reduced to 96px at 767px. The official mark is displayed at 75 × 68px, then 58px wide with automatic height at 479px.

Listings use three equal columns with a 24px gap, two columns at 1100px, then one column with a 20px gap at 767px. Cards have desktop insets from the card-inset token and mobile insets from section-gap. Filters wrap with 12px gaps; the search field occupies a full row at 767px. At 479px, archive selection moves to a full row and the postal field can fill its row. At 359px, header and navigation wrap.

The cyan listing header has 52px top and 44px bottom padding, becoming 36px vertically at 767px. Main listing content uses 36px top and 72px bottom padding, becoming 28px and 48px. These asymmetric values are surface-specific, not a universal spacing scale.

Details use a centered 960px maximum-width container with 40px top/side and 72px bottom padding; at 767px this becomes 28px top, 20px sides and 48px bottom. Facts have two columns with 24px gaps and collapse at 767px. Registration fields use two columns with 20px gaps, collapsing at 479px; the last field spans both columns. Registration panels inset 32px, reduced to 24px at 767px.

The spacing tokens capture repeated values; label gaps of 6px remain a local control detail. Avoid treating the stylesheet as a rigid modular scale.

## Elevation & Depth

There are no box shadows or floating panels. Navy and cyan full-width fields, pale registration and status panels, white cards, fine borders and whitespace establish depth. Card hover strengthens the border and underlines the title without lifting the card.

**The Flat Surface Rule.** Separate surfaces with borders, spacing and background fields rather than shadows.

## Shapes

Controls have explicit square corners; cards, badges and panels remain rectangular. Cards and separators use 1px lines, editable controls use a 1px field stroke, and buttons use 2px navy borders. Keyboard focus uses a 3px outline with 4px offset. Icons are restrained line SVGs, typically 12px for tags, 16px for search/location/date and 18px for the card action.

## Components

### Buttons

Outlined buttons use the recorded outline token, a 44px minimum height and invert to navy on hover. Primary registration actions have navy fill, white text and a 48px minimum height; hover uses ink-hover. Donation navigation is also navy, with 16px × 28px padding, reduced to 12px × 16px at 767px and 12px all around at 479px. Ghost reset controls have transparent borders, underlined text and a 48px minimum height; hover uses the subtle surface. Disabled buttons use muted text, pale backgrounds and unavailable cursors. Registration submit retains its more specific border behavior.

Button background and text changes use 160ms ease-out. Focus follows the global outline. Reduced-motion preference removes button and card-arrow transitions.

### Browse controls and badges

Browse controls are square buttons with transparent borders; the selected control is navy with white text and its pressed state is exposed. Unselected hover uses the subtle surface with navy text. Badges are noninteractive pale rectangles with compact bold labels; they are not pill-shaped filter buttons.

### Cards / Containers

Each event card is a single linked rectangle with a pale border and white fill. Bold event title, type badge, muted date/location, optional three-line description and a bottom-aligned action establish its hierarchy. Hover uses a navy border, a 2px title underline with 5px offset, and moves the arrow 4px over 160ms ease-out. Keyboard focus uses the common outline. Empty/error content uses a pale panel with 40px × 28px padding.

### Inputs / Fields

Fields are white with a stronger blue-gray stroke, square corners, 16px text, 48px minimum height and the recorded inset. Textareas are at least 120px high and resize vertically. Search adds a small line icon and increases left inset to 40px. Placeholder text uses muted ink at full opacity. Labels remain semantically present when visually hidden. Keyboard focus uses the common outline; there is no custom validation color system to inherit.

### Navigation

The white header places the official logo opposite bold text links and the navy donation action. Links have a 44px minimum height. Current Events navigation uses a 3px cyan underline with 8px offset; ordinary hover uses a 2px underline. The navy footer has a bold organization link and wrapping legal/contact navigation; footer hover text and focus accents are cyan. A skip link becomes a white fixed control when focused.

### Event facts and registration

Two-column event facts sit between pale horizontal rules with 24px vertical padding and bold labels. Registration and ended-event messaging share a pale panel. Preserve the distinction between submission receipt, confirmation, disabled intake and ended events; these states remain text, not invented success badges.

## Do's and Don'ts

### Do:
- Do preserve the official locally served Sea-Watch mark and supplied brand identity.
- Do use the recorded regular and bold Inter files and responsive heading sizes.
- Do retain visible keyboard focus, text labels, wrapping content and reduced-motion behavior.
- Do keep metadata quieter than event titles and preserve clear registration states.

### Don't:
- Don't carry this public events identity into the private CRM without a separate request.
- Don't reintroduce the replaced cream-and-green gradients or rounded floating panels.
- Don't substitute a generated logo or decorative concept imagery for the supplied identity.
