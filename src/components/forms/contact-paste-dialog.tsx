"use client";

import { ClipboardPaste, Loader2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  CONTACT_PASTE_FIELDS,
  CONTACT_PASTE_MAX_LENGTH,
  type ContactPasteField,
  type ContactPasteValues,
  type ContactPasteWorkerMessage,
  parseContactPaste,
} from "@/lib/contact-paste";

export function ContactPasteDialog({
  onApply,
}: {
  onApply: (values: ContactPasteValues) => void;
}) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [values, setValues] = useState<ContactPasteValues | null>(null);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  const worker = useRef<Worker | null>(null);
  const timeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  function stop() {
    worker.current?.terminate();
    worker.current = null;
    if (timeout.current) clearTimeout(timeout.current);
    timeout.current = null;
  }

  useEffect(
    () => () => {
      worker.current?.terminate();
      if (timeout.current) clearTimeout(timeout.current);
    },
    [],
  );

  function changeOpen(next: boolean) {
    stop();
    setBusy(false);
    setStatus("");
    setOpen(next);
    if (!next) {
      setText("");
      setValues(null);
    }
  }

  function detect() {
    stop();
    const parsed = parseContactPaste(text);
    setValues(parsed);
    setBusy(true);
    setStatus("Loading contact detector…");
    const fallback = () => {
      stop();
      setBusy(false);
      setStatus(
        "The contact detector is unavailable. Basic detection is ready; review and complete the fields below.",
      );
    };
    try {
      const instance = new Worker(
        new URL("../../workers/contact-paste.worker.ts", import.meta.url),
        { type: "module" },
      );
      worker.current = instance;
      instance.onmessage = (event: MessageEvent<ContactPasteWorkerMessage>) => {
        const message = event.data;
        if (message.type === "status") {
          setStatus(message.message);
          return;
        }
        if (message.type === "error") {
          fallback();
          return;
        }
        setValues({
          ...parsed,
          ...(message.name && !parsed.name ? { name: message.name } : {}),
        });
        setStatus(
          "Detection complete. Check the suggestions before filling the form.",
        );
        setBusy(false);
        stop();
      };
      instance.onerror = fallback;
      timeout.current = setTimeout(fallback, 60000);
      instance.postMessage(text);
    } catch {
      fallback();
    }
  }

  return (
    <Dialog open={open} onOpenChange={changeOpen}>
      <DialogTrigger asChild>
        <Button type="button" variant="outline">
          <ClipboardPaste className="mr-2 h-4 w-4" />
          Paste contact info
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Paste contact info</DialogTitle>
          <DialogDescription>
            Paste a contact section or email signature to fill the form.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="contact-paste-source">Contact text</Label>
            <Textarea
              id="contact-paste-source"
              value={text}
              maxLength={CONTACT_PASTE_MAX_LENGTH}
              rows={6}
              placeholder={
                "Jane Smith\nEmail: jane@example.org\nPhone: +49 30 1234567\nWebsite: https://example.org"
              }
              onChange={(event) => {
                stop();
                setBusy(false);
                setStatus("");
                setValues(null);
                setText(event.target.value);
              }}
            />
            <p className="text-xs text-muted-foreground">
              {text.length} / {CONTACT_PASTE_MAX_LENGTH} characters · Paste one
              contact at a time.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              disabled={!text.trim() || busy}
              onClick={detect}
            >
              {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Detect
              fields
            </Button>
            {busy && (
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  stop();
                  setBusy(false);
                  setStatus("Using basic detection. Review the fields below.");
                }}
              >
                Use basic detection
              </Button>
            )}
          </div>
          <p role="status" className="text-sm text-muted-foreground">
            {status}
          </p>
          {values && !busy && (
            <div className="space-y-3 border-t pt-4">
              <p className="text-sm text-muted-foreground">
                Edit or clear any suggestion. These values will replace the
                corresponding fields in your contact form. Unrecognised details
                remain in the text above for review.
              </p>
              <div className="grid gap-3 sm:grid-cols-2">
                {(
                  Object.entries(CONTACT_PASTE_FIELDS) as [
                    ContactPasteField,
                    string,
                  ][]
                ).map(([field, label]) => (
                  <div key={field} className="space-y-1">
                    <Label htmlFor={`contact-paste-${field}`}>{label}</Label>
                    <Input
                      id={`contact-paste-${field}`}
                      value={values[field] ?? ""}
                      onChange={(event) =>
                        setValues({ ...values, [field]: event.target.value })
                      }
                    />
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => changeOpen(false)}
          >
            Cancel
          </Button>
          <Button
            type="button"
            disabled={busy || !values}
            onClick={() => {
              if (values) onApply(values);
              changeOpen(false);
            }}
          >
            Fill contact form
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
