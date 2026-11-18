-- CreateEnum
CREATE TYPE "LanguageLevel" AS ENUM ('BASIC', 'CONVERSATIONAL', 'FLUENT', 'NATIVE');

-- AlterTable
ALTER TABLE "Organization" ADD COLUMN     "languages" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- CreateTable
CREATE TABLE "ContactLanguage" (
    "id" TEXT NOT NULL,
    "contactId" TEXT NOT NULL,
    "language" VARCHAR(8) NOT NULL,
    "level" "LanguageLevel",
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "ContactLanguage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ContactLanguage_id_key" ON "ContactLanguage"("id");

-- CreateIndex
CREATE INDEX "ContactLanguage_language_idx" ON "ContactLanguage"("language");

-- CreateIndex
CREATE UNIQUE INDEX "ContactLanguage_contactId_language_key" ON "ContactLanguage"("contactId", "language");

-- CreateIndex
CREATE INDEX "Organization_languages_idx" ON "Organization" USING GIN ("languages");

-- AddForeignKey
ALTER TABLE "ContactLanguage" ADD CONSTRAINT "ContactLanguage_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "Contact"("id") ON DELETE CASCADE ON UPDATE CASCADE;

