"use client";

import { Copy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";

interface CopyRegistrationLinkButtonProps {
  teamId: string;
}

export const CopyRegistrationLinkButton = ({
  teamId,
}: CopyRegistrationLinkButtonProps) => {
  const { toast } = useToast();

  const handleCopyRegistrationLink = async () => {
    const registrationLink = `${window.location.origin}/public/${teamId}/register`;

    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(registrationLink);
      } else {
        const textarea = document.createElement("textarea");
        textarea.value = registrationLink;
        textarea.setAttribute("readonly", "");
        textarea.style.position = "absolute";
        textarea.style.left = "-9999px";
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand("copy");
        document.body.removeChild(textarea);
      }

      toast({
        title: "Success",
        description: "Registration link copied to clipboard",
      });
    } catch (error) {
      toast({
        title: "Error",
        description:
          error instanceof Error
            ? error.message
            : "Failed to copy registration link",
        variant: "destructive",
      });
    }
  };

  return (
    <Button
      variant="outline"
      onClick={handleCopyRegistrationLink}
      className="flex items-center gap-2"
    >
      <Copy className="h-4 w-4" />
      Copy Public Registration Link
    </Button>
  );
};