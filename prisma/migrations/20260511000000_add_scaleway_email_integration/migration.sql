ALTER TYPE "IntegrationProvider" ADD VALUE 'SCALEWAY_TEM';

ALTER TABLE "IntegrationConnection"
ADD COLUMN "senderEmail" VARCHAR(255),
ADD COLUMN "senderName" VARCHAR(255);
