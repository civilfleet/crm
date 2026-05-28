"use client";

import {
  Building,
  ChevronDown,
  ChevronUp,
  CreditCard,
  DollarSign,
  Download,
  FileText,
  Globe,
  Mail,
  MapPin,
  Phone,
  User,
  Users,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
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
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { Separator } from "@/components/ui/separator";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { FundingRequest, Organization } from "@/types";
import DetailItem from "./helper/detail-item";

type ExpandableSection =
  | "profile"
  | "banking"
  | "files"
  | "users"
  | "contacts"
  | "funding";

export default function OrganizationDetails({
  organization,
  fundingRequests,
}: {
  organization: Organization;
  fundingRequests: FundingRequest[];
}) {
  const router = useRouter();
  const users = organization?.users || [];
  const contacts = organization?.contacts || [];
  const [expandedSections, setExpandedSections] = useState<ExpandableSection[]>(
    ["profile"],
  );

  const toggleSection = (section: ExpandableSection) => {
    if (expandedSections.includes(section)) {
      setExpandedSections(expandedSections.filter((s) => s !== section));
    } else {
      setExpandedSections([...expandedSections, section]);
    }
  };

  const isSectionExpanded = (section: ExpandableSection) =>
    expandedSections.includes(section);

  const getStatusVariant = (status: string) => {
    switch (status.toLowerCase()) {
      case "rejected":
        return "destructive";
      case "approved":
      case "submitted":
        return "default";

      case "accepted":
        return "secondary";
      default:
        return "outline";
    }
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
    }).format(amount);
  };

  return (
    <div className="space-y-6 max-w-5xl mx-auto px-4 py-6">
      <div className="flex items-center space-x-2 mb-6">
        <Building className="h-6 w-6 text-primary" />
        <h1 className="text-3xl font-bold tracking-tight">
          {organization.name}
        </h1>
      </div>
      <Collapsible
        open={isSectionExpanded("profile")}
        onOpenChange={() => toggleSection("profile")}
        className="w-full"
      >
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 py-4 px-6">
            <div>
              <CardTitle className="text-xl font-semibold">
                Organization Profile
              </CardTitle>
              <CardDescription>
                General information about the organization
              </CardDescription>
            </div>
            <CollapsibleTrigger asChild>
              <Button variant="ghost" size="icon">
                {isSectionExpanded("profile") ? (
                  <ChevronUp className="h-4 w-4" />
                ) : (
                  <ChevronDown className="h-4 w-4" />
                )}
              </Button>
            </CollapsibleTrigger>
          </CardHeader>

          <CollapsibleContent>
            <CardContent className="px-6 pb-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                <div className="space-y-4">
                  <div className="flex items-start space-x-2">
                    <Mail className="h-4 w-4 mt-1 text-muted-foreground" />
                    <DetailItem
                      label="Email Address"
                      value={organization.email}
                      type="email"
                      className="flex-1"
                    />
                  </div>

                  <div className="flex items-start space-x-2">
                    <Phone className="h-4 w-4 mt-1 text-muted-foreground" />
                    <DetailItem
                      label="Phone Number"
                      value={organization.phone}
                      type="phone"
                      className="flex-1"
                    />
                  </div>

                  <div className="flex items-start space-x-2">
                    <FileText className="h-4 w-4 mt-1 text-muted-foreground" />
                    <DetailItem
                      label="Tax Identification"
                      value={organization.taxID}
                      className="flex-1"
                    />
                  </div>
                  {organization.orgType && (
                    <div className="flex items-start space-x-2">
                      <Building className="h-4 w-4 mt-1 text-muted-foreground" />
                      <DetailItem
                        label="Organization Type"
                        value={organization.orgType.name}
                        className="flex-1"
                      />
                    </div>
                  )}

                  <div className="flex items-start space-x-2">
                    <Globe className="h-4 w-4 mt-1 text-muted-foreground" />
                    <DetailItem
                      label="Website"
                      value={organization.website}
                      type="link"
                      className="flex-1"
                    />
                  </div>
                </div>

                <div className="space-y-4">
                  <div className="flex items-start space-x-2">
                    <MapPin className="h-4 w-4 mt-1 text-muted-foreground" />
                    <div className="flex-1">
                      <DetailItem
                        label="Physical Address"
                        value={organization.address}
                      />

                      <div className="grid grid-cols-2 gap-4 mt-4">
                        <DetailItem
                          label="Postal Code"
                          value={organization.postalCode}
                        />
                        <DetailItem label="City" value={organization.city} />
                      </div>

                      <DetailItem
                        label="Country"
                        value={organization.country}
                        className="mt-4"
                      />
                    </div>
                  </div>
                  {organization.contactPerson && (
                    <div className="flex items-start space-x-2">
                      <User className="h-4 w-4 mt-1 text-muted-foreground" />
                      <DetailItem
                        label="Contact person"
                        value={
                          organization.contactPerson.name ||
                          organization.contactPerson.email ||
                          "Unnamed"
                        }
                        className="flex-1"
                      />
                    </div>
                  )}
                </div>
              </div>
            </CardContent>
          </CollapsibleContent>
        </Card>
      </Collapsible>
      {organization.bankDetails && (
        <Collapsible
          open={isSectionExpanded("banking")}
          onOpenChange={() => toggleSection("banking")}
          className="w-full"
        >
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 py-4 px-6">
              <div>
                <CardTitle className="text-xl font-semibold">
                  Banking Information
                </CardTitle>
                <CardDescription>
                  Financial details for transfers and payments
                </CardDescription>
              </div>
              <CollapsibleTrigger asChild>
                <Button variant="ghost" size="icon">
                  {isSectionExpanded("banking") ? (
                    <ChevronUp className="h-4 w-4" />
                  ) : (
                    <ChevronDown className="h-4 w-4" />
                  )}
                </Button>
              </CollapsibleTrigger>
            </CardHeader>

            <CollapsibleContent>
              <CardContent className="px-6 pb-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="p-4 rounded-md border bg-muted/30">
                    <div className="flex items-center mb-4">
                      <CreditCard className="h-5 w-5 mr-2 text-muted-foreground" />
                      <h3 className="font-medium">Account Information</h3>
                    </div>
                    <Separator className="mb-4" />
                    <div className="space-y-3">
                      <DetailItem
                        label="Bank Name"
                        value={organization.bankDetails.bankName}
                      />
                      <DetailItem
                        label="Account Holder"
                        value={organization.bankDetails.accountHolder}
                      />
                    </div>
                  </div>

                  <div className="p-4 rounded-md border bg-muted/30">
                    <div className="flex items-center mb-4">
                      <Globe className="h-5 w-5 mr-2 text-muted-foreground" />
                      <h3 className="font-medium">International Transfer</h3>
                    </div>
                    <Separator className="mb-4" />
                    <div className="space-y-3">
                      <DetailItem
                        label="IBAN Number"
                        value={organization.bankDetails.iban}
                      />
                      <DetailItem
                        label="BIC/SWIFT"
                        value={organization.bankDetails.bic}
                      />
                    </div>
                  </div>
                </div>
              </CardContent>
            </CollapsibleContent>
          </Card>
        </Collapsible>
      )}
      {organization.Files && organization.Files.length > 0 && (
        <Collapsible
          open={isSectionExpanded("files")}
          onOpenChange={() => toggleSection("files")}
          className="w-full"
        >
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 py-4 px-6">
              <div>
                <CardTitle className="text-xl font-semibold">
                  Documents
                </CardTitle>
                <CardDescription>
                  Organizational files and documents
                </CardDescription>
              </div>
              <CollapsibleTrigger asChild>
                <Button variant="ghost" size="icon">
                  {isSectionExpanded("files") ? (
                    <ChevronUp className="h-4 w-4" />
                  ) : (
                    <ChevronDown className="h-4 w-4" />
                  )}
                </Button>
              </CollapsibleTrigger>
            </CardHeader>

            <CollapsibleContent>
              <CardContent className="px-6 pb-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {organization.Files.map((file) => (
                    <div
                      key={file.id}
                      className="flex items-center justify-between p-4 bg-muted/30 rounded-md border"
                    >
                      <div className="flex items-center space-x-3">
                        <FileText className="h-5 w-5 text-muted-foreground" />
                        <span className="font-medium truncate max-w-[180px]">
                          {file?.name || file.type}
                        </span>
                      </div>

                      <Link
                        href={`${process.env.NEXT_PUBLIC_BASE_URL}/api/files/${file.id}`}
                        className="inline-flex items-center px-3 py-2 border rounded text-sm font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary bg-white text-primary hover:bg-muted"
                        tabIndex={0}
                        aria-label="Download file"
                      >
                        <Download className="w-4 h-4 mr-2" />
                        Download
                      </Link>
                    </div>
                  ))}
                </div>
              </CardContent>
            </CollapsibleContent>
          </Card>
        </Collapsible>
      )}
      {users && users.length > 0 && (
        <Collapsible
          open={isSectionExpanded("users")}
          onOpenChange={() => toggleSection("users")}
          className="w-full"
        >
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 py-4 px-6">
              <div>
                <CardTitle className="text-xl font-semibold">
                  User Persons <Badge variant="outline">{users.length}</Badge>
                </CardTitle>
                <CardDescription>
                  People associated with this organization
                </CardDescription>
              </div>
              <CollapsibleTrigger asChild>
                <Button variant="ghost" size="icon">
                  {isSectionExpanded("users") ? (
                    <ChevronUp className="h-4 w-4" />
                  ) : (
                    <ChevronDown className="h-4 w-4" />
                  )}
                </Button>
              </CollapsibleTrigger>
            </CardHeader>

            <CollapsibleContent>
              <CardContent className="px-6 pb-6">
                <div className="border rounded-md">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-muted/50">
                        <TableHead>Name</TableHead>
                        <TableHead className="hidden md:table-cell">
                          Address
                        </TableHead>
                        <TableHead>Email</TableHead>
                        <TableHead>Phone</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {users.map((user) => (
                        <TableRow key={user.id} className="hover:bg-muted/40">
                          <TableCell className="font-medium">
                            {user.name}
                          </TableCell>
                          <TableCell className="hidden md:table-cell">
                            {user.address}
                          </TableCell>
                          <TableCell>
                            <a
                              href={`mailto:${user.email}`}
                              className="flex items-center text-foreground underline underline-offset-2 hover:text-foreground"
                            >
                              <Mail className="h-3 w-3 mr-2 inline" />
                              <span className="hidden sm:inline">
                                {user.email}
                              </span>
                              <span className="sm:hidden">Email</span>
                            </a>
                          </TableCell>
                          <TableCell>
                            <a
                              href={`tel:${user.phone}`}
                              className="flex items-center text-foreground underline underline-offset-2 hover:text-foreground"
                            >
                              <Phone className="h-3 w-3 mr-2 inline" />
                              <span className="hidden sm:inline">
                                {user.phone}
                              </span>
                              <span className="sm:hidden">Call</span>
                            </a>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </CollapsibleContent>
          </Card>
        </Collapsible>
      )}
      {contacts.length > 0 && (
        <Collapsible
          open={isSectionExpanded("contacts")}
          onOpenChange={() => toggleSection("contacts")}
          className="w-full"
        >
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 py-4 px-6">
              <div>
                <CardTitle className="text-xl font-semibold">
                  Linked Contacts{" "}
                  <Badge variant="outline">{contacts.length}</Badge>
                </CardTitle>
                <CardDescription>
                  People linked to this organization from the CRM
                </CardDescription>
              </div>
              <CollapsibleTrigger asChild>
                <Button variant="ghost" size="icon">
                  {isSectionExpanded("contacts") ? (
                    <ChevronUp className="h-4 w-4" />
                  ) : (
                    <ChevronDown className="h-4 w-4" />
                  )}
                </Button>
              </CollapsibleTrigger>
            </CardHeader>

            <CollapsibleContent>
              <CardContent className="px-6 pb-6">
                <div className="border rounded-md">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-muted/50">
                        <TableHead>Name</TableHead>
                        <TableHead>Email</TableHead>
                        <TableHead>Phone</TableHead>
                        <TableHead className="text-right">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {contacts.map((contact) => (
                        <TableRow
                          key={contact.id}
                          className="hover:bg-muted/40"
                        >
                          <TableCell className="font-medium">
                            <div className="flex items-center">
                              <Users className="h-3.5 w-3.5 mr-2 text-muted-foreground" />
                              {contact.name}
                            </div>
                          </TableCell>
                          <TableCell>
                            {contact.email ? (
                              <a
                                href={`mailto:${contact.email}`}
                                className="text-foreground underline underline-offset-2 hover:text-foreground"
                              >
                                {contact.email}
                              </a>
                            ) : (
                              <span className="text-muted-foreground">-</span>
                            )}
                          </TableCell>
                          <TableCell>
                            {contact.phone ? (
                              <a
                                href={`tel:${contact.phone}`}
                                className="text-foreground underline underline-offset-2 hover:text-foreground"
                              >
                                {contact.phone}
                              </a>
                            ) : (
                              <span className="text-muted-foreground">-</span>
                            )}
                          </TableCell>
                          <TableCell className="text-right">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() =>
                                router.push(
                                  `/teams/${contact.teamId}/crm/contacts/${contact.id}`,
                                )
                              }
                            >
                              View
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </CollapsibleContent>
          </Card>
        </Collapsible>
      )}
      {fundingRequests && fundingRequests.length > 0 && (
        <Collapsible
          open={isSectionExpanded("funding")}
          onOpenChange={() => toggleSection("funding")}
          className="w-full"
        >
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 py-4 px-6">
              <div>
                <CardTitle className="text-xl font-semibold">
                  Funding Requests{" "}
                  <Badge variant="outline">{fundingRequests.length}</Badge>
                </CardTitle>
                <CardDescription>
                  Financial requests submitted by this organization
                </CardDescription>
              </div>
              <CollapsibleTrigger asChild>
                <Button variant="ghost" size="icon">
                  {isSectionExpanded("funding") ? (
                    <ChevronUp className="h-4 w-4" />
                  ) : (
                    <ChevronDown className="h-4 w-4" />
                  )}
                </Button>
              </CollapsibleTrigger>
            </CardHeader>

            <CollapsibleContent>
              <CardContent className="px-6 pb-6">
                <div className="border rounded-md">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-muted/50">
                        <TableHead className="w-40">Amount</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead className="hidden md:table-cell">
                          Description
                        </TableHead>
                        <TableHead className="text-right">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {fundingRequests.map((request) => (
                        <TableRow
                          key={request.id}
                          className="hover:bg-muted/40"
                        >
                          <TableCell className="font-medium">
                            <div className="flex items-center">
                              <DollarSign className="h-4 w-4 mr-1 text-muted-foreground" />
                              {typeof request.amountRequested === "number"
                                ? formatCurrency(request.amountRequested)
                                : request.amountRequested}
                            </div>
                          </TableCell>
                          <TableCell>
                            <Badge variant={getStatusVariant(request.status)}>
                              {request.status}
                            </Badge>
                          </TableCell>
                          <TableCell className="max-w-xs truncate hidden md:table-cell">
                            {request.description}
                          </TableCell>
                          <TableCell className="text-right">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() =>
                                router.push(
                                  `/team/funding-requests/${request.id}`,
                                )
                              }
                            >
                              View Details
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </CollapsibleContent>
          </Card>
        </Collapsible>
      )}
    </div>
  );
}