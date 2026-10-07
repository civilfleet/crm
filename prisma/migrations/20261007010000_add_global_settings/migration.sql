CREATE TABLE "GlobalSettings" (
    "id" VARCHAR(32) NOT NULL DEFAULT 'global',
    "accountCreationContactUrl" VARCHAR(2048) NOT NULL DEFAULT 'mailto:it@sea-watch.org',
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "GlobalSettings_pkey" PRIMARY KEY ("id")
);

INSERT INTO "GlobalSettings" (
    "id",
    "accountCreationContactUrl",
    "updatedAt"
) VALUES (
    'global',
    'mailto:it@sea-watch.org',
    CURRENT_TIMESTAMP
);
