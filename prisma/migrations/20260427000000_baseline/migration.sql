-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "FundingStatus" AS ENUM ('Submitted', 'Accepted', 'WaitingForSignature', 'Approved', 'FundsDisbursing', 'Completed', 'Rejected', 'UnderReview', 'Pending', 'Processing', 'FundsTransferred');

-- CreateEnum
CREATE TYPE "FileDownloadType" AS ENUM ('SINGLE', 'BULK');

-- CreateEnum
CREATE TYPE "Roles" AS ENUM ('Organization', 'Team', 'Admin');

-- CreateEnum
CREATE TYPE "LoginMethod" AS ENUM ('EMAIL_MAGIC_LINK', 'OIDC');

-- CreateEnum
CREATE TYPE "ContactAttributeType" AS ENUM ('STRING', 'NUMBER', 'DATE', 'LOCATION');

-- CreateEnum
CREATE TYPE "AppModule" AS ENUM ('CRM', 'FUNDING', 'ADMIN');

-- CreateEnum
CREATE TYPE "IntegrationProvider" AS ENUM ('KLAVIYO', 'ZAMMAD');

-- CreateEnum
CREATE TYPE "ZammadSyncJobType" AS ENUM ('INCREMENTAL_SYNC', 'FULL_SYNC', 'TICKET_SYNC');

-- CreateEnum
CREATE TYPE "ZammadSyncJobStatus" AS ENUM ('PENDING', 'RUNNING', 'SUCCEEDED', 'FAILED');

-- CreateEnum
CREATE TYPE "ContactGender" AS ENUM ('FEMALE', 'MALE', 'NON_BINARY', 'OTHER', 'NO_ANSWER');

-- CreateEnum
CREATE TYPE "ContactRequestPreference" AS ENUM ('YES', 'NO', 'NO_ANSWER');

-- CreateEnum
CREATE TYPE "ContactListType" AS ENUM ('MANUAL', 'SMART');

-- CreateEnum
CREATE TYPE "FieldType" AS ENUM ('TEXT', 'TEXTAREA', 'NUMBER', 'DATE', 'EMAIL', 'URL', 'SELECT', 'MULTISELECT', 'CHECKBOX', 'RADIO', 'FILE');

-- CreateEnum
CREATE TYPE "EngagementDirection" AS ENUM ('INBOUND', 'OUTBOUND');

-- CreateEnum
CREATE TYPE "EngagementSource" AS ENUM ('EMAIL', 'PHONE', 'SMS', 'MEETING', 'EVENT', 'TODO', 'NOTE', 'OTHER');

-- CreateEnum
CREATE TYPE "TodoStatus" AS ENUM ('PENDING', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "ContactSubmodule" AS ENUM ('SUPERVISION', 'EVENTS', 'SHOP');

-- CreateEnum
CREATE TYPE "ChangeAction" AS ENUM ('CREATED', 'UPDATED', 'DELETED');

-- CreateTable
CREATE TABLE "Organization" (
    "id" TEXT NOT NULL,
    "name" VARCHAR(255),
    "address" VARCHAR(255),
    "email" VARCHAR(255) NOT NULL,
    "phone" VARCHAR(255),
    "postalCode" VARCHAR(255),
    "city" VARCHAR(255),
    "country" VARCHAR(255),
    "website" VARCHAR(255),
    "taxID" VARCHAR(255),
    "isFilledByOrg" BOOLEAN NOT NULL DEFAULT false,
    "bankDetailsId" TEXT,
    "orgTypeId" TEXT,
    "profileData" JSONB,
    "contactPersonId" TEXT,
    "teamId" TEXT,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "Organization_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BankDetails" (
    "id" TEXT NOT NULL,
    "bankName" VARCHAR(255) NOT NULL,
    "accountHolder" VARCHAR(255) NOT NULL,
    "iban" VARCHAR(255) NOT NULL,
    "bic" VARCHAR(255) NOT NULL,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "BankDetails_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FundingRequest" (
    "id" TEXT NOT NULL,
    "name" VARCHAR(255) NOT NULL,
    "organizationId" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "purpose" TEXT NOT NULL,
    "amountRequested" DECIMAL(65,30) NOT NULL,
    "amountAgreed" DECIMAL(65,30),
    "remainingAmount" DECIMAL(65,30),
    "refinancingConcept" TEXT NOT NULL,
    "sustainability" TEXT NOT NULL,
    "expectedCompletionDate" TIMESTAMP(3) NOT NULL,
    "status" "FundingStatus" NOT NULL DEFAULT 'Submitted',
    "submittedById" TEXT NOT NULL,
    "customFields" JSONB,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,
    "teamId" TEXT,

    CONSTRAINT "FundingRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "File" (
    "id" TEXT NOT NULL,
    "name" VARCHAR(255),
    "url" TEXT NOT NULL,
    "type" VARCHAR(255) NOT NULL,
    "createdById" TEXT NOT NULL,
    "updatedById" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,
    "organizationId" VARCHAR(255),
    "fundingRequestId" TEXT,

    CONSTRAINT "File_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FileDownloadAudit" (
    "id" TEXT NOT NULL,
    "type" "FileDownloadType" NOT NULL,
    "fileCount" INTEGER NOT NULL DEFAULT 1,
    "query" TEXT,
    "userId" TEXT NOT NULL,
    "fileId" TEXT,
    "teamId" TEXT,
    "organizationId" TEXT,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FileDownloadAudit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Teams" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" VARCHAR(255) NOT NULL,
    "loginDomain" VARCHAR(255),
    "loginMethod" "LoginMethod" NOT NULL DEFAULT 'EMAIL_MAGIC_LINK',
    "oidcIssuer" VARCHAR(500),
    "oidcClientId" VARCHAR(255),
    "oidcClientSecret" TEXT,
    "autoProvisionUsersFromOidc" BOOLEAN NOT NULL DEFAULT false,
    "defaultOidcGroupId" TEXT,
    "domainVerificationToken" VARCHAR(255),
    "domainVerifiedAt" TIMESTAMPTZ(6),
    "domainLastCheckedAt" TIMESTAMPTZ(6),
    "registrationPageLogoKey" VARCHAR(255),
    "phone" VARCHAR(255),
    "address" VARCHAR(255),
    "postalCode" VARCHAR(255),
    "city" VARCHAR(255),
    "country" VARCHAR(255),
    "website" VARCHAR(255),
    "strategicPriorities" TEXT,
    "modules" "AppModule"[] DEFAULT ARRAY['CRM', 'FUNDING']::"AppModule"[],
    "bankDetailsId" TEXT,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,
    "ownerId" TEXT,

    CONSTRAINT "Teams_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrganizationType" (
    "id" TEXT NOT NULL,
    "teamId" TEXT NOT NULL,
    "name" VARCHAR(255) NOT NULL,
    "color" VARCHAR(50),
    "schema" JSONB,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "OrganizationType_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrganizationEngagement" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "teamId" TEXT NOT NULL,
    "type" VARCHAR(100) NOT NULL,
    "note" TEXT,
    "engagedAt" TIMESTAMPTZ(6) NOT NULL,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "OrganizationEngagement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrganizationFieldValue" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "key" VARCHAR(255) NOT NULL,
    "type" VARCHAR(50) NOT NULL,
    "stringValue" TEXT,
    "numberValue" DECIMAL(65,30),
    "dateValue" TIMESTAMPTZ(6),
    "booleanValue" BOOLEAN,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "OrganizationFieldValue_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IntegrationConnection" (
    "id" TEXT NOT NULL,
    "teamId" TEXT NOT NULL,
    "provider" "IntegrationProvider" NOT NULL,
    "apiKey" TEXT NOT NULL,
    "baseUrl" VARCHAR(500),
    "webhookSecret" TEXT,
    "defaultListId" VARCHAR(255),
    "isEnabled" BOOLEAN NOT NULL DEFAULT true,
    "lastSyncedAt" TIMESTAMPTZ(6),
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "IntegrationConnection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ZammadGroupSetting" (
    "id" TEXT NOT NULL,
    "teamId" TEXT NOT NULL,
    "groupId" INTEGER NOT NULL,
    "groupName" VARCHAR(255) NOT NULL,
    "importEnabled" BOOLEAN NOT NULL DEFAULT false,
    "autoCreateContacts" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "ZammadGroupSetting_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ZammadSyncJob" (
    "id" TEXT NOT NULL,
    "teamId" TEXT NOT NULL,
    "type" "ZammadSyncJobType" NOT NULL,
    "status" "ZammadSyncJobStatus" NOT NULL DEFAULT 'PENDING',
    "ticketId" INTEGER,
    "payload" JSONB,
    "result" JSONB,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "maxAttempts" INTEGER NOT NULL DEFAULT 5,
    "runAfter" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lockedAt" TIMESTAMPTZ(6),
    "lockedBy" VARCHAR(255),
    "startedAt" TIMESTAMPTZ(6),
    "finishedAt" TIMESTAMPTZ(6),
    "lastError" TEXT,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "ZammadSyncJob_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "name" VARCHAR(255),
    "address" VARCHAR(255),
    "email" VARCHAR(255) NOT NULL,
    "phone" VARCHAR(255),
    "postalCode" VARCHAR(255),
    "city" VARCHAR(255),
    "country" VARCHAR(255),
    "roles" "Roles"[],
    "emailVerified" TIMESTAMP(3),
    "image" TEXT,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DonationAgreement" (
    "id" TEXT NOT NULL,
    "fundingRequestId" TEXT NOT NULL,
    "fileId" TEXT NOT NULL,
    "agreement" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "teamId" TEXT,
    "organizationId" TEXT,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "DonationAgreement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DonationAgreementSignature" (
    "donationAgreementId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "signedAt" TIMESTAMP(3),

    CONSTRAINT "DonationAgreementSignature_pkey" PRIMARY KEY ("donationAgreementId","userId")
);

-- CreateTable
CREATE TABLE "Contact" (
    "id" TEXT NOT NULL,
    "teamId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "pronouns" VARCHAR(120),
    "gender" "ContactGender",
    "genderRequestPreference" "ContactRequestPreference",
    "isBipoc" BOOLEAN,
    "racismRequestPreference" "ContactRequestPreference",
    "otherMargins" TEXT,
    "onboardingDate" TIMESTAMPTZ(6),
    "breakUntil" TIMESTAMPTZ(6),
    "address" VARCHAR(255),
    "postalCode" VARCHAR(255),
    "state" VARCHAR(255),
    "city" VARCHAR(255),
    "country" VARCHAR(255),
    "countryCode" CHAR(2),
    "latitude" DECIMAL(9,6),
    "longitude" DECIMAL(9,6),
    "email" VARCHAR(255),
    "phone" VARCHAR(255),
    "signal" VARCHAR(255),
    "website" VARCHAR(255),
    "groupId" TEXT,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "Contact_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PostalCodeCentroid" (
    "countryCode" CHAR(2) NOT NULL,
    "postalCode" VARCHAR(32) NOT NULL,
    "placeName" VARCHAR(255),
    "admin1" VARCHAR(255),
    "admin1Code" VARCHAR(50),
    "admin2" VARCHAR(255),
    "admin2Code" VARCHAR(50),
    "admin3" VARCHAR(255),
    "admin3Code" VARCHAR(50),
    "latitude" DECIMAL(9,6),
    "longitude" DECIMAL(9,6),
    "accuracy" INTEGER,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PostalCodeCentroid_pkey" PRIMARY KEY ("countryCode","postalCode")
);

-- CreateTable
CREATE TABLE "ContactSocialLink" (
    "id" TEXT NOT NULL,
    "contactId" TEXT NOT NULL,
    "platform" VARCHAR(50) NOT NULL,
    "handle" VARCHAR(255) NOT NULL,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "ContactSocialLink_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ContactList" (
    "id" TEXT NOT NULL,
    "teamId" TEXT NOT NULL,
    "name" VARCHAR(255) NOT NULL,
    "description" TEXT,
    "type" "ContactListType" NOT NULL DEFAULT 'MANUAL',
    "filters" JSONB,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "ContactList_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ContactListMember" (
    "id" TEXT NOT NULL,
    "listId" TEXT NOT NULL,
    "contactId" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ContactListMember_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ContactAttribute" (
    "id" TEXT NOT NULL,
    "contactId" TEXT NOT NULL,
    "key" VARCHAR(255) NOT NULL,
    "type" "ContactAttributeType" NOT NULL,
    "stringValue" TEXT,
    "numberValue" DECIMAL(65,30),
    "dateValue" TIMESTAMPTZ(6),
    "locationLabel" VARCHAR(255),
    "latitude" DECIMAL(65,30),
    "longitude" DECIMAL(65,30),
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "ContactAttribute_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ContactFieldAccess" (
    "id" TEXT NOT NULL,
    "teamId" TEXT NOT NULL,
    "fieldKey" VARCHAR(255) NOT NULL,
    "groupId" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ContactFieldAccess_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "emailTemplates" (
    "id" TEXT NOT NULL,
    "name" VARCHAR(255) NOT NULL,
    "subject" VARCHAR(255) NOT NULL,
    "content" TEXT NOT NULL,
    "type" VARCHAR(255) NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "teamId" TEXT,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "emailTemplates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FormSection" (
    "id" TEXT NOT NULL,
    "name" VARCHAR(255) NOT NULL,
    "description" TEXT,
    "order" INTEGER NOT NULL,
    "teamId" TEXT,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "FormSection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FormField" (
    "id" TEXT NOT NULL,
    "key" VARCHAR(255) NOT NULL,
    "label" VARCHAR(255) NOT NULL,
    "description" TEXT,
    "type" "FieldType" NOT NULL,
    "placeholder" VARCHAR(255),
    "defaultValue" TEXT,
    "isRequired" BOOLEAN NOT NULL DEFAULT false,
    "order" INTEGER NOT NULL,
    "minLength" INTEGER,
    "maxLength" INTEGER,
    "minValue" DECIMAL(65,30),
    "maxValue" DECIMAL(65,30),
    "pattern" VARCHAR(255),
    "options" JSONB,
    "sectionId" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "FormField_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Transaction" (
    "id" TEXT NOT NULL,
    "amount" DECIMAL(65,30) NOT NULL,
    "totalAmount" DECIMAL(65,30) NOT NULL,
    "remainingAmount" DECIMAL(65,30) NOT NULL,
    "transactionReciept" TEXT,
    "fundingRequestId" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "teamId" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "Transaction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Account" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "providerAccountId" TEXT NOT NULL,
    "refresh_token" TEXT,
    "access_token" TEXT,
    "expires_at" INTEGER,
    "token_type" TEXT,
    "scope" TEXT,
    "id_token" TEXT,
    "session_state" TEXT,

    CONSTRAINT "Account_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Session" (
    "id" TEXT NOT NULL,
    "sessionToken" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "expires" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VerificationToken" (
    "identifier" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "expires" TIMESTAMP(3) NOT NULL
);

-- CreateTable
CREATE TABLE "Event" (
    "id" TEXT NOT NULL,
    "teamId" TEXT NOT NULL,
    "eventTypeId" TEXT,
    "title" VARCHAR(255) NOT NULL,
    "slug" VARCHAR(255),
    "description" TEXT,
    "location" VARCHAR(255),
    "isOnline" BOOLEAN NOT NULL DEFAULT false,
    "expectedGuests" INTEGER,
    "hasRemuneration" BOOLEAN NOT NULL DEFAULT false,
    "address" VARCHAR(255),
    "city" VARCHAR(255),
    "postalCode" VARCHAR(255),
    "state" VARCHAR(255),
    "timeZone" VARCHAR(255),
    "merchNeeded" BOOLEAN NOT NULL DEFAULT false,
    "startDate" TIMESTAMPTZ(6) NOT NULL,
    "endDate" TIMESTAMPTZ(6),
    "isPublic" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "Event_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EventList" (
    "eventId" TEXT NOT NULL,
    "listId" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EventList_pkey" PRIMARY KEY ("eventId","listId")
);

-- CreateTable
CREATE TABLE "EventType" (
    "id" TEXT NOT NULL,
    "teamId" TEXT NOT NULL,
    "name" VARCHAR(255) NOT NULL,
    "color" VARCHAR(50),
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "EventType_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EventContact" (
    "eventId" TEXT NOT NULL,
    "contactId" TEXT NOT NULL,

    CONSTRAINT "EventContact_pkey" PRIMARY KEY ("eventId","contactId")
);

-- CreateTable
CREATE TABLE "EventContactRole" (
    "eventId" TEXT NOT NULL,
    "contactId" TEXT NOT NULL,
    "eventRoleId" TEXT NOT NULL,

    CONSTRAINT "EventContactRole_pkey" PRIMARY KEY ("eventId","contactId","eventRoleId")
);

-- CreateTable
CREATE TABLE "EventRole" (
    "id" TEXT NOT NULL,
    "teamId" TEXT NOT NULL,
    "name" VARCHAR(255) NOT NULL,
    "color" VARCHAR(50),
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "EventRole_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EventRegistration" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "contactId" TEXT NOT NULL,
    "name" VARCHAR(255) NOT NULL,
    "email" VARCHAR(255) NOT NULL,
    "phone" VARCHAR(255),
    "notes" TEXT,
    "customData" JSONB,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "EventRegistration_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ContactEngagement" (
    "id" TEXT NOT NULL,
    "contactId" TEXT NOT NULL,
    "teamId" TEXT NOT NULL,
    "direction" "EngagementDirection" NOT NULL,
    "source" "EngagementSource" NOT NULL,
    "subject" VARCHAR(500),
    "message" TEXT NOT NULL,
    "userId" TEXT,
    "userName" VARCHAR(255),
    "externalId" VARCHAR(255),
    "externalSource" VARCHAR(255),
    "restrictedToSubmodule" "ContactSubmodule",
    "assignedToUserId" TEXT,
    "assignedToUserName" VARCHAR(255),
    "todoStatus" "TodoStatus",
    "dueDate" TIMESTAMPTZ(6),
    "engagedAt" TIMESTAMPTZ(6) NOT NULL,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "ContactEngagement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ContactChangeLog" (
    "id" TEXT NOT NULL,
    "contactId" TEXT NOT NULL,
    "action" "ChangeAction" NOT NULL,
    "fieldName" VARCHAR(255),
    "oldValue" TEXT,
    "newValue" TEXT,
    "metadata" JSONB,
    "userId" TEXT,
    "userName" VARCHAR(255),
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ContactChangeLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Group" (
    "id" TEXT NOT NULL,
    "teamId" TEXT NOT NULL,
    "name" VARCHAR(255) NOT NULL,
    "description" TEXT,
    "canAccessAllContacts" BOOLEAN NOT NULL DEFAULT false,
    "isDefaultGroup" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "Group_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserGroup" (
    "userId" TEXT NOT NULL,
    "groupId" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UserGroup_pkey" PRIMARY KEY ("userId","groupId")
);

-- CreateTable
CREATE TABLE "GroupModulePermission" (
    "id" TEXT NOT NULL,
    "groupId" TEXT NOT NULL,
    "module" "AppModule" NOT NULL,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "GroupModulePermission_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "_OrganizationUsers" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL,

    CONSTRAINT "_OrganizationUsers_AB_pkey" PRIMARY KEY ("A","B")
);

-- CreateTable
CREATE TABLE "_TeamUsers" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL,

    CONSTRAINT "_TeamUsers_AB_pkey" PRIMARY KEY ("A","B")
);

-- CreateIndex
CREATE UNIQUE INDEX "Organization_id_key" ON "Organization"("id");

-- CreateIndex
CREATE UNIQUE INDEX "Organization_email_key" ON "Organization"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Organization_bankDetailsId_key" ON "Organization"("bankDetailsId");

-- CreateIndex
CREATE UNIQUE INDEX "BankDetails_id_key" ON "BankDetails"("id");

-- CreateIndex
CREATE UNIQUE INDEX "BankDetails_iban_key" ON "BankDetails"("iban");

-- CreateIndex
CREATE UNIQUE INDEX "FundingRequest_id_key" ON "FundingRequest"("id");

-- CreateIndex
CREATE UNIQUE INDEX "File_id_key" ON "File"("id");

-- CreateIndex
CREATE UNIQUE INDEX "File_url_key" ON "File"("url");

-- CreateIndex
CREATE UNIQUE INDEX "FileDownloadAudit_id_key" ON "FileDownloadAudit"("id");

-- CreateIndex
CREATE INDEX "FileDownloadAudit_teamId_createdAt_idx" ON "FileDownloadAudit"("teamId", "createdAt");

-- CreateIndex
CREATE INDEX "FileDownloadAudit_organizationId_createdAt_idx" ON "FileDownloadAudit"("organizationId", "createdAt");

-- CreateIndex
CREATE INDEX "FileDownloadAudit_fileId_createdAt_idx" ON "FileDownloadAudit"("fileId", "createdAt");

-- CreateIndex
CREATE INDEX "FileDownloadAudit_userId_createdAt_idx" ON "FileDownloadAudit"("userId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Teams_id_key" ON "Teams"("id");

-- CreateIndex
CREATE UNIQUE INDEX "Teams_name_key" ON "Teams"("name");

-- CreateIndex
CREATE UNIQUE INDEX "Teams_email_key" ON "Teams"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Teams_bankDetailsId_key" ON "Teams"("bankDetailsId");

-- CreateIndex
CREATE UNIQUE INDEX "OrganizationType_id_key" ON "OrganizationType"("id");

-- CreateIndex
CREATE INDEX "OrganizationType_teamId_idx" ON "OrganizationType"("teamId");

-- CreateIndex
CREATE UNIQUE INDEX "OrganizationType_teamId_name_key" ON "OrganizationType"("teamId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "OrganizationEngagement_id_key" ON "OrganizationEngagement"("id");

-- CreateIndex
CREATE INDEX "OrganizationEngagement_organizationId_idx" ON "OrganizationEngagement"("organizationId");

-- CreateIndex
CREATE INDEX "OrganizationEngagement_teamId_idx" ON "OrganizationEngagement"("teamId");

-- CreateIndex
CREATE INDEX "OrganizationEngagement_engagedAt_idx" ON "OrganizationEngagement"("engagedAt");

-- CreateIndex
CREATE UNIQUE INDEX "OrganizationFieldValue_id_key" ON "OrganizationFieldValue"("id");

-- CreateIndex
CREATE INDEX "OrganizationFieldValue_key_idx" ON "OrganizationFieldValue"("key");

-- CreateIndex
CREATE INDEX "OrganizationFieldValue_organizationId_idx" ON "OrganizationFieldValue"("organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "OrganizationFieldValue_organizationId_key_key" ON "OrganizationFieldValue"("organizationId", "key");

-- CreateIndex
CREATE UNIQUE INDEX "IntegrationConnection_id_key" ON "IntegrationConnection"("id");

-- CreateIndex
CREATE UNIQUE INDEX "IntegrationConnection_teamId_provider_key" ON "IntegrationConnection"("teamId", "provider");

-- CreateIndex
CREATE UNIQUE INDEX "ZammadGroupSetting_id_key" ON "ZammadGroupSetting"("id");

-- CreateIndex
CREATE INDEX "ZammadGroupSetting_teamId_idx" ON "ZammadGroupSetting"("teamId");

-- CreateIndex
CREATE UNIQUE INDEX "ZammadGroupSetting_teamId_groupId_key" ON "ZammadGroupSetting"("teamId", "groupId");

-- CreateIndex
CREATE UNIQUE INDEX "ZammadSyncJob_id_key" ON "ZammadSyncJob"("id");

-- CreateIndex
CREATE INDEX "ZammadSyncJob_status_runAfter_idx" ON "ZammadSyncJob"("status", "runAfter");

-- CreateIndex
CREATE INDEX "ZammadSyncJob_teamId_status_idx" ON "ZammadSyncJob"("teamId", "status");

-- CreateIndex
CREATE INDEX "ZammadSyncJob_lockedAt_idx" ON "ZammadSyncJob"("lockedAt");

-- CreateIndex
CREATE UNIQUE INDEX "User_id_key" ON "User"("id");

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "DonationAgreement_id_key" ON "DonationAgreement"("id");

-- CreateIndex
CREATE UNIQUE INDEX "Contact_id_key" ON "Contact"("id");

-- CreateIndex
CREATE INDEX "Contact_groupId_idx" ON "Contact"("groupId");

-- CreateIndex
CREATE INDEX "Contact_teamId_groupId_idx" ON "Contact"("teamId", "groupId");

-- CreateIndex
CREATE UNIQUE INDEX "Contact_teamId_email_key" ON "Contact"("teamId", "email");

-- CreateIndex
CREATE INDEX "PostalCodeCentroid_postalCode_idx" ON "PostalCodeCentroid"("postalCode");

-- CreateIndex
CREATE UNIQUE INDEX "ContactSocialLink_id_key" ON "ContactSocialLink"("id");

-- CreateIndex
CREATE INDEX "ContactSocialLink_contactId_idx" ON "ContactSocialLink"("contactId");

-- CreateIndex
CREATE UNIQUE INDEX "ContactSocialLink_contactId_platform_key" ON "ContactSocialLink"("contactId", "platform");

-- CreateIndex
CREATE UNIQUE INDEX "ContactList_id_key" ON "ContactList"("id");

-- CreateIndex
CREATE INDEX "ContactList_teamId_idx" ON "ContactList"("teamId");

-- CreateIndex
CREATE UNIQUE INDEX "ContactListMember_id_key" ON "ContactListMember"("id");

-- CreateIndex
CREATE INDEX "ContactListMember_listId_idx" ON "ContactListMember"("listId");

-- CreateIndex
CREATE INDEX "ContactListMember_contactId_idx" ON "ContactListMember"("contactId");

-- CreateIndex
CREATE UNIQUE INDEX "ContactListMember_listId_contactId_key" ON "ContactListMember"("listId", "contactId");

-- CreateIndex
CREATE UNIQUE INDEX "ContactAttribute_id_key" ON "ContactAttribute"("id");

-- CreateIndex
CREATE INDEX "ContactAttribute_key_idx" ON "ContactAttribute"("key");

-- CreateIndex
CREATE UNIQUE INDEX "ContactAttribute_contactId_key_key" ON "ContactAttribute"("contactId", "key");

-- CreateIndex
CREATE UNIQUE INDEX "ContactFieldAccess_id_key" ON "ContactFieldAccess"("id");

-- CreateIndex
CREATE INDEX "ContactFieldAccess_teamId_fieldKey_idx" ON "ContactFieldAccess"("teamId", "fieldKey");

-- CreateIndex
CREATE INDEX "ContactFieldAccess_groupId_idx" ON "ContactFieldAccess"("groupId");

-- CreateIndex
CREATE UNIQUE INDEX "ContactFieldAccess_teamId_fieldKey_groupId_key" ON "ContactFieldAccess"("teamId", "fieldKey", "groupId");

-- CreateIndex
CREATE UNIQUE INDEX "emailTemplates_id_key" ON "emailTemplates"("id");

-- CreateIndex
CREATE UNIQUE INDEX "FormSection_id_key" ON "FormSection"("id");

-- CreateIndex
CREATE UNIQUE INDEX "FormField_id_key" ON "FormField"("id");

-- CreateIndex
CREATE UNIQUE INDEX "FormField_sectionId_key_key" ON "FormField"("sectionId", "key");

-- CreateIndex
CREATE UNIQUE INDEX "Transaction_id_key" ON "Transaction"("id");

-- CreateIndex
CREATE UNIQUE INDEX "Account_provider_providerAccountId_key" ON "Account"("provider", "providerAccountId");

-- CreateIndex
CREATE UNIQUE INDEX "Session_sessionToken_key" ON "Session"("sessionToken");

-- CreateIndex
CREATE UNIQUE INDEX "VerificationToken_identifier_token_key" ON "VerificationToken"("identifier", "token");

-- CreateIndex
CREATE UNIQUE INDEX "Event_id_key" ON "Event"("id");

-- CreateIndex
CREATE INDEX "Event_teamId_idx" ON "Event"("teamId");

-- CreateIndex
CREATE INDEX "Event_slug_idx" ON "Event"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "Event_teamId_slug_key" ON "Event"("teamId", "slug");

-- CreateIndex
CREATE INDEX "EventList_eventId_idx" ON "EventList"("eventId");

-- CreateIndex
CREATE INDEX "EventList_listId_idx" ON "EventList"("listId");

-- CreateIndex
CREATE UNIQUE INDEX "EventType_id_key" ON "EventType"("id");

-- CreateIndex
CREATE INDEX "EventType_teamId_idx" ON "EventType"("teamId");

-- CreateIndex
CREATE UNIQUE INDEX "EventType_teamId_name_key" ON "EventType"("teamId", "name");

-- CreateIndex
CREATE INDEX "EventContact_eventId_idx" ON "EventContact"("eventId");

-- CreateIndex
CREATE INDEX "EventContact_contactId_idx" ON "EventContact"("contactId");

-- CreateIndex
CREATE UNIQUE INDEX "EventRole_id_key" ON "EventRole"("id");

-- CreateIndex
CREATE INDEX "EventRole_teamId_idx" ON "EventRole"("teamId");

-- CreateIndex
CREATE UNIQUE INDEX "EventRole_teamId_name_key" ON "EventRole"("teamId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "EventRegistration_id_key" ON "EventRegistration"("id");

-- CreateIndex
CREATE INDEX "EventRegistration_eventId_idx" ON "EventRegistration"("eventId");

-- CreateIndex
CREATE INDEX "EventRegistration_email_idx" ON "EventRegistration"("email");

-- CreateIndex
CREATE INDEX "EventRegistration_contactId_idx" ON "EventRegistration"("contactId");

-- CreateIndex
CREATE UNIQUE INDEX "ContactEngagement_id_key" ON "ContactEngagement"("id");

-- CreateIndex
CREATE INDEX "ContactEngagement_contactId_idx" ON "ContactEngagement"("contactId");

-- CreateIndex
CREATE INDEX "ContactEngagement_teamId_idx" ON "ContactEngagement"("teamId");

-- CreateIndex
CREATE INDEX "ContactEngagement_engagedAt_idx" ON "ContactEngagement"("engagedAt");

-- CreateIndex
CREATE INDEX "ContactEngagement_assignedToUserId_idx" ON "ContactEngagement"("assignedToUserId");

-- CreateIndex
CREATE INDEX "ContactEngagement_todoStatus_idx" ON "ContactEngagement"("todoStatus");

-- CreateIndex
CREATE UNIQUE INDEX "ContactEngagement_teamId_externalId_externalSource_key" ON "ContactEngagement"("teamId", "externalId", "externalSource");

-- CreateIndex
CREATE UNIQUE INDEX "ContactChangeLog_id_key" ON "ContactChangeLog"("id");

-- CreateIndex
CREATE INDEX "ContactChangeLog_contactId_idx" ON "ContactChangeLog"("contactId");

-- CreateIndex
CREATE INDEX "ContactChangeLog_createdAt_idx" ON "ContactChangeLog"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Group_id_key" ON "Group"("id");

-- CreateIndex
CREATE INDEX "Group_teamId_idx" ON "Group"("teamId");

-- CreateIndex
CREATE INDEX "Group_teamId_isDefaultGroup_idx" ON "Group"("teamId", "isDefaultGroup");

-- CreateIndex
CREATE UNIQUE INDEX "Group_teamId_name_key" ON "Group"("teamId", "name");

-- CreateIndex
CREATE INDEX "UserGroup_userId_idx" ON "UserGroup"("userId");

-- CreateIndex
CREATE INDEX "UserGroup_groupId_idx" ON "UserGroup"("groupId");

-- CreateIndex
CREATE UNIQUE INDEX "GroupModulePermission_id_key" ON "GroupModulePermission"("id");

-- CreateIndex
CREATE INDEX "GroupModulePermission_groupId_idx" ON "GroupModulePermission"("groupId");

-- CreateIndex
CREATE UNIQUE INDEX "GroupModulePermission_groupId_module_key" ON "GroupModulePermission"("groupId", "module");

-- CreateIndex
CREATE INDEX "_OrganizationUsers_B_index" ON "_OrganizationUsers"("B");

-- CreateIndex
CREATE INDEX "_TeamUsers_B_index" ON "_TeamUsers"("B");

-- AddForeignKey
ALTER TABLE "Organization" ADD CONSTRAINT "Organization_orgTypeId_fkey" FOREIGN KEY ("orgTypeId") REFERENCES "OrganizationType"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Organization" ADD CONSTRAINT "Organization_contactPersonId_fkey" FOREIGN KEY ("contactPersonId") REFERENCES "Contact"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Organization" ADD CONSTRAINT "Organization_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Teams"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Organization" ADD CONSTRAINT "Organization_bankDetailsId_fkey" FOREIGN KEY ("bankDetailsId") REFERENCES "BankDetails"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FundingRequest" ADD CONSTRAINT "FundingRequest_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FundingRequest" ADD CONSTRAINT "FundingRequest_submittedById_fkey" FOREIGN KEY ("submittedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FundingRequest" ADD CONSTRAINT "FundingRequest_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Teams"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "File" ADD CONSTRAINT "File_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "File" ADD CONSTRAINT "File_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "File" ADD CONSTRAINT "File_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "File" ADD CONSTRAINT "File_fundingRequestId_fkey" FOREIGN KEY ("fundingRequestId") REFERENCES "FundingRequest"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FileDownloadAudit" ADD CONSTRAINT "FileDownloadAudit_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FileDownloadAudit" ADD CONSTRAINT "FileDownloadAudit_fileId_fkey" FOREIGN KEY ("fileId") REFERENCES "File"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FileDownloadAudit" ADD CONSTRAINT "FileDownloadAudit_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Teams"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FileDownloadAudit" ADD CONSTRAINT "FileDownloadAudit_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Teams" ADD CONSTRAINT "Teams_defaultOidcGroupId_fkey" FOREIGN KEY ("defaultOidcGroupId") REFERENCES "Group"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Teams" ADD CONSTRAINT "Teams_bankDetailsId_fkey" FOREIGN KEY ("bankDetailsId") REFERENCES "BankDetails"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Teams" ADD CONSTRAINT "Teams_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrganizationType" ADD CONSTRAINT "OrganizationType_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Teams"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrganizationEngagement" ADD CONSTRAINT "OrganizationEngagement_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrganizationEngagement" ADD CONSTRAINT "OrganizationEngagement_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Teams"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrganizationFieldValue" ADD CONSTRAINT "OrganizationFieldValue_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IntegrationConnection" ADD CONSTRAINT "IntegrationConnection_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Teams"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ZammadGroupSetting" ADD CONSTRAINT "ZammadGroupSetting_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Teams"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ZammadSyncJob" ADD CONSTRAINT "ZammadSyncJob_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Teams"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DonationAgreement" ADD CONSTRAINT "DonationAgreement_fundingRequestId_fkey" FOREIGN KEY ("fundingRequestId") REFERENCES "FundingRequest"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DonationAgreement" ADD CONSTRAINT "DonationAgreement_fileId_fkey" FOREIGN KEY ("fileId") REFERENCES "File"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DonationAgreement" ADD CONSTRAINT "DonationAgreement_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DonationAgreement" ADD CONSTRAINT "DonationAgreement_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Teams"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DonationAgreement" ADD CONSTRAINT "DonationAgreement_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DonationAgreementSignature" ADD CONSTRAINT "DonationAgreementSignature_donationAgreementId_fkey" FOREIGN KEY ("donationAgreementId") REFERENCES "DonationAgreement"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DonationAgreementSignature" ADD CONSTRAINT "DonationAgreementSignature_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Contact" ADD CONSTRAINT "Contact_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Teams"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Contact" ADD CONSTRAINT "Contact_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "Group"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContactSocialLink" ADD CONSTRAINT "ContactSocialLink_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "Contact"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContactList" ADD CONSTRAINT "ContactList_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Teams"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContactListMember" ADD CONSTRAINT "ContactListMember_listId_fkey" FOREIGN KEY ("listId") REFERENCES "ContactList"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContactListMember" ADD CONSTRAINT "ContactListMember_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "Contact"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContactAttribute" ADD CONSTRAINT "ContactAttribute_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "Contact"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContactFieldAccess" ADD CONSTRAINT "ContactFieldAccess_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Teams"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContactFieldAccess" ADD CONSTRAINT "ContactFieldAccess_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "Group"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "emailTemplates" ADD CONSTRAINT "emailTemplates_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Teams"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FormSection" ADD CONSTRAINT "FormSection_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Teams"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FormField" ADD CONSTRAINT "FormField_sectionId_fkey" FOREIGN KEY ("sectionId") REFERENCES "FormSection"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_fundingRequestId_fkey" FOREIGN KEY ("fundingRequestId") REFERENCES "FundingRequest"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Teams"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_transactionReciept_fkey" FOREIGN KEY ("transactionReciept") REFERENCES "File"("id") ON DELETE SET NULL ON UPDATE SET NULL;

-- AddForeignKey
ALTER TABLE "Account" ADD CONSTRAINT "Account_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Session" ADD CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Event" ADD CONSTRAINT "Event_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Teams"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Event" ADD CONSTRAINT "Event_eventTypeId_fkey" FOREIGN KEY ("eventTypeId") REFERENCES "EventType"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EventList" ADD CONSTRAINT "EventList_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EventList" ADD CONSTRAINT "EventList_listId_fkey" FOREIGN KEY ("listId") REFERENCES "ContactList"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EventType" ADD CONSTRAINT "EventType_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Teams"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EventContact" ADD CONSTRAINT "EventContact_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EventContact" ADD CONSTRAINT "EventContact_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "Contact"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EventContactRole" ADD CONSTRAINT "EventContactRole_eventId_contactId_fkey" FOREIGN KEY ("eventId", "contactId") REFERENCES "EventContact"("eventId", "contactId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EventContactRole" ADD CONSTRAINT "EventContactRole_eventRoleId_fkey" FOREIGN KEY ("eventRoleId") REFERENCES "EventRole"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EventRole" ADD CONSTRAINT "EventRole_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Teams"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EventRegistration" ADD CONSTRAINT "EventRegistration_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EventRegistration" ADD CONSTRAINT "EventRegistration_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "Contact"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContactEngagement" ADD CONSTRAINT "ContactEngagement_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "Contact"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContactChangeLog" ADD CONSTRAINT "ContactChangeLog_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "Contact"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Group" ADD CONSTRAINT "Group_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Teams"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserGroup" ADD CONSTRAINT "UserGroup_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserGroup" ADD CONSTRAINT "UserGroup_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "Group"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GroupModulePermission" ADD CONSTRAINT "GroupModulePermission_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "Group"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_OrganizationUsers" ADD CONSTRAINT "_OrganizationUsers_A_fkey" FOREIGN KEY ("A") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_OrganizationUsers" ADD CONSTRAINT "_OrganizationUsers_B_fkey" FOREIGN KEY ("B") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_TeamUsers" ADD CONSTRAINT "_TeamUsers_A_fkey" FOREIGN KEY ("A") REFERENCES "Teams"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_TeamUsers" ADD CONSTRAINT "_TeamUsers_B_fkey" FOREIGN KEY ("B") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

