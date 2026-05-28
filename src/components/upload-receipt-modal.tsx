import { AlertCircle } from "lucide-react";
import { useState } from "react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import FileUpload from "./file-uploader";

interface UploadReceiptModalProps {
  isOpen: boolean;
  onClose: () => void;
  onUpload: (fileUrl: string) => void;
  transactionId: string;
}

export function UploadReceiptModal({
  isOpen,
  onClose,
  onUpload,
  transactionId,
}: UploadReceiptModalProps) {
  const [_fileUrl, setFileUrl] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleFileUpload = async (url: string) => {
    setError(null);
    setIsLoading(true);
    setFileUrl(url);

    try {
      const response = await fetch(
        `/api/transactions/${transactionId}/receipt`,
        {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ transactionReciept: url }),
        },
      );

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(
          errorData.message || "Failed to update transaction receipt",
        );
      }

      onUpload(url);
      onClose();
    } catch (error) {
      console.error("Failed to update transaction receipt:", error);
      setError(
        error instanceof Error
          ? error.message
          : "Failed to upload receipt. Please try again.",
      );
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Upload Receipt</DialogTitle>
        </DialogHeader>
        <div className="mt-4">
          {error && (
            <Alert variant="destructive" className="mb-4">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
          <FileUpload
            onFileUpload={handleFileUpload}
            placeholder="Upload receipt"
            name="receipt"
            disabled={isLoading}
          />
          {isLoading && (
            <p className="text-sm text-muted-foreground mt-2">
              Uploading receipt...
            </p>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
