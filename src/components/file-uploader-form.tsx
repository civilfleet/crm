"use client";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import FileUpload from "./file-uploader";

const MyForm = () => {
  const [formData, setFormData] = useState({
    name: "",
    fileUrl: "",
  });

  const handleFileUpload = (url: string) => {
    setFormData((prev) => ({ ...prev, fileUrl: url }));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <Input
        type="text"
        placeholder="Enter name"
        value={formData.name}
        onChange={(e) =>
          setFormData((prev) => ({ ...prev, name: e.target.value }))
        }
      />

      <FileUpload onFileUpload={handleFileUpload} />

      <Button type="submit" disabled={!formData.fileUrl}>
        Submit
      </Button>
    </form>
  );
};

export default MyForm;
