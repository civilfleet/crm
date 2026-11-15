-- How each user has set up each records list (columns, sort, filters, view).
CREATE TABLE "UserViewPreference" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "viewKey" VARCHAR(120) NOT NULL,
    "settings" JSONB NOT NULL,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "UserViewPreference_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "UserViewPreference_userId_viewKey_key" ON "UserViewPreference"("userId", "viewKey");

ALTER TABLE "UserViewPreference" ADD CONSTRAINT "UserViewPreference_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
