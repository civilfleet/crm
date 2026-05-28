import { Label } from "@radix-ui/react-label";
import { Building } from "lucide-react";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "@/hooks/use-toast";
import type { FileTypes } from "@/types";
import FileUpload from "../file-uploader";
import ButtonControl from "../helper/button-control";
import { Form } from "../ui/form";

interface ReceiptFormData {
  url: string;
}

export default function FundingRequestPostData({
  fundingRequestId,
  title,
  description,
  type,
}: {
  fundingRequestId: string;
  title: string;
  description: string;
  type: FileTypes;
}) {
  const form = useForm<ReceiptFormData>();
  const [isUploaded, setIsUploaded] = useState(false);

  const onSubmit = async (data: ReceiptFormData) => {
    try {
      const response = await fetch(
        `/api/funding-requests/${fundingRequestId}/files`,
        {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            file: data.url,
            type,
          }),
        },
      );
      if (!response.ok) {
        toast({
          title: "Error",
          description: response?.statusText,
          variant: "destructive",
        });
        return;
      }
      await response.json();
      toast({
        title: "Success",
        description: "File uploaded successfully",
        variant: "default",
      });
      setIsUploaded(true); // Set the state to true after successful upload
    } catch (e) {
      toast({
        title: "Error",
        description: (e as Error).message,
        variant: "destructive",
      });
    }
  };

  const handleFileUpload = (url: string) => {
    form.setValue("url", url);
    // Set the file URL in the form state if needed
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Building className="h-5 w-5" />
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="">
            <Label className="text-sm text-gray-500 my-2">{description}</Label>

            <FileUpload
              placeholder="Upload file"
              name="file"
              data={""}
              error={
                form?.formState?.errors?.url
                  ? (form.formState.errors?.url?.message as string)
                  : ""
              }
              onFileUpload={(url) => handleFileUpload(url)}
              disabled={isUploaded} // Disable the file upload component after successful upload
            />

            {/* Submit Button */}
            <ButtonControl
              type="submit"
              label="Submit"
              className="my-2"
              disabled={form.watch("url") === undefined || isUploaded} // Disable the button if the file is not uploaded or if the upload is already successful
              loading={false}
            />
          </form>
        </Form>
      </CardContent>
    </Card>
  );
}
