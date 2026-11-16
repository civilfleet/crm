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

  const paragraphs = body
    .split(/\n{2,}/)
    .map(
      (paragraph) =>
        `<p style="margin:0 0 16px">${escapeHtml(paragraph).replaceAll("\n", "<br>")}</p>`,
    )
    .join("");
  const html = `<!doctype html>
<html lang="${escapeHtml(lang)}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>${escapeHtml(subject)}</title></head>
<body style="margin:0;padding:24px;background:#f4f5f7;font-family:Arial,Helvetica,sans-serif;color:#1d2433">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:8px">
<tr><td style="padding:28px 28px 8px;font-size:20px;font-weight:bold">Sea-Watch</td></tr>
<tr><td style="padding:8px 28px 8px;font-size:16px;line-height:1.5">${paragraphs}</td></tr>
<tr><td style="padding:8px 28px 28px"><a href="${escapeHtml(link)}" style="display:inline-block;background:#0b4f8a;color:#ffffff;text-decoration:none;font-weight:bold;padding:12px 22px;border-radius:6px">${escapeHtml(content.button)}</a>
<p style="margin:16px 0 0;font-size:12px;color:#5b6475;word-break:break-all">${escapeHtml(link)}</p></td></tr>
</table>
<p style="max-width:560px;margin:16px auto 0;font-size:12px;color:#5b6475;line-height:1.4">${escapeHtml(footer)}</p>
</td></tr></table>
</body></html>`;
  const text = `${body}\n\n${content.button}: ${link}\n\n${footer}\n`;
  return { subject, html, text, fromForm: Boolean(form?.confirmation) };
};
