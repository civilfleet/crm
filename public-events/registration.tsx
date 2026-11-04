"use client";
import { useState, type FormEvent } from "react";

export default function Registration({
  eventId,
  endDate,
}: {
  eventId: string;
  endDate: string;
}) {
  const endpoint = process.env.NEXT_PUBLIC_EVENTS_API_URL;
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [received, setReceived] = useState(false);
  const [submissionId, setSubmissionId] = useState<string>();
  if (!endpoint)
    return (
      <p>
        Online registration will open soon. Please contact the organiser to
        register.
      </p>
    );
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (Date.parse(endDate) < Date.now()) {
      setMessage("This event has ended. Registration is closed.");
      return;
    }
    const form = new FormData(event.currentTarget);
    if (form.get("website")) return;
    const id = submissionId ?? crypto.randomUUID();
    setSubmissionId(id);
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch(`${endpoint}/v1/events/registrations`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Idempotency-Key": id },
        body: JSON.stringify({
          eventId,
          name: form.get("name"),
          email: form.get("email"),
          phone: form.get("phone") || undefined,
          notes: form.get("notes") || undefined,
        }),
      });
      if (response.status !== 202)
        throw new Error(
          response.status === 429
            ? "Too many requests. Please try again later."
            : "We could not receive your registration. Please retry or contact the organiser.",
        );
      setReceived(true);
      setMessage(
        "Registration received. We’ll process your request and email you once it is confirmed.",
      );
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Please try again.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <p role="status" aria-live="polite">
        {message}
      </p>
      {!received && (
        <form onSubmit={submit}>
          <div className="form-grid">
            <label>
              Your name
              <input
                name="name"
                autoComplete="name"
                required
                maxLength={255}
                disabled={busy}
              />
            </label>
            <label>
              Email address
              <input
                name="email"
                type="email"
                autoComplete="email"
                required
                maxLength={255}
                disabled={busy}
              />
            </label>
            <label>
              Phone (optional)
              <input
                name="phone"
                type="tel"
                autoComplete="tel"
                maxLength={80}
                disabled={busy}
              />
            </label>
            <label>
              Notes (optional)
              <textarea name="notes" maxLength={4000} disabled={busy} />
            </label>
          </div>
          <div className="honeypot" aria-hidden="true">
            <label>
              Website
              <input name="website" tabIndex={-1} autoComplete="off" />
            </label>
          </div>
          <p className="small">
            Your details are sent to Sea-Watch to process this registration.{" "}
            <a href="https://sea-watch.org/en/privacy/">Privacy information</a>
          </p>
          <button type="submit" disabled={busy}>
            {busy ? "Sending…" : "Send registration →"}
          </button>
        </form>
      )}
    </>
  );
}
