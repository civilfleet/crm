"use client";

import { ListPlus, Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { type FormEvent, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { type ContactFilter, ContactListType } from "@/types";

type SaveSmartListButtonProps = {
  teamId: string;
  /** The filters that apply now; the list keeps them and stays up to date. */
  filters: ContactFilter[];
};

/** "Save as smart list": the contacts as filtered now, kept up to date. */
export const SaveSmartListButton = ({
  teamId,
  filters,
}: SaveSmartListButtonProps) => {
  const router = useRouter();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) return;
    setIsSaving(true);
    try {
      const response = await fetch("/api/contact-lists", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          teamId,
          name: trimmed,
          type: ContactListType.SMART,
          filters,
        }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok || !body?.data?.id) {
        throw new Error(body?.error || "The list could not be saved.");
      }
      toast({ title: `Smart list “${trimmed}” saved` });
      setOpen(false);
      router.push(`/teams/${teamId}/crm/lists/${body.data.id}`);
    } catch (error) {
      toast({
        title: "Unable to save the list",
        description:
          error instanceof Error ? error.message : "Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="h-7 gap-1 px-2 text-xs"
        onClick={() => setOpen(true)}
      >
        <ListPlus className="size-3.5" />
        Save as smart list
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          <form onSubmit={handleSubmit} className="space-y-4">
            <DialogHeader>
              <DialogTitle>Save as smart list</DialogTitle>
              <DialogDescription>
                The list keeps these filters and stays up to date: people who
                match later are added, people who no longer match drop out.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-2">
              <Label htmlFor="smart-list-name">Name</Label>
              <Input
                id="smart-list-name"
                autoFocus
                maxLength={255}
                placeholder="e.g. Signed the letter (confirmed)"
                value={name}
                onChange={(event) => setName(event.target.value)}
              />
            </div>
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setOpen(false)}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={!name.trim() || isSaving}>
                {isSaving ? <Loader2 className="animate-spin" /> : null}
                Save list
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
};
