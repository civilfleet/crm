import { format } from "date-fns";
import {
  AtSign,
  Calendar,
  CalendarDays,
  FileText,
  Globe,
  Hash,
  Mail,
  MapPin,
  MessageCircle,
  Phone,
  Type,
  Users,
} from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { auth } from "@/auth";
import ContactChangeHistory from "@/components/contact-change-history";
import ContactEngagementHistory from "@/components/contact-engagement-history";
import ContactResponsiveTabs from "@/components/contact-responsive-tabs";
import DeleteContactButton from "@/components/forms/delete-contact-button";
import DeleteContactFileButton from "@/components/forms/delete-contact-file-button";
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
  getAllowedContactSubmodules,
  getContactById,
} from "@/services/contacts";
import {
  ContactAttributeType,
  ContactGender,
  ContactRequestPreference,
} from "@/types";

interface ContactDetailPageProps {
  params: Promise<{
    teamId: string;
    id: string;
  }>;
}

const formatAttributeValue = (type: ContactAttributeType, value: unknown) => {
  switch (type) {
    case ContactAttributeType.STRING:
      return value as string;
    case ContactAttributeType.NUMBER:
      return (value as number).toLocaleString();
    case ContactAttributeType.DATE:
      if (typeof value === "string") {
        try {
          return format(new Date(value), "PPP");
        } catch {
          return value;
        }
      }
      return value as string;
    case ContactAttributeType.LOCATION:
      if (typeof value === "object" && value !== null) {
        const loc = value as {
          label?: string;
          latitude?: number;
          longitude?: number;
        };
        const parts = [];
        if (loc.label) parts.push(loc.label);
        if (loc.latitude !== undefined && loc.longitude !== undefined) {
          parts.push(
            `(${loc.latitude.toFixed(6)}, ${loc.longitude.toFixed(6)})`,
          );
        }
        return parts.join(" ");
      }
      return String(value);
    default:
      return String(value);
  }
};

const getAttributeIcon = (type: ContactAttributeType) => {
  switch (type) {
    case ContactAttributeType.STRING:
      return Type;
    case ContactAttributeType.NUMBER:
      return Hash;
    case ContactAttributeType.DATE:
      return Calendar;
    case ContactAttributeType.LOCATION:
      return MapPin;
    default:
      return Type;
  }
};

const SOCIAL_PLATFORM_LABELS: Record<string, string> = {
  instagram: "Instagram",
  facebook: "Facebook",
  x: "X",
  twitter: "X",
  linkedin: "LinkedIn",
  tiktok: "TikTok",
  youtube: "YouTube",
};

const formatSocialPlatform = (platform: string) =>
  SOCIAL_PLATFORM_LABELS[platform.toLowerCase()] ?? platform;

const buildSocialHref = (platform: string, handle: string) => {
  const trimmed = handle.trim();
  if (!trimmed) {
    return undefined;
  }
  if (/^https?:\/\//i.test(trimmed)) {
    return trimmed;
  }

  const normalizedHandle = trimmed.replace(/^@/, "");
  const key = platform.toLowerCase();
  switch (key) {
    case "instagram":
      return `https://instagram.com/${normalizedHandle}`;
    case "facebook":
      return `https://facebook.com/${normalizedHandle}`;
    case "x":
    case "twitter":
      return `https://x.com/${normalizedHandle}`;
    case "linkedin":
      return `https://www.linkedin.com/in/${normalizedHandle}`;
    case "tiktok":
      return `https://www.tiktok.com/@${normalizedHandle}`;
    case "youtube":
      return `https://www.youtube.com/${normalizedHandle}`;
    default:
      return undefined;
  }
};

const formatGender = (gender?: ContactGender | null) => {
  switch (gender) {
    case ContactGender.FEMALE:
      return "Female";
    case ContactGender.MALE:
      return "Male";
    case ContactGender.NON_BINARY:
      return "Non-binary";
    case ContactGender.OTHER:
      return "Other";
    case ContactGender.NO_ANSWER:
      return "No answer";
    default:
      return undefined;
  }
};

const formatPreference = (preference?: ContactRequestPreference | null) => {
  switch (preference) {
    case ContactRequestPreference.YES:
      return "Yes";
    case ContactRequestPreference.NO:
      return "No";
    case ContactRequestPreference.NO_ANSWER:
      return "No answer";
    default:
      return undefined;
  }
};

const formatBipoc = (value?: boolean | null) => {
  if (value === true) {
    return "Yes";
  }
  if (value === false) {
    return "No";
  }
  return undefined;
};

const formatDateValue = (value?: Date) => {
  if (!value) return undefined;
  try {
    return format(new Date(value), "PPP");
  } catch {
    return undefined;
  }
};

export default async function ContactDetailPage({
  params,
}: ContactDetailPageProps) {
  const { teamId, id } = await params;
  const session = await auth();
  const userId = session?.user?.userId;
  const contact = await getContactById(
    id,
    teamId,
    userId,
    session?.user?.roles,
  );

  if (!contact) {
    notFound();
  }

  const allowedSubmodules = await getAllowedContactSubmodules(teamId, userId);
  const showSupervisionTab = allowedSubmodules.includes("SUPERVISION");
  const showShopTab = allowedSubmodules.includes("SHOP");
  const showEventsTab = true;

  const formattedGender = formatGender(contact.gender);
  const formattedGenderPreference = formatPreference(
    contact.genderRequestPreference,
  );
  const formattedBipoc = formatBipoc(contact.isBipoc);
  const formattedRacismPreference = formatPreference(
    contact.racismRequestPreference,
  );
  const formattedOtherMargins = contact.otherMargins?.trim();
  const formattedOnboardingDate = formatDateValue(contact.onboardingDate);
  const formattedBreakUntil = formatDateValue(contact.breakUntil);
  const formattedAddress = [
    contact.address,
    contact.postalCode,
    contact.city,
    contact.state,
    contact.country,
  ]
    .filter(Boolean)
    .join(", ");

  const socialItems = contact.socialLinks.map((link) => {
    const label = formatSocialPlatform(link.platform);
    const href = buildSocialHref(link.platform, link.handle);
    return {
      icon: AtSign,
      label,
      value: link.handle,
      href,
      newTab: Boolean(href),
    };
  });

  const generalInfoItems = [
    contact.email && {
      icon: Mail,
      label: "Email",
      value: contact.email,
      href: `mailto:${contact.email}`,
    },
    contact.phone && {
      icon: Phone,
      label: "Phone",
      value: contact.phone,
      href: `tel:${contact.phone}`,
    },
    contact.signal && {
      icon: MessageCircle,
      label: "Signal",
      value: contact.signal,
    },
    contact.website && {
      icon: Globe,
      label: "Website",
      value: contact.website,
      href: contact.website,
      newTab: true,
    },
    contact.pronouns && {
      icon: Type,
      label: "Pronouns",
      value: contact.pronouns,
    },
    formattedAddress && {
      icon: MapPin,
      label: "Address",
      value: formattedAddress,
    },
    ...socialItems,
  ].filter(Boolean) as Array<{
    icon: typeof Mail;
    label: string;
    value: string;
    href?: string;
    newTab?: boolean;
  }>;

  const supervisionInfoItems = [
    formattedGender && {
      icon: Users,
      label: "Gender",
      value: formattedGender,
    },
    formattedGenderPreference && {
      icon: Hash,
      label: "Request because of gender",
      value: formattedGenderPreference,
    },
    formattedBipoc && {
      icon: Users,
      label: "BIPoC",
      value: formattedBipoc,
    },
    formattedRacismPreference && {
      icon: Hash,
      label: "Request because of racism experience",
      value: formattedRacismPreference,
    },
    formattedOtherMargins && {
      icon: Type,
      label: "Other margins",
      value: formattedOtherMargins,
    },
    formattedOnboardingDate && {
      icon: Calendar,
      label: "Onboarding date",
      value: formattedOnboardingDate,
    },
    formattedBreakUntil && {
      icon: Calendar,
      label: "Break until",
      value: formattedBreakUntil,
    },
  ].filter(Boolean) as Array<{
    icon: typeof Mail;
    label: string;
    value: string;
  }>;

  const generalTabContent = (
    <div className="grid gap-8 lg:grid-cols-[1.4fr_1fr]">
      <section className="space-y-4">
        <div>
          <h3 className="text-base font-semibold">Basic Information</h3>
          <p className="text-sm text-muted-foreground">Core contact details</p>
        </div>

        {generalInfoItems.length === 0 ? (
          <p className="rounded-md border border-dashed p-3 text-center text-sm text-muted-foreground">
            No contact information available
          </p>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            {generalInfoItems.map(
              ({ icon: Icon, label, value, href, newTab }) => (
                <div
                  key={label}
                  className="flex min-w-0 items-center gap-3 rounded-md border bg-muted/30 p-3"
                >
                  <Icon className="h-5 w-5 shrink-0 text-muted-foreground" />
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-muted-foreground">
                      {label}
                    </p>
                    {href ? (
                      <a
                        href={href}
                        className="break-words text-base [overflow-wrap:anywhere] hover:underline"
                        target={newTab ? "_blank" : undefined}
                        rel={newTab ? "noreferrer" : undefined}
                      >
                        {value}
                      </a>
                    ) : (
                      <p className="break-words text-base [overflow-wrap:anywhere]">
                        {value}
                      </p>
                    )}
                  </div>
                </div>
              ),
            )}
          </div>
        )}

        {contact.notes && (
          <div className="rounded-md border bg-muted/30 p-3">
            <div className="mb-2 flex items-center gap-2">
              <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
              <p className="text-sm font-medium text-muted-foreground">
                Notes / additional info
              </p>
            </div>
            <p className="whitespace-pre-wrap break-words text-base [overflow-wrap:anywhere]">
              {contact.notes}
            </p>
          </div>
        )}
      </section>

      <section className="space-y-4">
        <div>
          <h3 className="text-base font-semibold">Metadata</h3>
          <p className="text-sm text-muted-foreground">
            Contact lifecycle details
          </p>
        </div>

        <div className="grid gap-3">
          {contact.groups && contact.groups.length > 0 && (
            <div className="rounded-md border bg-muted/30 p-3">
              <div className="mb-1 flex items-center gap-2">
                <Users className="h-4 w-4 text-muted-foreground" />
                <p className="text-sm font-medium text-muted-foreground">
                  Groups
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                {contact.groups.map((group) => (
                  <Badge key={group.id} variant="secondary">
                    {group.name}
                  </Badge>
                ))}
              </div>
            </div>
          )}
          <div className="rounded-md border bg-muted/30 p-3">
            <p className="text-sm font-medium text-muted-foreground">
              Created At
            </p>
            <p className="text-base">
              {format(new Date(contact.createdAt), "PPpp")}
            </p>
          </div>
          <div className="rounded-md border bg-muted/30 p-3">
            <p className="text-sm font-medium text-muted-foreground">
              Last Updated
            </p>
            <p className="text-base">
              {format(new Date(contact.updatedAt), "PPpp")}
            </p>
          </div>
        </div>
      </section>
    </div>
  );

  const supervisionTabContent = (
    <>
      <div>
        <h3 className="text-base font-semibold">Supervision</h3>
        <p className="text-sm text-muted-foreground">
          Sensitive supervision details
        </p>
      </div>

      {supervisionInfoItems.length === 0 ? (
        <p className="rounded-md border border-dashed p-3 text-center text-sm text-muted-foreground">
          No supervision details available
        </p>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {supervisionInfoItems.map(({ icon: Icon, label, value }) => (
            <div
              key={label}
              className="flex items-center gap-3 rounded-md border bg-muted/30 p-3"
            >
              <Icon className="h-5 w-5 text-muted-foreground" />
              <div>
                <p className="text-sm font-medium text-muted-foreground">
                  {label}
                </p>
                <p className="text-base">{value}</p>
              </div>
            </div>
          ))}
        </div>
      )}
    </>
  );

  const engagementsTabContent = (
    <ContactEngagementHistory
      contactId={id}
      teamId={teamId}
      currentUser={{
        id: session?.user?.userId ?? null,
        name: session?.user?.name ?? null,
        email: session?.user?.email ?? null,
      }}
    />
  );

  const eventsTabContent = (
    <Card className="w-full shadow-sm">
      <CardHeader className="border-b pb-3">
        <div className="flex items-center gap-2">
          <CalendarDays className="h-5 w-5" />
          <CardTitle className="text-xl font-semibold">
            Associated Events
          </CardTitle>
        </div>
        <CardDescription>
          Events this contact is participating in
        </CardDescription>
      </CardHeader>

      <CardContent className="pt-6">
        {contact.events && contact.events.length > 0 ? (
          <div className="grid gap-4">
            {contact.events.map((contactEvent) => (
              <Link
                key={contactEvent.event.id}
                href={`/teams/${teamId}/crm/events/${contactEvent.event.id}`}
                className="block h-full rounded-md border bg-muted/30 p-4 transition-colors hover:bg-muted/50"
              >
                <div className="space-y-3">
                  <div className="space-y-1">
                    <h4 className="text-base font-semibold">
                      {contactEvent.event.title}
                    </h4>
                    {contactEvent.event.description && (
                      <p className="text-sm text-muted-foreground">
                        {contactEvent.event.description}
                      </p>
                    )}
                  </div>

                  {contactEvent.participationTypes?.length ? (
                    <div className="flex flex-wrap gap-2">
                      {contactEvent.participationTypes.includes("linked") && (
                        <Badge variant="outline">Linked contact</Badge>
                      )}
                      {contactEvent.participationTypes.includes(
                        "registered",
                      ) && <Badge variant="outline">Registered attendee</Badge>}
                    </div>
                  ) : null}

                  <div className="flex flex-wrap gap-3 text-sm text-muted-foreground">
                    <div className="flex items-center gap-1.5">
                      <Calendar className="h-4 w-4" />
                      <span>
                        {format(new Date(contactEvent.event.startDate), "PPP")}
                      </span>
                    </div>
                    {contactEvent.event.location && (
                      <div className="flex items-center gap-1.5">
                        <MapPin className="h-4 w-4" />
                        <span>{contactEvent.event.location}</span>
                      </div>
                    )}
                  </div>

                  {contactEvent.roles && contactEvent.roles.length > 0 && (
                    <div className="flex flex-wrap gap-2">
                      {contactEvent.roles.map((role) => (
                        <Badge
                          key={`${contactEvent.event.id}-${role.eventRole.id}`}
                          variant="secondary"
                          style={
                            role.eventRole.color
                              ? {
                                  backgroundColor: `${role.eventRole.color}20`,
                                  color: role.eventRole.color,
                                  borderColor: role.eventRole.color,
                                }
                              : undefined
                          }
                        >
                          {role.eventRole.name}
                        </Badge>
                      ))}
                    </div>
                  )}

                  {contactEvent.registration && (
                    <p className="text-xs text-muted-foreground">
                      Registered on{" "}
                      {format(
                        new Date(contactEvent.registration.createdAt),
                        "PPpp",
                      )}
                    </p>
                  )}
                </div>
              </Link>
            ))}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">
            No associated events yet.
          </p>
        )}
      </CardContent>
    </Card>
  );

  const shopTabContent = (
    <div className="rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground">
      No shop data configured yet.
    </div>
  );

  const attributesTabContent = (
    <>
      <div>
        <h3 className="text-base font-semibold">Profile Attributes</h3>
        <p className="text-sm text-muted-foreground">
          Additional information about this contact
        </p>
      </div>

      {contact.profileAttributes.length === 0 ? (
        <div className="rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground">
          No attributes yet.
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {contact.profileAttributes.map((attribute) => {
            const Icon = getAttributeIcon(attribute.type);
            return (
              <div
                key={`${attribute.key}-${attribute.type}`}
                className="min-w-0 flex items-start gap-3 rounded-md border bg-muted/30 p-3"
              >
                <Icon className="mt-0.5 h-5 w-5 shrink-0 text-muted-foreground" />
                <div className="min-w-0 flex-1">
                  <div className="mb-1 flex flex-wrap items-center gap-2">
                    <p className="min-w-0 break-words text-sm font-medium [overflow-wrap:anywhere]">
                      {attribute.key}
                    </p>
                    <Badge variant="outline" className="text-xs">
                      {attribute.type}
                    </Badge>
                  </div>
                  <p className="break-words text-base [overflow-wrap:anywhere]">
                    {formatAttributeValue(attribute.type, attribute.value)}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </>
  );

  const filesTabContent = (
    <>
      <div>
        <h3 className="text-base font-semibold">Files</h3>
        <p className="text-sm text-muted-foreground">
          List of files attached to this contact
        </p>
      </div>

      {!contact.files || contact.files.length === 0 ? (
        <div className="rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground">
          No files attached.
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {contact.files.map((file) => {
            if (!file.id) {
              return null;
            }

            return (
              <div
                key={file.id}
                className="flex items-start gap-3 rounded-md border bg-muted/30 p-4"
              >
                <FileText className="mt-0.5 h-5 w-5 text-muted-foreground" />
                <div className="min-w-0 flex-1 space-y-1">
                  <div className="flex items-center gap-2">
                    <p className="font-medium">{file.name}</p>
                    <Badge variant="outline" className="text-xs">
                      {file.type}
                    </Badge>
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <a
                      href={`/api/files/${file.id}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="break-all text-sm text-blue-600 hover:underline"
                    >
                      View File
                    </a>
                    <DeleteContactFileButton
                      teamId={teamId}
                      contactId={id}
                      fileId={file.id}
                      fileName={file.name}
                    />
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </>
  );

  const tabItems = [
    {
      value: "general",
      label: "General",
      content: generalTabContent,
      contentClassName: "space-y-6",
    },
    {
      value: "engagements",
      label: "Engagements",
      content: engagementsTabContent,
      contentClassName: "space-y-6",
    },
    ...(showSupervisionTab
      ? [
          {
            value: "supervision",
            label: "Supervision",
            content: supervisionTabContent,
            contentClassName: "space-y-4",
          },
        ]
      : []),
    ...(showEventsTab
      ? [
          {
            value: "events",
            label: "Events",
            content: eventsTabContent,
            contentClassName: "space-y-6",
          },
        ]
      : []),
    ...(showShopTab
      ? [
          {
            value: "shop",
            label: "Shop",
            content: shopTabContent,
            contentClassName: "space-y-4",
          },
        ]
      : []),
    {
      value: "attributes",
      label: "Attributes",
      content: attributesTabContent,
      contentClassName: "space-y-4",
    },
    {
      value: "files",
      label: "Files",
      content: filesTabContent,
      contentClassName: "space-y-4",
    },
  ];

  return (
    <div className="overflow-x-hidden p-4">
      <div className="mx-auto w-full">
        <div className="grid gap-6 lg:grid-cols-12 lg:items-start">
          <div className="space-y-6 lg:col-span-8">
            <Card className="w-full shadow-sm">
              <CardHeader className="border-b pb-3">
                <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <CardTitle className="text-xl font-semibold">
                      {contact.name}
                    </CardTitle>
                    <CardDescription>Contact Details</CardDescription>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button asChild variant="outline">
                      <Link href={`/teams/${teamId}/crm/contacts/${id}/edit`}>
                        Edit Contact
                      </Link>
                    </Button>
                    <DeleteContactButton
                      teamId={teamId}
                      contactId={id}
                      contactName={contact.name}
                    />
                  </div>
                </div>
              </CardHeader>

              <CardContent className="pt-6">
                <ContactResponsiveTabs
                  defaultValue="general"
                  items={tabItems}
                />
              </CardContent>
            </Card>
          </div>

          <div className="space-y-6 lg:col-span-4 lg:col-start-9">
            <ContactChangeHistory contactId={id} />
          </div>
        </div>
      </div>
    </div>
  );
}
