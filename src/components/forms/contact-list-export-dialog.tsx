"use client";

import { Download, Loader2 } from "lucide-react";
import { useCallback, useState } from "react";
import useSWR from "swr";

const fetcher = (url: string) => fetch(url).then((res) => res.json());

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";

type ContactListExportDialogProps = {
  teamId: string;
  list: { id: string; name: string } | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

const STANDARD_FIELDS = [
  { id: "name", label: "Name" },
  { id: "email", label: "Email" },
  { id: "phone", label: "Phone" },
  { id: "city", label: "City" },
  { id: "state", label: "State" },
  { id: "country", label: "Country" },
  { id: "createdAt", label: "Created Date" },
];

export function ContactListExportDialog({
  teamId,
  list,
  open,
  onOpenChange,
}: ContactListExportDialogProps) {
  const { toast } = useToast();
  const [isExporting, setIsExporting] = useState(false);
  const [selectedFields, setSelectedFields] = useState<Set<string>>(
    new Set(["name", "email", "phone"]),
  );
  const [selectedAttributes, setSelectedAttributes] = useState<Set<string>>(
    new Set(),
  );

  const { data: attributesData, isLoading: isLoadingAttributes } = useSWR(
    open ? `/api/contacts/attribute-keys?teamId=${teamId}` : null,
    fetcher,
  );

  const attributeKeys = (attributesData?.data as string[]) || [];

  const handleToggleField = (fieldId: string, checked: boolean) => {
    const next = new Set(selectedFields);
    if (checked) next.add(fieldId);
    else next.delete(fieldId);
    setSelectedFields(next);
  };

  const handleToggleAttribute = (key: string, checked: boolean) => {
    const next = new Set(selectedAttributes);
    if (checked) next.add(key);
    else next.delete(key);
    setSelectedAttributes(next);
  };

  const handleEmailOnly = () => {
    setSelectedFields(new Set(["email"]));
    setSelectedAttributes(new Set());
  };

  const handleExport = useCallback(async () => {
    if (!list) return;

    if (selectedFields.size === 0 && selectedAttributes.size === 0) {
      toast({
        title: "No columns selected",
        description: "Please select at least one column to export.",
        variant: "destructive",
      });
      return;
    }

    setIsExporting(true);
    try {
      const response = await fetch(
        `/api/contact-lists/${list.id}/export?teamId=${teamId}`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            fields: Array.from(selectedFields),
            attributes: Array.from(selectedAttributes),
          }),
        },
      );

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || "Failed to generate export");
      }

      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `${list.name.replace(/\s+/g, "-").toLowerCase()}-export.csv`;
      link.click();
      URL.revokeObjectURL(url);

      toast({
        title: "Export successful",
        description: "Your CSV file is downloading.",
      });
      onOpenChange(false);
    } catch (error) {
      toast({
        title: "Export failed",
        description:
          error instanceof Error
            ? error.message
            : "An unexpected error occurred.",
        variant: "destructive",
      });
    } finally {
      setIsExporting(false);
    }
  }, [list, selectedFields, selectedAttributes, teamId, toast, onOpenChange]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Export Contact List</DialogTitle>
          <DialogDescription>
            Choose the fields and attributes to include in the CSV export for
            &quot;
            {list?.name}&quot;.
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto pr-2 space-y-6 py-2">
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h4 className="text-sm font-medium leading-none">
                Standard Fields
              </h4>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleEmailOnly}
                className="h-7 text-xs"
              >
                Quick select: Email only
              </Button>
            </div>
            <div className="grid grid-cols-2 gap-3">
              {STANDARD_FIELDS.map((field) => (
                <div key={field.id} className="flex items-center space-x-2">
                  <Checkbox
                    id={`export-field-${field.id}`}
                    checked={selectedFields.has(field.id)}
                    onCheckedChange={(checked) =>
                      handleToggleField(field.id, checked as boolean)
                    }
                  />
                  <Label
                    htmlFor={`export-field-${field.id}`}
                    className="text-sm font-normal"
                  >
                    {field.label}
                  </Label>
                </div>
              ))}
            </div>
          </div>

          <div className="space-y-4">
            <h4 className="text-sm font-medium leading-none">
              Profile Attributes
            </h4>
            {isLoadingAttributes ? (
              <div className="flex items-center text-sm text-muted-foreground">
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Loading attributes...
              </div>
            ) : attributeKeys.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No custom attributes found for this team.
              </p>
            ) : (
              <div className="grid grid-cols-2 gap-3">
                {attributeKeys.map((key) => (
                  <div key={key} className="flex items-center space-x-2">
                    <Checkbox
                      id={`export-attr-${key}`}
                      checked={selectedAttributes.has(key)}
                      onCheckedChange={(checked) =>
                        handleToggleAttribute(key, checked as boolean)
                      }
                    />
                    <Label
                      htmlFor={`export-attr-${key}`}
                      className="text-sm font-normal truncate max-w-[120px]"
                      title={key}
                    >
                      {key}
                    </Label>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <DialogFooter className="mt-4 pt-4 border-t">
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isExporting}
          >
            Cancel
          </Button>
          <Button
            type="button"
            onClick={handleExport}
            disabled={
              isExporting ||
              (selectedFields.size === 0 && selectedAttributes.size === 0)
            }
          >
            {isExporting ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Generating...
              </>
            ) : (
              <>
                <Download className="mr-2 h-4 w-4" />
                Download CSV
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}