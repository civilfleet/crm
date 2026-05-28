import { Download, FileText } from "lucide-react"; // Icons for files
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { File } from "@/types";

interface FileListProps {
  files?: File[];
  organizationFiles?: File[];
}

export const FileList = ({ files, organizationFiles }: FileListProps) => {
  const allFiles = [...(files || []), ...(organizationFiles || [])];

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <FileText className="h-5 w-5" />
          Documents
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4 max-h-96 overflow-y-auto">
        {" "}
        {/* Scrollable container */}
        {allFiles.length > 0 ? (
          <div className="grid grid-cols-1 gap-3">
            {" "}
            {/* Reduced gap */}
            {allFiles.map((file) => (
              <div
                key={file.id}
                className="flex items-center justify-between p-3 border rounded-lg hover:bg-gray-50 transition-colors" // Reduced padding
              >
                <div className="flex items-center gap-3 flex-1 min-w-0">
                  {" "}
                  {/* Allow truncation */}
                  <FileText className="w-5 h-5 text-gray-500" />{" "}
                  {/* Smaller icon */}
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-sm truncate">
                      {" "}
                      {/* Truncate long file names */}
                      {file.name || file.type}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Uploaded on {new Date(file.createdAt).toLocaleString()}
                    </p>
                  </div>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  className="shrink-0 flex items-center gap-2" // Prevent button from shrinking
                  asChild
                >
                  <a
                    href={`${process.env.NEXT_PUBLIC_BASE_URL}/api/files/${file.id}`}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    <Download className="w-4 h-4" /> {/* Download icon */}
                    Download
                  </a>
                </Button>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-muted-foreground text-sm text-center">
            No documents attached
          </p>
        )}
      </CardContent>
    </Card>
  );
};
