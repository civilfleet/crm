import type { ContactSubmodule } from "@/constants/contact-submodules";

export interface BankDetails {
  id: string;
  bankName: string;
  accountHolder: string;
  iban: string;
  bic: string;
  createdAt: Date;
  updatedAt: Date;
  organization?: Organization;
  teams?: Teams;
}

export enum Roles {
  Organization = "Organization",
  Team = "Team",
  Admin = "Admin",
}

export const APP_MODULES = ["CRM", "FUNDING", "ADMIN"] as const;
export const DEFAULT_TEAM_MODULES = ["CRM", "FUNDING"] as const;
export type AppModule = (typeof APP_MODULES)[number];

export enum IntegrationProvider {
  KLAVIYO = "KLAVIYO",
  ZAMMAD = "ZAMMAD",
  SCALEWAY_TEM = "SCALEWAY_TEM",
}

export enum ContactGender {
  FEMALE = "FEMALE",
  MALE = "MALE",
  NON_BINARY = "NON_BINARY",
  OTHER = "OTHER",
  NO_ANSWER = "NO_ANSWER",
}

export enum ContactRequestPreference {
  YES = "YES",
  NO = "NO",
  NO_ANSWER = "NO_ANSWER",
}

export interface IntegrationConnection {
  id: string;
  teamId: string;
  provider: IntegrationProvider;
  baseUrl?: string;
  webhookSecret?: string;
  defaultListId?: string;
  senderEmail?: string;
  senderName?: string;
  isEnabled: boolean;
  lastSyncedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface ZammadGroupSetting {
  id: string;
  teamId: string;
  groupId: number;
  groupName: string;
  importEnabled: boolean;
  autoCreateContacts: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export enum ContactAttributeType {
  STRING = "STRING",
  NUMBER = "NUMBER",
  DATE = "DATE",
  LOCATION = "LOCATION",
}

export type ContactLocationValue = {
  label?: string;
  latitude?: number;
  longitude?: number;
};

export type ContactProfileAttribute =
  | {
      key: string;
      type: ContactAttributeType.STRING | ContactAttributeType.DATE;
      value: string;
    }
  | {
      key: string;
      type: ContactAttributeType.NUMBER;
      value: number;
    }
  | {
      key: string;
      type: ContactAttributeType.LOCATION;
      value: ContactLocationValue;
    };

export interface EventRole {
  id: string;
  teamId: string;
  name: string;
  color?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface EventType {
  id: string;
  teamId: string;
  name: string;
  color?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface Event {
  id: string;
  teamId: string;
  eventTypeId?: string;
  eventType?: EventType;
  title: string;
  description?: string;
  location?: string;
  isOnline?: boolean;
  expectedGuests?: number;
  hasRemuneration?: boolean;
  address?: string;
  city?: string;
  postalCode?: string;
  state?: string;
  timeZone?: string;
  merchNeeded?: boolean;
  startDate: Date;
  endDate?: Date;
  lists?: Array<{
    id: string;
    name: string;
    description?: string;
  }>;
  createdAt: Date;
  updatedAt: Date;
}

export type ContactParticipationType = "linked" | "registered";

export interface ContactEvent {
  event: Event;
  roles: { eventRole: EventRole }[];
  participationTypes: ContactParticipationType[];
  registration?: {
    id: string;
    createdAt: Date;
  };
}

export interface Group {
  id: string;
  teamId: string;
  name: string;
  description?: string;
  canAccessAllContacts: boolean;
  isDefaultGroup: boolean;
  modules: AppModule[];
  contactSubmodules?: ContactSubmodule[];
  createdAt: Date;
  updatedAt: Date;
}

export interface UserGroup {
  userId: string;
  groupId: string;
  createdAt: Date;
}

export interface Contact {
  id: string;
  teamId: string;
  name: string;
  pronouns?: string;
  gender?: ContactGender;
  genderRequestPreference?: ContactRequestPreference;
  isBipoc?: boolean;
  racismRequestPreference?: ContactRequestPreference;
  otherMargins?: string;
  onboardingDate?: Date;
  breakUntil?: Date;
  address?: string;
  postalCode?: string;
  state?: string;
  city?: string;
  country?: string;
  countryCode?: string;
  latitude?: number;
  longitude?: number;
  email?: string;
  phone?: string;
  signal?: string;
  website?: string;
  socialLinks: ContactSocialLink[];
  organizations?: Array<{
    id: string;
    name?: string | null;
    email: string;
  }>;
  groupId?: string;
  groupIds?: string[];
  group?: Group;
  groups?: Group[];
  profileAttributes: ContactProfileAttribute[];
  events?: ContactEvent[];
  files?: { id?: string; name: string; type: string; url: string }[];
  createdAt: Date;
  updatedAt: Date;
}

export interface ContactSocialLink {
  platform: string;
  handle: string;
}

export type ContactFilter =
  | {
      type: "contactField";
      field:
        | "email"
        | "phone"
        | "signal"
        | "name"
        | "pronouns"
        | "address"
        | "postalCode"
        | "state"
        | "city"
        | "country"
        | "website";
      operator: "has" | "missing" | "contains";
      value?: string;
    }
  | {
      type: "attribute";
      key: string;
      operator: "contains" | "equals";
      value: string;
    }
  | {
      type: "group";
      groupId: string;
    }
  | {
      type: "eventRole";
      eventRoleId: string;
    }
  | {
      type: "createdAt";
      from?: string;
      to?: string;
    }
  | {
      type: "distance";
      postalCode: string;
      countryCode: string;
      radiusKm: number;
    }
  | {
      type: "contactIds";
      contactIds: string[];
    };

export type ContactFilterType = ContactFilter["type"];

export enum ContactListType {
  MANUAL = "MANUAL",
  SMART = "SMART",
}

export interface ContactList {
  id: string;
  teamId: string;
  name: string;
  description?: string;
  type: ContactListType;
  filters?: ContactFilter[];
  contacts: Array<Pick<Contact, "id" | "name" | "email" | "phone">>;
  contactCount: number;
  createdAt: Date;
  updatedAt: Date;
}

export enum EngagementDirection {
  INBOUND = "INBOUND",
  OUTBOUND = "OUTBOUND",
}

export enum EngagementSource {
  EMAIL = "EMAIL",
  PHONE = "PHONE",
  SMS = "SMS",
  MEETING = "MEETING",
  EVENT = "EVENT",
  TODO = "TODO",
  NOTE = "NOTE",
  OTHER = "OTHER",
}

export enum TodoStatus {
  PENDING = "PENDING",
  IN_PROGRESS = "IN_PROGRESS",
  COMPLETED = "COMPLETED",
  CANCELLED = "CANCELLED",
}

export interface ContactEngagement {
  id: string;
  contactId: string;
  teamId: string;
  direction: EngagementDirection;
  source: EngagementSource;
  externalId?: string;
  externalSource?: string;
  restrictedToSubmodule?: ContactSubmodule;
  subject?: string;
  message: string;
  userId?: string;
  userName?: string;
  assignedToUserId?: string;
  assignedToUserName?: string;
  todoStatus?: TodoStatus;
  dueDate?: Date;
  engagedAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

export enum ChangeAction {
  CREATED = "CREATED",
  UPDATED = "UPDATED",
  DELETED = "DELETED",
}

export interface ContactChangeLog {
  id: string;
  contactId: string;
  action: ChangeAction;
  fieldName?: string;
  oldValue?: string;
  newValue?: string;
  userId?: string;
  userName?: string;
  metadata?: Record<string, unknown>;
  createdAt: Date;
}

export interface User {
  id: string;
  name?: string;
  address?: string;
  email: string;
  phone?: string;
  postalCode?: string;
  city?: string;
  country?: string;
  organizationId?: string;
  organization?: Organization;
  fundingRequests: FundingRequest[];
  teamId?: string;
  team?: Teams;
  roles: Roles[];
  groups?: Array<{
    groupId: string;
    group: {
      id: string;
      name: string;
    };
  }>;

  createdAt: Date;
  updatedAt: Date;
}

export interface File {
  id: string;
  url: string;
  type: FileTypes;
  name: string;
  createdBy: User;
  updatedBy: User;
  createdAt: Date;
  updatedAt: Date;
  organizationId?: string;
  organization?: Organization;
  fundingRequestId?: string;
  OrganizationTaxExemptionCertificate?: Organization;
  OrganizationArticlesOfAssociation?: Organization;
  FundingRequest?: FundingRequest;
  contactId?: string;
  contact?: Pick<Contact, "id" | "teamId" | "name" | "email">;
  donationAgreement?: DonationAgreement[];
  Transaction?: Transaction[];
  downloadAudits?: FileDownloadAudit[];
}

export enum FileDownloadType {
  SINGLE = "SINGLE",
  BULK = "BULK",
}

export interface FileDownloadAudit {
  id: string;
  type: FileDownloadType;
  fileCount: number;
  query?: string;
  createdAt: Date;
  user: {
    email: string;
  };
  file?: {
    id: string;
    name?: string;
    url: string;
  };
}

export enum FundingStatus {
  Submitted = "Submitted", // When the funding request is created and is received by the organization
  Accepted = "Accepted", // When the funding request agreed amount is set and waiting for donation agreement and board approval
  WaitingForSignature = "WaitingForSignature", // When the funding request is approved by the board and being signed by the organiation and board members
  FundsDisbursing = "FundsDisbursing", // When the funding request is approved by the board and being signed by the organiation and board members
  Completed = "Completed", // When the funds are transferred to the organization completely
  Approved = "Approved", // When the funding request when funding requested is complete signed by the organization and board members
  Rejected = "Rejected", // When the funding request is rejected by the organization or board
}

export interface FundingRequest {
  id: string;
  name: string;
  organizationId: string;
  organization: Organization;
  description: string;
  purpose: string;
  amountRequested: number;
  amountAgreed?: number;
  remainingAmount?: number;
  refinancingConcept: string;
  sustainability: string;
  expectedCompletionDate: Date;
  status: FundingStatus;
  submittedById: string;
  submittedBy?: User;
  customFields?: Record<string, unknown>; // Dynamic field data
  donationAgreement?: DonationAgreement[];
  createdAt: Date;
  updatedAt: Date;
  files: File[];
}

export interface Manager {
  id: string;
  email: string;
  name?: string;
  roles: string;
  organizations: Organization[];
}

export interface Organization {
  id: string;
  name?: string;
  address?: string;
  email: string;
  phone?: string;
  postalCode?: string;
  city?: string;
  country?: string;
  website?: string;
  taxID?: string;
  isFilledByOrg: boolean;
  portalAccessEnabled: boolean;
  orgTypeId?: string;
  orgType?: OrganizationType;
  profileData?: Record<string, unknown>;
  contactPersonId?: string;
  contactPerson?: Contact;
  bankDetailsId?: string;
  managers: Manager[];
  users: User[];
  contacts?: Array<Pick<Contact, "id" | "teamId" | "name" | "email" | "phone">>;
  teamId?: string;
  team?: Teams;
  bankDetails?: BankDetails;
  fundingRequests: FundingRequest[];
  taxExemptionCertificate?: File;
  articlesOfAssociation?: File;
  createdAt: Date;
  updatedAt: Date;
  Files?: File[]; // This is a relation
}

export interface OrganizationType {
  id: string;
  teamId: string;
  name: string;
  color?: string;
  schema?: OrganizationTypeField[];
  createdAt: Date;
  updatedAt: Date;
}

export interface OrganizationEngagement {
  id: string;
  organizationId: string;
  teamId: string;
  type: string;
  note?: string;
  engagedAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

export type OrganizationFieldType =
  | "STRING"
  | "NUMBER"
  | "DATE"
  | "BOOLEAN"
  | "SELECT"
  | "MULTISELECT";

export interface OrganizationTypeField {
  key: string;
  label: string;
  type: OrganizationFieldType;
  required?: boolean;
  options?: Array<{ label: string; value: string }>;
}

export interface OrganizationFieldValue {
  id: string;
  organizationId: string;
  key: string;
  type: OrganizationFieldType | string;
  stringValue?: string | null;
  numberValue?: number | null;
  dateValue?: Date | null;
  booleanValue?: boolean | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface Teams {
  id: string;
  name: string;
  roleName: string;
  email: string;
  phone?: string;
  address?: string;
  postalCode?: string;
  city?: string;
  country?: string;
  website?: string;
  bankDetailsId?: string;
  bankDetails?: BankDetails;
  organizations: Organization[];
  users: User[];
  contacts?: Contact[];
  modules?: AppModule[];
  ownerId?: string;
  createdAt: Date;
  updatedAt: Date;
}

export enum FileTypes {
  TAX_EXEMPTION_CERTIFICATE = "TAX_EXEMPTION_CERTIFICATE",
  ARTICLES_OF_ASSOCIATION = "ARTICLES_OF_ASSOCIATION",
  REPORT = "REPORT",
  LOGO = "LOGO",
  DONATION_AGREEMENT = "DONATION_AGREEMENT",
  DONATION_RECEIPT = "DONATION_RECEIPT",
  STATEMENT = "STATEMENT",
  TRANSACTION_RECEIPT = "TRANSACTION_RECEIPT",
}

export type DonationAgreementSignature = {
  id: string;
  userId: string;
  user: User;
  agreementId: string;
  agreement: DonationAgreement;
  signature: string;
  signedAt: Date;
  createdAt: Date;
  updatedAt: Date;
};
export type DonationAgreement = {
  id: string;
  fundingRequestId: string;
  description: string;
  fileId: string;
  agreement: string;
  createdAt: Date;
  updatedAt: Date;
  userSignatures: DonationAgreementSignature[];
  fundingRequest?: FundingRequest; // Optional relation
  file?: File; // Optional relation
  createdBy: User;
  createdById: string;
};

export type EMAIL_CONTENT = {
  from?: string;
  to: string;
  subject: string;
  template: string;
  content?: string;
};

export type EmailTemplate = {
  id?: string;
  name: string;
  content: string;
  subject: string;
  type: string;
  teamId: string;
  team?: Teams;
  updatedAt?: Date;
  createdAt?: Date;
  isActive?: boolean;
};

export type Transaction = {
  id: string;
  amount: number;
  totalAmount: number;
  remainingAmount: number;
  transactionReciept?: string;
  fundingRequestId: string;
  fundingRequest?: FundingRequest;
  organizationId: string;
  organization?: Organization;
  teamId: string;
  team?: Teams;
  createdAt: Date;
  updatedAt: Date;
};

export enum FieldType {
  TEXT = "TEXT",
  TEXTAREA = "TEXTAREA",
  NUMBER = "NUMBER",
  DATE = "DATE",
  EMAIL = "EMAIL",
  URL = "URL",
  SELECT = "SELECT",
  MULTISELECT = "MULTISELECT",
  CHECKBOX = "CHECKBOX",
  RADIO = "RADIO",
  FILE = "FILE",
}

export type FormFieldOption = {
  label: string;
  value: string;
};

export type FormField = {
  id: string;
  key: string;
  label: string;
  description?: string;
  type: FieldType;
  placeholder?: string;
  defaultValue?: string;
  isRequired: boolean;
  order: number;
  minLength?: number;
  maxLength?: number;
  minValue?: number;
  maxValue?: number;
  pattern?: string;
  options?: FormFieldOption[];
  sectionId: string;
  createdAt: Date;
  updatedAt: Date;
};

export type FormSection = {
  id: string;
  name: string;
  description?: string;
  order: number;
  teamId?: string;
  team?: Teams;
  fields: FormField[];
  createdAt: Date;
  updatedAt: Date;
};
