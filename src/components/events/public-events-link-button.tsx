"use client";

import { Link2 } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";

type PublicEventsLinkButtonProps = {
  teamId: string;
};

const buildPublicEventsUrl = (teamId: string) => {
  if (typeof window === "undefined") {
    return "";
  }
  return `${window.location.origin}/public/${teamId}/events`;
};

export default function PublicEventsLinkButton({
  teamId,
}: PublicEventsLinkButtonProps) {
  const { toast } = useToast();
  const [isCopying, setIsCopying] = useState(false);

  const handleCopy = async () => {
    const url = buildPublicEventsUrl(teamId);
    if (!url) {
      toast({
        title: "Unable to copy",
        description: "Public events URL is not available in this context.",
        variant: "destructive",
      });
      return;
    }

    if (!navigator?.clipboard) {
      toast({
        title: "Clipboard unavailable",
        description: "Copying is not supported in this browser.",
        variant: "destructive",
      });
      return;
    }

    try {
      setIsCopying(true);
      await navigator.clipboard.writeText(url);
      toast({
        title: "Public events link copied",
        description: url,
      });
    } catch (error) {
      toast({
        title: "Unable to copy",
        description:
          error instanceof Error ? error.message : "Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsCopying(false);
    }
  };

  return (
    <Button
      type="button"
      variant="outline"
      onClick={handleCopy}
      disabled={isCopying}
    >
      <Link2 className="mr-2 h-4 w-4" />
      Copy public events URL
    </Button>
  );
}
