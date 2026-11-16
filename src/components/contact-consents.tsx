import { format } from "date-fns";
import { ShieldCheck } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import type { ContactConsentState } from "@/services/contact-consents";

/** How each purpose reads to the team; an unknown one shows its key. */
const PURPOSE_LABELS: Record<string, string> = {
  marketing: "Updates from Sea-Watch",
};

const SOURCE_LABELS = {
  FORM: "Website form",
  MANUAL: "Set by hand",
  EXTERNAL: "Another system",
} as const;

const STATUS = {
  GRANTED: {
    label: "Agreed",
    className: "border-success/25 bg-success/10 text-success-strong",
  },
  PENDING: {
    label: "Waiting for e-mail confirmation",
    className: "border-warning/25 bg-warning/10 text-warning-strong",
  },
  WITHDRAWN: {
    label: "Withdrawn",
    className:
      "border-destructive/25 bg-destructive/10 text-destructive-strong",
  },
} as const;

type ContactConsentsProps = {
  consents: ContactConsentState[];
};

/** What the contact agreed to, per purpose, with the words and the source. */
const ContactConsents = ({ consents }: ContactConsentsProps) => (
  <Card className="w-full shadow-sm">
    <CardHeader className="border-b pb-3">
      <CardTitle className="flex items-center gap-2 text-lg font-semibold">
        <ShieldCheck aria-hidden="true" className="size-5" />
        Consents
      </CardTitle>
      <CardDescription>What this person agreed to, and where.</CardDescription>
    </CardHeader>
    <CardContent className="pt-4">
      {consents.length === 0 ? (
        <p className="text-sm text-muted-foreground">No consents recorded.</p>
      ) : (
        <ul className="space-y-4">
          {consents.map(({ purpose, current, history }) => {
            const state = STATUS[current.status];
            return (
              <li key={purpose} className="space-y-1.5">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-medium">
                    {PURPOSE_LABELS[purpose] ?? purpose}
                  </span>
                  <Badge variant="outline" className={state.className}>
                    {state.label}
                  </Badge>
                </div>
                {current.wording ? (
                  <p className="text-sm text-muted-foreground">
                    “{current.wording}”
                  </p>
                ) : null}
                <p className="text-xs text-muted-foreground">
                  {SOURCE_LABELS[current.source]}
                  {current.formId ? ` (form ${current.formId})` : ""}
                  {current.locale ? `, ${current.locale}` : ""},{" "}
                  {format(current.recordedAt, "PPp")}
                  {history.length > 1
                    ? ` · ${history.length - 1} earlier ${history.length === 2 ? "entry" : "entries"}`
                    : ""}
                </p>
              </li>
            );
          })}
        </ul>
      )}
    </CardContent>
  </Card>
);

export default ContactConsents;
