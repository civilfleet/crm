-- Per-form settings: public counter and goal (docs/PUBLIC_FORMS_INTAKE.md).

-- CreateTable
CREATE TABLE "FormSetting" (
    "id" TEXT NOT NULL,
    "teamId" TEXT NOT NULL,
    "formId" VARCHAR(64) NOT NULL,
    "publicCount" BOOLEAN NOT NULL DEFAULT false,
    "goal" INTEGER,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "FormSetting_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "FormSetting_teamId_formId_key" ON "FormSetting"("teamId", "formId");

-- AddForeignKey
ALTER TABLE "FormSetting" ADD CONSTRAINT "FormSetting_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Teams"("id") ON DELETE CASCADE ON UPDATE CASCADE;

