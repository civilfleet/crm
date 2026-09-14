"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";

interface DeleteContactButtonProps {
  teamId: string;
  contactId: string;
  contactName?: string;
}

export default function DeleteContactButton({
  teamId,
  contactId,
  contactName,
}: DeleteContactButtonProps) {
  const router = useRouter();
  const { toast } = useToast();
  const [isDeleting, setIsDeleting] = useState(false);

  const handleDelete = async () => {
    setIsDeleting(true);
    try {
      const response = await fetch("/api/contacts", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ teamId, ids: [contactId] }),
      });

      const result = await response.json();
      if (!response.ok) {
        throw new Error(result?.error || response.statusText);
      }

      toast({
        title: "Contact moved to trash",
        description: contactName
          ? `${contactName} can be restored from the contacts trash.`
          : "The contact can be restored from the contacts trash.",
        variant: "default",
      });

      router.replace(`/teams/${teamId}/crm/contacts`);
      router.refresh();
    } catch (error) {
      toast({
        title: "Failed to delete contact",
        description: (error as Error).message,
        variant: "destructive",
      });
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button variant="destructive" size="sm">
          Move to trash
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Move contact to trash?</AlertDialogTitle>
          <AlertDialogDescription>
            This will remove{" "}
            <span className="font-semibold">
              {contactName ?? "this contact"}
            </span>{" "}
            from active contacts. You can restore it from the trash later.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={isDeleting}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            onClick={handleDelete}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            disabled={isDeleting}
          >
            {isDeleting ? "Moving..." : "Move to trash"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
