import { ArrowLeft, Download, ExternalLink, FileText } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { auth } from "@/auth";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { canUserAccessFile, getFileDetails } from "@/services/file";

interface FileDetailPageProps {
  params: Promise<{
    teamId: string;
    fileId: string;
  }>;
}

type FileDetails = NonNullable<Awaited<ReturnType<typeof getFileDetails>>>;

const formatDateTime = (value: Date | string) =>
  new Date(value).toLocaleString();

const getFileTeamIds = (file: FileDetails) =>
  new Set(
    [
      file.organization?.teamId,
      file.contact?.teamId,
      file.FundingRequest?.teamId,
      ...file.donationAgreement.map((agreement) => agreement.teamId),
      ...file.Transaction.map((transaction) => transaction.teamId),
    ].filter((value): value is string => Boolean(value)),
  );

const getAssociatedResource = (file: FileDetails, teamId: string) => {
  if (file.contact?.id) {
    return {
      label: `Contact: ${file.contact.name}`,
      href: `/teams/${teamId}/crm/contacts/${file.contact.id}`,
    };
  }

  if (file.FundingRequest?.id) {
    return {
      label: file.FundingRequest.name
        ? `Funding Request: ${file.FundingRequest.name}`
        : "Funding Request",
      href: `/teams/${teamId}/funding/funding-requests/${file.FundingRequest.id}`,
    };
  }

  const donationAgreement = file.donationAgreement[0];
  if (donationAgreement?.id) {
    return {
      label: donationAgreement.fundingRequest?.name
        ? `Donation Agreement: ${donationAgreement.fundingRequest.name}`
        : "Donation Agreement",
      href: `/teams/${teamId}/funding/donation-agreements/${donationAgreement.id}`,
    };
  }

  const transaction = file.Transaction[0];
  if (transaction) {
    return {
      label: transaction.fundingRequest?.name
        ? `Transaction: ${transaction.fundingRequest.name}`
        : "Transaction",
      href: `/teams/${teamId}/funding/transactions`,
    };
  }

  if (file.organization?.id) {
    return {
      label: `Organization: ${file.organization.name ?? file.organization.id}`,
      href: `/teams/${teamId}/crm/organizations/${file.organization.id}`,
    };
  }

  return null;
};

export default async function FileDetailPage({ params }: FileDetailPageProps) {
  const { teamId, fileId } = await params;
  const session = await auth();
  const userId = session?.user?.userId;

  if (!userId) {
    notFound();
  }

  const [file, hasAccess] = await Promise.all([
    getFileDetails(fileId),
    canUserAccessFile({ userId, fileId }),
  ]);

  if (!file || !hasAccess || !getFileTeamIds(file).has(teamId)) {
    notFound();
  }

  const associatedResource = getAssociatedResource(file, teamId);
  const fileLabel = file.name || file.url;
  const previewUrl = `/api/files/${file.id}?preview=true`;
  const downloadUrl = `/api/files/${file.id}`;

  return (
    <div className="space-y-6 p-4">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-2">
          <Button asChild variant="ghost" size="sm" className="-ml-3 gap-2">
            <Link href={`/teams/${teamId}/crm/files`}>
              <ArrowLeft className="h-4 w-4" />
              Files
            </Link>
          </Button>
          <div>
            <h1 className="text-2xl font-semibold">{fileLabel}</h1>
            <p className="text-sm text-muted-foreground">
              File details, preview, and download history.
            </p>
          </div>
        </div>
        <Button asChild>
          <Link href={downloadUrl}>
            <Download className="mr-2 h-4 w-4" />
            Download
          </Link>
        </Button>
      </div>

      <div className="grid gap-6 lg:grid-cols-12">
        <Card className="lg:col-span-8">
          <CardHeader className="border-b pb-3">
            <CardTitle className="flex items-center gap-2 text-lg">
              <FileText className="h-5 w-5" />
              Preview
            </CardTitle>
            <CardDescription>{file.url}</CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            <iframe
              src={previewUrl}
              title={`Preview of ${fileLabel}`}
              className="h-[70vh] min-h-[480px] w-full rounded-b-md bg-muted"
            />
          </CardContent>
        </Card>

        <div className="space-y-6 lg:col-span-4">
          <Card>
            <CardHeader className="border-b pb-3">
              <CardTitle className="text-lg">Details</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4 pt-4 text-sm">
              <div>
                <p className="text-muted-foreground">Type</p>
                <Badge variant="outline">{file.type}</Badge>
              </div>
              <div>
                <p className="text-muted-foreground">Associated Resource</p>
                {associatedResource ? (
                  <Link
                    className="inline-flex items-center gap-1 text-blue-600 hover:underline"
                    href={associatedResource.href}
                  >
                    {associatedResource.label}
                    <ExternalLink className="h-3 w-3" />
                  </Link>
                ) : (
                  <p>N/A</p>
                )}
              </div>
              <div>
                <p className="text-muted-foreground">Created</p>
                <p>{formatDateTime(file.createdAt)}</p>
              </div>
              <div>
                <p className="text-muted-foreground">Created By</p>
                <p>{file.createdBy.email}</p>
              </div>
              <div>
                <p className="text-muted-foreground">Updated</p>
                <p>{formatDateTime(file.updatedAt)}</p>
              </div>
              <div>
                <p className="text-muted-foreground">Updated By</p>
                <p>{file.updatedBy.email}</p>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="border-b pb-3">
              <CardTitle className="text-lg">Download History</CardTitle>
              <CardDescription>
                {file.downloadAudits.length} recorded download
                {file.downloadAudits.length === 1 ? "" : "s"}
              </CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              {file.downloadAudits.length === 0 ? (
                <p className="p-4 text-sm text-muted-foreground">
                  No downloads recorded yet.
                </p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>User</TableHead>
                      <TableHead>When</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {file.downloadAudits.map((audit) => (
                      <TableRow key={audit.id}>
                        <TableCell>{audit.user.email}</TableCell>
                        <TableCell>{formatDateTime(audit.createdAt)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
