"use client";
import { useId, useState } from "react";
import { Loader } from "@/components/helper/loader";
import { FloatingLabelInput } from "@/components/ui/floating-label-input";

interface FileUploadProps {
  onFileUpload: (fileUrl: string) => void;
  placeholder?: string;
  name?: string;
  error?: string;
  data?: string;
  disabled?: boolean;
  label?: string;
  onUploadError?: (message: string) => void;
  onUploadingChange?: (isUploading: boolean) => void;
}

const FileUpload = ({
  onFileUpload,
  placeholder,
  name,
  data,
  error,
  disabled = false,
  label,
  onUploadError,
  onUploadingChange,
}: FileUploadProps) => {
  const [_fileUrl, setFileUrl] = useState<string | null>(data || null);
  const [loading, setLoading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const inputId = useId();

  const handleFileChange = async (
    event: React.ChangeEvent<HTMLInputElement>,
  ) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setUploadError(null);
    onUploadError?.("");
    setLoading(true);
    onUploadingChange?.(true);

    try {
      const upload = await fetch("/api/upload", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fileName: file.name, fileType: file.type }),
      });

      if (!upload.ok) {
        throw new Error("Failed to request upload URL");
      }

      const { putUrl } = await upload.json();
      if (!putUrl) {
        throw new Error("Upload URL is missing");
      }

      const uploadFile = await fetch(putUrl, {
        method: "PUT",
        headers: { "Content-Type": file.type },
        body: file,
      });

      if (!uploadFile.ok) {
        throw new Error("File upload failed");
      }

      const fileUrl = putUrl.split("?")[0].split("/").pop(); // Keep only object key
      if (!fileUrl) {
        throw new Error("Invalid uploaded file URL");
      }

      setFileUrl(fileUrl);
      onFileUpload(fileUrl);
    } catch (error) {
      console.error("File upload failed:", error);
      const message = "File upload failed. Please try again.";
      setUploadError(message);
      onUploadError?.(message);
      onFileUpload("");
    } finally {
      setLoading(false);
      onUploadingChange?.(false);
    }
  };

  return (
    <div className="relative w-full">
      <FloatingLabelInput
        id={inputId}
        label={label || placeholder}
        type="file"
        className="pr-10"
        onChange={handleFileChange}
        name={name}
        disabled={disabled}
      />

      {loading && (
        <div className="absolute right-3 top-1/2 -translate-y-1/2">
          <Loader className="text-gray-950" />
        </div>
      )}

      {error && <p className="text-red-500 text-xs ">{error}</p>}
      {uploadError && <p className="text-red-500 text-xs ">{uploadError}</p>}
    </div>
  );
};

export default FileUpload;