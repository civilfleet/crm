# sea-hive logo — developer kit

Installed from the designer's kit: the SVGs and app icons are in
`public/brand/`; the favicon (`favicon.ico`, `icon.svg`) and the Apple touch
icon (`apple-icon.png`) are in `src/app/`, where Next.js links them itself,
and the web app manifest is `src/app/manifest.ts`. The kit's PNG exports of
the logos are not in the repo; the SVGs cover them. The kit's `favicon.ico` still had the old icon
(no blue centre), so `src/app/favicon.ico` is rendered from `icon.svg`
(16, 32 and 48 px).

The "Signal" logo: a yellow hexagonal lifebuoy on Sea-Watch navy, with a sky-blue offset shadow.

## Colours (from sea-watch.org)

| Name         | Hex       | Use                                   |
|--------------|-----------|---------------------------------------|
| Navy         | `#001F29` | Background, lifebuoy bands            |
| Signal Yellow| `#FFE601` | Lifebuoy, outline, wave, wordmark     |
| Sky Blue     | `#17AFFA` | Offset shadow                         |

```css
:root {
  --sh-navy: #001F29;
  --sh-yellow: #FFE601;
  --sh-sky: #17AFFA;
}
```

## Typeface

The wordmark is set in **Inter Bold (700)**, letter-spacing −0.05em, the same family sea-watch.org uses.
In the SVGs the wordmark is converted to outlines, so no font needs to be installed.
For UI text in sea-hive, use Inter (400–700), as on sea-watch.org.

## Files

```
svg/
  sea-hive-mark.svg                         mark only, transparent background
  sea-hive-logo-horizontal.svg              mark + wordmark, on navy  (headers, login screen)
  sea-hive-logo-horizontal-transparent.svg  same, transparent (place on navy only)
  sea-hive-logo-stacked.svg                 mark above wordmark, on navy
  sea-hive-wordmark.svg                     wordmark only, transparent
  sea-hive-app-icon.svg                     rounded-square app icon
  sea-hive-app-icon-square.svg              square app icon (for platforms that round corners themselves)
png/
  mark (512, 1024), logos (1200/1280 wide), app icon (192–1024)
favicon/
  favicon.ico (16/32/48), favicon.svg, favicon-32.png,
  apple-touch-icon.png (180), icon-192.png, icon-512.png, site.webmanifest
```

## Favicon setup

Copy the `favicon/` files to your web root and add to `<head>`:

```html
<link rel="icon" href="/favicon.ico" sizes="any">
<link rel="icon" href="/favicon.svg" type="image/svg+xml">
<link rel="apple-touch-icon" href="/apple-touch-icon.png">
<link rel="manifest" href="/site.webmanifest">
<meta name="theme-color" content="#001F29">
```

## Usage

- The yellow logo is designed for the navy background. Don't place it on white or light backgrounds.
- Keep clear space around the logo of at least the height of one lifebuoy band.
- Minimum size: full mark 24 px; below that use the favicon (simplified: no wave, sky-blue centre instead of the shadow).
- Don't rotate, recolour, stretch or add effects to the logo.
