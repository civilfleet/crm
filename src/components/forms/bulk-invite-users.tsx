"use client";

import { Loader2, Users } from "lucide-react";
import { useMemo, useState } from "react";
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
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { Roles } from "@/types";

type BulkInviteUsersDialogProps = {
  teamId: string;
};

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function BulkInviteUsersDialog({ teamId }: BulkInviteUsersDialogProps) {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [rawInput, setRawInput] = useState("");
  const [isInviting, setIsInviting] = useState(false);

  const { validEmails, invalidEntries } = useMemo(() => {
    const tokens = rawInput
      .split(/[\s,;]+/)
      .map((token) => token.trim().toLowerCase())
      .filter(Boolean);

    const uniqueTokens = Array.from(new Set(tokens));
    const valids = uniqueTokens.filter((token) => EMAIL_PATTERN.test(token));
    const invalids = uniqueTokens.filter((token) => !EMAIL_PATTERN.test(token));

    return { validEmails: valids, invalidEntries: invalids };
  }, [rawInput]);

  const handleInvite = async () => {
    if (!validEmails.length) {
      toast({
        title: "No valid email addresses",
        description: "Enter at least one valid email to continue.",
        variant: "destructive",
      });
      return;
    }

    setIsInviting(true);

    let successCount = 0;
    const failures: Array<{ email: string; reason: string }> = [];

    for (const email of validEmails) {
      try {
        const response = await fetch("/api/users", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            email,
            name: "",
            phone: "",
            teamId,
            roles: [Roles.Team],
          }),
        });

        if (response.ok) {
          successCount += 1;
        } else {
          const error = await response.json().catch(() => null);
          failures.push({
            email,
            reason: error?.error ?? response.statusText,
          });
        }
      } catch (error) {
        failures.push({
          email,
          reason: error instanceof Error ? error.message : "Unknown error",
        });
      }
    }

    setIsInviting(false);

    if (successCount) {
      toast({
        title: "Invitations sent",
        description: `Successfully invited ${successCount} ${
          successCount === 1 ? "user" : "users"
        }.`,
      });
    }

    if (failures.length) {
      toast({
        title: "Some invitations failed",
        description: failures
          .map((failure) => `${failure.email}: ${failure.reason}`)
          .join("\n"),
        variant: "destructive",
      });
    }

    if (successCount && failures.length === 0) {
      setRawInput("");
      setOpen(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(value) => !isInviting && setOpen(value)}>
      <DialogTrigger asChild>
        <Button type="button" variant="outline">
          <Users className="mr-2 h-4 w-4" aria-hidden="true" />
          Bulk Invite Users
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Bulk Invite Users</DialogTitle>
          <DialogDescription>
            Paste a list of email addresses separated by spaces, commas, or new
            lines. Each valid email will receive an invite to join this team.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <Textarea
            value={rawInput}
            onChange={(event) => setRawInput(event.target.value)}
            placeholder="user1@example.com&#10;user2@example.com&#10;user3@example.com"
            rows={8}
          />
          <div className="space-y-1 text-sm text-muted-foreground">
            <p>
              {validEmails.length} valid{" "}
              {validEmails.length === 1 ? "email" : "emails"} detected.
            </p>
            {invalidEntries.length > 0 && (
              <p className="text-destructive">
                Ignoring {invalidEntries.length} invalid{" "}
                {invalidEntries.length === 1 ? "entry" : "entries"}.
              </p>
            )}
          </div>
        </div>
        <DialogFooter className="flex-col gap-2 sm:flex-row sm:justify-end">
          <Button
            type="button"
            variant="outline"
            onClick={() => {
              setRawInput("");
              setOpen(false);
            }}
            disabled={isInviting}
          >
            Cancel
          </Button>
          <Button
            type="button"
            onClick={handleInvite}
            disabled={isInviting || !validEmails.length}
          >
            {isInviting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Send Invitations
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}