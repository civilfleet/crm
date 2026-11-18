"use client";

import { Users } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import useSWR from "swr";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";

type Hint = { contact: { id: string; name: string }; reason: "phone" };

const fetcher = async (url: string) => {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Request failed (${response.status})`);
  return response.json() as Promise<{ data: Hint[] }>;
};

/**
 * "Possibly the same person as …": a website form or event registration
 * made this contact although another had the same phone number. Intake
 * matches by e-mail only, so a person decides: merge or dismiss.
 */
export const ContactDuplicateHints = ({
  teamId,
  contactId,
}: {
  teamId: string;
  contactId: string;
}) => {
  const { toast } = useToast();
  const url = `/api/contacts/${contactId}/duplicates?teamId=${teamId}`;
  const { data, mutate } = useSWR(url, fetcher);
  const [busyId, setBusyId] = useState<string | null>(null);
  const hints = data?.data ?? [];
  if (hints.length === 0) return null;

  const handleDismiss = async (duplicateOfId: string) => {
    setBusyId(duplicateOfId);
    try {
      const response = await fetch(`/api/contacts/${contactId}/duplicates`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ teamId, duplicateOfId }),
      });
      if (!response.ok) throw new Error();
      await mutate();
    } catch {
      toast({
        title: "Not saved",
        description: "Try again in a moment.",
        variant: "destructive",
      });
    } finally {
      setBusyId(null);
    }
  };

  return (
    <Card className="w-full border-warning/40 shadow-sm">
      <CardHeader className="border-b pb-3">
        <CardTitle className="flex items-center gap-2 text-lg font-semibold">
          <Users aria-hidden="true" className="size-5" />
          Possibly the same person
        </CardTitle>
        <CardDescription>
          This contact came from a website form or event registration with a new
          e-mail address, and the same phone number as another contact. To merge
          them, select both in the contacts list and choose Merge.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3 pt-4">
        {hints.map((hint) => (
          <div
            key={hint.contact.id}
            className="flex flex-wrap items-center justify-between gap-2"
          >
            <p className="text-sm">
              <Link
                href={`/teams/${teamId}/crm/contacts/${hint.contact.id}`}
                className="font-medium hover:underline"
              >
                {hint.contact.name}
              </Link>
              <span className="text-muted-foreground">
                {" "}
                · same phone number
              </span>
            </p>
            <Button
              size="sm"
              variant="ghost"
              disabled={busyId === hint.contact.id}
              onClick={() => handleDismiss(hint.contact.id)}
            >
              Different people
            </Button>
          </div>
        ))}
      </CardContent>
    </Card>
  );
};
