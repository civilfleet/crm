import { CreditCard, DollarSign, FileText, Users } from "lucide-react";
import Link from "next/link";
import RecentActivity from "@/components/recent-activity";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import prisma from "@/lib/prisma";

interface OrganizationPageProps {
  params: Promise<{
    organizationId: string;
  }>;
}

export default async function OrganizationPage({
  params,
}: OrganizationPageProps) {
  const { organizationId } = await params;

  // Get organization information for the title
  const organization = await prisma.organization.findUnique({
    where: { id: organizationId },
    select: { name: true },
  });

  return (
    <div className="p-6">
      <h1 className="text-3xl font-bold mb-6">
        {organization?.name || "Organization"} Dashboard
      </h1>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <Link href={`/organizations/${organizationId}/funding-requests`}>
          <Card className="hover:bg-accent transition-colors cursor-pointer h-full">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-lg font-medium">
                Funding Requests
              </CardTitle>
              <DollarSign className="h-5 w-5 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <CardDescription>
                View and create funding requests
              </CardDescription>
            </CardContent>
          </Card>
        </Link>

        <Link href={`/organizations/${organizationId}/transactions`}>
          <Card className="hover:bg-accent transition-colors cursor-pointer h-full">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-lg font-medium">
                Transactions
              </CardTitle>
              <CreditCard className="h-5 w-5 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <CardDescription>View transaction history</CardDescription>
            </CardContent>
          </Card>
        </Link>

        <Link href={`/organizations/${organizationId}/files`}>
          <Card className="hover:bg-accent transition-colors cursor-pointer h-full">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-lg font-medium">Files</CardTitle>
              <FileText className="h-5 w-5 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <CardDescription>Manage organization documents</CardDescription>
            </CardContent>
          </Card>
        </Link>

        <Link href={`/organizations/${organizationId}/users`}>
          <Card className="hover:bg-accent transition-colors cursor-pointer h-full">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-lg font-medium">Users</CardTitle>
              <Users className="h-5 w-5 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <CardDescription>Manage organization members</CardDescription>
            </CardContent>
          </Card>
        </Link>
      </div>

      <div className="mt-8">
        <RecentActivity
          scope="organization"
          scopeId={organizationId}
          title="Organization Activity"
        />
      </div>
    </div>
  );
}
