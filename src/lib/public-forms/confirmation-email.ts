import type { PublishedForm } from "@/lib/public-forms/published-form";

/*
  The confirmation e-mail: the editor's text from the published form (or a
  default per language) inside a fixed layout with the confirmation button.
  The editor's text is plain text: it is escaped, never run as a template;
  only the literal {{name}} is replaced.
*/

type ConfirmationText = { subject: string; text: string; button: string };

export const DEFAULT_CONFIRMATION_TEXTS: Record<string, ConfirmationText> = {
  it: {
    subject: "Conferma il tuo indirizzo e-mail",
    text: "Ciao {{name}},\n\ngrazie! Per completare, conferma il tuo indirizzo e-mail.\n\nSe non sei stato tu, ignora questa e-mail: non useremo il tuo indirizzo.",
    button: "Conferma",
  },
  de: {
    subject: "Bitte bestätige deine E-Mail-Adresse",
    text: "Hallo {{name}},\n\ndanke! Bitte bestätige zum Abschluss deine E-Mail-Adresse.\n\nWenn du das nicht warst, ignoriere diese E-Mail einfach: Wir verwenden deine Adresse dann nicht.",
    button: "Bestätigen",
  },
  en: {
    subject: "Please confirm your e-mail address",
    text: "Hi {{name}},\n\nthank you! To finish, please confirm your e-mail address.\n\nIf this wasn't you, just ignore this e-mail: we won't use your address.",
    button: "Confirm",
  },
};

const FOOTERS: Record<string, string> = {
  it: "Hai ricevuto questa e-mail perché il tuo indirizzo è stato inserito in un modulo su sea-watch.org. Il link scade dopo 7 giorni.",
  de: "Du erhältst diese E-Mail, weil deine Adresse in ein Formular auf sea-watch.org eingegeben wurde. Der Link läuft nach 7 Tagen ab.",
  en: "You received this e-mail because your address was entered in a form on sea-watch.org. The link expires after 7 days.",
};

/** The Sea-Watch logo as PNG (mail clients do not show SVG), from the CMS. */
const LOGO_URL =
  "https://res.cloudinary.com/sea-watch/image/upload/w_192,f_png/v1721663330/sea_watch_logo_2db5145c0f.png";

const language = (locale: string) => locale.slice(0, 2).toLowerCase();

const escapeHtml = (value: string) =>
  value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");

/** Replaces {{name}} only; a missing name leaves no gap ("Hi ,"). */
const fillName = (text: string, name: string) =>
  text
    .replace(/\s*\{\{\s*name\s*\}\}/g, name ? ` ${name}` : "")
    .replace(/^ /gm, "");

export type ConfirmationEmail = {
  subject: string;
  html: string;
  text: string;
  /** Whether the editor's text from the published form was used. */
  fromForm: boolean;
};

export const renderConfirmationEmail = ({
  form,
  locale,
  name,
  link,
}: {
  form: PublishedForm | null;
  locale: string;
  name: string;
  link: string;
}): ConfirmationEmail => {
  const lang = language(locale);
  const fallback =
    DEFAULT_CONFIRMATION_TEXTS[lang] ?? DEFAULT_CONFIRMATION_TEXTS.en;
  const content = form?.confirmation ?? fallback;
  const body = fillName(content.text, name.trim());
  const subject = fillName(content.subject, name.trim()).replace(/\s+/g, " ");
  const footer = FOOTERS[lang] ?? FOOTERS.en;

  // sea-watch.org's look (sea-watch-nuxt tailwind.config.js): warm light
  // grey page, dark blue text in Inter, square buttons with a heavy border,
  // Sea-Watch yellow. Inline styles and tables only, for mail clients.
  const font =
    "Inter,-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Helvetica,Arial,sans-serif";
  const ink = "#001F29";
  const paragraphs = body
    .split(/\n{2,}/)
    .map(
      (paragraph) =>
        `<p style="margin:0 0 18px;font-family:${font};font-size:17px;line-height:1.6;color:${ink}">${escapeHtml(paragraph).replaceAll("\n", "<br>")}</p>`,
    )
    .join("");
  // Shown as the inbox preview, never in the message.
  const preheader = escapeHtml(body.replace(/\s+/g, " ").slice(0, 140));
  const html = `<!doctype html>
<html lang="${escapeHtml(lang)}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light"><title>${escapeHtml(subject)}</title></head>
<body style="margin:0;padding:0;background:#FAF4EF;color:${ink}">
<div style="display:none;max-height:0;overflow:hidden;opacity:0">${preheader}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#FAF4EF"><tr><td align="center" style="padding:32px 16px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px">
<tr><td style="padding:0 0 24px"><a href="https://sea-watch.org" style="text-decoration:none"><img src="${LOGO_URL}" width="96" height="87" alt="Sea-Watch" style="display:block;border:0;width:96px;height:auto;font-family:${font};font-size:22px;font-weight:bold;color:#17AFFA"></a></td></tr>
<tr><td style="background:#FFFFFF;border-top:6px solid #17AFFA;padding:36px 32px 32px">
${paragraphs}
<table role="presentation" cellpadding="0" cellspacing="0" style="margin:8px 0 0"><tr><td style="background:#FFE601;border:4px solid ${ink}">
<a href="${escapeHtml(link)}" style="display:inline-block;padding:16px 26px;font-family:${font};font-size:19px;font-weight:bold;line-height:1.2;color:${ink};text-decoration:none">${escapeHtml(content.button)}</a>
</td></tr></table>
<p style="margin:24px 0 0;font-family:${font};font-size:13px;line-height:1.5;color:#036B9D;word-break:break-all">${escapeHtml(link)}</p>
</td></tr>
<tr><td style="padding:20px 4px 0;font-family:${font};font-size:13px;line-height:1.5;color:#003A56">${escapeHtml(footer)}<br><a href="https://sea-watch.org" style="color:#036B9D;text-decoration:underline">sea-watch.org</a></td></tr>
</table>
</td></tr></table>
</body></html>`;
  const text = `${body}\n\n${content.button}: ${link}\n\n${footer}\n`;
  return { subject, html, text, fromForm: Boolean(form?.confirmation) };
};
