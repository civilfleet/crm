import assert from "node:assert/strict";
import test from "node:test";
import {
  confirmationLink,
  createConfirmationToken,
  verifyConfirmationToken,
} from "@/lib/public-forms/confirmation";
import { renderConfirmationEmail } from "@/lib/public-forms/confirmation-email";
import {
  createPublishedFormReader,
  type PublishedForm,
  PublishedFormUnavailableError,
} from "@/lib/public-forms/published-form";

/* Double opt-in: the signed link, the e-mail, and reading the form file. */

const ID = "11111111-1111-4111-8111-111111111111";
const KEY = "test-key-only";

test("a token confirms its submission, and only with our key", () => {
  const token = createConfirmationToken(ID, KEY);
  assert.equal(verifyConfirmationToken(token, KEY), ID);
  assert.equal(verifyConfirmationToken(token, "another key"), null);
  assert.equal(verifyConfirmationToken(token, ""), null);
  const [id, signature] = token.split(".");
  const other = "22222222-2222-4222-8222-222222222222";
  assert.equal(verifyConfirmationToken(`${other}.${signature}`, KEY), null);
  assert.equal(verifyConfirmationToken(`${id}.${signature}x`, KEY), null);
  assert.equal(verifyConfirmationToken(`${token}.more`, KEY), null);
  assert.equal(verifyConfirmationToken("not-a-uuid.abc", KEY), null);
  assert.throws(() => createConfirmationToken(ID, ""));
});

test("the link names the form and keeps the token in the fragment", () => {
  assert.equal(
    confirmationLink("https://sea-watch.org", "it", "tok", "abc123"),
    "https://sea-watch.org/it/form-confirmation/?form=abc123#tok",
  );
  // German is the website's default: no prefix.
  assert.equal(
    confirmationLink("https://sea-watch.org/", "de", "tok", "abc123"),
    "https://sea-watch.org/form-confirmation/?form=abc123#tok",
  );
  assert.equal(
    confirmationLink("https://staging.example", "EN", "tok", "a b/c"),
    "https://staging.example/en/form-confirmation/?form=a%20b%2Fc#tok",
  );
});

const form = (confirmation: PublishedForm["confirmation"]): PublishedForm => ({
  version: 1,
  formId: "petition",
  locale: "it",
  revision: "1",
  teamId: "team",
  title: "Firma",
  confirmation,
  questions: [],
});

test("the editor's text is escaped, with only {{name}} filled in", () => {
  const mail = renderConfirmationEmail({
    form: form({
      required: true,
      subject: "Conferma, {{name}}",
      text: "Ciao {{name}},\n\n<script>alert(1)</script> {{other}}\nriga",
      button: "Conferma <b>",
    }),
    locale: "it",
    name: "Giulia <Rossi>",
    link: "https://sea-watch.org/it/form-confirmation#tok",
  });
  assert.equal(mail.fromForm, true);
  assert.equal(mail.subject, "Conferma, Giulia <Rossi>");
  assert.ok(mail.html.includes("Ciao Giulia &lt;Rossi&gt;,"));
  assert.ok(mail.html.includes("&lt;script&gt;alert(1)&lt;/script&gt;"));
  assert.ok(!mail.html.includes("<script>"));
  // Anything else in braces is text, not a template.
  assert.ok(mail.html.includes("{{other}}<br>riga"));
  assert.ok(mail.html.includes("Conferma &lt;b&gt;</a>"));
  assert.ok(
    mail.text.includes("https://sea-watch.org/it/form-confirmation#tok"),
  );
  // sea-watch.org's look: the logo as PNG (mail clients skip SVG), the
  // yellow button, the warm page background; the first words as preview.
  assert.match(
    mail.html,
    /<img src="https:\/\/res\.cloudinary\.com\/[^"]+\.png"/,
  );
  assert.match(mail.html, /background:#FFE601/);
  assert.match(mail.html, /background:#FAF4EF/);
  assert.match(mail.html, /display:none[^>]*>Ciao Giulia/);
});

test("without the editor's text, the default for the language", () => {
  const italian = renderConfirmationEmail({
    form: form(null),
    locale: "it",
    name: "",
    link: "https://x.test/#t",
  });
  assert.equal(italian.fromForm, false);
  assert.equal(italian.subject, "Conferma il tuo indirizzo e-mail");
  // No name: "Ciao," rather than "Ciao ,".
  assert.ok(italian.text.startsWith("Ciao,"));
  const unknown = renderConfirmationEmail({
    form: null,
    locale: "fr",
    name: "Lou",
    link: "https://x.test/#t",
  });
  assert.equal(unknown.subject, "Please confirm your e-mail address");
  assert.ok(unknown.text.startsWith("Hi Lou,"));
});

const file = {
  version: 1,
  formId: "petition",
  locale: "it",
  revision: "2026-11-16T21:40:00.000Z",
  teamId: "a10957f3-9d42-4b67-b31c-8bed001777ff",
  title: "Firma la lettera",
  confirmation: {
    required: true,
    subject: "Conferma",
    text: "Ciao {{name}}",
    button: "Conferma",
  },
  questions: [
    {
      id: "mail",
      label: "E-mail",
      type: "email",
      required: true,
      contactField: "email",
    },
    {
      id: "topic",
      label: "Come?",
      type: "single",
      required: true,
      options: [{ id: "deck", label: "Deck" }],
    },
    {
      id: "details",
      label: "Di più",
      type: "textarea",
      required: true,
      conditional: true,
    },
    {
      id: "updates",
      label: "Notizie",
      type: "consent",
      required: false,
      purpose: "marketing",
    },
  ],
};

test("reads the published file from the configured site, cached", async () => {
  const urls: string[] = [];
  let clock = 0;
  const read = createPublishedFormReader({
    websiteUrl: "https://sea-watch.org/",
    now: () => clock,
    fetch: async (url) => {
      urls.push(url);
      return url.endsWith("/de.json")
        ? new Response("", { status: 404 })
        : Response.json(file);
    },
  });
  assert.equal((await read("petition", "it"))?.title, "Firma la lettera");
  assert.equal(await read("petition", "de"), null, "no file for German");
  await read("petition", "it");
  await read("petition", "de");
  assert.deepEqual(urls, [
    "https://sea-watch.org/forms/petition/it.json",
    "https://sea-watch.org/forms/petition/de.json",
  ]);
  clock += 6 * 60_000;
  await read("petition", "it");
  assert.equal(urls.length, 3, "read again once the cache expired");
  // Ids that cannot be a path are never fetched.
  assert.equal(await read("../admin", "it"), null);
  assert.equal(urls.length, 3);
});

test("a wrong sender value in the file is ignored, not the whole file", async () => {
  const read = createPublishedFormReader({
    websiteUrl: "https://sea-watch.org",
    fetch: async () =>
      Response.json({
        ...file,
        confirmation: {
          ...file.confirmation,
          senderLocalPart: 42,
          replyTo: "x".repeat(300),
        },
      }),
  });
  const form = await read("petition", "it");
  assert.equal(form?.confirmation?.subject, "Conferma");
  assert.equal(form?.confirmation?.senderLocalPart, undefined);
  assert.equal(form?.confirmation?.replyTo, undefined);
});

test("an unreachable site or an unexpected file is an error, not a guess", async () => {
  const failing = (response: () => Promise<Response>) =>
    createPublishedFormReader({
      websiteUrl: "https://sea-watch.org",
      fetch: response,
    })("petition", "it");
  await assert.rejects(
    failing(async () => new Response("", { status: 503 })),
    PublishedFormUnavailableError,
  );
  await assert.rejects(
    failing(async () => {
      throw new TypeError("fetch failed");
    }),
    PublishedFormUnavailableError,
  );
  await assert.rejects(
    failing(async () => Response.json({ ...file, formId: "another" })),
    PublishedFormUnavailableError,
  );
  await assert.rejects(
    failing(async () => Response.json({ hello: "world" })),
    PublishedFormUnavailableError,
  );
});
