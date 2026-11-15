-- The Contacts list pages and sorts active contacts of a team on the server;
-- these keep the common orders fast. The id breaks ties between pages.

-- CreateIndex
CREATE INDEX "Contact_active_createdAt_idx" ON "Contact"("teamId", "createdAt", "id") WHERE ("deletedAt" IS NULL);

-- CreateIndex
CREATE INDEX "Contact_active_updatedAt_idx" ON "Contact"("teamId", "updatedAt", "id") WHERE ("deletedAt" IS NULL);

-- CreateIndex
CREATE INDEX "Contact_active_name_idx" ON "Contact"("teamId", "name", "id") WHERE ("deletedAt" IS NULL);

